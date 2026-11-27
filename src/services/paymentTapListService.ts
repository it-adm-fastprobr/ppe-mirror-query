import { Prisma } from "@prisma/client";

import { Brand, GetPaymentTapListInput, GetPaymentTapListResult, PaymentTapListItem } from "../models";
import { fromBrasiliaText, parseAndValidateDateRange, toBrasiliaText } from "../utils/dateRange";
import { buildPaginationMeta, parseAndValidatePagination } from "../utils/pagination";
import { prisma } from "../utils/prisma";
import { loadBrands, loadMidias, toText } from "./paymentListService";

const OPEN_FINAL_DATE = "NULL";

const TAP_RECEIV = { start: "tap_receiv_start", end: "tap_receiv_end" };

const NON_NEGATIVE_INTEGER_REGEX = /^\d+$/;

// tap_status é Int no schema; acima disso o Prisma recusa o filtro com erro interno.
const MAX_INT32 = 2_147_483_647;

const TAP_SELECT = {
  id: true,
  tap_receiv: true,
  tap_read: true,
  sam: true,
  serial_number: true,
  unique_id: true,
  card_hash: true,
  pan_mask: true,
  tap_status: true,
  terminal_version: true,
  app_priority: true,
  app_data: true,
  hash_aux: true,
  app_name: true,
  terminal_id: true,
  card_code: true,
  type_pay: true
} satisfies Prisma.TapLogSelect;

const LOCAL_SELECT = {
  terminal_id: true,
  local_description: true,
  group_desc: true,
  subgroup: true,
  initial_date: true,
  final_date: true
} satisfies Prisma.TerminalTreeHistoricalSelect;

type TapDbRecord = Prisma.TapLogGetPayload<{ select: typeof TAP_SELECT }>;
type LocalDbRecord = Prisma.TerminalTreeHistoricalGetPayload<{ select: typeof LOCAL_SELECT }>;

// terminal_id em texto, como em tap_log. Em terminal_tree_historical ele pode estar gravado como número.
export type Local = Omit<LocalDbRecord, "terminal_id"> & { terminal_id: string | null };

type LocalFilter = Pick<Prisma.TerminalTreeHistoricalWhereInput, "local_description" | "group_desc" | "subgroup">;

const distinctTexts = (values: (string | null)[]): string[] =>
  [...new Set(values)].filter((value): value is string => value !== null);

// "10" também é procurado como o número 10; "010" e "T-001" só como texto.
export const terminalIdForms = (terminalId: string): Prisma.InputJsonValue[] => {
  const numeric = Number(terminalId);
  return /^\d+$/.test(terminalId) && String(numeric) === terminalId ? [terminalId, numeric] : [terminalId];
};

const loadLocals = async (terminalIds: (string | null)[]): Promise<Local[]> => {
  const forms = distinctTexts(terminalIds).flatMap(terminalIdForms);

  if (forms.length === 0) {
    return [];
  }

  const records = await prisma.terminalTreeHistorical.findMany({
    where: { OR: forms.map((form) => ({ terminal_id: { equals: form } })) },
    select: LOCAL_SELECT
  });

  return records.map((record) => ({ ...record, terminal_id: toText(record.terminal_id) }));
};

export const findLocal = (locals: Local[], terminalId: string | null, tapReceiv: Date | null): Local | null => {
  if (!tapReceiv) {
    return null;
  }

  const tapText = toBrasiliaText(tapReceiv);

  return locals
    .filter(
      (local) =>
        local.terminal_id === terminalId &&
        local.initial_date <= tapText &&
        (local.final_date === null || local.final_date === OPEN_FINAL_DATE || local.final_date >= tapText)
    )
    .reduce<Local | null>(
      (latest, local) => (latest === null || local.initial_date > latest.initial_date ? local : latest),
      null
    );
};

export const mapTap = (
  tap: TapDbRecord,
  brands: Map<number | null, Brand>,
  midias: Map<number | null, string>,
  locals: Local[]
): PaymentTapListItem => {
  const brand = brands.get(tap.card_code);
  const local = findLocal(locals, tap.terminal_id, tap.tap_receiv);

  return {
    id: tap.id,
    tap_receiv: tap.tap_receiv?.toISOString() ?? null,
    tap_read: tap.tap_read?.toISOString() ?? null,
    sam: tap.sam,
    local_description: local?.local_description ?? null,
    group_desc: local?.group_desc ?? null,
    subgroup: local?.subgroup ?? null,
    serial_number: tap.serial_number,
    unique_id: tap.unique_id,
    card_hash: tap.card_hash,
    pan_mask: tap.pan_mask,
    brand_type: brand?.brand_type ?? null,
    brand: brand?.brand ?? null,
    transaction_midia: midias.get(tap.type_pay) ?? null,
    tap_status: tap.tap_status,
    terminal_version: tap.terminal_version,
    app_priority: tap.app_priority,
    app_data: tap.app_data as Record<string, unknown> | null,
    hash_aux: tap.hash_aux,
    app_name: tap.app_name
  };
};

const findUniqueIds = async (transactionUid: string): Promise<string[]> => {
  const links = await prisma.tapPayList.findMany({
    where: { transaction_uid: transactionUid },
    select: { unique_id: true }
  });

  return distinctTexts(links.map(({ unique_id }) => unique_id));
};

// Cada registro de vigência vira um período de tap_receiv do terminal, com os limites inclusivos do findLocal.
const findLocalPeriods = async (filter: LocalFilter): Promise<Prisma.TapLogWhereInput[]> => {
  const locals = await prisma.terminalTreeHistorical.findMany({
    where: filter,
    select: { terminal_id: true, initial_date: true, final_date: true }
  });

  return locals.flatMap(({ terminal_id, initial_date, final_date }) => {
    const terminalId = toText(terminal_id);
    const start = fromBrasiliaText(initial_date);
    const end = final_date === null || final_date === OPEN_FINAL_DATE ? undefined : fromBrasiliaText(final_date);

    if (terminalId === null || !start || end === null) {
      return [];
    }

    return [{ terminal_id: terminalId, tap_receiv: { gte: start, ...(end ? { lte: end } : {}) } }];
  });
};

const parseTapStatus = (value: string): number | null => {
  const parsed = NON_NEGATIVE_INTEGER_REGEX.test(value) ? Number(value) : NaN;
  return parsed <= MAX_INT32 ? parsed : null;
};

export const getPaymentTapList = async ({
  transactionUid,
  cardHash,
  tapReceivStart,
  tapReceivEnd,
  localDescription,
  groupDesc,
  subgroup,
  tapStatus,
  page,
  pageSize
}: GetPaymentTapListInput): Promise<GetPaymentTapListResult> => {
  const range = parseAndValidateDateRange(tapReceivStart, tapReceivEnd, TAP_RECEIV);

  if (!range.ok) {
    return { ok: false, status: 400, error: range.error };
  }

  const status = tapStatus === undefined ? undefined : parseTapStatus(tapStatus);

  if (status === null) {
    return { ok: false, status: 400, error: "tap_status must be a non-negative integer." };
  }

  const pagination = parseAndValidatePagination(page, pageSize);

  if (!pagination.ok) {
    return { ok: false, status: 400, error: pagination.error };
  }

  const localFilter: LocalFilter = {
    ...(localDescription ? { local_description: localDescription } : {}),
    ...(groupDesc ? { group_desc: groupDesc } : {}),
    ...(subgroup ? { subgroup } : {})
  };

  try {
    const [uniqueIds, localPeriods] = await Promise.all([
      transactionUid ? findUniqueIds(transactionUid) : undefined,
      Object.keys(localFilter).length > 0 ? findLocalPeriods(localFilter) : undefined
    ]);

    if (localPeriods?.length === 0) {
      return { ok: false, status: 404, error: "No taps found." };
    }

    const where: Prisma.TapLogWhereInput = {
      ...(range.start || range.end
        ? { tap_receiv: { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lte: range.end } : {}) } }
        : {}),
      ...(cardHash ? { card_hash: cardHash } : {}),
      ...(status !== undefined ? { tap_status: status } : {}),
      ...(uniqueIds ? { unique_id: { in: uniqueIds } } : {}),
      ...(localPeriods ? { OR: localPeriods } : {})
    };

    const [total, taps] = await Promise.all([
      prisma.tapLog.count({ where }),
      prisma.tapLog.findMany({
        where,
        orderBy: { id: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: TAP_SELECT
      })
    ]);

    if (total === 0) {
      return { ok: false, status: 404, error: "No taps found." };
    }

    const [brands, midias, locals] = await Promise.all([
      loadBrands(taps.map(({ card_code }) => card_code)),
      loadMidias(taps.map(({ type_pay }) => type_pay)),
      loadLocals(taps.map(({ terminal_id }) => terminal_id))
    ]);

    return {
      ok: true,
      status: 200,
      data: taps.map((tap) => mapTap(tap, brands, midias, locals)),
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
    };
  } catch (error) {
    console.error("getPaymentTapList failed:", error);
    return { ok: false, status: 500, error: "Internal error while fetching payment tap list." };
  }
};
