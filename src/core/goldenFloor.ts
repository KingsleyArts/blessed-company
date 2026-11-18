// Canonical floor string + FNV-1a-64 hash, mirroring tools/golden/dump_golden.cpp. Used to compare TS floors to the C++ fixtures.
import type { EnemyPack, Floor } from './floorGenerator';

const b = (v: boolean): string => (v ? '1' : '0');
const packStr = (p: EnemyPack): string => `${p.size},${p.counts.join(',')}`;

export function canonicalFloor(f: Floor): string {
  let s = `${f.number},${f.seed},${b(f.isBoss)},${f.cols},${f.rows},${f.startNode},${f.crystalNode},${b(f.crystalRequiresBossKill)},` +
    `${f.totalEnemies},${f.killQuota},${f.roomRoll},${b(f.usedFallbackLayout)},${f.rescueNode},${b(f.isTutorial)},${b(f.isRescueLayout)};`;
  for (const n of f.nodes) {
    s += `${n.id},${n.gx},${n.gy},${n.type},${n.shape},${n.door.join(',')},P${packStr(n.pack)},${b(n.hasReinforcements)},` +
      `R${packStr(n.reinforcements)},${b(n.hasCrystal)},${b(n.revealed)},${b(n.known)},${b(n.isStart)},${b(n.isDeadEnd)},${b(n.isRescueRoom)}|`;
  }
  return s;
}

export function fnv1a64(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(s)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h;
}

export const floorHash = (f: Floor): string => fnv1a64(canonicalFloor(f)).toString();
