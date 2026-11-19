// Build-time step: data/*.csv -> src/data/generated/<Name>.ts.
// Each module exports the parsed records (`<Name>`) for UI and tools, and the raw text (`<Name>Csv`) so the combat loaders
// can mirror the C++ readers exactly (naive comma split, std::stof, rows with a bad numeric cell skipped).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { csvToRecords } from '../src/core/csv';

const out = join('src', 'data', 'generated');
mkdirSync(out, { recursive: true });
const names: string[] = [];
for (const f of readdirSync('data').filter((f) => f.endsWith('.csv'))) {
  const name = f.replace(/\.csv$/, '');
  names.push(name);
  const text = readFileSync(join('data', f), 'utf8');
  const rows = csvToRecords(text);
  writeFileSync(
    join(out, `${name}.ts`),
    `// GENERATED from data/${f} by scripts/csv-to-ts.ts. Do not edit.\n` +
      `export const ${name} = ${JSON.stringify(rows, null, 2)} as const;\n` +
      `export const ${name}Csv = ${JSON.stringify(text)};\n`,
  );
}
writeFileSync(join(out, 'index.ts'), `// GENERATED\n${names.map((n) => `export { ${n}, ${n}Csv } from './${n}';`).join('\n')}\n`);
console.log(`csv-to-ts: ${names.length} tables -> ${out}`);
