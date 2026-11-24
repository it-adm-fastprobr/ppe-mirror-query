import { Request, Response } from "express";

import { getPaymentList } from "../services/paymentListService";

const QUERY_PARAMS = [
  "payment_time_start",
  "payment_time_end",
  "card_hash",
  "pan_mask",
  "brand_type",
  "brand",
  "page",
  "pageSize"
] as const;

type QueryParam = (typeof QUERY_PARAMS)[number];

export const getPaymentListController = async (req: Request, res: Response): Promise<void> => {
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

  const paymentTimeStart = read("payment_time_start");
  const paymentTimeEnd = read("payment_time_end");

  if (!paymentTimeStart || !paymentTimeEnd) {
    res.status(400).json({ error: "Provide payment_time_start and payment_time_end." });
    return;
  }

  const result = await getPaymentList({
    paymentTimeStart,
    paymentTimeEnd,
    cardHash: read("card_hash"),
    panMask: read("pan_mask"),
    brandType: read("brand_type"),
    brand: read("brand"),
    page: read("page"),
    pageSize: read("pageSize")
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(result.status).json({ data: result.data, pagination: result.pagination });
};
