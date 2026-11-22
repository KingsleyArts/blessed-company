// Row types for data/*.csv (datatable_structs.h). The CSVs are canonical; src/data/generated/ holds them as records.
// Float fields are rounded with Math.fround: the C++ rows hold `float`, and the resolver reads them as doubles.
// Enum columns stay string unions; lists are '|' separated in the CSV. -1 in a numeric field means TBD.

export type ClassRole = 'Tank' | 'Healer' | 'MeleeDPS' | 'RangedDPS' | 'Support';
export type EnemyRole = 'Melee' | 'Tank' | 'Ranged' | 'Healer';
export type TriggerMode = 'OnCooldown' | 'SaveForBossOrElite' | 'PackIsLarge' | 'AllyIsLow';
export type TargetType = 'Closest' | 'Weakest' | 'Strongest' | 'HealerFirst' | 'ArcherFirst';
export type EffectType = 'Damage' | 'Heal' | 'AddThreat' | 'ApplyModifier' | 'SpawnSummon' | 'Rush' | 'ThreatBurst';

export interface StatBlock { HP: number; Damage: number; AttackPerSec: number; DefensePct: number }

export interface ClassDataRow {
  Name: string;
  RoleTag: ClassRole;
  BaseStats: StatBlock;
  BaseThreat: number;
  AutoActionId: string;
  AbilityId: string;
  AllowedStats: string[];
  AllowedTargetTypes: TargetType[];
  AllowedTriggerModes: TriggerMode[];
  ThreatMultiplier: number;
  MoveSpeed: number;
  AttackRange: number;
  PreferredDistMin: number;
  PreferredDistMax: number;
  RetreatDistance: number;
  SmiteThreshold: number;
  ExtraAbilityIds: string[];
}

export interface EnemyDataRow {
  Name: string;
  RoleTag: EnemyRole;
  BaseStats: StatBlock;
  AutoActionId: string;
  AbilityId: string;
  Taunts: boolean;
  IsBoss: boolean;
  IsElite: boolean;
  MoveSpeed: number;
  AttackRange: number;
  PreferredDistMin: number;
  PreferredDistMax: number;
  RetreatDistance: number;
}

export interface StatDefRow {
  Name: string;
  Tier: number;
  AllowedClasses: string[];
  EssenceBaseCost: number;
  EssenceCostGrowth: number;
  GoldUnlockCost: number;
  MaxRank: number;
  BonusPerRank: number;
  Cap: number;
  IsStretch: boolean;
}

export interface AbilityEffectRow {
  Name: string;
  AbilityId: string;
  Order: number;
  Type: EffectType;
  TargetSelector: string;
  Stat: string;
  Value: number;
  Duration: number;
}

export interface AbilityDataRow {
  Name: string;
  Cooldown: number;
  EffectIds: string[];
  AllowedTriggerModes: TriggerMode[];
  /** Multiplies the damage-based threat of this ability's Damage effects (Bloodrush 3). Absent column = 1. */
  ThreatMultiplier: number;
}

export interface GearDataRow {
  Name: string;
  Slot: string;
  Class: string;
  Level: number;
  GoldCost: number;
  StatModifiers: string;
}

type Rec = Record<string, string | number | boolean>;
const f32 = Math.fround;
const str = (r: Rec, k: string): string => (r[k] === undefined ? '' : String(r[k]));
const num = (r: Rec, k: string, d: number): number => (typeof r[k] === 'number' ? (r[k] as number) : d);
const flt = (r: Rec, k: string, d: number): number => f32(num(r, k, d));
const bool = (r: Rec, k: string): boolean => r[k] === true;
const list = <T extends string = string>(r: Rec, k: string): T[] => {
  const s = str(r, k);
  return (s === '' ? [] : s.split('|')) as T[];
};

export const classDataFromRecord = (r: Rec): ClassDataRow => ({
  Name: str(r, 'Name'),
  RoleTag: str(r, 'RoleTag') as ClassRole,
  BaseStats: { HP: flt(r, 'BaseHP', 0), Damage: flt(r, 'BaseDamage', 0), AttackPerSec: flt(r, 'BaseAttackPerSec', 0), DefensePct: flt(r, 'BaseDefensePct', 0) },
  BaseThreat: flt(r, 'BaseThreat', 1),
  AutoActionId: str(r, 'AutoActionId'),
  AbilityId: str(r, 'AbilityId'),
  AllowedStats: list(r, 'AllowedStats'),
  AllowedTargetTypes: list<TargetType>(r, 'AllowedTargetTypes'),
  AllowedTriggerModes: list<TriggerMode>(r, 'AllowedTriggerModes'),
  ThreatMultiplier: flt(r, 'ThreatMultiplier', 1),
  MoveSpeed: flt(r, 'MoveSpeed', 0),
  AttackRange: flt(r, 'AttackRange', 0),
  PreferredDistMin: flt(r, 'PreferredDistMin', 0),
  PreferredDistMax: flt(r, 'PreferredDistMax', 0),
  RetreatDistance: flt(r, 'RetreatDistance', 0),
  SmiteThreshold: flt(r, 'SmiteThreshold', -1),
  ExtraAbilityIds: list(r, 'ExtraAbilityIds'),
});

export const enemyDataFromRecord = (r: Rec): EnemyDataRow => ({
  Name: str(r, 'Name'),
  RoleTag: str(r, 'RoleTag') as EnemyRole,
  BaseStats: { HP: flt(r, 'BaseHP', 0), Damage: flt(r, 'BaseDamage', 0), AttackPerSec: flt(r, 'BaseAttackPerSec', 0), DefensePct: flt(r, 'BaseDefensePct', 0) },
  AutoActionId: str(r, 'AutoActionId'),
  AbilityId: str(r, 'AbilityId'),
  Taunts: bool(r, 'Taunts'),
  IsBoss: bool(r, 'IsBoss'),
  IsElite: bool(r, 'IsElite'),
  MoveSpeed: flt(r, 'MoveSpeed', 0),
  AttackRange: flt(r, 'AttackRange', 0),
  PreferredDistMin: flt(r, 'PreferredDistMin', 0),
  PreferredDistMax: flt(r, 'PreferredDistMax', 0),
  RetreatDistance: flt(r, 'RetreatDistance', 0),
});

export const statDefFromRecord = (r: Rec): StatDefRow => ({
  Name: str(r, 'Name'),
  Tier: num(r, 'Tier', 0),
  AllowedClasses: list(r, 'AllowedClasses'),
  EssenceBaseCost: flt(r, 'EssenceBaseCost', -1),
  EssenceCostGrowth: flt(r, 'EssenceCostGrowth', -1),
  GoldUnlockCost: flt(r, 'GoldUnlockCost', -1),
  MaxRank: num(r, 'MaxRank', -1),
  BonusPerRank: flt(r, 'BonusPerRank', -1),
  Cap: flt(r, 'Cap', -1),
  IsStretch: bool(r, 'IsStretch'),
});

export const abilityEffectFromRecord = (r: Rec): AbilityEffectRow => ({
  Name: str(r, 'Name'),
  AbilityId: str(r, 'AbilityId'),
  Order: num(r, 'Order', 0),
  Type: str(r, 'EffectType') as EffectType,
  TargetSelector: str(r, 'TargetSelector'),
  Stat: str(r, 'Stat'),
  Value: flt(r, 'Value', -1),
  Duration: flt(r, 'Duration', 0),
});

export const abilityDataFromRecord = (r: Rec): AbilityDataRow => ({
  Name: str(r, 'Name'),
  Cooldown: flt(r, 'Cooldown', 0),
  EffectIds: list(r, 'EffectIds'),
  AllowedTriggerModes: list<TriggerMode>(r, 'AllowedTriggerModes'),
  ThreatMultiplier: flt(r, 'ThreatMultiplier', 1),
});

export const gearDataFromRecord = (r: Rec): GearDataRow => ({
  Name: str(r, 'Name'),
  Slot: str(r, 'Slot'),
  Class: str(r, 'Class'),
  Level: num(r, 'Level', 1),
  GoldCost: num(r, 'GoldCost', 0),
  StatModifiers: str(r, 'StatModifiers'),
});
