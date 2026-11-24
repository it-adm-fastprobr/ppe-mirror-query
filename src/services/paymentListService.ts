import { Prisma } from "@prisma/client";

import { Brand, GetPaymentListInput, GetPaymentListResult, PaymentListItem } from "../models";
import { parseAndValidateDateRange } from "../utils/dateRange";
import { buildPaginationMeta, parseAndValidatePagination } from "../utils/pagination";
import { prisma } from "../utils/prisma";

const PAN_MASK_LENGTH = 20;

const PAYMENT_SELECT = {
  id: true,
  response_code: true,
  auth_code: true,
  auth_message: true,
  payment_time: true,
  card_hash: true,
  pan_mask: true,
  fare: true,
  gateway_usn: true,
  pay_result: true,
  first_ride: true,
  auth_number: true,
  refer_rec_neg: true,
  payment_id: true,
  transaction_uid: true,
  card_code: true,
  type_pay: true
} satisfies Prisma.PaymentListSelect;

type PaymentDbRecord = Prisma.PaymentListGetPayload<{ select: typeof PAYMENT_SELECT }>;

export const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

export const toText = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const distinctCodes = (codes: (number | null)[]): number[] =>
  [...new Set(codes)].filter((code): code is number => code !== null);

export const loadBrands = async (cardCodes: (number | null)[]): Promise<Map<number | null, Brand>> => {
  const records = await prisma.brandAidProp.findMany({
    where: { card_code: { in: distinctCodes(cardCodes) } },
    select: { card_code: true, brand: true, brand_type: true }
  });

  return new Map<number | null, Brand>(
    records.map(({ card_code, brand, brand_type }) => [card_code, { brand, brand_type }])
  );
};

export const loadMidias = async (typePays: (number | null)[]): Promise<Map<number | null, string>> => {
  const records = await prisma.typesPay.findMany({
    where: { type_pay: { in: distinctCodes(typePays) } },
    select: { type_pay: true, transaction_midia: true }
  });

  return new Map<number | null, string>(
    records.map(({ type_pay, transaction_midia }) => [type_pay, transaction_midia])
  );
};

const findCardCodes = async (brand?: string, brandType?: string): Promise<number[]> => {
  const records = await prisma.brandAidProp.findMany({
    where: {
      ...(brand ? { brand } : {}),
      ...(brandType ? { brand_type: brandType } : {})
    },
    select: { card_code: true }
  });

  return distinctCodes(records.map(({ card_code }) => card_code));
};

export const mapPayment = (
  payment: PaymentDbRecord,
  brands: Map<number | null, Brand>,
  midias: Map<number | null, string>
): PaymentListItem => {
  const brand = brands.get(payment.card_code);

  return {
    id: payment.id,
    response_code: toNumber(payment.response_code),
    auth_code: toText(payment.auth_code),
    auth_message: payment.auth_message,
    payment_time: payment.payment_time.toISOString(),
    card_hash: payment.card_hash,
    pan_mask: payment.pan_mask?.trimEnd() ?? null,
    fare: payment.fare,
    gateway_usn: payment.gateway_usn,
    pay_result: payment.pay_result,
    first_ride: payment.first_ride,
    brand_type: brand?.brand_type ?? null,
    brand: brand?.brand ?? null,
    transaction_midia: midias.get(payment.type_pay) ?? null,
    auth_number: payment.auth_number,
    refer_rec_neg: payment.refer_rec_neg,
    payment_id: payment.payment_id,
    transaction_uid: payment.transaction_uid
  };
};

export const getPaymentList = async ({
  paymentTimeStart,
  paymentTimeEnd,
  cardHash,
  panMask,
  brandType,
  brand,
  page,
  pageSize
}: GetPaymentListInput): Promise<GetPaymentListResult> => {
  const range = parseAndValidateDateRange(paymentTimeStart, paymentTimeEnd);

  if (!range.ok) {
    return { ok: false, status: 400, error: range.error };
  }

  const pagination = parseAndValidatePagination(page, pageSize);

  if (!pagination.ok) {
    return { ok: false, status: 400, error: pagination.error };
  }

  try {
    const where: Prisma.PaymentListWhereInput = {
      payment_time: { gte: range.start, lte: range.end },
      ...(cardHash ? { card_hash: cardHash } : {}),
      ...(panMask ? { pan_mask: { in: [panMask, panMask.padEnd(PAN_MASK_LENGTH, " ")] } } : {}),
      ...(brand || brandType ? { card_code: { in: await findCardCodes(brand, brandType) } } : {})
    };

    const [total, payments] = await Promise.all([
      prisma.paymentList.count({ where }),
      prisma.paymentList.findMany({
        where,
        orderBy: { id: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: PAYMENT_SELECT
      })
    ]);

    if (total === 0) {
      return { ok: false, status: 404, error: "No payments found." };
    }

    const [brands, midias] = await Promise.all([
      loadBrands(payments.map(({ card_code }) => card_code)),
      loadMidias(payments.map(({ type_pay }) => type_pay))
    ]);

    return {
      ok: true,
      status: 200,
      data: payments.map((payment) => mapPayment(payment, brands, midias)),
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total)
    };
  } catch (error) {
    console.error("getPaymentList failed:", error);
    return { ok: false, status: 500, error: "Internal error while fetching payment list." };
  }
};
