import { PaginationMeta } from "../models";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

const POSITIVE_INTEGER_REGEX = /^\d+$/;

const parsePositiveInteger = (value: string | undefined, fallback: number): number | null => {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (!POSITIVE_INTEGER_REGEX.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return parsed >= 1 ? parsed : null;
};

export const parseAndValidatePagination = (
  page?: string,
  pageSize?: string
): { ok: true; page: number; pageSize: number; skip: number; take: number } | { ok: false; error: string } => {
  const parsedPage = parsePositiveInteger(page, 1);
  if (parsedPage === null) {
    return { ok: false, error: "page must be a positive integer." };
  }

  const parsedPageSize = parsePositiveInteger(pageSize, DEFAULT_PAGE_SIZE);
  if (parsedPageSize === null || parsedPageSize > MAX_PAGE_SIZE) {
    return { ok: false, error: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.` };
  }

  return {
    ok: true,
    page: parsedPage,
    pageSize: parsedPageSize,
    skip: (parsedPage - 1) * parsedPageSize,
    take: parsedPageSize,
  };
};

export const buildPaginationMeta = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});
