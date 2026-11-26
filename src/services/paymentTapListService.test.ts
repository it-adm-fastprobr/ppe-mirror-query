jest.mock("../utils/prisma", () => ({
  prisma: {
    tapPayList: { findMany: jest.fn() },
    tapLog: { findMany: jest.fn(), count: jest.fn() },
    brandAidProp: { findMany: jest.fn() },
    typesPay: { findMany: jest.fn() },
    terminalTreeHistorical: { findMany: jest.fn() }
  }
}));

import { Brand } from "../models";
import { prisma } from "../utils/prisma";
import { findLocal, getPaymentTapList, mapTap } from "./paymentTapListService";

const mockedPrisma = prisma as unknown as {
  tapPayList: { findMany: jest.Mock };
  tapLog: { findMany: jest.Mock; count: jest.Mock };
  brandAidProp: { findMany: jest.Mock };
  typesPay: { findMany: jest.Mock };
  terminalTreeHistorical: { findMany: jest.Mock };
};

const RESPONSE_FIELDS = [
  "id",
  "tap_receiv",
  "tap_read",
  "sam",
  "local_description",
  "group_desc",
  "subgroup",
  "serial_number",
  "unique_id",
  "card_hash",
  "pan_mask",
  "brand_type",
  "brand",
  "transaction_midia",
  "tap_status",
  "terminal_version",
  "app_priority",
  "app_data",
  "hash_aux",
  "app_name"
];

const LOCAL_A = {
  terminal_id: "T-001",
  local_description: "ESTACAO A",
  group_desc: "001 - Grupo A",
  subgroup: "Modal A",
  initial_date: "2026-01-01 00:00:00.000",
  final_date: "2026-11-23 08:30:00.000"
};

const LOCAL_B = {
  terminal_id: "T-001",
  local_description: "ESTACAO B",
  group_desc: "002 - Grupo B",
  subgroup: "Modal B",
  initial_date: "2026-11-23 08:30:00.001",
  final_date: "NULL"
};

const LOCALS = [LOCAL_A, LOCAL_B];

const buildTap = (overrides: Partial<Parameters<typeof mapTap>[0]> = {}): Parameters<typeof mapTap>[0] => ({
  id: "6b04748f28660a52fb7c0002",
  tap_receiv: new Date("2026-11-23T11:00:00.000Z"),
  tap_read: new Date("2026-11-23T10:59:59.000Z"),
  sam: "0000000001",
  serial_number: "SN-0001",
  unique_id: "tap-1",
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
  type_pay: 1,
  ...overrides
});

const brandMap = new Map<number | null, Brand>([[1, { brand: "VISA", brand_type: "CREDITO" }]]);
const midiaMap = new Map<number | null, string>([[1, "CARD"]]);

const mockTaps = (taps: ReturnType<typeof buildTap>[], total = taps.length) => {
  mockedPrisma.tapPayList.findMany.mockResolvedValue(taps.map(({ unique_id }) => ({ unique_id })));
  mockedPrisma.tapLog.findMany.mockResolvedValue(taps);
  mockedPrisma.tapLog.count.mockResolvedValue(total);
};

const expectNoQueries = () => {
  for (const model of Object.values(mockedPrisma)) {
    for (const query of Object.values(model)) {
      expect(query).not.toHaveBeenCalled();
    }
  }
};

const tapQuery = () => mockedPrisma.tapLog.findMany.mock.calls[0][0];

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockedPrisma.brandAidProp.findMany.mockResolvedValue([
    { card_code: 1, brand: "VISA", brand_type: "CREDITO" },
    { card_code: 286, brand: "MASTER", brand_type: "DEBITO" }
  ]);
  mockedPrisma.typesPay.findMany.mockResolvedValue([
    { type_pay: 1, transaction_midia: "CARD" },
    { type_pay: 2, transaction_midia: "MOBILE" }
  ]);
  mockedPrisma.terminalTreeHistorical.findMany.mockResolvedValue(LOCALS);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("findLocal", () => {
  it("compares tap_receiv in Brasilia time", () => {
    expect(findLocal(LOCALS, "T-001", new Date("2026-11-23T11:00:00.000Z"))).toBe(LOCAL_A);
    expect(findLocal(LOCALS, "T-001", new Date("2026-11-23T11:59:00.000Z"))).toBe(LOCAL_B);
  });

  it.each([
    ["first instant of the closed record", "2026-01-01T03:00:00.000Z", LOCAL_A],
    ["last instant of the closed record", "2026-11-23T11:30:00.000Z", LOCAL_A],
    ["first instant of the open record", "2026-11-23T11:30:00.001Z", LOCAL_B],
    ["long after the start of the open record", "2030-01-01T00:00:00.000Z", LOCAL_B]
  ])("includes the limits of the validity: %s", (_name, tapReceiv, expected) => {
    expect(findLocal(LOCALS, "T-001", new Date(tapReceiv))).toBe(expected);
  });

  it("treats a null final_date as an open record", () => {
    const open = { ...LOCAL_B, final_date: null };

    expect(findLocal([LOCAL_A, open], "T-001", new Date("2026-11-23T11:30:00.000Z"))).toBe(LOCAL_A);
    expect(findLocal([LOCAL_A, open], "T-001", new Date("2026-11-23T11:30:00.001Z"))).toBe(open);
    expect(findLocal([LOCAL_A, open], "T-001", new Date("2030-01-01T00:00:00.000Z"))).toBe(open);
    expect(findLocal([open], "T-001", new Date("2026-11-23T11:30:00.000Z"))).toBeNull();
  });

  it("returns null before the first record", () => {
    expect(findLocal(LOCALS, "T-001", new Date("2026-01-01T02:59:59.999Z"))).toBeNull();
  });

  it("returns null after a closed record without a successor", () => {
    expect(findLocal([LOCAL_A], "T-001", new Date("2026-11-23T11:30:00.001Z"))).toBeNull();
  });

  it("uses the most recent initial_date when more than one record is valid", () => {
    const older = { ...LOCAL_A, final_date: "NULL" };
    const middle = { ...LOCAL_A, initial_date: "2026-06-01 00:00:00.000", final_date: "2027-01-01 00:00:00.000" };
    const tapReceiv = new Date("2026-11-23T15:00:00.000Z");

    expect(findLocal([older, middle, LOCAL_B], "T-001", tapReceiv)).toBe(LOCAL_B);
    expect(findLocal([LOCAL_B, middle, older], "T-001", tapReceiv)).toBe(LOCAL_B);
    expect(findLocal([middle, LOCAL_B, older], "T-001", tapReceiv)).toBe(LOCAL_B);
  });

  it("ignores a more recent record that is not valid yet", () => {
    const future = { ...LOCAL_B, initial_date: "2027-01-01 00:00:00.000" };

    expect(findLocal([LOCAL_A, future], "T-001", new Date("2026-11-23T11:00:00.000Z"))).toBe(LOCAL_A);
  });

  it.each(["T-999", null])("returns null for the terminal %p", (terminalId) => {
    expect(findLocal(LOCALS, terminalId, new Date("2026-11-23T11:00:00.000Z"))).toBeNull();
  });

  it("returns null without tap_receiv", () => {
    expect(findLocal(LOCALS, "T-001", null)).toBeNull();
  });

  it("returns null without records", () => {
    expect(findLocal([], "T-001", new Date("2026-11-23T11:00:00.000Z"))).toBeNull();
  });
});

describe("mapTap", () => {
  it("maps a complete tap to the 20 response fields", () => {
    const item = mapTap(buildTap(), brandMap, midiaMap, LOCALS);

    expect(Object.keys(item)).toEqual(RESPONSE_FIELDS);
    expect(item).toEqual({
      id: "6b04748f28660a52fb7c0002",
      tap_receiv: "2026-11-23T11:00:00.000Z",
      tap_read: "2026-11-23T10:59:59.000Z",
      sam: "0000000001",
      local_description: "ESTACAO A",
      group_desc: "001 - Grupo A",
      subgroup: "Modal A",
      serial_number: "SN-0001",
      unique_id: "tap-1",
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
    });
  });

  it("returns null for every field without value, except id and unique_id", () => {
    const item = mapTap(
      buildTap({
        tap_receiv: null,
        tap_read: null,
        sam: null,
        serial_number: null,
        card_hash: null,
        pan_mask: null,
        tap_status: null,
        terminal_version: null,
        app_priority: null,
        app_data: null,
        hash_aux: null,
        app_name: null,
        terminal_id: null,
        card_code: null,
        type_pay: null
      }),
      brandMap,
      midiaMap,
      LOCALS
    );

    const { id, unique_id, ...others } = item;

    expect(Object.keys(item)).toEqual(RESPONSE_FIELDS);
    expect(id).toBe("6b04748f28660a52fb7c0002");
    expect(unique_id).toBe("tap-1");
    expect(Object.values(others).every((value) => value === null)).toBe(true);
  });

  it("returns null for auxiliary fields without a match", () => {
    const item = mapTap(buildTap({ card_code: 999, type_pay: 9, terminal_id: "T-999" }), brandMap, midiaMap, LOCALS);

    expect(item.brand).toBeNull();
    expect(item.brand_type).toBeNull();
    expect(item.transaction_midia).toBeNull();
    expect(item.local_description).toBeNull();
    expect(item.group_desc).toBeNull();
    expect(item.subgroup).toBeNull();
  });

  it("keeps pan_mask unchanged", () => {
    expect(mapTap(buildTap({ pan_mask: "510000******0003    " }), brandMap, midiaMap, LOCALS).pan_mask).toBe(
      "510000******0003    "
    );
  });
});

describe("getPaymentTapList", () => {
  const TAP_SELECT = {
    id: true,
    tap_receiv: true,
    tap_read: true,
    sam: true,
    serial_number: true,
    unique_id: true,
    card_hash: true,
    pan_mask: true,
    tap_status: true,
    terminal_version: true,
    app_priority: true,
    app_data: true,
    hash_aux: true,
    app_name: true,
    terminal_id: true,
    card_code: true,
    type_pay: true
  };

  const PERIOD_SELECT = { terminal_id: true, initial_date: true, final_date: true };

  const PERIOD_A = {
    terminal_id: "T-001",
    tap_receiv: { gte: new Date("2026-01-01T03:00:00.000Z"), lte: new Date("2026-11-23T11:30:00.000Z") }
  };

  const PERIOD_B = { terminal_id: "T-001", tap_receiv: { gte: new Date("2026-11-23T11:30:00.001Z") } };

  const FIRST_PAGE = { page: 1, pageSize: 50, total: 1, totalPages: 1 };

  describe("validation", () => {
    beforeEach(() => {
      mockTaps([buildTap()]);
    });

    it.each([
      ["an invalid start", { tapReceivStart: "abc" }, "tap_receiv_start and tap_receiv_end must be valid ISO dates."],
      ["an invalid end", { tapReceivEnd: "2026-02-31" }, "tap_receiv_start and tap_receiv_end must be valid ISO dates."],
      [
        "an end before the start",
        { tapReceivStart: "2026-11-23", tapReceivEnd: "2026-11-22" },
        "tap_receiv_end must be greater than or equal to tap_receiv_start."
      ]
    ])("returns 400 for %s, without queries", async (_name, input, error) => {
      expect(await getPaymentTapList(input)).toEqual({ ok: false, status: 400, error });
      expectNoQueries();
    });

    it.each(["abc", "-1", "1.5", "1e3", "0x1", "2147483648"])(
      "returns 400 for tap_status %p, without queries",
      async (tapStatus) => {
        expect(await getPaymentTapList({ tapStatus })).toEqual({
          ok: false,
          status: 400,
          error: "tap_status must be a non-negative integer."
        });
        expectNoQueries();
      }
    );

    it.each([
      [{ page: "0" }, "page must be a positive integer."],
      [{ page: "abc" }, "page must be a positive integer."],
      [{ pageSize: "201" }, "pageSize must be an integer between 1 and 200."]
    ])("returns 400 for the pagination %p, without queries", async (input, error) => {
      expect(await getPaymentTapList(input)).toEqual({ ok: false, status: 400, error });
      expectNoQueries();
    });

    it("validates the period first, then tap_status, then the pagination", async () => {
      expect(await getPaymentTapList({ tapReceivStart: "abc", tapStatus: "abc", page: "0" })).toMatchObject({
        error: "tap_receiv_start and tap_receiv_end must be valid ISO dates."
      });
      expect(await getPaymentTapList({ tapStatus: "abc", page: "0" })).toMatchObject({
        error: "tap_status must be a non-negative integer."
      });
      expectNoQueries();
    });
  });

  describe("query", () => {
    beforeEach(() => {
      mockTaps([buildTap()]);
    });

    it("reads the first page of every tap in id DESC without filters", async () => {
      await getPaymentTapList({});

      expect(mockedPrisma.tapLog.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.tapLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { id: "desc" },
        skip: 0,
        take: 50,
        select: TAP_SELECT
      });
      expect(mockedPrisma.tapPayList.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.terminalTreeHistorical.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.terminalTreeHistorical.findMany.mock.calls[0][0].where).toEqual({
        terminal_id: { in: ["T-001"] }
      });
    });

    it("counts with the same where of the page", async () => {
      await getPaymentTapList({ cardHash: "abc", tapStatus: "0", tapReceivStart: "2026-11-23" });

      expect(mockedPrisma.tapLog.count).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.tapLog.count).toHaveBeenCalledWith({ where: tapQuery().where });
    });

    it.each([
      ["only the start", { tapReceivStart: "2026-11-23" }, { gte: new Date("2026-11-23T03:00:00.000Z") }],
      ["only the end", { tapReceivEnd: "2026-11-23" }, { lte: new Date("2026-11-24T02:59:59.999Z") }],
      [
        "both limits",
        { tapReceivStart: "2026-11-23T08:00:00", tapReceivEnd: "2026-11-23T12:00:00Z" },
        { gte: new Date("2026-11-23T11:00:00.000Z"), lte: new Date("2026-11-23T12:00:00.000Z") }
      ]
    ])("filters tap_receiv with %s", async (_name, input, tapReceiv) => {
      await getPaymentTapList(input);

      expect(tapQuery().where).toStrictEqual({ tap_receiv: tapReceiv });
    });

    it("filters card_hash by the exact value", async () => {
      await getPaymentTapList({ cardHash: "fedcba9876543210fedcba9876543210" });

      expect(tapQuery().where).toStrictEqual({ card_hash: "fedcba9876543210fedcba9876543210" });
    });

    it.each([
      ["0", 0],
      ["255", 255],
      ["2147483647", 2147483647]
    ])("filters tap_status %p as the number %p", async (tapStatus, expected) => {
      await getPaymentTapList({ tapStatus });

      expect(tapQuery().where).toStrictEqual({ tap_status: expected });
    });

    it("filters by the unique_id of the links of transaction_uid", async () => {
      await getPaymentTapList({ transactionUid: "uid-1" });

      expect(mockedPrisma.tapPayList.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.tapPayList.findMany).toHaveBeenCalledWith({
        where: { transaction_uid: "uid-1" },
        select: { unique_id: true }
      });
      expect(tapQuery().where).toStrictEqual({ unique_id: { in: ["tap-1"] } });
    });

    it("ignores links without unique_id and repeated links", async () => {
      mockedPrisma.tapPayList.findMany.mockResolvedValue([
        { unique_id: "tap-2a" },
        { unique_id: null },
        { unique_id: "tap-2b" },
        { unique_id: "tap-2a" }
      ]);

      await getPaymentTapList({ transactionUid: "uid-2" });

      expect(tapQuery().where).toEqual({ unique_id: { in: ["tap-2a", "tap-2b"] } });
    });

    it.each([
      ["local_description", { localDescription: "ESTACAO A" }, { local_description: "ESTACAO A" }],
      ["group_desc", { groupDesc: "001 - Grupo A" }, { group_desc: "001 - Grupo A" }],
      ["subgroup", { subgroup: "Modal A" }, { subgroup: "Modal A" }],
      [
        "the three local filters",
        { localDescription: "ESTACAO A", groupDesc: "001 - Grupo A", subgroup: "Modal A" },
        { local_description: "ESTACAO A", group_desc: "001 - Grupo A", subgroup: "Modal A" }
      ]
    ])("searches the validity records by %s only", async (_name, input, where) => {
      await getPaymentTapList(input);

      expect(mockedPrisma.terminalTreeHistorical.findMany.mock.calls[0][0]).toStrictEqual({
        where,
        select: PERIOD_SELECT
      });
    });

    it("combines every filter", async () => {
      await getPaymentTapList({
        transactionUid: "uid-1",
        cardHash: "abc",
        tapReceivStart: "2026-11-23",
        tapReceivEnd: "2026-11-23",
        localDescription: "ESTACAO A",
        groupDesc: "001 - Grupo A",
        subgroup: "Modal A",
        tapStatus: "0"
      });

      expect(mockedPrisma.tapPayList.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.terminalTreeHistorical.findMany.mock.calls[0][0].where).toStrictEqual({
        local_description: "ESTACAO A",
        group_desc: "001 - Grupo A",
        subgroup: "Modal A"
      });
      expect(tapQuery().where).toStrictEqual({
        tap_receiv: { gte: new Date("2026-11-23T03:00:00.000Z"), lte: new Date("2026-11-24T02:59:59.999Z") },
        card_hash: "abc",
        tap_status: 0,
        unique_id: { in: ["tap-1"] },
        OR: [PERIOD_A, PERIOD_B]
      });
    });

    it("applies the requested page", async () => {
      mockTaps([buildTap()], 25);

      const result = await getPaymentTapList({ page: "2", pageSize: "10" });

      expect(tapQuery()).toMatchObject({ skip: 10, take: 10 });
      expect(result).toMatchObject({ pagination: { page: 2, pageSize: 10, total: 25, totalPages: 3 } });
    });

    it("resolves the auxiliary fields of the page in a single batch", async () => {
      mockTaps([
        buildTap({ unique_id: "tap-2a", card_code: 286, type_pay: 2 }),
        buildTap({ unique_id: "tap-2b", card_code: 286, type_pay: 2 }),
        buildTap({ unique_id: "tap-2c", terminal_id: "T-002" }),
        buildTap({ unique_id: "tap-2d", card_code: null, type_pay: null, terminal_id: null })
      ]);

      await getPaymentTapList({ transactionUid: "uid-2" });

      expect(mockedPrisma.brandAidProp.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.brandAidProp.findMany.mock.calls[0][0].where).toEqual({ card_code: { in: [286, 1] } });
      expect(mockedPrisma.typesPay.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.typesPay.findMany.mock.calls[0][0].where).toEqual({ type_pay: { in: [2, 1] } });
      expect(mockedPrisma.terminalTreeHistorical.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.terminalTreeHistorical.findMany).toHaveBeenCalledWith({
        where: { terminal_id: { in: ["T-001", "T-002"] } },
        select: {
          terminal_id: true,
          local_description: true,
          group_desc: true,
          subgroup: true,
          initial_date: true,
          final_date: true
        }
      });
    });
  });

  describe("local validity filter", () => {
    const filterBy = async (records: unknown[]) => {
      mockedPrisma.terminalTreeHistorical.findMany.mockResolvedValueOnce(records);
      return getPaymentTapList({ localDescription: "ESTACAO A" });
    };

    beforeEach(() => {
      mockTaps([buildTap()]);
    });

    it("turns a closed record into a period with both limits converted from Brasilia", async () => {
      await filterBy([LOCAL_A]);

      expect(tapQuery().where).toStrictEqual({ OR: [PERIOD_A] });
    });

    it.each(["NULL", null])("turns an open record with final_date %p into a period without end", async (finalDate) => {
      await filterBy([{ ...LOCAL_B, final_date: finalDate }]);

      expect(tapQuery().where).toStrictEqual({ OR: [PERIOD_B] });
    });

    it("creates one period per record, for a terminal that moved and for several terminals", async () => {
      const other = { ...LOCAL_A, terminal_id: "T-002", initial_date: "2026-06-01 12:00:00.000", final_date: "NULL" };

      await filterBy([LOCAL_A, LOCAL_B, other]);

      expect(tapQuery().where).toStrictEqual({
        OR: [PERIOD_A, PERIOD_B, { terminal_id: "T-002", tap_receiv: { gte: new Date("2026-06-01T15:00:00.000Z") } }]
      });
    });

    it.each([
      ["initial_date", { ...LOCAL_A, initial_date: "01/01/2026" }],
      ["final_date", { ...LOCAL_A, final_date: "abc" }]
    ])("ignores a record with an invalid %s and keeps the others", async (_name, invalid) => {
      await filterBy([invalid, LOCAL_B]);

      expect(tapQuery().where).toStrictEqual({ OR: [PERIOD_B] });
    });

    it.each([
      ["no record matches", []],
      ["every record has an invalid date", [{ ...LOCAL_A, initial_date: "" }, { ...LOCAL_B, initial_date: "abc" }]]
    ])("returns 404 without reading tap_log when %s", async (_name, records) => {
      const result = await filterBy(records);

      expect(result).toEqual({ ok: false, status: 404, error: "No taps found." });
      expect(mockedPrisma.tapLog.count).not.toHaveBeenCalled();
      expect(mockedPrisma.tapLog.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.brandAidProp.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.typesPay.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.terminalTreeHistorical.findMany).toHaveBeenCalledTimes(1);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("returns the same local used by the filter", async () => {
      const result = await filterBy([LOCAL_A]);

      expect(result).toMatchObject({
        status: 200,
        data: [{ local_description: "ESTACAO A", group_desc: "001 - Grupo A", subgroup: "Modal A" }]
      });
    });

    it("reads terminal_tree_historical once to filter and once for the locals of the page", async () => {
      mockTaps([buildTap(), buildTap({ unique_id: "tap-x", terminal_id: "T-002" })]);

      await filterBy([LOCAL_A]);

      expect(mockedPrisma.terminalTreeHistorical.findMany).toHaveBeenCalledTimes(2);
      expect(mockedPrisma.terminalTreeHistorical.findMany.mock.calls[1][0].where).toEqual({
        terminal_id: { in: ["T-001", "T-002"] }
      });
    });

    it("runs the transaction_uid and the local queries", async () => {
      await getPaymentTapList({ transactionUid: "uid-1", subgroup: "Modal A" });

      expect(mockedPrisma.tapPayList.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.terminalTreeHistorical.findMany.mock.calls[0][0].where).toStrictEqual({ subgroup: "Modal A" });
      expect(tapQuery().where).toStrictEqual({ unique_id: { in: ["tap-1"] }, OR: [PERIOD_A, PERIOD_B] });
    });
  });

  describe("result", () => {
    it("returns the 20 fields of each tap and the pagination", async () => {
      mockTaps([buildTap()]);

      const result = await getPaymentTapList({ transactionUid: "uid-1" });

      expect(result).toEqual({
        ok: true,
        status: 200,
        data: [mapTap(buildTap(), brandMap, midiaMap, LOCALS)],
        pagination: FIRST_PAGE
      });
      expect(result.ok && Object.keys(result.data[0])).toEqual(RESPONSE_FIELDS);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("returns every tap of the page, each with its own auxiliary fields", async () => {
      mockTaps([
        buildTap({ unique_id: "tap-2a", card_code: 286, type_pay: 2 }),
        buildTap({ unique_id: "tap-2b" })
      ]);

      const result = await getPaymentTapList({ transactionUid: "uid-2" });

      expect(result).toMatchObject({
        status: 200,
        data: [
          { unique_id: "tap-2a", brand: "MASTER", brand_type: "DEBITO", transaction_midia: "MOBILE" },
          { unique_id: "tap-2b", brand: "VISA", brand_type: "CREDITO", transaction_midia: "CARD" }
        ],
        pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 }
      });
      expect(result.ok && result.data.map((item) => Object.keys(item))).toEqual([RESPONSE_FIELDS, RESPONSE_FIELDS]);
    });

    it("returns the local valid at the time of each tap when the terminal moved", async () => {
      mockTaps([
        buildTap({ unique_id: "tap-a", tap_receiv: new Date("2026-11-23T11:00:00.000Z") }),
        buildTap({ unique_id: "tap-b", tap_receiv: new Date("2026-11-23T11:59:00.000Z") })
      ]);

      const result = await getPaymentTapList({});

      expect(result).toMatchObject({
        data: [
          { local_description: "ESTACAO A", group_desc: "001 - Grupo A", subgroup: "Modal A" },
          { local_description: "ESTACAO B", group_desc: "002 - Grupo B", subgroup: "Modal B" }
        ]
      });
    });

    it("returns the local of an open record with null final_date", async () => {
      mockTaps([
        buildTap({ unique_id: "tap-a", tap_receiv: new Date("2026-11-23T11:00:00.000Z") }),
        buildTap({ unique_id: "tap-b", tap_receiv: new Date("2026-11-23T11:59:00.000Z") })
      ]);
      mockedPrisma.terminalTreeHistorical.findMany.mockResolvedValue([LOCAL_A, { ...LOCAL_B, final_date: null }]);

      const result = await getPaymentTapList({});

      expect(result).toMatchObject({
        status: 200,
        data: [{ local_description: "ESTACAO A" }, { local_description: "ESTACAO B" }]
      });
    });

    it("returns null in the local fields for a terminal without record", async () => {
      mockTaps([buildTap({ terminal_id: "T-999" })]);
      mockedPrisma.terminalTreeHistorical.findMany.mockResolvedValue([]);

      const result = await getPaymentTapList({ transactionUid: "uid-3" });

      expect(result).toMatchObject({
        status: 200,
        data: [{ local_description: null, group_desc: null, subgroup: null }]
      });
    });

    it("returns null for a tap without sam and tap_receiv", async () => {
      mockTaps([buildTap({ unique_id: "tap-7", sam: null, tap_receiv: null })]);
      mockedPrisma.tapPayList.findMany.mockResolvedValue([{ unique_id: "tap-7" }, { unique_id: null }]);

      const result = await getPaymentTapList({ transactionUid: "uid-7" });

      expect(tapQuery().where).toEqual({ unique_id: { in: ["tap-7"] } });
      expect(result).toMatchObject({
        status: 200,
        data: [{ sam: null, tap_receiv: null, local_description: null, group_desc: null, subgroup: null }]
      });
    });

    it("returns 200 with an empty page after the last one", async () => {
      mockTaps([], 3);

      const result = await getPaymentTapList({ page: "2", pageSize: "10" });

      expect(result).toEqual({
        ok: true,
        status: 200,
        data: [],
        pagination: { page: 2, pageSize: 10, total: 3, totalPages: 1 }
      });
    });

    it.each([
      ["there are no taps", {}, []],
      ["the transaction has no links", { transactionUid: "uid-inexistente" }, []],
      ["the links have no unique_id", { transactionUid: "uid-inexistente" }, [{ unique_id: null }]],
      ["the linked taps are not in tap_log", { transactionUid: "uid-inexistente" }, [{ unique_id: "tap-x" }]]
    ])("returns 404 when %s, without loading the auxiliary fields", async (_name, input, links) => {
      mockTaps([], 0);
      mockedPrisma.tapPayList.findMany.mockResolvedValue(links);

      const result = await getPaymentTapList(input);

      expect(result).toEqual({ ok: false, status: 404, error: "No taps found." });
      expect(mockedPrisma.brandAidProp.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.typesPay.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.terminalTreeHistorical.findMany).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("searches an empty list of unique_id when the transaction has no links", async () => {
      mockTaps([], 0);

      await getPaymentTapList({ transactionUid: "uid-inexistente" });

      expect(tapQuery().where).toStrictEqual({ unique_id: { in: [] } });
    });
  });

  describe("internal error", () => {
    const failure = new Error("mongodb://user:secret@host is unreachable");

    it.each<[string, () => void]>([
      ["tapPayList", () => mockedPrisma.tapPayList.findMany.mockRejectedValue(failure)],
      ["the local filter", () => mockedPrisma.terminalTreeHistorical.findMany.mockRejectedValueOnce(failure)],
      ["tapLog.count", () => mockedPrisma.tapLog.count.mockRejectedValue(failure)],
      ["tapLog.findMany", () => mockedPrisma.tapLog.findMany.mockRejectedValue(failure)],
      ["brandAidProp", () => mockedPrisma.brandAidProp.findMany.mockRejectedValue(failure)],
      ["typesPay", () => mockedPrisma.typesPay.findMany.mockRejectedValue(failure)],
      [
        "the locals of the page",
        () => mockedPrisma.terminalTreeHistorical.findMany.mockResolvedValueOnce(LOCALS).mockRejectedValueOnce(failure)
      ]
    ])("returns 500 and logs the cause when %s fails", async (_name, fail) => {
      mockTaps([buildTap()]);
      fail();

      const result = await getPaymentTapList({ transactionUid: "uid-1", localDescription: "ESTACAO A" });

      expect(result).toEqual({ ok: false, status: 500, error: "Internal error while fetching payment tap list." });
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith("getPaymentTapList failed:", failure);
    });
  });
});
