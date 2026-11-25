import { Prisma } from "@prisma/client";

import { Brand, GetPaymentTapListResult, PaymentTapListItem } from "../models";
import { toBrasiliaText } from "../utils/dateRange";
import { prisma } from "../utils/prisma";
import { loadBrands, loadMidias } from "./paymentListService";

const OPEN_FINAL_DATE = "NULL";

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

const distinctTexts = (values: (string | null)[]): string[] =>
  [...new Set(values)].filter((value): value is string => value !== null);

const loadLocals = async (terminalIds: (string | null)[]): Promise<LocalDbRecord[]> =>
  prisma.terminalTreeHistorical.findMany({
    where: { terminal_id: { in: distinctTexts(terminalIds) } },
    select: LOCAL_SELECT
  });

export const findLocal = (
  locals: LocalDbRecord[],
  terminalId: string | null,
  tapReceiv: Date | null
): LocalDbRecord | null => {
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
    .reduce<LocalDbRecord | null>(
      (latest, local) => (latest === null || local.initial_date > latest.initial_date ? local : latest),
      null
    );
};

export const mapTap = (
  tap: TapDbRecord,
  brands: Map<number | null, Brand>,
  midias: Map<number | null, string>,
  locals: LocalDbRecord[]
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

export const getPaymentTapList = async (transactionUid: string): Promise<GetPaymentTapListResult> => {
  try {
    const links = await prisma.tapPayList.findMany({
      where: { transaction_uid: transactionUid },
      select: { unique_id: true }
    });

    const taps = await prisma.tapLog.findMany({
      where: { unique_id: { in: distinctTexts(links.map(({ unique_id }) => unique_id)) } },
      select: TAP_SELECT
    });

    if (taps.length === 0) {
      return { ok: false, status: 404, error: "No taps found." };
    }

    const [brands, midias, locals] = await Promise.all([
      loadBrands(taps.map(({ card_code }) => card_code)),
      loadMidias(taps.map(({ type_pay }) => type_pay)),
      loadLocals(taps.map(({ terminal_id }) => terminal_id))
    ]);

    return { ok: true, status: 200, data: taps.map((tap) => mapTap(tap, brands, midias, locals)) };
  } catch (error) {
    console.error("getPaymentTapList failed:", error);
    return { ok: false, status: 500, error: "Internal error while fetching payment tap list." };
  }
};
