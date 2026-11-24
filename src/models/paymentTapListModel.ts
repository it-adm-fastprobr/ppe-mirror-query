export type PaymentTapListItem = {
  id: string;
  tap_receiv: string | null;
  tap_read: string | null;
  sam: string | null;
  local_description: string | null;
  group_desc: string | null;
  subgroup: string | null;
  serial_number: string | null;
  unique_id: string;
  card_hash: string | null;
  pan_mask: string | null;
  brand_type: string | null;
  brand: string | null;
  transaction_midia: string | null;
  tap_status: number | null;
  terminal_version: string | null;
  app_priority: number | null;
  app_data: Record<string, unknown> | null;
  hash_aux: string | null;
  app_name: string | null;
};

export type GetPaymentTapListResult =
  | { ok: true; status: 200; data: PaymentTapListItem[] }
  | { ok: false; status: 404 | 500; error: string };
