/**
 * CSV export helper.
 *
 * Takes a list of rows + a column spec and returns a well-formed RFC
 * 4180 CSV string. Handles the three common gotchas:
 *   - Commas inside a cell → wrap in double quotes.
 *   - Double quotes inside a cell → escaped by doubling (`"` → `""`).
 *   - Newlines inside a cell → preserved, still wrapped in double quotes.
 *
 * `null` / `undefined` cells render as empty strings. Booleans render
 * as `"true"` / `"false"` because most spreadsheet apps parse those
 * without issue. Arrays render as pipe-separated strings because
 * comma-separated would conflict with the outer delimiter; pipe is
 * the least-surprising alternative.
 *
 * Dates: pass them in as ISO strings from the caller. Locale-aware
 * dates don't round-trip cleanly through spreadsheet apps.
 */

export interface CsvColumn<T> {
  header: string;
  /** Pull the raw cell value from the row. Return anything — we stringify. */
  get: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((row) =>
      columns.map((c) => escapeCell(stringifyCell(c.get(row)))).join(",")
    )
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return value.map((v) => stringifyCell(v)).join(" | ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeCell(raw: string): string {
  // Quote the cell when it contains any of: comma, double-quote, CR, LF.
  // Otherwise emit as-is.
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Convenience: build a browser-friendly filename prefix with the
 * current date stamped in yyyy-mm-dd. Used by UI callers when
 * assembling the `download` attribute.
 */
export function csvFilenameStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Convert a CSV string into a data-URL the browser can open as a
 * download. Adds the UTF-8 BOM so Excel opens Unicode content
 * correctly out of the box (Excel defaults to a legacy Windows
 * codepage without it).
 */
export function csvDataUrl(csv: string): string {
  const withBom = `\uFEFF${csv}`;
  return `data:text/csv;charset=utf-8,${encodeURIComponent(withBom)}`;
}
