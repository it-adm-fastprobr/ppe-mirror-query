import { Request, Response } from "express";

import { getPaymentTapList } from "../services/paymentTapListService";

export const getPaymentTapListController = async (req: Request, res: Response): Promise<void> => {
  const value = req.query.transaction_uid;
  const transactionUid = typeof value === "string" ? value.trim() : "";

  if (!transactionUid) {
    res.status(400).json({ error: "Provide transaction_uid only once." });
    return;
  }

  const result = await getPaymentTapList(transactionUid);

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(result.status).json({ data: result.data });
};
