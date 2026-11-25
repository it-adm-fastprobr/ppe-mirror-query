jest.mock("../utils/prisma", () => ({
  prisma: {
    tapPayList: { findMany: jest.fn() },
    tapLog: { findMany: jest.fn() },
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
  tapLog: { findMany: jest.Mock };
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

const mockTaps = (taps: ReturnType<typeof buildTap>[]) => {
  mockedPrisma.tapPayList.findMany.mockResolvedValue(taps.map(({ unique_id }) => ({ unique_id })));
  mockedPrisma.tapLog.findMany.mockResolvedValue(taps);
};

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
  describe("query", () => {
    beforeEach(() => {
      mockTaps([buildTap()]);
    });

    it("searches the links by transaction_uid and the taps by unique_id, without ordering", async () => {
      await getPaymentTapList("uid-1");

      expect(mockedPrisma.tapPayList.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.tapPayList.findMany).toHaveBeenCalledWith({
        where: { transaction_uid: "uid-1" },
        select: { unique_id: true }
      });
      expect(mockedPrisma.tapLog.findMany).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.tapLog.findMany).toHaveBeenCalledWith({
        where: { unique_id: { in: ["tap-1"] } },
        select: {
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
        }
      });
    });

    it("ignores links without unique_id and repeated links", async () => {
      mockedPrisma.tapPayList.findMany.mockResolvedValue([
        { unique_id: "tap-2a" },
        { unique_id: null },
        { unique_id: "tap-2b" },
        { unique_id: "tap-2a" }
      ]);

      await getPaymentTapList("uid-2");

      expect(mockedPrisma.tapLog.findMany.mock.calls[0][0].where).toEqual({ unique_id: { in: ["tap-2a", "tap-2b"] } });
    });

    it("resolves the auxiliary fields in a single batch", async () => {
      mockTaps([
        buildTap({ unique_id: "tap-2a", card_code: 286, type_pay: 2 }),
        buildTap({ unique_id: "tap-2b", card_code: 286, type_pay: 2 }),
        buildTap({ unique_id: "tap-2c", terminal_id: "T-002" }),
        buildTap({ unique_id: "tap-2d", card_code: null, type_pay: null, terminal_id: null })
      ]);

      await getPaymentTapList("uid-2");

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

  describe("result", () => {
    it("returns the 20 fields of a transaction with one tap", async () => {
      mockTaps([buildTap()]);

      const result = await getPaymentTapList("uid-1");

      expect(result).toEqual({
        ok: true,
        status: 200,
        data: [mapTap(buildTap(), brandMap, midiaMap, LOCALS)]
      });
      expect(result.ok && Object.keys(result.data[0])).toEqual(RESPONSE_FIELDS);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("returns every tap of a transaction with several, each with its own auxiliary fields", async () => {
      mockTaps([
        buildTap({ unique_id: "tap-2a", card_code: 286, type_pay: 2 }),
        buildTap({ unique_id: "tap-2b" })
      ]);

      const result = await getPaymentTapList("uid-2");

      expect(result).toMatchObject({
        status: 200,
        data: [
          { unique_id: "tap-2a", brand: "MASTER", brand_type: "DEBITO", transaction_midia: "MOBILE" },
          { unique_id: "tap-2b", brand: "VISA", brand_type: "CREDITO", transaction_midia: "CARD" }
        ]
      });
      expect(result.ok && result.data.map((item) => Object.keys(item))).toEqual([RESPONSE_FIELDS, RESPONSE_FIELDS]);
    });

    it("returns the local valid at the time of each tap when the terminal moved", async () => {
      mockTaps([
        buildTap({ unique_id: "tap-a", tap_receiv: new Date("2026-11-23T11:00:00.000Z") }),
        buildTap({ unique_id: "tap-b", tap_receiv: new Date("2026-11-23T11:59:00.000Z") })
      ]);

      const result = await getPaymentTapList("uid-2");

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

      const result = await getPaymentTapList("uid-2");

      expect(result).toMatchObject({
        status: 200,
        data: [{ local_description: "ESTACAO A" }, { local_description: "ESTACAO B" }]
      });
    });

    it("returns null in the local fields for a terminal without record", async () => {
      mockTaps([buildTap({ terminal_id: "T-999" })]);
      mockedPrisma.terminalTreeHistorical.findMany.mockResolvedValue([]);

      const result = await getPaymentTapList("uid-3");

      expect(result).toMatchObject({
        status: 200,
        data: [{ local_description: null, group_desc: null, subgroup: null }]
      });
    });

    it("returns null for a tap without sam and tap_receiv", async () => {
      mockTaps([buildTap({ unique_id: "tap-7", sam: null, tap_receiv: null })]);
      mockedPrisma.tapPayList.findMany.mockResolvedValue([{ unique_id: "tap-7" }, { unique_id: null }]);

      const result = await getPaymentTapList("uid-7");

      expect(mockedPrisma.tapLog.findMany.mock.calls[0][0].where).toEqual({ unique_id: { in: ["tap-7"] } });
      expect(result).toMatchObject({
        status: 200,
        data: [{ sam: null, tap_receiv: null, local_description: null, group_desc: null, subgroup: null }]
      });
    });

    it.each([
      ["the transaction has no links", []],
      ["the links have no unique_id", [{ unique_id: null }]],
      ["the linked taps are not in tap_log", [{ unique_id: "tap-x" }]]
    ])("returns 404 when %s, without loading the auxiliary fields", async (_name, links) => {
      mockedPrisma.tapPayList.findMany.mockResolvedValue(links);
      mockedPrisma.tapLog.findMany.mockResolvedValue([]);

      const result = await getPaymentTapList("uid-inexistente");

      expect(result).toEqual({ ok: false, status: 404, error: "No taps found." });
      expect(mockedPrisma.brandAidProp.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.typesPay.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.terminalTreeHistorical.findMany).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe("internal error", () => {
    it.each(["tapPayList", "tapLog", "brandAidProp", "typesPay", "terminalTreeHistorical"] as const)(
      "returns 500 and logs the cause when %s fails",
      async (model) => {
        const failure = new Error("mongodb://user:secret@host is unreachable");
        mockTaps([buildTap()]);
        mockedPrisma[model].findMany.mockRejectedValue(failure);

        const result = await getPaymentTapList("uid-1");

        expect(result).toEqual({ ok: false, status: 500, error: "Internal error while fetching payment tap list." });
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith("getPaymentTapList failed:", failure);
      }
    );
  });
});
