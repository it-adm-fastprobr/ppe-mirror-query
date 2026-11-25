jest.mock("./utils/prisma", () => ({
  prisma: {
    paymentList: { findMany: jest.fn(), count: jest.fn() },
    tapPayList: { findMany: jest.fn() },
    tapLog: { findMany: jest.fn() },
    brandAidProp: { findMany: jest.fn() },
    typesPay: { findMany: jest.fn() },
    terminalTreeHistorical: { findMany: jest.fn() }
  }
}));

import { Server } from "http";
import { AddressInfo } from "net";

import app from "./app";
import { prisma } from "./utils/prisma";

const mockedPrisma = prisma as unknown as {
  paymentList: { findMany: jest.Mock; count: jest.Mock };
  tapPayList: { findMany: jest.Mock };
  tapLog: { findMany: jest.Mock };
  brandAidProp: { findMany: jest.Mock };
  typesPay: { findMany: jest.Mock };
  terminalTreeHistorical: { findMany: jest.Mock };
};

const PAYMENT_LIST = "/api/payment-list";
const PAYMENT_TAP_LIST = "/api/payment-tap-list";
const DATES = "payment_time_start=2026-11-23&payment_time_end=2026-11-23";

const VALID_REQUESTS = [`${PAYMENT_LIST}?${DATES}`, `${PAYMENT_TAP_LIST}?transaction_uid=uid-1`];

const payment = {
  id: "6b04748f28660a52fb7c0001",
  response_code: "302",
  auth_code: 0,
  auth_message: "Transacao negada",
  payment_time: new Date("2026-11-24T02:30:00.000Z"),
  card_hash: "0123456789abcdef0123456789abcdef",
  pan_mask: "400000******0002    ",
  fare: 790,
  gateway_usn: "",
  pay_result: "REC",
  first_ride: "2026-11-23T08:00:00",
  auth_number: "123456",
  refer_rec_neg: "uid-3",
  payment_id: "pay-4",
  transaction_uid: "uid-4",
  acq_name: "CIELO 1",
  card_code: 1,
  type_pay: 1
};

const tap = {
  id: "6b04748f28660a52fb7c0002",
  tap_receiv: new Date("2026-11-23T11:00:00.000Z"),
  tap_read: new Date("2026-11-23T11:00:00.000Z"),
  sam: "0000000001",
  serial_number: "SN-0001",
  unique_id: "tap-3",
  card_hash: "0123456789abcdef0123456789abcdef",
  pan_mask: "400000******0002",
  tap_status: 0,
  terminal_version: "1.0",
  app_priority: 1,
  app_data: { direction: 0, route: "001" },
  hash_aux: "",
  app_name: "APP_EXEMPLO",
  terminal_id: "T-001",
  card_code: 1,
  type_pay: 1
};

let server: Server;
let baseUrl: string;
let consoleError: jest.SpyInstance;

const ORIGINAL_ENV = process.env;

const request = async (path: string, init: RequestInit = { headers: { "X-API-Key": "test-key" } }) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return { status: response.status, contentType: response.headers.get("content-type"), text };
};

const requestJson = async (path: string, init?: RequestInit) => {
  const { status, contentType, text } = await request(path, init);
  expect(contentType).toContain("application/json");
  return { status, body: JSON.parse(text) };
};

const expectNoQueries = () => {
  for (const model of Object.values(mockedPrisma)) {
    for (const query of Object.values(model)) {
      expect(query).not.toHaveBeenCalled();
    }
  }
};

beforeAll((done) => {
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    done();
  });
});

afterAll((done) => {
  process.env = ORIGINAL_ENV;
  server.closeAllConnections();
  server.close(done);
});

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...ORIGINAL_ENV, INTERNAL_API_KEY: "test-key" };
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

  mockedPrisma.paymentList.count.mockResolvedValue(1);
  mockedPrisma.paymentList.findMany.mockResolvedValue([payment]);
  mockedPrisma.tapPayList.findMany.mockImplementation(async ({ where }) =>
    where.transaction_uid === "uid-3" ? [{ unique_id: "tap-3" }] : []
  );
  mockedPrisma.tapLog.findMany.mockImplementation(async ({ where }) =>
    where.unique_id.in.includes("tap-3") ? [tap] : []
  );
  mockedPrisma.brandAidProp.findMany.mockResolvedValue([{ card_code: 1, brand: "VISA", brand_type: "CREDITO" }]);
  mockedPrisma.typesPay.findMany.mockResolvedValue([{ type_pay: 1, transaction_midia: "CARD" }]);
  mockedPrisma.terminalTreeHistorical.findMany.mockResolvedValue([]);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("API key", () => {
  it.each(VALID_REQUESTS)("returns 401 without the key: %s", async (path) => {
    expect(await requestJson(path, {})).toEqual({ status: 401, body: { error: "Invalid or missing API Key." } });
    expectNoQueries();
  });

  it.each(VALID_REQUESTS)("returns 401 with the wrong key: %s", async (path) => {
    expect(await requestJson(path, { headers: { "X-API-Key": "wrong-key" } })).toEqual({
      status: 401,
      body: { error: "Invalid or missing API Key." }
    });
    expectNoQueries();
  });

  it.each(VALID_REQUESTS)("returns 500 when INTERNAL_API_KEY is not configured: %s", async (path) => {
    delete process.env.INTERNAL_API_KEY;

    expect(await requestJson(path)).toEqual({ status: 500, body: { error: "INTERNAL_API_KEY is not configured." } });
    expectNoQueries();
  });

  it.each([PAYMENT_LIST, PAYMENT_TAP_LIST])("checks the key before the parameters: %s", async (path) => {
    expect((await requestJson(path, {})).status).toBe(401);
  });
});

describe("GET /api/payment-list", () => {
  it("returns 200 with data and pagination", async () => {
    const { status, body } = await requestJson(`${PAYMENT_LIST}?${DATES}`);

    expect(status).toBe(200);
    expect(body).toEqual({
      data: [
        {
          id: "6b04748f28660a52fb7c0001",
          response_code: 302,
          auth_code: "0",
          auth_message: "Transacao negada",
          payment_time: "2026-11-24T02:30:00.000Z",
          card_hash: "0123456789abcdef0123456789abcdef",
          pan_mask: "400000******0002",
          fare: 790,
          gateway_usn: "",
          pay_result: "REC",
          first_ride: "2026-11-23T08:00:00",
          brand_type: "CREDITO",
          brand: "VISA",
          transaction_midia: "CARD",
          auth_number: "123456",
          refer_rec_neg: "uid-3",
          payment_id: "pay-4",
          transaction_uid: "uid-4",
          acq_name: "CIELO 1"
        }
      ],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 }
    });
  });

  it("applies the parameters of the query string", async () => {
    mockedPrisma.brandAidProp.findMany.mockResolvedValueOnce([{ card_code: 286 }]);

    const { status } = await requestJson(
      `${PAYMENT_LIST}?payment_time_start=2026-11-23T08:00:00-03:00` +
        `&payment_time_end=${encodeURIComponent("2026-11-23T12:00:00+01:00")}` +
        "&card_hash=abc&pan_mask=510000******0003&brand_type=DEBITO&brand=MASTER&page=2&pageSize=10"
    );

    expect(status).toBe(200);
    expect(mockedPrisma.brandAidProp.findMany.mock.calls[0][0].where).toEqual({ brand: "MASTER", brand_type: "DEBITO" });
    expect(mockedPrisma.paymentList.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        payment_time: { gte: new Date("2026-11-23T11:00:00.000Z"), lte: new Date("2026-11-23T11:00:00.000Z") },
        card_hash: "abc",
        pan_mask: { in: ["510000******0003", "510000******0003    "] },
        card_code: { in: [286] }
      },
      skip: 10,
      take: 10
    });
  });

  it.each([
    "payment_time_start",
    "payment_time_end",
    "card_hash",
    "pan_mask",
    "brand_type",
    "brand",
    "page",
    "pageSize"
  ])("returns 400 when %s is repeated in the query string", async (name) => {
    expect(await requestJson(`${PAYMENT_LIST}?${DATES}&${name}=1&${name}=2`)).toEqual({
      status: 400,
      body: { error: `${name} must be provided only once.` }
    });
    expectNoQueries();
  });

  it.each([
    ["", "Provide payment_time_start and payment_time_end."],
    ["?payment_time_end=2026-11-23", "Provide payment_time_start and payment_time_end."],
    ["?payment_time_start=2026-11-23", "Provide payment_time_start and payment_time_end."],
    [
      "?payment_time_start=2026-02-31&payment_time_end=2026-11-23",
      "payment_time_start and payment_time_end must be valid ISO dates."
    ],
    [
      "?payment_time_start=2026-11-23&payment_time_end=2026-11-22",
      "payment_time_end must be greater than or equal to payment_time_start."
    ],
    [`?${DATES}&page=0`, "page must be a positive integer."],
    [`?${DATES}&pageSize=201`, "pageSize must be an integer between 1 and 200."]
  ])("returns 400 for %p", async (query, error) => {
    expect(await requestJson(`${PAYMENT_LIST}${query}`)).toEqual({ status: 400, body: { error } });
    expectNoQueries();
  });

  it("returns 404 when there are no payments", async () => {
    mockedPrisma.paymentList.count.mockResolvedValue(0);
    mockedPrisma.paymentList.findMany.mockResolvedValue([]);

    expect(await requestJson(`${PAYMENT_LIST}?${DATES}`)).toEqual({
      status: 404,
      body: { error: "No payments found." }
    });
  });

  it("returns 500 with the cause only in the log", async () => {
    const failure = new Error("mongodb://user:secret@host is unreachable");
    mockedPrisma.paymentList.findMany.mockRejectedValue(failure);

    expect(await requestJson(`${PAYMENT_LIST}?${DATES}`)).toEqual({
      status: 500,
      body: { error: "Internal error while fetching payment list." }
    });
    expect(consoleError).toHaveBeenCalledWith("getPaymentList failed:", failure);
  });
});

describe("GET /api/payment-tap-list", () => {
  it("returns 200 with data", async () => {
    const { status, body } = await requestJson(`${PAYMENT_TAP_LIST}?transaction_uid=uid-3`);

    expect(status).toBe(200);
    expect(body).toEqual({
      data: [
        {
          id: "6b04748f28660a52fb7c0002",
          tap_receiv: "2026-11-23T11:00:00.000Z",
          tap_read: "2026-11-23T11:00:00.000Z",
          sam: "0000000001",
          local_description: null,
          group_desc: null,
          subgroup: null,
          serial_number: "SN-0001",
          unique_id: "tap-3",
          card_hash: "0123456789abcdef0123456789abcdef",
          pan_mask: "400000******0002",
          brand_type: "CREDITO",
          brand: "VISA",
          transaction_midia: "CARD",
          tap_status: 0,
          terminal_version: "1.0",
          app_priority: 1,
          app_data: { direction: 0, route: "001" },
          hash_aux: "",
          app_name: "APP_EXEMPLO"
        }
      ]
    });
  });

  it.each(["", "?transaction_uid=", "?transaction_uid=uid-1&transaction_uid=uid-2"])(
    "returns 400 for %p",
    async (query) => {
      expect(await requestJson(`${PAYMENT_TAP_LIST}${query}`)).toEqual({
        status: 400,
        body: { error: "Provide transaction_uid only once." }
      });
      expectNoQueries();
    }
  );

  it("returns 404 for an unknown transaction_uid", async () => {
    expect(await requestJson(`${PAYMENT_TAP_LIST}?transaction_uid=uid-inexistente`)).toEqual({
      status: 404,
      body: { error: "No taps found." }
    });
  });

  it("returns 404 for a REC and 200 for its refer_rec_neg", async () => {
    const list = await requestJson(`${PAYMENT_LIST}?${DATES}`);
    const [rec] = list.body.data;

    const byOwnUid = await requestJson(`${PAYMENT_TAP_LIST}?transaction_uid=${rec.transaction_uid}`);
    const byReference = await requestJson(`${PAYMENT_TAP_LIST}?transaction_uid=${rec.refer_rec_neg}`);

    expect(rec.pay_result).toBe("REC");
    expect(byOwnUid.status).toBe(404);
    expect(byReference.status).toBe(200);
    expect(byReference.body.data).toHaveLength(1);
    expect(byReference.body.data[0].unique_id).toBe("tap-3");
  });

  it("returns 500 with the cause only in the log", async () => {
    const failure = new Error("mongodb://user:secret@host is unreachable");
    mockedPrisma.tapPayList.findMany.mockRejectedValue(failure);

    expect(await requestJson(`${PAYMENT_TAP_LIST}?transaction_uid=uid-3`)).toEqual({
      status: 500,
      body: { error: "Internal error while fetching payment tap list." }
    });
    expect(consoleError).toHaveBeenCalledWith("getPaymentTapList failed:", failure);
  });
});

describe("other routes", () => {
  it.each(["/", "/api", "/payment-list", "/api/payment-list/uid-1", "/api/payment-tap-list/uid-1"])(
    "returns 404 for GET %s",
    async (path) => {
      expect((await request(path)).status).toBe(404);
      expectNoQueries();
    }
  );

  it.each(["POST", "PUT", "PATCH", "DELETE"])("returns 404 for %s, since the API is read-only", async (method) => {
    for (const path of VALID_REQUESTS) {
      expect((await request(path, { method, headers: { "X-API-Key": "test-key" } })).status).toBe(404);
    }

    expectNoQueries();
  });
});
