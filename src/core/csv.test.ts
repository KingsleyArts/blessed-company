import { describe, expect, it } from 'vitest';
import { csvToRecords, parseCsv, parseList } from './csv';

describe('csv', () => {
  it('parses quotes, lists and types', () => {
    const r = csvToRecords('Name,N,B,L\r\nA,-1,true,"x,y|z"\n');
    expect(r).toEqual([{ Name: 'A', N: -1, B: true, L: 'x,y|z' }]);
    expect(parseList('a|b')).toEqual(['a', 'b']);
    expect(parseCsv('a\n\nb')).toEqual([['a'], ['b']]);
  });

  it('only plain decimal cells become numbers', () => {
    expect(csvToRecords('A,B,C,D,E,F\n 1.5e2,0x10, ,Infinity,.5,-3\n')).toEqual([
      { A: ' 1.5e2', B: '0x10', C: ' ', D: 'Infinity', E: 0.5, F: -3 },
    ]);
  });
});
