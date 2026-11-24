import { Request, Response } from "express";

import { apiKeyAuth } from "./apiKeyAuth";

const buildReq = (apiKey?: string): Request => {
  return { header: jest.fn().mockReturnValue(apiKey) } as unknown as Request;
};

const buildRes = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe("apiKeyAuth", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, INTERNAL_API_KEY: "test-key" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("calls next when the key matches", () => {
    const req = buildReq("test-key");
    const res = buildRes();
    const next = jest.fn();

    apiKeyAuth(req, res, next);

    expect(req.header).toHaveBeenCalledWith("X-API-Key");
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "wrong-key", "TEST-KEY", "test-key ", "test-ke"])("returns 401 for the key %p", (apiKey) => {
    const res = buildRes();
    const next = jest.fn();

    apiKeyAuth(buildReq(apiKey), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or missing API Key." });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "test-key"])("returns 500 when INTERNAL_API_KEY is not set and the key is %p", (apiKey) => {
    delete process.env.INTERNAL_API_KEY;
    const res = buildRes();
    const next = jest.fn();

    apiKeyAuth(buildReq(apiKey), res, next);

    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "INTERNAL_API_KEY is not configured." });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 500 when INTERNAL_API_KEY is empty", () => {
    process.env.INTERNAL_API_KEY = "";
    const res = buildRes();
    const next = jest.fn();

    apiKeyAuth(buildReq(""), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
