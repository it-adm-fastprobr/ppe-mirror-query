import { PaginationMeta } from "./paginationModel";

export type Brand = {
  brand: string;
  brand_type: string;
};

export type PaymentListItem = {
  id: string;
  response_code: number | null;
  auth_code: string | null;
  auth_message: string | null;
  payment_time: string;
  card_hash: string | null;
  pan_mask: string | null;
  fare: number | null;
  gateway_usn: string | null;
  pay_result: string | null;
  first_ride: string | null;
  brand_type: string | null;
  brand: string | null;
  transaction_midia: string | null;
  auth_number: string | null;
  refer_rec_neg: string | null;
  payment_id: string | null;
  transaction_uid: string | null;
};

export type GetPaymentListInput = {
  paymentTimeStart: string;
  paymentTimeEnd: string;
  cardHash?: string;
  panMask?: string;
  brandType?: string;
  brand?: string;
  page?: string;
  pageSize?: string;
};

export type GetPaymentListResult =
  | { ok: true; status: 200; data: PaymentListItem[]; pagination: PaginationMeta }
  | { ok: false; status: 400 | 404 | 500; error: string };
