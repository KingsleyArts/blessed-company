// Build-time step: data/*.csv -> src/data/generated/<Name>.ts (typed-by-inference records).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { csvToRecords } from '../src/core/csv';

const out = join('src', 'data', 'generated');
mkdirSync(out, { recursive: true });
const names: string[] = [];
for (const f of readdirSync('data').filter((f) => f.endsWith('.csv'))) {
  const name = f.replace(/\.csv$/, '');
  names.push(name);
  const rows = csvToRecords(readFileSync(join('data', f), 'utf8'));
  writeFileSync(
    join(out, `${name}.ts`),
    `// GENERATED from data/${f} by scripts/csv-to-ts.ts. Do not edit.\nexport const ${name} = ${JSON.stringify(rows, null, 2)} as const;\n`,
  );
}
writeFileSync(
  join(out, 'index.ts'),
  `// GENERATED\n${names.map((n) => `export { ${n} } from './${n}';`).join('\n')}\n`,
);
console.log(`csv-to-ts: ${names.length} tables -> ${out}`);
