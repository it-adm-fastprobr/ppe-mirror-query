const BRASILIA_OFFSET = "-03:00";
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

const isCalendarDate = (date: string): boolean => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const parseDateBoundary = (value: string, boundary: "start" | "end"): Date | null => {
  if (!isCalendarDate(value.slice(0, 10))) {
    return null;
  }

  if (DATE_ONLY_REGEX.test(value)) {
    const time = boundary === "start" ? "00:00:00.000" : "23:59:59.999";
    return new Date(`${value}T${time}${BRASILIA_OFFSET}`);
  }

  const match = DATE_TIME_REGEX.exec(value);

  if (!match) {
    return null;
  }

  const parsed = new Date(match[1] ? value : `${value}${BRASILIA_OFFSET}`);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const parseAndValidateDateRange = (
  startDate: string,
  endDate: string
): { ok: true; start: Date; end: Date } | { ok: false; error: string } => {
  const start = parseDateBoundary(startDate, "start");
  const end = parseDateBoundary(endDate, "end");

  if (!start || !end) {
    return { ok: false, error: "payment_time_start and payment_time_end must be valid ISO dates." };
  }

  if (end < start) {
    return { ok: false, error: "payment_time_end must be greater than or equal to payment_time_start." };
  }

  return { ok: true, start, end };
};

// 2026-09-28T17:42:04.827Z → "2026-09-28 14:42:04.827"
export const toBrasiliaText = (date: Date): string =>
  new Date(date.getTime() - BRASILIA_OFFSET_MS).toISOString().replace("T", " ").replace("Z", "");
