jest.mock("../services/paymentTapListService", () => ({ getPaymentTapList: jest.fn() }));

import { Request, Response } from "express";

import { getPaymentTapList } from "../services/paymentTapListService";
import { getPaymentTapListController } from "./paymentTapListController";

const mockedGetPaymentTapList = getPaymentTapList as jest.Mock;

const PAGINATION = { page: 1, pageSize: 50, total: 1, totalPages: 1 };

const PARAMS = [
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
];

const NOT_INFORMED = {
  transactionUid: undefined,
  cardHash: undefined,
  tapReceivStart: undefined,
  tapReceivEnd: undefined,
  localDescription: undefined,
  groupDesc: undefined,
  subgroup: undefined,
  tapStatus: undefined,
  page: undefined,
  pageSize: undefined
};

const buildRes = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

const call = async (query: Record<string, unknown>): Promise<Response> => {
  const res = buildRes();
  await getPaymentTapListController({ query } as unknown as Request, res);
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
  mockedGetPaymentTapList.mockResolvedValue({ ok: true, status: 200, data: [], pagination: PAGINATION });
});

describe("getPaymentTapListController", () => {
  it.each(PARAMS)("returns 400 when %s is repeated", async (name) => {
    const res = await call({ transaction_uid: "uid-1", [name]: ["a", "b"] });

    expectResponse(res, 400, { error: `${name} must be provided only once.` });
    expect(mockedGetPaymentTapList).not.toHaveBeenCalled();
  });

  it("ignores a repeated parameter that does not belong to the route", async () => {
    const res = await call({ other: ["a", "b"] });

    expectResponse(res, 200, { data: [], pagination: PAGINATION });
  });

  it("calls the service without any parameter", async () => {
    const res = await call({});

    expect(mockedGetPaymentTapList).toHaveBeenCalledTimes(1);
    expect(mockedGetPaymentTapList).toHaveBeenCalledWith(NOT_INFORMED);
    expectResponse(res, 200, { data: [], pagination: PAGINATION });
  });

  it("sends every parameter to the service, without surrounding spaces", async () => {
    await call({
      transaction_uid: " uid-1 ",
      card_hash: " fedcba9876543210fedcba9876543210",
      tap_receiv_start: " 2026-11-22 ",
      tap_receiv_end: "2026-11-23 ",
      local_description: " ESTACAO A ",
      group_desc: " 001 - Grupo A ",
      subgroup: " Modal A ",
      tap_status: " 0 ",
      page: " 2 ",
      pageSize: " 10 "
    });

    expect(mockedGetPaymentTapList).toHaveBeenCalledTimes(1);
    expect(mockedGetPaymentTapList).toHaveBeenCalledWith({
      transactionUid: "uid-1",
      cardHash: "fedcba9876543210fedcba9876543210",
      tapReceivStart: "2026-11-22",
      tapReceivEnd: "2026-11-23",
      localDescription: "ESTACAO A",
      groupDesc: "001 - Grupo A",
      subgroup: "Modal A",
      tapStatus: "0",
      page: "2",
      pageSize: "10"
    });
  });

  it.each([
    ["empty", ""],
    ["blank", "   "]
  ])("treats %s parameters as not informed", async (_name, value) => {
    await call(Object.fromEntries(PARAMS.map((name) => [name, value])));

    expect(mockedGetPaymentTapList).toHaveBeenCalledWith(NOT_INFORMED);
  });

  it("returns only data and pagination on success", async () => {
    const data = [{ id: "6b04748f28660a52fb7c0002" }];
    mockedGetPaymentTapList.mockResolvedValue({ ok: true, status: 200, data, pagination: PAGINATION });

    const res = await call({ transaction_uid: "uid-1" });

    expectResponse(res, 200, { data, pagination: PAGINATION });
  });

  it.each([
    [400, "tap_status must be a non-negative integer."],
    [404, "No taps found."],
    [500, "Internal error while fetching payment tap list."]
  ])("returns the %d of the service", async (status, error) => {
    mockedGetPaymentTapList.mockResolvedValue({ ok: false, status, error });

    const res = await call({ transaction_uid: "uid-1" });

    expectResponse(res, status, { error });
  });
});
