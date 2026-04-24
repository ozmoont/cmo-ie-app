/**
 * Tests for the CSV export helper. Everything a spreadsheet app might
 * choke on — quoted cells, embedded commas, embedded quotes, newlines,
 * nulls/booleans/arrays — has an explicit case here.
 */

import { describe, expect, it } from "vitest";
import { csvDataUrl, csvFilenameStamp, toCsv } from "../csv";

describe("toCsv", () => {
  it("emits header only when rows is empty", () => {
    const csv = toCsv<{ a: string }>([], [{ header: "A", get: (r) => r.a }]);
    expect(csv).toBe("A");
  });

  it("separates rows with CRLF and cells with commas", () => {
    const csv = toCsv(
      [
        { a: "1", b: "2" },
        { a: "3", b: "4" },
      ],
      [
        { header: "A", get: (r) => r.a },
        { header: "B", get: (r) => r.b },
      ]
    );
    expect(csv).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("quotes cells containing a comma", () => {
    const csv = toCsv(
      [{ name: "Smith, John" }],
      [{ header: "Name", get: (r) => r.name }]
    );
    expect(csv).toBe('Name\r\n"Smith, John"');
  });

  it("escapes double quotes by doubling them inside a quoted cell", () => {
    const csv = toCsv(
      [{ quote: 'He said "hi"' }],
      [{ header: "Q", get: (r) => r.quote }]
    );
    expect(csv).toBe('Q\r\n"He said ""hi"""');
  });

  it("preserves newlines inside a quoted cell", () => {
    const csv = toCsv(
      [{ body: "line one\nline two" }],
      [{ header: "Body", get: (r) => r.body }]
    );
    expect(csv).toBe('Body\r\n"line one\nline two"');
  });

  it("renders null/undefined as empty strings", () => {
    const csv = toCsv(
      [{ a: null, b: undefined }],
      [
        { header: "A", get: (r) => r.a },
        { header: "B", get: (r) => r.b },
      ]
    );
    expect(csv).toBe("A,B\r\n,");
  });

  it("renders arrays as pipe-separated", () => {
    const csv = toCsv(
      [{ tags: ["foo", "bar"] }],
      [{ header: "Tags", get: (r) => r.tags }]
    );
    expect(csv).toBe("Tags\r\nfoo | bar");
  });

  it("renders booleans as 'true' / 'false'", () => {
    const csv = toCsv(
      [{ ok: true, err: false }],
      [
        { header: "Ok", get: (r) => r.ok },
        { header: "Err", get: (r) => r.err },
      ]
    );
    expect(csv).toBe("Ok,Err\r\ntrue,false");
  });

  it("drops non-finite numbers (NaN / Infinity) so they don't corrupt files", () => {
    const csv = toCsv(
      [{ x: NaN, y: Infinity, z: 42 }],
      [
        { header: "X", get: (r) => r.x },
        { header: "Y", get: (r) => r.y },
        { header: "Z", get: (r) => r.z },
      ]
    );
    expect(csv).toBe("X,Y,Z\r\n,,42");
  });

  it("handles header text containing commas or quotes by escaping them", () => {
    const csv = toCsv(
      [{ a: "x" }],
      [{ header: 'Name, "full"', get: (r) => r.a }]
    );
    expect(csv.startsWith('"Name, ""full"""')).toBe(true);
  });
});

describe("csvDataUrl", () => {
  it("prefixes the BOM and uses url-encoding", () => {
    const url = csvDataUrl("A,B\r\n1,2");
    expect(url.startsWith("data:text/csv;charset=utf-8,")).toBe(true);
    // BOM is U+FEFF; URL-encoded as %EF%BB%BF.
    expect(url).toContain("%EF%BB%BF");
  });
});

describe("csvFilenameStamp", () => {
  it("returns a zero-padded yyyy-mm-dd string", () => {
    const stamp = csvFilenameStamp();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
