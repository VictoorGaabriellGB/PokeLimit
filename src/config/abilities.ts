import { PokemonAttackProfile } from './pokemonManifest';

export type AbilityKind = 'active' | 'passive';

export type AbilityId =
  // Ativas (modificam o ataque básico)
  | 'multishot'
  | 'pierce'
  | 'echo'
  | 'explosion'
  | 'chain'
  | 'orbit'
  // Passivas (atributos e efeitos)
  | 'power'
  | 'agility'
  | 'vigor'
  | 'haste'
  | 'crit'
  | 'lifesteal'
  | 'elemental'
  | 'energy'
  | 'magnet';

export interface AbilityDefinition {
  id: AbilityId;
  kind: AbilityKind;
  name: string;
  icon: string;
  maxLevel: number;
  /** Descrição do efeito ao atingir o nível informado */
  describe: (level: number) => string;
}

export const ABILITIES: Record<AbilityId, AbilityDefinition> = {
  // ======================= ATIVAS =======================
  multishot: {
    id: 'multishot',
    kind: 'active',
    name: 'Rajada Múltipla',
    icon: '🔱',
    maxLevel: 3,
    describe: (l) =>
      `O ataque básico dispara +${l} projétil/arco/onda extra.`,
  },
  pierce: {
    id: 'pierce',
    kind: 'active',
    name: 'Golpe Perfurante',
    icon: '🗡️',
    maxLevel: 3,
    describe: (l) =>
      `Projéteis atravessam +${l} inimigo(s). Alcance e área +${l * 12}%.`,
  },
  echo: {
    id: 'echo',
    kind: 'active',
    name: 'Eco do Golpe',
    icon: '🔁',
    maxLevel: 3,
    describe: (l) =>
      `O ataque básico se repete logo em seguida com ${20 + l * 15}% do dano.`,
  },
  explosion: {
    id: 'explosion',
    kind: 'active',
    name: 'Impacto Explosivo',
    icon: '💥',
    maxLevel: 3,
    describe: (l) =>
      `Acertos explodem em área causando ${20 + l * 10}% do dano ao redor.`,
  },
  chain: {
    id: 'chain',
    kind: 'active',
    name: 'Ricochete em Cadeia',
    icon: '⛓️',
    maxLevel: 3,
    describe: (l) =>
      `Acertos saltam para ${l} inimigo(s) próximo(s) com 45% do dano.`,
  },
  orbit: {
    id: 'orbit',
    kind: 'active',
    name: 'Órbita Elemental',
    icon: '🪐',
    maxLevel: 3,
    describe: (l) =>
      `${l} esfera(s) do seu elemento orbitam você causando ${30 + l * 10}% de dano.`,
  },

  // ======================= PASSIVAS =======================
  power: {
    id: 'power',
    kind: 'passive',
    name: 'Força Bruta',
    icon: '💪',
    maxLevel: 5,
    describe: (l) => `Todo dano causado +${l * 12}%.`,
  },
  agility: {
    id: 'agility',
    kind: 'passive',
    name: 'Agilidade',
    icon: '👟',
    maxLevel: 5,
    describe: (l) => `Velocidade de movimento +${l * 8}%.`,
  },
  vigor: {
    id: 'vigor',
    kind: 'passive',
    name: 'Vigor',
    icon: '❤️',
    maxLevel: 5,
    describe: (l) => `HP máximo +${l * 15}% (cura ao aprender).`,
  },
  haste: {
    id: 'haste',
    kind: 'passive',
    name: 'Ritmo de Combate',
    icon: '⚡',
    maxLevel: 5,
    describe: (l) => `Recarga do ataque básico -${l * 8}%.`,
  },
  crit: {
    id: 'crit',
    kind: 'passive',
    name: 'Olho Crítico',
    icon: '🎯',
    maxLevel: 5,
    describe: (l) =>
      `Chance de crítico +${l * 6}% e dano crítico +${l * 10}%.`,
  },
  lifesteal: {
    id: 'lifesteal',
    kind: 'passive',
    name: 'Dreno Vital',
    icon: '🩸',
    maxLevel: 5,
    describe: (l) => `Recupera ${(l * 2.5).toFixed(1)}% do dano causado como HP.`,
  },
  elemental: {
    id: 'elemental',
    kind: 'passive',
    name: 'Afinidade Elemental',
    icon: '🌈',
    maxLevel: 5,
    describe: (l) =>
      `+${l * 12}% de chance de aplicar o efeito do seu tipo (queimar, paralisar, envenenar, encharcar, encantar).`,
  },
  energy: {
    id: 'energy',
    kind: 'passive',
    name: 'Fúria Interior',
    icon: '🔥',
    maxLevel: 5,
    describe: (l) =>
      `Carga do Especial +${l * 20}% e dano do Especial +${l * 8}%.`,
  },
  magnet: {
    id: 'magnet',
    kind: 'passive',
    name: 'Magnetismo',
    icon: '🧲',
    maxLevel: 5,
    describe: (l) =>
      `Raio de coleta de XP +${l * 40}% e XP ganho +${l * 8}%.`,
  },
};

export const ACTIVE_ABILITY_IDS = (Object.keys(ABILITIES) as AbilityId[]).filter(
  (id) => ABILITIES[id].kind === 'active'
);
export const PASSIVE_ABILITY_IDS = (Object.keys(ABILITIES) as AbilityId[]).filter(
  (id) => ABILITIES[id].kind === 'passive'
);

export interface AbilityChoice {
  id: AbilityId;
  currentLevel: number;
}

/**
 * Sorteia 3 opções de habilidade ainda não maximizadas.
 * Sempre que possível, garante pelo menos 1 ATIVA e 1 PASSIVA entre as opções.
 */
export function rollAbilityChoices(
  levels: Map<AbilityId, number>,
  count = 3
): AbilityChoice[] {
  const available = (Object.keys(ABILITIES) as AbilityId[]).filter(
    (id) => (levels.get(id) ?? 0) < ABILITIES[id].maxLevel
  );

  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const actives = shuffle(available.filter((id) => ABILITIES[id].kind === 'active'));
  const passives = shuffle(available.filter((id) => ABILITIES[id].kind === 'passive'));

  const picked: AbilityId[] = [];
  if (actives.length) picked.push(actives.shift()!);
  if (passives.length) picked.push(passives.shift()!);

  const rest = shuffle([...actives, ...passives]);
  while (picked.length < count && rest.length) {
    picked.push(rest.shift()!);
  }

  return shuffle(picked).map((id) => ({ id, currentLevel: levels.get(id) ?? 0 }));
}

// ======================= ESPECIAIS =======================

export interface SpecialDefinition {
  name: string;
  icon: string;
  description: string;
}

export const SPECIALS: Record<PokemonAttackProfile['style'], SpecialDefinition> = {
  ranged_bolt: {
    name: 'Trovão',
    icon: '🌩️',
    description: 'Raios caem do céu sobre os inimigos mais próximos e os paralisam.',
  },
  melee_flame: {
    name: 'Nova Flamejante',
    icon: '☄️',
    description: 'Explosão de fogo ao redor do Pokémon que queima e repele tudo.',
  },
  control_leaf: {
    name: 'Raio Solar',
    icon: '☀️',
    description: 'Feixe solar concentrado que atravessa a tela, envenenando e desacelerando.',
  },
  wave_water: {
    name: 'Hidro Vórtice',
    icon: '🌀',
    description: 'Redemoinho que puxa os inimigos e explode em uma onda gigante.',
  },
  support_song: {
    name: 'Canção de Ninar',
    icon: '💤',
    description: 'Adormece todos ao redor, causa dano e restaura grande parte do HP.',
  },
};

