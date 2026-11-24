import { buildPaginationMeta, parseAndValidatePagination } from "./pagination";

const INVALID_PAGE = "page must be a positive integer.";
const INVALID_PAGE_SIZE = "pageSize must be an integer between 1 and 200.";

describe("parseAndValidatePagination", () => {
  it.each([
    [undefined, undefined],
    ["", ""]
  ])("uses page 1 and pageSize 50 when not informed (page=%p, pageSize=%p)", (page, pageSize) => {
    expect(parseAndValidatePagination(page, pageSize)).toEqual({
      ok: true,
      page: 1,
      pageSize: 50,
      skip: 0,
      take: 50
    });
  });

  it.each([
    ["1", "1", { page: 1, pageSize: 1, skip: 0, take: 1 }],
    ["1", "200", { page: 1, pageSize: 200, skip: 0, take: 200 }],
    ["3", "20", { page: 3, pageSize: 20, skip: 40, take: 20 }],
    ["2", undefined, { page: 2, pageSize: 50, skip: 50, take: 50 }]
  ])("calculates skip and take (page=%p, pageSize=%p)", (page, pageSize, expected) => {
    expect(parseAndValidatePagination(page, pageSize)).toEqual({ ok: true, ...expected });
  });

  it.each(["0", "-1", "1.5", "abc", "1a", "a1", " 1", "1e2"])("rejects page=%p", (page) => {
    expect(parseAndValidatePagination(page, "50")).toEqual({ ok: false, error: INVALID_PAGE });
  });

  it.each(["0", "201", "-1", "1.5", "abc", "1a", "a1", " 1", "1e2"])("rejects pageSize=%p", (pageSize) => {
    expect(parseAndValidatePagination("1", pageSize)).toEqual({ ok: false, error: INVALID_PAGE_SIZE });
  });

  it("reports page first when both are invalid", () => {
    expect(parseAndValidatePagination("0", "0")).toEqual({ ok: false, error: INVALID_PAGE });
  });
});

describe("buildPaginationMeta", () => {
  it.each([
    [0, 0],
    [1, 1],
    [50, 1],
    [51, 2],
    [100, 2],
    [101, 3]
  ])("calculates totalPages for total %d", (total, totalPages) => {
    expect(buildPaginationMeta(1, 50, total)).toEqual({ page: 1, pageSize: 50, total, totalPages });
  });

  it("keeps the requested page even beyond the last one", () => {
    expect(buildPaginationMeta(9, 50, 5)).toEqual({ page: 9, pageSize: 50, total: 5, totalPages: 1 });
  });
});
