jest.mock("../utils/prisma", () => ({
  prisma: {
    paymentList: { findMany: jest.fn(), count: jest.fn() },
    brandAidProp: { findMany: jest.fn() },
    typesPay: { findMany: jest.fn() }
  }
}));

import { Brand, GetPaymentListInput } from "../models";
import { prisma } from "../utils/prisma";
import { getPaymentList, loadBrands, loadMidias, mapPayment, toNumber, toText } from "./paymentListService";

const mockedPrisma = prisma as unknown as {
  paymentList: { findMany: jest.Mock; count: jest.Mock };
  brandAidProp: { findMany: jest.Mock };
  typesPay: { findMany: jest.Mock };
};

const RESPONSE_FIELDS = [
  "id",
  "response_code",
  "auth_code",
  "auth_message",
  "payment_time",
  "card_hash",
  "pan_mask",
  "fare",
  "gateway_usn",
  "pay_result",
  "first_ride",
  "brand_type",
  "brand",
  "transaction_midia",
  "auth_number",
  "refer_rec_neg",
  "payment_id",
  "transaction_uid"
];

const DAY: GetPaymentListInput = { paymentTimeStart: "2026-11-23", paymentTimeEnd: "2026-11-23" };

const DAY_WHERE = {
  payment_time: {
    gte: new Date("2026-11-23T03:00:00.000Z"),
    lte: new Date("2026-11-24T02:59:59.999Z")
  }
};

const BRANDS = [
  { card_code: 1, brand: "VISA", brand_type: "CREDITO" },
  { card_code: 221, brand: "VISA", brand_type: "DEBITO" },
  { card_code: 286, brand: "MASTER", brand_type: "DEBITO" }
];

const MIDIAS = [
  { type_pay: 1, transaction_midia: "CARD" },
  { type_pay: 2, transaction_midia: "MOBILE" }
];

const buildPayment = (overrides: Partial<Parameters<typeof mapPayment>[0]> = {}) => ({
  id: "6b04748f28660a52fb7c0001",
  response_code: 0,
  auth_code: "00",
  auth_message: "Transacao aprovada",
  payment_time: new Date("2026-11-23T11:00:00.000Z"),
  card_hash: "0123456789abcdef0123456789abcdef",
  pan_mask: "400000******0002",
  fare: 790,
  gateway_usn: "",
  pay_result: "OK",
  first_ride: "2026-11-23T08:00:00",
  auth_number: "123456",
  refer_rec_neg: "0",
  payment_id: "pay-1",
  transaction_uid: "uid-1",
  card_code: 1,
  type_pay: 1,
  ...overrides
});

const brandMap = new Map<number | null, Brand>([[1, { brand: "VISA", brand_type: "CREDITO" }]]);
const midiaMap = new Map<number | null, string>([[1, "CARD"]]);

const mockPayments = (payments: ReturnType<typeof buildPayment>[], total = payments.length) => {
  mockedPrisma.paymentList.count.mockResolvedValue(total);
  mockedPrisma.paymentList.findMany.mockResolvedValue(payments);
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockedPrisma.brandAidProp.findMany.mockResolvedValue(BRANDS);
  mockedPrisma.typesPay.findMany.mockResolvedValue(MIDIAS);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("toNumber", () => {
  it.each([
    [0, 0],
    [302, 302],
    ["0", 0],
    ["302", 302],
    ["255", 255],
    [" 302 ", 302]
  ])("converts %p to %p", (value, expected) => {
    expect(toNumber(value)).toBe(expected);
  });

  it.each([[null], [undefined], [""], ["   "], ["N7"], ["302x"], ["Infinity"], [NaN], [Infinity], [true], [{}], [[]]])(
    "returns null for %p",
    (value) => {
      expect(toNumber(value)).toBeNull();
    }
  );
});

describe("toText", () => {
  it.each([
    ["00", "00"],
    ["", ""],
    [0, "0"],
    [422, "422"]
  ])("converts %p to %p", (value, expected) => {
    expect(toText(value)).toBe(expected);
  });

  it.each([[null], [undefined]])("returns null for %p", (value) => {
    expect(toText(value)).toBeNull();
  });
});

describe("loadBrands", () => {
  it("queries the distinct codes once, ignoring null, and maps by card_code", async () => {
    const brands = await loadBrands([1, 286, 1, null]);

    expect(mockedPrisma.brandAidProp.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.brandAidProp.findMany).toHaveBeenCalledWith({
      where: { card_code: { in: [1, 286] } },
      select: { card_code: true, brand: true, brand_type: true }
    });
    expect(brands.get(286)).toEqual({ brand: "MASTER", brand_type: "DEBITO" });
    expect(brands.get(null)).toBeUndefined();
  });

  it("keeps code 0 in the query", async () => {
    await loadBrands([0]);

    expect(mockedPrisma.brandAidProp.findMany.mock.calls[0][0].where).toEqual({ card_code: { in: [0] } });
  });
});

describe("loadMidias", () => {
  it("queries the distinct types once, ignoring null, and maps by type_pay", async () => {
    const midias = await loadMidias([2, null, 2, 1]);

    expect(mockedPrisma.typesPay.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.typesPay.findMany).toHaveBeenCalledWith({
      where: { type_pay: { in: [2, 1] } },
      select: { type_pay: true, transaction_midia: true }
    });
    expect(midias.get(1)).toBe("CARD");
    expect(midias.get(2)).toBe("MOBILE");
    expect(midias.get(null)).toBeUndefined();
  });
});

describe("mapPayment", () => {
  it("maps a complete payment to the 18 response fields", () => {
    const item = mapPayment(buildPayment(), brandMap, midiaMap);

    expect(Object.keys(item)).toEqual(RESPONSE_FIELDS);
    expect(item).toEqual({
      id: "6b04748f28660a52fb7c0001",
      response_code: 0,
      auth_code: "00",
      auth_message: "Transacao aprovada",
      payment_time: "2026-11-23T11:00:00.000Z",
      card_hash: "0123456789abcdef0123456789abcdef",
      pan_mask: "400000******0002",
      fare: 790,
      gateway_usn: "",
      pay_result: "OK",
      first_ride: "2026-11-23T08:00:00",
      brand_type: "CREDITO",
      brand: "VISA",
      transaction_midia: "CARD",
      auth_number: "123456",
      refer_rec_neg: "0",
      payment_id: "pay-1",
      transaction_uid: "uid-1"
    });
  });

  it("returns null for every field without value, except id and payment_time", () => {
    const item = mapPayment(
      buildPayment({
        response_code: null,
        auth_code: null,
        auth_message: null,
        card_hash: null,
        pan_mask: null,
        fare: null,
        gateway_usn: null,
        pay_result: null,
        first_ride: null,
        auth_number: null,
        refer_rec_neg: null,
        payment_id: null,
        transaction_uid: null,
        card_code: null,
        type_pay: null
      }),
      brandMap,
      midiaMap
    );

    const { id, payment_time, ...others } = item;

    expect(Object.keys(item)).toEqual(RESPONSE_FIELDS);
    expect(id).toBe("6b04748f28660a52fb7c0001");
    expect(payment_time).toBe("2026-11-23T11:00:00.000Z");
    expect(Object.values(others).every((value) => value === null)).toBe(true);
  });

  it("returns null for auxiliary fields without a match", () => {
    const item = mapPayment(buildPayment({ card_code: 999, type_pay: 9 }), brandMap, midiaMap);

    expect(item.brand).toBeNull();
    expect(item.brand_type).toBeNull();
    expect(item.transaction_midia).toBeNull();
  });

  it("removes only the trailing spaces of pan_mask", () => {
    expect(mapPayment(buildPayment({ pan_mask: "510000******0003    " }), brandMap, midiaMap).pan_mask).toBe(
      "510000******0003"
    );
    expect(mapPayment(buildPayment({ pan_mask: " 510000 0003 " }), brandMap, midiaMap).pan_mask).toBe(" 510000 0003");
  });

  it("converts response_code and auth_code recorded with another type", () => {
    const item = mapPayment(buildPayment({ response_code: "302", auth_code: 422 }), brandMap, midiaMap);

    expect(item.response_code).toBe(302);
    expect(item.auth_code).toBe("422");
  });

  it("returns null for a response_code that is not a number", () => {
    expect(mapPayment(buildPayment({ response_code: "N7" }), brandMap, midiaMap).response_code).toBeNull();
  });
});

describe("getPaymentList", () => {
  const expectNoQueries = () => {
    expect(mockedPrisma.paymentList.count).not.toHaveBeenCalled();
    expect(mockedPrisma.paymentList.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.brandAidProp.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.typesPay.findMany).not.toHaveBeenCalled();
  };

  describe("validation", () => {
    it.each([
      [{ paymentTimeStart: "2026-02-31", paymentTimeEnd: "2026-11-23" }],
      [{ paymentTimeStart: "2026-11-23", paymentTimeEnd: "23/11/2026" }]
    ])("returns 400 for invalid dates (%p)", async (input) => {
      const result = await getPaymentList(input);

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "payment_time_start and payment_time_end must be valid ISO dates."
      });
      expectNoQueries();
    });

    it("returns 400 when the end is before the start", async () => {
      const result = await getPaymentList({ paymentTimeStart: "2026-11-23", paymentTimeEnd: "2026-11-22" });

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "payment_time_end must be greater than or equal to payment_time_start."
      });
      expectNoQueries();
    });

    it.each([
      ["0", undefined, "page must be a positive integer."],
      ["-1", undefined, "page must be a positive integer."],
      ["abc", undefined, "page must be a positive integer."],
      [undefined, "0", "pageSize must be an integer between 1 and 200."],
      [undefined, "201", "pageSize must be an integer between 1 and 200."],
      [undefined, "x", "pageSize must be an integer between 1 and 200."]
    ])("returns 400 for invalid pagination (page=%p, pageSize=%p)", async (page, pageSize, error) => {
      const result = await getPaymentList({ ...DAY, page, pageSize });

      expect(result).toEqual({ ok: false, status: 400, error });
      expectNoQueries();
    });

    it("reports the date before the pagination when both are invalid", async () => {
      const result = await getPaymentList({ paymentTimeStart: "abc", paymentTimeEnd: "abc", page: "0" });

      expect(result).toMatchObject({
        status: 400,
        error: "payment_time_start and payment_time_end must be valid ISO dates."
      });
    });
  });

  describe("query", () => {
    beforeEach(() => {
      mockPayments([buildPayment()]);
    });

    it("filters only by the period, by id DESC, with the default page", async () => {
      await getPaymentList(DAY);

      expect(mockedPrisma.paymentList.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.paymentList.findMany).toHaveBeenCalledWith({
        where: DAY_WHERE,
        orderBy: { id: "desc" },
        skip: 0,
        take: 50,
        select: {
          id: true,
          response_code: true,
          auth_code: true,
          auth_message: true,
          payment_time: true,
          card_hash: true,
          pan_mask: true,
          fare: true,
          gateway_usn: true,
          pay_result: true,
          first_ride: true,
          auth_number: true,
          refer_rec_neg: true,
          payment_id: true,
          transaction_uid: true,
          card_code: true,
          type_pay: true
        }
      });
      expect(mockedPrisma.paymentList.count).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.paymentList.count).toHaveBeenCalledWith({ where: DAY_WHERE });
    });

    it("sends skip and take of the requested page", async () => {
      await getPaymentList({ ...DAY, page: "3", pageSize: "20" });

      expect(mockedPrisma.paymentList.findMany.mock.calls[0][0]).toMatchObject({ skip: 40, take: 20 });
    });

    it("filters by card_hash", async () => {
      await getPaymentList({ ...DAY, cardHash: "fedcba9876543210fedcba9876543210" });

      expect(mockedPrisma.paymentList.findMany.mock.calls[0][0].where).toEqual({
        ...DAY_WHERE,
        card_hash: "fedcba9876543210fedcba9876543210"
      });
    });

    it("filters by pan_mask with and without the spaces up to 20 positions", async () => {
      await getPaymentList({ ...DAY, panMask: "510000******0003" });

      expect(mockedPrisma.paymentList.findMany.mock.calls[0][0].where).toEqual({
        ...DAY_WHERE,
        pan_mask: { in: ["510000******0003", "510000******0003    "] }
      });
    });

    it.each([
      ["brand", { brand: "VISA" }, { brand: "VISA" }],
      ["brand_type", { brandType: "DEBITO" }, { brand_type: "DEBITO" }],
      ["brand and brand_type", { brand: "VISA", brandType: "DEBITO" }, { brand: "VISA", brand_type: "DEBITO" }]
    ])("converts %s into card_code", async (_name, filter, brandWhere) => {
      mockedPrisma.brandAidProp.findMany.mockResolvedValueOnce([{ card_code: 221 }, { card_code: 286 }, { card_code: 221 }]);

      await getPaymentList({ ...DAY, ...filter });

      expect(mockedPrisma.brandAidProp.findMany).toHaveBeenNthCalledWith(1, {
        where: brandWhere,
        select: { card_code: true }
      });
      expect(mockedPrisma.paymentList.findMany.mock.calls[0][0].where).toEqual({
        ...DAY_WHERE,
        card_code: { in: [221, 286] }
      });
    });

    it("does not look up card codes to filter without brand and brand_type", async () => {
      await getPaymentList(DAY);

      expect(mockedPrisma.brandAidProp.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.brandAidProp.findMany.mock.calls[0][0].where).toEqual({ card_code: { in: [1] } });
    });

    it("combines all the filters in count and findMany", async () => {
      mockedPrisma.brandAidProp.findMany.mockResolvedValueOnce([{ card_code: 286 }]);

      await getPaymentList({
        ...DAY,
        cardHash: "fedcba9876543210fedcba9876543210",
        panMask: "510000******0003",
        brandType: "DEBITO",
        brand: "MASTER"
      });

      const where = {
        ...DAY_WHERE,
        card_hash: "fedcba9876543210fedcba9876543210",
        pan_mask: { in: ["510000******0003", "510000******0003    "] },
        card_code: { in: [286] }
      };

      expect(mockedPrisma.paymentList.findMany.mock.calls[0][0].where).toEqual(where);
      expect(mockedPrisma.paymentList.count).toHaveBeenCalledWith({ where });
    });

    it("resolves the auxiliary fields in a single batch", async () => {
      mockPayments([
        buildPayment({ card_code: 1, type_pay: 1 }),
        buildPayment({ card_code: 286, type_pay: 2 }),
        buildPayment({ card_code: 1, type_pay: 1 }),
        buildPayment({ card_code: null, type_pay: null })
      ]);

      await getPaymentList(DAY);

      expect(mockedPrisma.brandAidProp.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.brandAidProp.findMany.mock.calls[0][0].where).toEqual({ card_code: { in: [1, 286] } });
      expect(mockedPrisma.typesPay.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.typesPay.findMany.mock.calls[0][0].where).toEqual({ type_pay: { in: [1, 2] } });
    });
  });

  describe("result", () => {
    it("returns the payments in the order of the database with the pagination", async () => {
      mockPayments(
        [
          buildPayment({ id: "6b04748f28660a52fb7c0002", transaction_uid: "uid-2", card_code: 286, type_pay: 2 }),
          buildPayment()
        ],
        5
      );

      const result = await getPaymentList({ ...DAY, page: "2", pageSize: "2" });

      expect(result).toEqual({
        ok: true,
        status: 200,
        data: [
          expect.objectContaining({
            id: "6b04748f28660a52fb7c0002",
            transaction_uid: "uid-2",
            brand: "MASTER",
            brand_type: "DEBITO",
            transaction_midia: "MOBILE"
          }),
          expect.objectContaining({
            id: "6b04748f28660a52fb7c0001",
            transaction_uid: "uid-1",
            brand: "VISA",
            brand_type: "CREDITO",
            transaction_midia: "CARD"
          })
        ],
        pagination: { page: 2, pageSize: 2, total: 5, totalPages: 3 }
      });
      expect(result.ok && result.data.map((item) => Object.keys(item))).toEqual([RESPONSE_FIELDS, RESPONSE_FIELDS]);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("returns payments with response_code and auth_code of another type or absent", async () => {
      mockPayments([
        buildPayment({ transaction_uid: "uid-7", response_code: "N7", auth_code: null, pay_result: null }),
        buildPayment({ transaction_uid: "uid-6", response_code: "302", auth_code: 422 })
      ]);

      const result = await getPaymentList({ paymentTimeStart: "2026-11-22", paymentTimeEnd: "2026-11-22" });

      expect(result).toMatchObject({
        status: 200,
        data: [
          { transaction_uid: "uid-7", response_code: null, auth_code: null, pay_result: null },
          { transaction_uid: "uid-6", response_code: 302, auth_code: "422" }
        ]
      });
    });

    it("returns 200 with empty data for a page beyond the last one", async () => {
      mockPayments([], 5);

      const result = await getPaymentList({ ...DAY, page: "9" });

      expect(result).toEqual({
        ok: true,
        status: 200,
        data: [],
        pagination: { page: 9, pageSize: 50, total: 5, totalPages: 1 }
      });
    });

    it("returns 404 when there are no payments, without loading the auxiliary fields", async () => {
      mockPayments([]);

      const result = await getPaymentList(DAY);

      expect(result).toEqual({ ok: false, status: 404, error: "No payments found." });
      expect(mockedPrisma.brandAidProp.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.typesPay.findMany).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it.each([
      ["brand", { brand: "HIPER" }],
      ["brand_type", { brandType: "VOUCHER" }]
    ])("returns 404 for a %s outside the list", async (_name, filter) => {
      mockedPrisma.brandAidProp.findMany.mockResolvedValueOnce([]);
      mockPayments([]);

      const result = await getPaymentList({ ...DAY, ...filter });

      expect(mockedPrisma.paymentList.findMany.mock.calls[0][0].where).toEqual({ ...DAY_WHERE, card_code: { in: [] } });
      expect(result).toEqual({ ok: false, status: 404, error: "No payments found." });
    });
  });

  describe("internal error", () => {
    const failure = new Error("mongodb://user:secret@host is unreachable");

    const expectInternalError = async (input: GetPaymentListInput) => {
      const result = await getPaymentList(input);

      expect(result).toEqual({ ok: false, status: 500, error: "Internal error while fetching payment list." });
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith("getPaymentList failed:", failure);
    };

    beforeEach(() => {
      mockPayments([buildPayment()]);
    });

    it("returns 500 and logs the cause when count fails", async () => {
      mockedPrisma.paymentList.count.mockRejectedValue(failure);

      await expectInternalError(DAY);
    });

    it("returns 500 and logs the cause when findMany fails", async () => {
      mockedPrisma.paymentList.findMany.mockRejectedValue(failure);

      await expectInternalError(DAY);
    });

    it("returns 500 and logs the cause when the brand filter fails", async () => {
      mockedPrisma.brandAidProp.findMany.mockRejectedValueOnce(failure);

      await expectInternalError({ ...DAY, brand: "VISA" });
      expect(mockedPrisma.paymentList.findMany).not.toHaveBeenCalled();
    });

    it("returns 500 and logs the cause when the brands fail", async () => {
      mockedPrisma.brandAidProp.findMany.mockRejectedValue(failure);

      await expectInternalError(DAY);
    });

    it("returns 500 and logs the cause when the midias fail", async () => {
      mockedPrisma.typesPay.findMany.mockRejectedValue(failure);

      await expectInternalError(DAY);
    });
  });
});
