export type PokemonAnimType = 'Walk' | 'Idle' | 'Attack';

export type PokemonClassId =
  | 'disparador'
  | 'lutador'
  | 'controlador'
  | 'tank'
  | 'suporte';

export type ElementType = 'eletrico' | 'fogo' | 'planta' | 'agua' | 'fada';

export const MAX_PLAYER_LEVEL = 15;

/**
 * Curva de XP balanceada para partidas de 3 minutos por mapa até o Nível 15
 */
export const XP_CURVE_LEVELS: number[] = [
  0,    // Nv 1 (base)
  15,   // Nv 1 -> 2
  35,   // Nv 2 -> 3
  70,   // Nv 3 -> 4 (1ª Evolução: Charmeleon, Ivysaur, Wartortle)
  120,  // Nv 4 -> 5 (Evolução: Raichu, Wigglytuff)
  185,  // Nv 5 -> 6
  265,  // Nv 6 -> 7
  360,  // Nv 7 -> 8 (2ª Evolução: Charizard, Venusaur, Blastoise)
  480,  // Nv 8 -> 9
  620,  // Nv 9 -> 10
  780,  // Nv 10 -> 11
  960,  // Nv 11 -> 12
  1160, // Nv 12 -> 13
  1380, // Nv 13 -> 14
  1650, // Nv 14 -> 15 (Nível Máximo!)
];

export function getRequiredXpForLevel(level: number): number {
  const idx = Math.max(1, Math.min(level, MAX_PLAYER_LEVEL - 1));
  return XP_CURVE_LEVELS[idx] ?? 1650;
}

export interface ClassSummaryItem {
  text: string;
  positive: boolean;
}

export interface PokemonClassDefinition {
  id: PokemonClassId;
  title: string;
  colorHex: string;
  colorNum: number;
  iconSymbol: string;
  description: string[];
  summary: ClassSummaryItem[];
  stats: {
    hpMultiplier: number;
    speedMultiplier: number;
    physDamageMultiplier: number;
    specDamageMultiplier: number;
    physDefenseMultiplier: number;
    specDefenseMultiplier: number;
    critChanceBonus: number;
    critDamageBonus: number;
    damageReduction: number;
    passiveRegenPercentPerSec: number;
    effectChanceBonus: number;
    effectStrengthBonus: number;
    soloBuffMultiplier: number;
    healEfficiencyMultiplier: number;
  };
}

export const POKEMON_CLASSES: Record<PokemonClassId, PokemonClassDefinition> = {
  disparador: {
    id: 'disparador',
    title: 'DISPARADOR',
    colorHex: '#e63946',
    colorNum: 0xe63946,
    iconSymbol: '🎯',
    description: [
      'Golpes do tipo distância ganham +15% de dano.',
      'Ganha +10% de acerto crítico, +25% de dano crítico.',
    ],
    summary: [
      { text: '- HP', positive: false },
      { text: '+ DANO ESPECIAL', positive: true },
      { text: '+ VELOCIDADE', positive: true },
      { text: '- DANO FÍSICO', positive: false },
    ],
    stats: {
      hpMultiplier: 0.85,
      speedMultiplier: 1.15,
      physDamageMultiplier: 0.9,
      specDamageMultiplier: 1.25,
      physDefenseMultiplier: 1.0,
      specDefenseMultiplier: 1.0,
      critChanceBonus: 0.1,
      critDamageBonus: 0.25,
      damageReduction: 0,
      passiveRegenPercentPerSec: 0,
      effectChanceBonus: 0,
      effectStrengthBonus: 0,
      soloBuffMultiplier: 1.0,
      healEfficiencyMultiplier: 1.0,
    },
  },
  lutador: {
    id: 'lutador',
    title: 'LUTADOR',
    colorHex: '#f59e0b',
    colorNum: 0xf59e0b,
    iconSymbol: '✊',
    description: [
      'Golpes de combate de perto ganham:',
      'Quanto menor o HP (Abaixo de 40%/30%/20%)',
      'Maior o dano (+10% / +18,5% / +30%).',
    ],
    summary: [
      { text: '+ VELOCIDADE', positive: true },
      { text: '+ DEFESA FÍSICA', positive: true },
      { text: '+ DEFESA ESPECIAL', positive: true },
    ],
    stats: {
      hpMultiplier: 1.0,
      speedMultiplier: 1.12,
      physDamageMultiplier: 1.15,
      specDamageMultiplier: 1.0,
      physDefenseMultiplier: 1.15,
      specDefenseMultiplier: 1.15,
      critChanceBonus: 0.05,
      critDamageBonus: 0,
      damageReduction: 0.08,
      passiveRegenPercentPerSec: 0,
      effectChanceBonus: 0,
      effectStrengthBonus: 0,
      soloBuffMultiplier: 1.0,
      healEfficiencyMultiplier: 1.0,
    },
  },
  controlador: {
    id: 'controlador',
    title: 'CONTROLADOR',
    colorHex: '#00b4d8',
    colorNum: 0x00b4d8,
    iconSymbol: '🌀',
    description: [
      'Especialistas em controle de área e SUPER ATAQUE.',
      'Potência e duração de efeitos +20%,',
      'Velocidade da barra de ULT aumentada em +30%.',
    ],
    summary: [
      { text: '+ DANO ESPECIAL', positive: true },
      { text: '- VELOCIDADE', positive: false },
    ],
    stats: {
      hpMultiplier: 1.0,
      speedMultiplier: 0.92,
      physDamageMultiplier: 1.0,
      specDamageMultiplier: 1.2,
      physDefenseMultiplier: 1.0,
      specDefenseMultiplier: 1.05,
      critChanceBonus: 0.05,
      critDamageBonus: 0,
      damageReduction: 0,
      passiveRegenPercentPerSec: 0,
      effectChanceBonus: 0,
      effectStrengthBonus: 0.2,
      soloBuffMultiplier: 1.0,
      healEfficiencyMultiplier: 1.0,
    },
  },
  tank: {
    id: 'tank',
    title: 'TANK',
    colorHex: '#9d4edd',
    colorNum: 0x9d4edd,
    iconSymbol: '🛡️',
    description: [
      'Redução de dano +25%,',
      'Cura passiva aumentada +2.5% HP/s,',
      'Itens de HP e Resistência +10% eficientes.',
    ],
    summary: [
      { text: '- VELOCIDADE', positive: false },
      { text: '+ DEFESA FÍSICA', positive: true },
      { text: '+ DEFESA ESPECIAL', positive: true },
      { text: '+ HP', positive: true },
    ],
    stats: {
      hpMultiplier: 1.35,
      speedMultiplier: 0.88,
      physDamageMultiplier: 1.0,
      specDamageMultiplier: 1.0,
      physDefenseMultiplier: 1.25,
      specDefenseMultiplier: 1.25,
      critChanceBonus: 0,
      critDamageBonus: 0,
      damageReduction: 0.25,
      passiveRegenPercentPerSec: 0.025,
      effectChanceBonus: 0,
      effectStrengthBonus: 0,
      soloBuffMultiplier: 1.0,
      healEfficiencyMultiplier: 1.1,
    },
  },
  suporte: {
    id: 'suporte',
    title: 'SUPORTE',
    colorHex: '#ff4d8d',
    colorNum: 0xff4d8d,
    iconSymbol: '💖',
    description: [
      '"Grupo": Buffs passam aos aliados (-35%).',
      '"Solo": Força do BUFF aumentada em +25%,',
      'Eficiência de cura aumentada em +25%.',
    ],
    summary: [
      { text: '+ DEFESA ESPECIAL', positive: true },
      { text: '- DEFESA FÍSICA', positive: false },
    ],
    stats: {
      hpMultiplier: 1.1,
      speedMultiplier: 1.0,
      physDamageMultiplier: 0.9,
      specDamageMultiplier: 1.18,
      physDefenseMultiplier: 0.9,
      specDefenseMultiplier: 1.25,
      critChanceBonus: 0.05,
      critDamageBonus: 0,
      damageReduction: 0.1,
      passiveRegenPercentPerSec: 0.015,
      effectChanceBonus: 0,
      effectStrengthBonus: 0.2,
      soloBuffMultiplier: 1.25,
      healEfficiencyMultiplier: 1.25,
    },
  },
};

export interface PokemonInnatePassive {
  name: string;
  icon: string;
  statusName: string;
  baseStatusChance: number;
  description: string;
}

export interface PokemonAnimConfig {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  durations: number[];
}

export interface PokemonAttackProfile {
  name: string;
  element: ElementType;
  elementLabel: string;
  elementColor: number;
  secondaryColor: number;
  style:
    | 'ranged_bolt'
    | 'melee_flame'
    | 'control_leaf'
    | 'wave_water'
    | 'support_song';
  baseDamage: number;
  cooldownMs: number;
  range: number;
  description: string;
  /** Caminho opcional de imagem estática para o ataque (ex: 'assets/attacks/raio.png') */
  spriteFile?: string;
  /** Escala opcional para o sprite do ataque (padrão: 1.0) */
  spriteScale?: number;
}

export interface PokemonDefinition {
  id: string;
  name: string;
  role: 'starter' | 'evolution' | 'enemy' | 'boss';
  classId?: PokemonClassId;
  evolvesToId?: string;
  evolveAtLevel?: number;
  evolutionLineText?: string;
  baseHp: number;
  speed: number;
  scale: number;
  canFly?: boolean;
  canSwim?: boolean;
  innatePassive?: PokemonInnatePassive;
  attackProfile?: PokemonAttackProfile;
  anims: Record<PokemonAnimType, PokemonAnimConfig>;
}


export function isPokemonWater(def: PokemonDefinition): boolean {
  return def.canSwim === true || def.attackProfile?.element === 'agua';
}

export function isPokemonFlying(def: PokemonDefinition): boolean {
  return def.canFly === true || def.id === '0006' || def.id === '0041';
}

export interface MapDefinition {
  key: string;
  name: string;
  file: string;
  theme: 'forest' | 'cave' | 'boss';
  worldScale: number;
  northExitNormX: number;
  southEntranceNormX: number;
  initialSpawnNorm: { x: number; y: number };
  /** Recorta a base da imagem (0..1) para conectar exatamente no ponto desejado do mapa */
  southCropNormY?: number;
}

export const MAP_SEQUENCE: MapDefinition[] = [
  {
    key: 'map1',
    name: 'Mapa 1 - Vila Verdejante',
    file: 'assets/maps/map1.jpeg',
    theme: 'forest',
    worldScale: 1.5,
    northExitNormX: 0.5,
    southEntranceNormX: 0.5,
    initialSpawnNorm: { x: 0.5, y: 0.52 },
  },
  {
    key: 'map2',
    name: 'Mapa 2 - Vale das Falésias',
    file: 'assets/maps/map2.jpeg',
    theme: 'forest',
    worldScale: 1.5,
    northExitNormX: 0.5,
    southEntranceNormX: 0.5,
    initialSpawnNorm: { x: 0.5, y: 0.88 },
  },
  {
    key: 'map3',
    name: 'Mapa 3 - Rota da Clareira',
    file: 'assets/maps/map3.jpeg',
    theme: 'forest',
    worldScale: 1.5,
    northExitNormX: 0.5,
    southEntranceNormX: 0.5,
    initialSpawnNorm: { x: 0.5, y: 0.88 },
  },
  {
    key: 'map4',
    name: 'Mapa 4 - Cidade Pokémon',
    file: 'assets/maps/map4.jpeg',
    theme: 'forest',
    worldScale: 1.5,
    northExitNormX: 0.5,
    southEntranceNormX: 0.5,
    initialSpawnNorm: { x: 0.5, y: 0.88 },
  },
  {
    key: 'map5',
    name: 'Mapa 5 - Costa das Marés',
    file: 'assets/maps/map5.jpeg',
    theme: 'forest',
    worldScale: 1.5,
    northExitNormX: 0.5,
    southEntranceNormX: 0.5,
    initialSpawnNorm: { x: 0.5, y: 0.88 },
  },
  {
    key: 'map6',
    name: 'Mapa 6 - Caverna Rochosa (1F)',
    file: 'assets/maps/map6.jpeg',
    theme: 'cave',
    worldScale: 1.5,
    northExitNormX: 0.5,
    southEntranceNormX: 0.5,
    initialSpawnNorm: { x: 0.5, y: 0.88 },
  },
  {
    key: 'map7',
    name: 'Mapa 7 - Profundezas da Caverna (2F)',
    file: 'assets/maps/map7.jpeg',
    theme: 'cave',
    worldScale: 1.5,
    northExitNormX: 0.5,
    southEntranceNormX: 0.5,
    initialSpawnNorm: { x: 0.5, y: 0.88 },
  },
];

export const BOSS_MAP_DEFINITION: MapDefinition = {
  key: 'map5-boss',
  name: 'Arena Final - Ginásio de Pedra (BOSS ONIX)',
  file: 'assets/maps/map5-BOSS.jpeg',
  theme: 'boss',
  worldScale: 1.5,
  northExitNormX: 0.5,
  southEntranceNormX: 0.5,
  initialSpawnNorm: { x: 0.5, y: 0.72 },
};

export const POKEMON_MANIFEST: Record<string, PokemonDefinition> = {
  // === LINHA PIKACHU -> RAICHU (DISPARADOR) ===
  '0025': {
    id: '0025',
    name: 'Pikachu',
    role: 'starter',
    classId: 'disparador',
    evolvesToId: '0026',
    evolveAtLevel: 5,
    evolutionLineText: 'Pikachu → Raichu (Nv. 5)',
    baseHp: 95,
    speed: 195,
    scale: 1.45,
    innatePassive: {
      name: 'Estática (Static)',
      icon: '⚡',
      statusName: 'Paralisia',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Paralisar no ataque básico; 30% de chance de Paralisar inimigos ao contato.',
    },
    attackProfile: {
      name: 'Choque do Trovão',
      element: 'eletrico',
      elementLabel: 'Elétrico',
      elementColor: 0xf7d02c,
      secondaryColor: 0x60efff,
      style: 'ranged_bolt',
      baseDamage: 18,
      cooldownMs: 920,
      range: 280,
      description: 'Dispara lanças elétricas rápidas à distância (5% de Paralisia base).',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0025/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 40,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0025/Idle-Anim.png',
        frameWidth: 40,
        frameHeight: 56,
        frameCount: 6,
        durations: [40, 2, 3, 3, 3, 2],
      },
      Attack: {
        file: 'assets/sprites/0025/Attack-Anim.png',
        frameWidth: 80,
        frameHeight: 80,
        frameCount: 10,
        durations: [2, 4, 1, 1, 1, 2, 2, 2, 2, 4],
      },
    },
  },
  '0026': {
    id: '0026',
    name: 'Raichu',
    role: 'evolution',
    classId: 'disparador',
    baseHp: 135,
    speed: 210,
    scale: 1.5,
    innatePassive: {
      name: 'Estática & Surfista (Static)',
      icon: '⚡',
      statusName: 'Paralisia',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Paralisar no ataque básico; 35% de chance de Paralisar ao contato.',
    },
    attackProfile: {
      name: 'Relâmpago Direto',
      element: 'eletrico',
      elementLabel: 'Elétrico',
      elementColor: 0xffae00,
      secondaryColor: 0xfef08a,
      style: 'ranged_bolt',
      baseDamage: 29,
      cooldownMs: 780,
      range: 320,
      description: 'Dispara descargas elétricas de alta voltagem na direção do alvo.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0026/Walk-Anim.png',
        frameWidth: 40,
        frameHeight: 48,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0026/Idle-Anim.png',
        frameWidth: 40,
        frameHeight: 56,
        frameCount: 6,
        durations: [40, 2, 4, 4, 4, 2],
      },
      Attack: {
        file: 'assets/sprites/0026/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 10,
        durations: [2, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },

  // === LINHA CHARMANDER -> CHARMELEON -> CHARIZARD (LUTADOR) ===
  '0004': {
    id: '0004',
    name: 'Charmander',
    role: 'starter',
    classId: 'lutador',
    evolvesToId: '0005',
    evolveAtLevel: 4,
    evolutionLineText: 'Charmander → Charmeleon (Nv.4) → Charizard (Nv.8)',
    baseHp: 110,
    speed: 185,
    scale: 1.45,
    innatePassive: {
      name: 'Chama Ardente (Blaze)',
      icon: '🔥',
      statusName: 'Queimadura',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de aplicar Queimadura no ataque básico; até +30% de dano de Fogo com HP baixo.',
    },
    attackProfile: {
      name: 'Garra de Brasas',
      element: 'fogo',
      elementLabel: 'Fogo',
      elementColor: 0xff5722,
      secondaryColor: 0xffc107,
      style: 'melee_flame',
      baseDamage: 22,
      cooldownMs: 1020,
      range: 100,
      description: 'Golpe flamejante frontal (5% base de Queimadura; mais forte com HP baixo).',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0004/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        durations: [6, 8, 6, 8],
      },
      Idle: {
        file: 'assets/sprites/0004/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 40,
        frameCount: 4,
        durations: [12, 8, 8, 8],
      },
      Attack: {
        file: 'assets/sprites/0004/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 11,
        durations: [2, 2, 4, 2, 2, 2, 2, 2, 2, 2, 2],
      },
    },
  },
  '0005': {
    id: '0005',
    name: 'Charmeleon',
    role: 'evolution',
    classId: 'lutador',
    evolvesToId: '0006',
    evolveAtLevel: 8,
    baseHp: 145,
    speed: 195,
    scale: 1.5,
    innatePassive: {
      name: 'Chama Ardente (Blaze)',
      icon: '🔥',
      statusName: 'Queimadura',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de aplicar Queimadura no ataque básico; até +30% de dano de Fogo com HP baixo.',
    },
    attackProfile: {
      name: 'Talho Flamejante',
      element: 'fogo',
      elementLabel: 'Fogo',
      elementColor: 0xff3d00,
      secondaryColor: 0xffab00,
      style: 'melee_flame',
      baseDamage: 30,
      cooldownMs: 920,
      range: 120,
      description: 'Arco intenso de fogo direcionado aos inimigos à frente.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0005/Walk-Anim.png',
        frameWidth: 24,
        frameHeight: 32,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0005/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 56,
        frameCount: 6,
        durations: [40, 2, 3, 3, 3, 2],
      },
      Attack: {
        file: 'assets/sprites/0005/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 14,
        durations: [2, 2, 2, 2, 4, 1, 1, 2, 2, 2, 2, 2, 2, 2],
      },
    },
  },
  '0006': {
    id: '0006',
    canFly: true,
    name: 'Charizard',
    role: 'evolution',
    classId: 'lutador',
    baseHp: 190,
    speed: 208,
    scale: 1.55,
    innatePassive: {
      name: 'Chama Dracônica (Blaze)',
      icon: '🔥',
      statusName: 'Queimadura',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de aplicar Queimadura no ataque básico; até +30% de dano de Fogo com HP baixo.',
    },
    attackProfile: {
      name: 'Garra Ígnea Dracônica',
      element: 'fogo',
      elementLabel: 'Fogo',
      elementColor: 0xd50000,
      secondaryColor: 0xffab00,
      style: 'melee_flame',
      baseDamage: 42,
      cooldownMs: 840,
      range: 145,
      description: 'Rajada devastadora de chamas dracônicas em grande arco frontal.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0006/Walk-Anim.png',
        frameWidth: 40,
        frameHeight: 48,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0006/Idle-Anim.png',
        frameWidth: 40,
        frameHeight: 48,
        frameCount: 4,
        durations: [15, 15, 15, 15],
      },
      Attack: {
        file: 'assets/sprites/0006/Attack-Anim.png',
        frameWidth: 80,
        frameHeight: 88,
        frameCount: 14,
        durations: [2, 2, 2, 2, 4, 1, 1, 2, 2, 2, 2, 2, 2, 2],
      },
    },
  },

  // === LINHA BULBASAUR -> IVYSAUR -> VENUSAUR (CONTROLADOR) ===
  '0001': {
    id: '0001',
    name: 'Bulbasaur',
    role: 'starter',
    classId: 'controlador',
    evolvesToId: '0002',
    evolveAtLevel: 4,
    evolutionLineText: 'Bulbasaur → Ivysaur (Nv.4) → Venusaur (Nv.8)',
    baseHp: 115,
    speed: 170,
    scale: 1.45,
    innatePassive: {
      name: 'Espessura Tóxica (Overgrow)',
      icon: '☠️',
      statusName: 'Envenenamento',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Envenenar no ataque básico; ULT sempre causa Envenenamento Tóxico; +22% dano com HP baixo.',
    },
    attackProfile: {
      name: 'Folha Navalha',
      element: 'planta',
      elementLabel: 'Planta',
      elementColor: 0x4caf50,
      secondaryColor: 0xa5d6a7,
      style: 'control_leaf',
      baseDamage: 16,
      cooldownMs: 1100,
      range: 215,
      description: 'Lança folhas cortantes direcionadas que reduzem velocidade (5% de Veneno base).',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0001/Walk-Anim.png',
        frameWidth: 40,
        frameHeight: 40,
        frameCount: 6,
        durations: [4, 4, 4, 4, 4, 4],
      },
      Idle: {
        file: 'assets/sprites/0001/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 40,
        frameCount: 3,
        durations: [40, 6, 6],
      },
      Attack: {
        file: 'assets/sprites/0001/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 72,
        frameCount: 11,
        durations: [4, 2, 4, 2, 2, 2, 2, 2, 2, 2, 4],
      },
    },
  },
  '0002': {
    id: '0002',
    name: 'Ivysaur',
    role: 'evolution',
    classId: 'controlador',
    evolvesToId: '0003',
    evolveAtLevel: 8,
    baseHp: 150,
    speed: 178,
    scale: 1.5,
    innatePassive: {
      name: 'Espessura Tóxica (Overgrow)',
      icon: '☠️',
      statusName: 'Envenenamento',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Envenenar no ataque básico; ULT sempre causa Envenenamento Tóxico; +22% dano com HP baixo.',
    },
    attackProfile: {
      name: 'Dança de Folhas',
      element: 'planta',
      elementLabel: 'Planta',
      elementColor: 0x2e7d32,
      secondaryColor: 0x81c784,
      style: 'control_leaf',
      baseDamage: 24,
      cooldownMs: 980,
      range: 245,
      description: 'Dispara rajadas afiadas de folhas perfurantes de longo alcance.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0002/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0002/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        durations: [40, 12, 12, 12],
      },
      Attack: {
        file: 'assets/sprites/0002/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 9,
        durations: [4, 2, 4, 2, 2, 2, 2, 2, 4],
      },
    },
  },
  '0003': {
    id: '0003',
    name: 'Venusaur',
    role: 'evolution',
    classId: 'controlador',
    baseHp: 195,
    speed: 185,
    scale: 1.6,
    innatePassive: {
      name: 'Espessura Floral (Overgrow)',
      icon: '☠️',
      statusName: 'Envenenamento',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Envenenar no ataque básico; ULT sempre causa Envenenamento Tóxico; +22% dano com HP baixo.',
    },
    attackProfile: {
      name: 'Tempestade Floral',
      element: 'planta',
      elementLabel: 'Planta',
      elementColor: 0x1b5e20,
      secondaryColor: 0xf48fb1,
      style: 'control_leaf',
      baseDamage: 35,
      cooldownMs: 880,
      range: 275,
      description: 'Cria uma tempestade de lâminas botânicas que controla a área.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0003/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        durations: [8, 16, 8, 16],
      },
      Idle: {
        file: 'assets/sprites/0003/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        durations: [30, 16, 12, 16],
      },
      Attack: {
        file: 'assets/sprites/0003/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 72,
        frameCount: 11,
        durations: [4, 2, 4, 2, 2, 2, 2, 2, 2, 2, 4],
      },
    },
  },

  // === LINHA SQUIRTLE -> WARTORTLE -> BLASTOISE (TANK) ===
  '0007': {
    id: '0007',
    canSwim: true,
    name: 'Squirtle',
    role: 'starter',
    classId: 'tank',
    evolvesToId: '0008',
    evolveAtLevel: 4,
    evolutionLineText: 'Squirtle → Wartortle (Nv.4) → Blastoise (Nv.8)',
    baseHp: 145,
    speed: 168,
    scale: 1.45,
    innatePassive: {
      name: 'Torrente (Torrent)',
      icon: '💧',
      statusName: 'Encharcar',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Encharcar (-45% vel.) no ataque básico; +22% de dano de Água com HP baixo.',
    },
    attackProfile: {
      name: 'Pulso de Água',
      element: 'agua',
      elementLabel: 'Água',
      elementColor: 0x00b4d8,
      secondaryColor: 0x90e0ef,
      style: 'wave_water',
      baseDamage: 17,
      cooldownMs: 1050,
      range: 155,
      description: 'Dispara esferas pressurizadas de água que empurram os inimigos.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0007/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        durations: [12, 8, 12, 8],
      },
      Idle: {
        file: 'assets/sprites/0007/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 8,
        durations: [30, 2, 2, 4, 4, 4, 2, 2],
      },
      Attack: {
        file: 'assets/sprites/0007/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 72,
        frameCount: 10,
        durations: [2, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0008': {
    id: '0008',
    canSwim: true,
    name: 'Wartortle',
    role: 'evolution',
    classId: 'tank',
    evolvesToId: '0009',
    evolveAtLevel: 8,
    baseHp: 185,
    speed: 176,
    scale: 1.5,
    innatePassive: {
      name: 'Torrente (Torrent)',
      icon: '💧',
      statusName: 'Encharcar',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Encharcar (-45% vel.) no ataque básico; +22% de dano de Água com HP baixo.',
    },
    attackProfile: {
      name: 'Torrente Marinha',
      element: 'agua',
      elementLabel: 'Água',
      elementColor: 0x0077b6,
      secondaryColor: 0x48cae4,
      style: 'wave_water',
      baseDamage: 25,
      cooldownMs: 950,
      range: 175,
      description: 'Jato hidráulico de alta pressão que repele hordas inteiras.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0008/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 40,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0008/Idle-Anim.png',
        frameWidth: 24,
        frameHeight: 40,
        frameCount: 4,
        durations: [40, 2, 2, 2],
      },
      Attack: {
        file: 'assets/sprites/0008/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 72,
        frameCount: 11,
        durations: [4, 2, 4, 2, 2, 2, 2, 2, 2, 2, 4],
      },
    },
  },
  '0009': {
    id: '0009',
    canSwim: true,
    name: 'Blastoise',
    role: 'evolution',
    classId: 'tank',
    baseHp: 245,
    speed: 182,
    scale: 1.6,
    innatePassive: {
      name: 'Torrente Colossal (Torrent)',
      icon: '💧',
      statusName: 'Encharcar',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Encharcar (-45% vel.) no ataque básico; +22% de dano de Água com HP baixo.',
    },
    attackProfile: {
      name: 'Hidro Bomba Colossal',
      element: 'agua',
      elementLabel: 'Água',
      elementColor: 0x023e8a,
      secondaryColor: 0x00b4d8,
      style: 'wave_water',
      baseDamage: 38,
      cooldownMs: 880,
      range: 205,
      description: 'Disparo massivo dos canhões hidráulicos com grande impacto.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0009/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 40,
        frameCount: 4,
        durations: [8, 14, 8, 14],
      },
      Idle: {
        file: 'assets/sprites/0009/Idle-Anim.png',
        frameWidth: 40,
        frameHeight: 40,
        frameCount: 8,
        durations: [32, 12, 4, 4, 4, 4, 4, 8],
      },
      Attack: {
        file: 'assets/sprites/0009/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 72,
        frameCount: 13,
        durations: [2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 4],
      },
    },
  },

  // === LINHA JIGGLYPUFF -> WIGGLYTUFF (SUPORTE) ===
  '0039': {
    id: '0039',
    name: 'Jigglypuff',
    role: 'starter',
    classId: 'suporte',
    evolvesToId: '0040',
    evolveAtLevel: 5,
    evolutionLineText: 'Jigglypuff → Wigglytuff (Nv. 5)',
    baseHp: 125,
    speed: 175,
    scale: 1.45,
    innatePassive: {
      name: 'Charme Fofo (Cute Charm)',
      icon: '💖',
      statusName: 'Encanto',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Encantar no ataque básico; 30% de chance de Encantar quem tocar em você.',
    },
    attackProfile: {
      name: 'Canto Melódico & Aura',
      element: 'fada',
      elementLabel: 'Fada / Som',
      elementColor: 0xff4d8d,
      secondaryColor: 0xffb3c6,
      style: 'support_song',
      baseDamage: 16,
      cooldownMs: 1080,
      range: 165,
      description: 'Emite notas harmônicas direcionadas e em pulso que curam HP.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0039/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 40,
        frameCount: 5,
        durations: [6, 4, 4, 4, 6],
      },
      Idle: {
        file: 'assets/sprites/0039/Idle-Anim.png',
        frameWidth: 24,
        frameHeight: 32,
        frameCount: 5,
        durations: [25, 8, 15, 8, 15],
      },
      Attack: {
        file: 'assets/sprites/0039/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 13,
        durations: [2, 2, 6, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2],
      },
    },
  },
  '0040': {
    id: '0040',
    name: 'Wigglytuff',
    role: 'evolution',
    classId: 'suporte',
    baseHp: 175,
    speed: 185,
    scale: 1.5,
    innatePassive: {
      name: 'Charme Feérico (Cute Charm)',
      icon: '💖',
      statusName: 'Encanto',
      baseStatusChance: 0.05,
      description:
        '5% de chance base de Encantar no ataque básico; 35% de chance de Encantar quem tocar em você.',
    },
    attackProfile: {
      name: 'Sinfonia Estelar & Cura',
      element: 'fada',
      elementLabel: 'Fada / Som',
      elementColor: 0xf72585,
      secondaryColor: 0xffccd5,
      style: 'support_song',
      baseDamage: 27,
      cooldownMs: 920,
      range: 195,
      description: 'Ondas harmônicas estelares que restauram vida e controlam inimigos.',
    },
    anims: {
      Walk: {
        file: 'assets/sprites/0040/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 40,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0040/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 48,
        frameCount: 4,
        durations: [40, 4, 6, 4],
      },
      Attack: {
        file: 'assets/sprites/0040/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 80,
        frameCount: 10,
        durations: [2, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },

  // === INIMIGOS SELVAGENS E BOSS ===
  '0019': {
    id: '0019',
    name: 'Rattata',
    role: 'enemy',
    baseHp: 32,
    speed: 92,
    scale: 1.35,
    anims: {
      Walk: {
        file: 'assets/sprites/0019/Walk-Anim.png',
        frameWidth: 48,
        frameHeight: 40,
        frameCount: 7,
        durations: [6, 4, 4, 4, 4, 4, 4],
      },
      Idle: {
        file: 'assets/sprites/0019/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 8,
        durations: [40, 2, 2, 2, 4, 2, 2, 2],
      },
      Attack: {
        file: 'assets/sprites/0019/Attack-Anim.png',
        frameWidth: 64,
        frameHeight: 72,
        frameCount: 10,
        durations: [2, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0041': {
    id: '0041',
    canFly: true,
    name: 'Zubat',
    role: 'enemy',
    baseHp: 26,
    speed: 108,
    scale: 1.35,
    anims: {
      Walk: {
        file: 'assets/sprites/0041/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 56,
        frameCount: 8,
        durations: [6, 6, 6, 6, 6, 6, 6, 6],
      },
      Idle: {
        file: 'assets/sprites/0041/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 56,
        frameCount: 8,
        durations: [10, 6, 6, 6, 6, 6, 6, 8],
      },
      Attack: {
        file: 'assets/sprites/0041/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 11,
        durations: [2, 3, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0074': {
    id: '0074',
    name: 'Geodude',
    role: 'boss',
    baseHp: 1250,
    speed: 125,
    scale: 1.5,
    canFly: false,
    anims: {
      Walk: {
        file: 'assets/sprites/0074/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0074/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 24,
        frameCount: 4,
        durations: [8, 12, 8, 12],
      },
      Attack: {
        file: 'assets/sprites/0074/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 14,
        durations: [3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2],
      },
    },
  },
  '0095': {
    id: '0095',
    name: 'Onix',
    role: 'boss',
    baseHp: 1150,
    speed: 115,
    scale: 1.55,
    anims: {
      Walk: {
        file: 'assets/sprites/0095/Walk-Anim.png',
        frameWidth: 88,
        frameHeight: 112,
        frameCount: 4,
        durations: [10, 14, 10, 14],
      },
      Idle: {
        file: 'assets/sprites/0095/Idle-Anim.png',
        frameWidth: 96,
        frameHeight: 104,
        frameCount: 4,
        durations: [16, 16, 16, 16],
      },
      Attack: {
        file: 'assets/sprites/0095/Attack-Anim.png',
        frameWidth: 128,
        frameHeight: 152,
        frameCount: 11,
        durations: [2, 6, 1, 1, 1, 2, 2, 2, 2, 2, 2],
      },
    },
  },
  '0123': {
    id: '0123',
    name: 'Scyther',
    role: 'enemy',
    baseHp: 380,
    speed: 145,
    scale: 1.45,
    canFly: true,
    anims: {
      Walk: {
        file: 'assets/sprites/0123/Walk-Anim.png',
        frameWidth: 40,
        frameHeight: 48,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0123/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 48,
        frameCount: 4,
        durations: [40, 10, 14, 10],
      },
      Attack: {
        file: 'assets/sprites/0123/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 10,
        durations: [2, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0126': {
    id: '0126',
    name: 'Magmar',
    role: 'enemy',
    baseHp: 440,
    speed: 120,
    scale: 1.4,
    canFly: false,
    anims: {
      Walk: {
        file: 'assets/sprites/0126/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 48,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0126/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 48,
        frameCount: 4,
        durations: [40, 6, 12, 6],
      },
      Attack: {
        file: 'assets/sprites/0126/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 10,
        durations: [2, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0062': {
    id: '0062',
    name: 'Poliwrath',
    role: 'enemy',
    baseHp: 480,
    speed: 115,
    scale: 1.45,
    canFly: false,
    anims: {
      Walk: {
        file: 'assets/sprites/0062/Walk-Anim.png',
        frameWidth: 40,
        frameHeight: 40,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0062/Idle-Anim.png',
        frameWidth: 32,
        frameHeight: 48,
        frameCount: 4,
        durations: [40, 2, 4, 2],
      },
      Attack: {
        file: 'assets/sprites/0062/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 10,
        durations: [2, 6, 1, 1, 2, 2, 2, 2, 2, 2],
      },
    },
  },
  '0125': {
    id: '0125',
    name: 'Electabuzz',
    role: 'enemy',
    baseHp: 420,
    speed: 135,
    scale: 1.4,
    canFly: false,
    anims: {
      Walk: {
        file: 'assets/sprites/0125/Walk-Anim.png',
        frameWidth: 40,
        frameHeight: 56,
        frameCount: 4,
        durations: [8, 10, 8, 10],
      },
      Idle: {
        file: 'assets/sprites/0125/Idle-Anim.png',
        frameWidth: 40,
        frameHeight: 56,
        frameCount: 4,
        durations: [28, 18, 28, 18],
      },
      Attack: {
        file: 'assets/sprites/0125/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 72,
        frameCount: 10,
        durations: [2, 6, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0042': {
    id: '0042',
    name: 'Golbat',
    role: 'enemy',
    baseHp: 360,
    speed: 140,
    scale: 1.45,
    canFly: true,
    anims: {
      Walk: {
        file: 'assets/sprites/0042/Walk-Anim.png',
        frameWidth: 40,
        frameHeight: 64,
        frameCount: 8,
        durations: [6, 6, 6, 6, 6, 6, 6, 6],
      },
      Idle: {
        file: 'assets/sprites/0042/Idle-Anim.png',
        frameWidth: 40,
        frameHeight: 56,
        frameCount: 4,
        durations: [6, 6, 6, 6],
      },
      Attack: {
        file: 'assets/sprites/0042/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 88,
        frameCount: 11,
        durations: [2, 3, 4, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0112': {
    id: '0112',
    name: 'Rhydon',
    role: 'enemy',
    baseHp: 550,
    speed: 105,
    scale: 1.55,
    canFly: false,
    anims: {
      Walk: {
        file: 'assets/sprites/0112/Walk-Anim.png',
        frameWidth: 32,
        frameHeight: 48,
        frameCount: 4,
        durations: [8, 12, 8, 12],
      },
      Idle: {
        file: 'assets/sprites/0112/Idle-Anim.png',
        frameWidth: 48,
        frameHeight: 48,
        frameCount: 2,
        durations: [40, 26],
      },
      Attack: {
        file: 'assets/sprites/0112/Attack-Anim.png',
        frameWidth: 72,
        frameHeight: 80,
        frameCount: 10,
        durations: [2, 6, 1, 1, 1, 2, 2, 2, 2, 2],
      },
    },
  },
  '0131': {
    id: '0131',
    name: 'Lapras',
    role: 'enemy',
    baseHp: 510,
    speed: 120,
    scale: 1.48,
    canFly: false,
    canSwim: true,
    anims: {
      Walk: {
        file: 'assets/sprites/0131/Walk-Anim.png',
        frameWidth: 48,
        frameHeight: 56,
        frameCount: 4,
        durations: [10, 12, 10, 12],
      },
      Idle: {
        file: 'assets/sprites/0131/Idle-Anim.png',
        frameWidth: 48,
        frameHeight: 56,
        frameCount: 4,
        durations: [40, 12, 16, 12],
      },
      Attack: {
        file: 'assets/sprites/0131/Attack-Anim.png',
        frameWidth: 88,
        frameHeight: 88,
        frameCount: 12,
        durations: [2, 2, 6, 1, 1, 1, 2, 2, 2, 2, 2, 2],
      },
    },
  },
};

export const STARTER_IDS = ['0025', '0004', '0001', '0007', '0039'] as const;
export const ENEMY_IDS = ['0019', '0041'] as const;
export const BOSS_GEODUDE_ID = '0074';
export const BOSS_ONIX_ID = '0095';
export const BOSS_ID = '0095';

export interface MinibossConfig {
  id: string;
  name: string;
  title: string;
  element: ElementType | 'veneno' | 'normal' | string;
}

export const MAP_MINIBOSS_CONFIGS: Record<string, MinibossConfig> = {
  map1: { id: '0123', name: 'Scyther Alfa', title: '🍃 Retalhador da Floresta', element: 'planta' },
  map2: { id: '0126', name: 'Magmar Vulcânico', title: '🔥 Fera das Falésias', element: 'fogo' },
  map3: { id: '0062', name: 'Poliwrath Campeão', title: '💧 Guardião dos Rios', element: 'agua' },
  map4: { id: '0125', name: 'Electabuzz Trovão', title: '⚡ Tirano das Ruas', element: 'eletrico' },
  map5: { id: '0131', name: 'Lapras Guardião', title: '🌊 Soberano das Marés', element: 'agua' },
  map6: { id: '0042', name: 'Golbat Alfa', title: '🦇 Terror das Cavernas', element: 'veneno' },
  map7: { id: '0112', name: 'Rhydon Titânico', title: '🪨 Guardião das Profundezas', element: 'rocha' },
};
