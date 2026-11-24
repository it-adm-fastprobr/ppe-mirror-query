import { parseAndValidateDateRange, toBrasiliaText } from "./dateRange";

const INVALID_DATES = "payment_time_start and payment_time_end must be valid ISO dates.";
const END_BEFORE_START = "payment_time_end must be greater than or equal to payment_time_start.";

const parseStart = (value: string) => {
  const result = parseAndValidateDateRange(value, "2099-12-31");
  return result.ok ? result.start.toISOString() : result.error;
};

const parseEnd = (value: string) => {
  const result = parseAndValidateDateRange("2000-01-01", value);
  return result.ok ? result.end.toISOString() : result.error;
};

describe("parseAndValidateDateRange", () => {
  it("expands date-only values to the full day in Brasilia", () => {
    expect(parseAndValidateDateRange("2026-11-23", "2026-11-23")).toEqual({
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
    const result = parseAndValidateDateRange("2026-11-23", "2026-11-23");
    const payment = new Date("2026-11-24T02:30:00.000Z");

    expect(result.ok && result.start <= payment && payment <= result.end).toBe(true);
  });

  it("excludes payments right outside the day in Brasilia", () => {
    const result = parseAndValidateDateRange("2026-11-23", "2026-11-23");
    const before = new Date("2026-11-23T02:59:59.999Z");
    const after = new Date("2026-11-24T03:00:00.000Z");

    expect(result.ok && result.start > before && after > result.end).toBe(true);
  });

  it.each(["2028-02-29", "2026-12-31", "2026-01-01"])("accepts the calendar date %s", (value) => {
    expect(parseAndValidateDateRange(value, value).ok).toBe(true);
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
    expect(parseAndValidateDateRange(value, "2026-11-23")).toEqual({ ok: false, error: INVALID_DATES });
    expect(parseAndValidateDateRange("2026-11-23", value)).toEqual({ ok: false, error: INVALID_DATES });
  });

  it("rejects an end before the start", () => {
    expect(parseAndValidateDateRange("2026-11-23", "2026-11-22")).toEqual({ ok: false, error: END_BEFORE_START });
  });

  it("rejects an end one millisecond before the start", () => {
    expect(parseAndValidateDateRange("2026-11-23T10:00:00.001Z", "2026-11-23T10:00:00.000Z")).toEqual({
      ok: false,
      error: END_BEFORE_START
    });
  });

  it("accepts an end equal to the start", () => {
    expect(parseAndValidateDateRange("2026-11-23T10:00:00Z", "2026-11-23T07:00:00")).toEqual({
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
      parseAndValidateDateRange("2026-11-23", "2026-11-23");
      parseAndValidateDateRange("2026-11-23T10:00", "2026-11-23T10:00:00.827");
    } finally {
      global.Date = RealDate;
    }

    expect(parsedTexts).toContain("2026-11-23T10:00-03:00");
    expect(parsedTexts.filter((text) => !/T.*(Z|-03:00)$/.test(String(text)))).toEqual([]);
  });

  it("does not limit the size of the period", () => {
    expect(parseAndValidateDateRange("2000-01-01", "2026-11-23").ok).toBe(true);
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
