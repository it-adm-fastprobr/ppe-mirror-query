import { NextFunction, Request, Response } from "express";

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
  const providedKey = req.header("X-API-Key");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    res.status(500).json({ error: "INTERNAL_API_KEY is not configured." });
    return;
  }

  if (!providedKey || providedKey !== expectedKey) {
    res.status(401).json({ error: "Invalid or missing API Key." });
    return;
  }

  next();
};
