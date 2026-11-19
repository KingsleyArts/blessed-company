// RunConfig port (Core/RunConfig.h): the run layer's tunable numbers in one place. DOC values come from DESIGN-DECISIONS
// section 3; PLACEHOLDER values were drafted by the run-programmer (see the C++ header for each note).
import { EssenceConfig, shippedEssenceConfig } from './essenceConfig';
import { EnemyType, defaultConfig, type Config } from './floorGenerator';

export interface RunConfig {
  essencePerKill: number;
  essencePerRoom: number;
  goldCombat: number;
  goldElite: number;
  goldBoss: number;
  goldTreasure: number;
  startParty: string[];
  rescueClass: string;
  rescueExtraEnemies: number;
  rescueExtraType: EnemyType;
  rescueMinPack: number;
  rescueWave: boolean;
  rescueRequiredToLeaveFloor: boolean;
  waveMinSeconds: number;
  waveMaxSeconds: number;
  endRunAfterBossFloor: boolean;
  essence: EssenceConfig;
  floor: Config;
}

export function defaultRunConfig(): RunConfig {
  return {
    essencePerKill: 5,
    essencePerRoom: 10,
    goldCombat: 10,
    goldElite: 25,
    goldBoss: 50,
    goldTreasure: 15,
    startParty: ['Warrior', 'Mage'],
    rescueClass: 'Priest',
    rescueExtraEnemies: 1,
    rescueExtraType: EnemyType.Grunt,
    rescueMinPack: 2,
    rescueWave: false,
    rescueRequiredToLeaveFloor: true,
    waveMinSeconds: 6,
    waveMaxSeconds: 12,
    endRunAfterBossFloor: true,
    essence: shippedEssenceConfig(),
    floor: defaultConfig(),
  };
}

export function cloneRunConfig(c: RunConfig): RunConfig {
  return { ...c, startParty: [...c.startParty], essence: c.essence.clone(), floor: structuredClone(c.floor) };
}
