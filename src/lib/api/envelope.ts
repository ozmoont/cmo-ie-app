/**
 * Response + pagination envelopes shared by every /api/v1/* route.
 *
 * Shape contract (stable for v1):
 *
 *   Success:   { data: T | T[], pagination?: PaginationMeta }
 *   Error:     { error: { code: string, message: string, details?: unknown } }
 *
 * The pagination envelope is only present on list endpoints, and always
 * the exact four fields below so clients can implement `while (has_more)`
 * loops without special-casing.
 */

import { NextResponse } from "next/server";

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

export interface PaginationParams {
  page: number;
  page_size: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** Parse `?page=` / `?page_size=` from a URL with safe clamping. */
export function parsePagination(url: URL): PaginationParams {
  const rawPage = Number(url.searchParams.get("page"));
  const rawSize = Number(url.searchParams.get("page_size"));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const size =
    Number.isFinite(rawSize) && rawSize >= 1
      ? Math.min(Math.floor(rawSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page, page_size: size };
}

/** Build a PaginationMeta from the input pagination + total count. */
export function makePaginationMeta(
  p: PaginationParams,
  total: number
): PaginationMeta {
  return {
    page: p.page,
    page_size: p.page_size,
    total,
    has_more: p.page * p.page_size < total,
  };
}

/** Success response helper. */
export function ok<T>(data: T, pagination?: PaginationMeta): NextResponse {
  return NextResponse.json(pagination ? { data, pagination } : { data });
}

/** Error response helper. Canonicalises every non-2xx body shape. */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    { error: details ? { code, message, details } : { code, message } },
    { status }
  );
}
