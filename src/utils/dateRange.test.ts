import { fromBrasiliaText, parseAndValidateDateRange, toBrasiliaText } from "./dateRange";

const PAYMENT_TIME = { start: "payment_time_start", end: "payment_time_end" };
const TAP_RECEIV = { start: "tap_receiv_start", end: "tap_receiv_end" };

const INVALID_DATES = "payment_time_start and payment_time_end must be valid ISO dates.";
const END_BEFORE_START = "payment_time_end must be greater than or equal to payment_time_start.";

const range = (start?: string, end?: string) => parseAndValidateDateRange(start, end, PAYMENT_TIME);

const parseStart = (value: string) => {
  const result = range(value, "2099-12-31");
  return result.ok ? result.start?.toISOString() : result.error;
};

const parseEnd = (value: string) => {
  const result = range("2000-01-01", value);
  return result.ok ? result.end?.toISOString() : result.error;
};

const isInside = (result: ReturnType<typeof range>, date: Date): boolean =>
  result.ok && result.start !== undefined && result.end !== undefined && result.start <= date && date <= result.end;

describe("parseAndValidateDateRange", () => {
  it("expands date-only values to the full day in Brasilia", () => {
    expect(range("2026-11-23", "2026-11-23")).toEqual({
      ok: true,
      start: new Date("2026-11-23T03:00:00.000Z"),
      end: new Date("2026-11-24T02:59:59.999Z")
    });
  });

  it.each([
    ["2026-11-23T10:00", "2026-11-23T13:00:00.000Z"],
    ["2026-11-23T10:00:00", "2026-11-23T13:00:00.000Z"],
    ["2026-11-23T10:00:00.5", "2026-11-23T13:00:00.500Z"],
    ["2026-11-23T10:00:00.827", "2026-11-23T13:00:00.827Z"],
    ["2026-11-23T22:30:00", "2026-11-24T01:30:00.000Z"]
  ])("reads %s without timezone as Brasilia", (value, expected) => {
    expect(parseStart(value)).toBe(expected);
    expect(parseEnd(value)).toBe(expected);
  });

  it.each([
    ["2026-11-23T10:00Z", "2026-11-23T10:00:00.000Z"],
    ["2026-11-23T10:00:00Z", "2026-11-23T10:00:00.000Z"],
    ["2026-11-23T10:00:00.827Z", "2026-11-23T10:00:00.827Z"],
    ["2026-11-23T10:00:00-03:00", "2026-11-23T13:00:00.000Z"],
    ["2026-11-23T10:00:00+01:00", "2026-11-23T09:00:00.000Z"]
  ])("respects the explicit timezone of %s", (value, expected) => {
    expect(parseStart(value)).toBe(expected);
    expect(parseEnd(value)).toBe(expected);
  });

  it("includes a payment made at 23:30 in Brasilia when filtering by that day", () => {
    expect(isInside(range("2026-11-23", "2026-11-23"), new Date("2026-11-24T02:30:00.000Z"))).toBe(true);
  });

  it("excludes payments right outside the day in Brasilia", () => {
    const result = range("2026-11-23", "2026-11-23");

    expect(isInside(result, new Date("2026-11-23T02:59:59.999Z"))).toBe(false);
    expect(isInside(result, new Date("2026-11-24T03:00:00.000Z"))).toBe(false);
  });

  it.each(["2028-02-29", "2026-12-31", "2026-01-01"])("accepts the calendar date %s", (value) => {
    expect(range(value, value).ok).toBe(true);
  });

  it.each([
    "",
    "abc",
    "23/11/2026",
    "2026-11",
    "2026-13-01",
    "2026-02-29",
    "2026-02-31",
    "2026-04-31",
    "2026-02-31T10:00:00",
    "2026-02-31T10:00:00Z",
    "2026-11-23 10:00:00",
    "2026-11-23T",
    "2026-11-23T10",
    "2026-11-23T25:00:00",
    "2026-11-23T10:60:00",
    "2026-11-23T25:00:00Z",
    "2026-11-23T10:00:00.",
    "2026-11-23T10:00:00.1234",
    "2026-11-23T10:00:00-0300",
    "2026-11-23T10:00:00 03:00",
    "2026-11-23T10:00:00Zx",
    "x2026-11-23",
    "2026-11-23x",
    "2026-11-232026-11-23",
    "2026-11-23(2026-11-23T10:00Z"
  ])("rejects %p as start or end", (value) => {
    expect(range(value, "2026-11-23")).toEqual({ ok: false, error: INVALID_DATES });
    expect(range("2026-11-23", value)).toEqual({ ok: false, error: INVALID_DATES });
  });

  it("rejects an end before the start", () => {
    expect(range("2026-11-23", "2026-11-22")).toEqual({ ok: false, error: END_BEFORE_START });
  });

  it("rejects an end one millisecond before the start", () => {
    expect(range("2026-11-23T10:00:00.001Z", "2026-11-23T10:00:00.000Z")).toEqual({
      ok: false,
      error: END_BEFORE_START
    });
  });

  it("accepts an end equal to the start", () => {
    expect(range("2026-11-23T10:00:00Z", "2026-11-23T07:00:00")).toEqual({
      ok: true,
      start: new Date("2026-11-23T10:00:00.000Z"),
      end: new Date("2026-11-23T10:00:00.000Z")
    });
  });

  it("does not depend on the timezone of the machine", () => {
    const RealDate = Date;
    const parsedTexts: unknown[] = [];

    global.Date = class extends RealDate {
      constructor(value: string) {
        parsedTexts.push(value);
        super(value);
      }
    } as DateConstructor;

    try {
      range("2026-11-23", "2026-11-23");
      range("2026-11-23T10:00", "2026-11-23T10:00:00.827");
    } finally {
      global.Date = RealDate;
    }

    expect(parsedTexts).toContain("2026-11-23T10:00-03:00");
    expect(parsedTexts.filter((text) => !/T.*(Z|-03:00)$/.test(String(text)))).toEqual([]);
  });

  it("does not limit the size of the period", () => {
    expect(range("2000-01-01", "2026-11-23").ok).toBe(true);
  });

  describe("optional limits", () => {
    it("accepts only the start, expanding a date-only value to the start of the day in Brasilia", () => {
      expect(range("2026-11-23", undefined)).toEqual({ ok: true, start: new Date("2026-11-23T03:00:00.000Z") });
    });

    it("accepts only the end, expanding a date-only value to the end of the day in Brasilia", () => {
      expect(range(undefined, "2026-11-23")).toEqual({ ok: true, end: new Date("2026-11-24T02:59:59.999Z") });
    });

    it("keeps the absent limit undefined", () => {
      const onlyStart = range("2026-11-23T10:00:00Z", undefined);
      const onlyEnd = range(undefined, "2026-11-23T10:00:00Z");

      expect(onlyStart.ok && onlyStart.end).toBeUndefined();
      expect(onlyEnd.ok && onlyEnd.start).toBeUndefined();
    });

    it("accepts no limit at all", () => {
      const result = range(undefined, undefined);

      expect(result.ok).toBe(true);
      expect(result.ok && result.start).toBeUndefined();
      expect(result.ok && result.end).toBeUndefined();
    });

    it.each(["", "abc", "2026-02-31", "2026-11-23 10:00:00"])("rejects %p as the only limit", (value) => {
      expect(range(value, undefined)).toEqual({ ok: false, error: INVALID_DATES });
      expect(range(undefined, value)).toEqual({ ok: false, error: INVALID_DATES });
    });

    it("does not compare the limits when one is absent", () => {
      expect(range("2099-12-31", undefined).ok).toBe(true);
      expect(range(undefined, "2000-01-01").ok).toBe(true);
    });
  });

  describe("names", () => {
    it("uses the names of the parameters in the messages", () => {
      expect(parseAndValidateDateRange("abc", undefined, TAP_RECEIV)).toEqual({
        ok: false,
        error: "tap_receiv_start and tap_receiv_end must be valid ISO dates."
      });
      expect(parseAndValidateDateRange("2026-11-23", "2026-11-22", TAP_RECEIV)).toEqual({
        ok: false,
        error: "tap_receiv_end must be greater than or equal to tap_receiv_start."
      });
    });

    it("does not change the parsing", () => {
      expect(parseAndValidateDateRange("2026-11-23", "2026-11-23", TAP_RECEIV)).toEqual(range("2026-11-23", "2026-11-23"));
    });
  });
});

describe("toBrasiliaText", () => {
  it.each([
    ["2026-09-28T17:42:04.827Z", "2026-09-28 14:42:04.827"],
    ["2026-11-23T03:00:00.000Z", "2026-11-23 00:00:00.000"],
    ["2026-11-23T02:59:59.999Z", "2026-11-22 23:59:59.999"],
    ["2027-01-01T01:00:00.000Z", "2026-12-31 22:00:00.000"]
  ])("converts %s to %s", (value, expected) => {
    expect(toBrasiliaText(new Date(value))).toBe(expected);
  });
});

describe("fromBrasiliaText", () => {
  it.each([
    ["2026-09-28 14:42:04.827", "2026-09-28T17:42:04.827Z"],
    ["2026-11-23 00:00:00.000", "2026-11-23T03:00:00.000Z"],
    ["2026-11-22 23:59:59.999", "2026-11-23T02:59:59.999Z"],
    ["2026-12-31 22:00:00.000", "2027-01-01T01:00:00.000Z"]
  ])("converts %s to %s", (value, expected) => {
    expect(fromBrasiliaText(value)?.toISOString()).toBe(expected);
  });

  it.each(["2026-09-28T17:42:04.827Z", "2026-11-23T11:30:00.001Z", "2027-01-01T02:59:59.999Z"])(
    "reverts toBrasiliaText for %s",
    (value) => {
      expect(fromBrasiliaText(toBrasiliaText(new Date(value)))).toEqual(new Date(value));
    }
  );

  it("reads a text without milliseconds", () => {
    expect(fromBrasiliaText("2026-11-23 08:30:00")).toEqual(new Date("2026-11-23T11:30:00.000Z"));
  });

  it.each([
    "",
    "NULL",
    "abc",
    "23/11/2026 08:30:00",
    "01/01/2026",
    "2026-11-23",
    "2026-11-23T08:30:00.000",
    "2026-11-23 08:30:00.000Z",
    "2026-11-23 08:30:00-03:00",
    "2026-02-31 00:00:00.000",
    "2026-11-23 25:00:00.000",
    "2026-11-23 08:30:00.1234",
    " 2026-11-23 08:30:00.000"
  ])("returns null for %p", (value) => {
    expect(fromBrasiliaText(value)).toBeNull();
  });

  it("does not depend on the timezone of the machine", () => {
    const RealDate = Date;
    const parsedTexts: unknown[] = [];

    global.Date = class extends RealDate {
      constructor(value: string) {
        parsedTexts.push(value);
        super(value);
      }
    } as DateConstructor;

    try {
      fromBrasiliaText("2026-11-23 08:30:00.000");
    } finally {
      global.Date = RealDate;
    }

    expect(parsedTexts).toContain("2026-11-23T08:30:00.000-03:00");
    expect(parsedTexts.filter((text) => !/T.*(Z|-03:00)$/.test(String(text)))).toEqual([]);
  });
});
