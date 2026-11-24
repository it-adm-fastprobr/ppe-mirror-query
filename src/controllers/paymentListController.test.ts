jest.mock("../services/paymentListService", () => ({ getPaymentList: jest.fn() }));

import { Request, Response } from "express";

import { getPaymentList } from "../services/paymentListService";
import { getPaymentListController } from "./paymentListController";

const mockedGetPaymentList = getPaymentList as jest.Mock;

const DATES = { payment_time_start: "2026-11-23", payment_time_end: "2026-11-23" };

const PAGINATION = { page: 1, pageSize: 50, total: 1, totalPages: 1 };

const buildRes = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

const call = async (query: Record<string, unknown>): Promise<Response> => {
  const res = buildRes();
  await getPaymentListController({ query } as unknown as Request, res);
  return res;
};

const expectResponse = (res: Response, status: number, body: unknown) => {
  expect(res.status).toHaveBeenCalledTimes(1);
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith(body);
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGetPaymentList.mockResolvedValue({ ok: true, status: 200, data: [], pagination: PAGINATION });
});

describe("getPaymentListController", () => {
  it.each([
    "payment_time_start",
    "payment_time_end",
    "card_hash",
    "pan_mask",
    "brand_type",
    "brand",
    "page",
    "pageSize"
  ])("returns 400 when %s is repeated", async (name) => {
    const res = await call({ ...DATES, [name]: ["a", "b"] });

    expectResponse(res, 400, { error: `${name} must be provided only once.` });
    expect(mockedGetPaymentList).not.toHaveBeenCalled();
  });

  it("reports the repeated parameter before the missing dates", async () => {
    const res = await call({ brand: ["VISA", "ELO"] });

    expectResponse(res, 400, { error: "brand must be provided only once." });
  });

  it("ignores a repeated parameter that does not belong to the route", async () => {
    const res = await call({ ...DATES, other: ["a", "b"] });

    expectResponse(res, 200, { data: [], pagination: PAGINATION });
  });

  it.each([
    ["both dates", {}],
    ["payment_time_start", { payment_time_end: "2026-11-23" }],
    ["payment_time_end", { payment_time_start: "2026-11-23" }],
    ["payment_time_start (empty)", { ...DATES, payment_time_start: "" }],
    ["payment_time_end (blank)", { ...DATES, payment_time_end: "   " }]
  ])("returns 400 without %s", async (_name, query) => {
    const res = await call(query);

    expectResponse(res, 400, { error: "Provide payment_time_start and payment_time_end." });
    expect(mockedGetPaymentList).not.toHaveBeenCalled();
  });

  it("sends every parameter to the service, without surrounding spaces", async () => {
    await call({
      payment_time_start: " 2026-11-22 ",
      payment_time_end: "2026-11-23 ",
      card_hash: " fedcba9876543210fedcba9876543210",
      pan_mask: "510000******0003    ",
      brand_type: " DEBITO ",
      brand: " MASTER ",
      page: " 2 ",
      pageSize: " 10 "
    });

    expect(mockedGetPaymentList).toHaveBeenCalledTimes(1);
    expect(mockedGetPaymentList).toHaveBeenCalledWith({
      paymentTimeStart: "2026-11-22",
      paymentTimeEnd: "2026-11-23",
      cardHash: "fedcba9876543210fedcba9876543210",
      panMask: "510000******0003",
      brandType: "DEBITO",
      brand: "MASTER",
      page: "2",
      pageSize: "10"
    });
  });

  it.each([
    ["absent", {}],
    ["empty", { card_hash: "", pan_mask: "", brand_type: "", brand: "", page: "", pageSize: "" }],
    ["blank", { card_hash: " ", pan_mask: " ", brand_type: " ", brand: " ", page: " ", pageSize: " " }]
  ])("treats %s optional parameters as not informed", async (_name, optionals) => {
    await call({ ...DATES, ...optionals });

    expect(mockedGetPaymentList).toHaveBeenCalledWith({
      paymentTimeStart: "2026-11-23",
      paymentTimeEnd: "2026-11-23",
      cardHash: undefined,
      panMask: undefined,
      brandType: undefined,
      brand: undefined,
      page: undefined,
      pageSize: undefined
    });
  });

  it("returns only data and pagination on success", async () => {
    const data = [{ id: "6b04748f28660a52fb7c0001" }];
    mockedGetPaymentList.mockResolvedValue({ ok: true, status: 200, data, pagination: PAGINATION });

    const res = await call(DATES);

    expectResponse(res, 200, { data, pagination: PAGINATION });
  });

  it.each([
    [400, "page must be a positive integer."],
    [404, "No payments found."],
    [500, "Internal error while fetching payment list."]
  ])("returns the %d of the service", async (status, error) => {
    mockedGetPaymentList.mockResolvedValue({ ok: false, status, error });

    const res = await call(DATES);

    expectResponse(res, status, { error });
  });
});
