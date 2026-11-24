jest.mock("../services/paymentTapListService", () => ({ getPaymentTapList: jest.fn() }));

import { Request, Response } from "express";

import { getPaymentTapList } from "../services/paymentTapListService";
import { getPaymentTapListController } from "./paymentTapListController";

const mockedGetPaymentTapList = getPaymentTapList as jest.Mock;

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
});

describe("getPaymentTapListController", () => {
  it.each([
    ["absent", {}],
    ["empty", { transaction_uid: "" }],
    ["blank", { transaction_uid: "   " }],
    ["repeated", { transaction_uid: ["uid-1", "uid-2"] }]
  ])("returns 400 when transaction_uid is %s", async (_name, query) => {
    const res = await call(query);

    expectResponse(res, 400, { error: "Provide transaction_uid only once." });
    expect(mockedGetPaymentTapList).not.toHaveBeenCalled();
  });

  it("sends transaction_uid to the service without surrounding spaces and returns only data", async () => {
    const data = [{ id: "6b04748f28660a52fb7c0002" }];
    mockedGetPaymentTapList.mockResolvedValue({ ok: true, status: 200, data });

    const res = await call({ transaction_uid: " uid-1 " });

    expect(mockedGetPaymentTapList).toHaveBeenCalledTimes(1);
    expect(mockedGetPaymentTapList).toHaveBeenCalledWith("uid-1");
    expectResponse(res, 200, { data });
  });

  it.each([
    [404, "No taps found."],
    [500, "Internal error while fetching payment tap list."]
  ])("returns the %d of the service", async (status, error) => {
    mockedGetPaymentTapList.mockResolvedValue({ ok: false, status, error });

    const res = await call({ transaction_uid: "uid-1" });

    expectResponse(res, status, { error });
  });
});
