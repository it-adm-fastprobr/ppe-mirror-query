import { Request, Response } from "express";

import { getPaymentTapList } from "../services/paymentTapListService";

const QUERY_PARAMS = [
  "transaction_uid",
  "card_hash",
  "tap_receiv_start",
  "tap_receiv_end",
  "local_description",
  "group_desc",
  "subgroup",
  "tap_status",
  "page",
  "pageSize"
] as const;

type QueryParam = (typeof QUERY_PARAMS)[number];

export const getPaymentTapListController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query;

  const repeated = QUERY_PARAMS.find((name) => query[name] !== undefined && typeof query[name] !== "string");

  if (repeated) {
    res.status(400).json({ error: `${repeated} must be provided only once.` });
    return;
  }

  const read = (name: QueryParam): string | undefined => {
    const value = query[name];
    return typeof value === "string" ? value.trim() || undefined : undefined;
  };

  const result = await getPaymentTapList({
    transactionUid: read("transaction_uid"),
    cardHash: read("card_hash"),
    tapReceivStart: read("tap_receiv_start"),
    tapReceivEnd: read("tap_receiv_end"),
    localDescription: read("local_description"),
    groupDesc: read("group_desc"),
    subgroup: read("subgroup"),
    tapStatus: read("tap_status"),
    page: read("page"),
    pageSize: read("pageSize")
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(result.status).json({ data: result.data, pagination: result.pagination });
};
