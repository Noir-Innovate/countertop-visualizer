/**
 * Minimal RFC 4180 CSV parser. No dependency (the repo installs none), correct
 * for the cases that actually bite a naive split: quoted fields containing
 * commas/newlines and escaped `""` quotes, plus CRLF and a trailing newline.
 *
 * Returns normalised header keys (trimmed, lowercased, spaces/dashes ->
 * underscore) mapped to string values. Rows shorter than the header are padded
 * with ""; extra trailing fields are ignored.
 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function tokenize(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      // handle CRLF and lone CR as a record break
      if (text[i + 1] === "\n") i++;
      pushRecord();
      i++;
      continue;
    }
    if (c === "\n") {
      pushRecord();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // flush trailing field/record if the file didn't end with a newline
  if (field !== "" || record.length > 0) {
    pushRecord();
  }
  return records;
}

export function parseCsv(text: string): ParsedCsv {
  const records = tokenize(text).filter(
    // drop fully-empty records (e.g. a trailing blank line)
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map(normalizeHeader);
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = (rec[c] ?? "").trim();
    }
    rows.push(row);
  }
  return { headers, rows };
}
