/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). Pure, no Phaser. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** `|` separated list cell -> array (empty cell -> []). */
export function parseList(cell: string): string[] {
  return cell === '' ? [] : cell.split('|');
}

// Plain decimal numbers only: Number() alone would turn ' ' into 0 and accept '0x10' or 'Infinity'.
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** Convert a cell by inferred type: number (-1 = TBD kept as -1), boolean, else string. */
export function parseCell(cell: string): string | number | boolean {
  if (cell === 'true') return true;
  if (cell === 'false') return false;
  if (NUMERIC.test(cell)) return Number(cell);
  return cell;
}

export function csvToRecords(text: string): Record<string, string | number | boolean>[] {
  const [head, ...body] = parseCsv(text);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, parseCell(r[i] ?? '')])));
}
