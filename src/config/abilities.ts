import { ElementType, PokemonAttackProfile } from './pokemonManifest';

export type AbilityKind = 'active' | 'passive';

export type AbilityId =
  // ================= Ativas Genéricas =================
  | 'multishot'
  | 'pierce'
  | 'echo'
  // ================= Exclusivas: Elétrico (Pikachu / Raichu) =================
  | 'elec_volt_orb'
  | 'elec_discharge'
  | 'elec_thunder_wave'
  | 'elec_lightning_rod'
  | 'elec_surge_surfer'
  // ================= Exclusivas: Fogo (Charmander / Charmeleon / Charizard) =================
  | 'fire_flame_charge'
  | 'fire_spin'
  | 'fire_blast'
  | 'fire_solar_power'
  | 'fire_tough_claws'
  // ================= Exclusivas: Planta (Bulbasaur / Ivysaur / Venusaur) =================
  | 'grass_vine_whip'
  | 'grass_leech_seed'
  | 'grass_poison_powder'
  | 'grass_effect_spore'
  | 'grass_chlorophyll'
  // ================= Exclusivas: Água (Squirtle / Wartortle / Blastoise) =================
  | 'water_aqua_ring'
  | 'water_icy_wind'
  | 'water_hydro_cannon'
  | 'water_rain_dish'
  | 'water_mega_launcher'
  // ================= Exclusivas: Fada / Som (Jigglypuff / Wigglytuff) =================
  | 'fairy_moonblast'
  | 'fairy_hyper_voice'
  | 'fairy_wish_barrier'
  | 'fairy_pixilate'
  | 'fairy_friend_guard'
  // ================= Passivas Genéricas =================
  | 'power'
  | 'agility'
  | 'vigor'
  | 'haste'
  | 'crit'
  | 'lifesteal'
  | 'energy'
  | 'magnet'
  | 'quick_charge'
  | 'execute'
  | 'shield_regen'
  | 'bounty';

export interface AbilityDefinition {
  id: AbilityId;
  kind: AbilityKind;
  name: string;
  icon: string;
  maxLevel: number;
  /** Quando definido, apenas Pokémons destes elementos podem receber esta habilidade */
  allowedElements?: ElementType[];
  /** Indica habilidade exclusiva da linha evolutiva / tipo do Pokémon */
  isUnique?: boolean;
  /** Descrição do efeito ao atingir o nível informado */
  describe: (level: number) => string;
}

export const ABILITIES: Record<AbilityId, AbilityDefinition> = {
  // ======================= ATIVAS GENÉRICAS =======================
  multishot: {
    id: 'multishot',
    kind: 'active',
    name: 'Rajada Múltipla',
    icon: '🔱',
    maxLevel: 3,
    describe: (l) =>
      `O ataque básico dispara +${l} projétil, garra ou pulso extra por ataque.`,
  },
  pierce: {
    id: 'pierce',
    kind: 'active',
    name: 'Alcance & Perfuração',
    icon: '🏹',
    maxLevel: 3,
    describe: (l) =>
      `Projéteis atravessam +${l} inimigo(s) e o alcance de ataques aumenta +${l * 12}%.`,
  },
  echo: {
    id: 'echo',
    kind: 'active',
    name: 'Eco de Combate',
    icon: '🔁',
    maxLevel: 3,
    describe: (l) =>
      `O ataque básico se repete rapidamente em seguida causando ${20 + l * 15}% do dano.`,
  },

  // ======================= EXCLUSIVAS: ELÉTRICO (PIKACHU / RAICHU) =======================
  elec_volt_orb: {
    id: 'elec_volt_orb',
    kind: 'active',
    name: 'Esfera Elétrica',
    icon: '⚡',
    maxLevel: 3,
    allowedElements: ['eletrico'],
    isUnique: true,
    describe: (l) =>
      `A cada ${(4.4 - l * 0.6).toFixed(1)}s dispara uma Esfera Voltaica direcionada que explode causando ${42 + l * 18} de dano elétrico.`,
  },
  elec_discharge: {
    id: 'elec_discharge',
    kind: 'active',
    name: 'Descarga em Cadeia',
    icon: '🌩️',
    maxLevel: 3,
    allowedElements: ['eletrico'],
    isUnique: true,
    describe: (l) =>
      `Seus golpes saltam em arco elétrico para até ${l + 1} inimigos próximos com ${38 + l * 10}% do dano.`,
  },
  elec_thunder_wave: {
    id: 'elec_thunder_wave',
    kind: 'active',
    name: 'Onda de Trovão',
    icon: '💫',
    maxLevel: 3,
    allowedElements: ['eletrico'],
    isUnique: true,
    describe: (l) =>
      `A cada ${7 - l}s emite um pulso eletromagnético que Paralisa inimigos próximos por ${(0.9 + l * 0.35).toFixed(2)}s.`,
  },
  elec_lightning_rod: {
    id: 'elec_lightning_rod',
    kind: 'passive',
    name: 'Para-Raios',
    icon: '🔋',
    maxLevel: 5,
    allowedElements: ['eletrico'],
    isUnique: true,
    describe: (l) =>
      `Chance de Paralisia +${l * 8}% (sobre os 5% base) e +${l * 16}% de dano em alvos paralisados.`,
  },
  elec_surge_surfer: {
    id: 'elec_surge_surfer',
    kind: 'passive',
    name: 'Surfista de Cauda',
    icon: '🏄',
    maxLevel: 5,
    allowedElements: ['eletrico'],
    isUnique: true,
    describe: (l) =>
      `Velocidade de movimento +${l * 7}% e tempo de recarga de ataques -${l * 7}%.`,
  },

  // ======================= EXCLUSIVAS: FOGO (CHARMANDER / CHARMELEON / CHARIZARD) =======================
  fire_flame_charge: {
    id: 'fire_flame_charge',
    kind: 'active',
    name: 'Ataque de Chamas',
    icon: '🔥',
    maxLevel: 3,
    allowedElements: ['fogo'],
    isUnique: true,
    describe: (l) =>
      `Seus passos e o Dash deixam brasas por ${(1.6 + l * 0.5).toFixed(1)}s causando ${9 + l * 6}/s de dano de fogo.`,
  },
  fire_spin: {
    id: 'fire_spin',
    kind: 'active',
    name: 'Giro de Fogo',
    icon: '☄️',
    maxLevel: 3,
    allowedElements: ['fogo'],
    isUnique: true,
    describe: (l) =>
      `${l + 1} chamas dracônicas orbitam você continuamente causando ${32 + l * 12}% de dano e queimadura.`,
  },
  fire_blast: {
    id: 'fire_blast',
    kind: 'active',
    name: 'Explosão de Fogo',
    icon: '💥',
    maxLevel: 3,
    allowedElements: ['fogo'],
    isUnique: true,
    describe: (l) =>
      `A cada ${Math.max(2, 5 - l)} ataques dispara uma lança ígnea direcionada que detona em área causando ${45 + l * 22} de dano.`,
  },
  fire_solar_power: {
    id: 'fire_solar_power',
    kind: 'passive',
    name: 'Poder Solar',
    icon: '☀️',
    maxLevel: 5,
    allowedElements: ['fogo'],
    isUnique: true,
    describe: (l) =>
      `Chance de Queimadura +${l * 8}% (sobre os 5% base) e dano de Queimadura/ULT +${l * 18}%.`,
  },
  fire_tough_claws: {
    id: 'fire_tough_claws',
    kind: 'passive',
    name: 'Garras Firmes',
    icon: '🐉',
    maxLevel: 5,
    allowedElements: ['fogo'],
    isUnique: true,
    describe: (l) =>
      `Dano dos golpes de Fogo +${l * 15}% e alcance/largura das garras +${l * 8}%.`,
  },

  // ======================= EXCLUSIVAS: PLANTA (BULBASAUR / IVYSAUR / VENUSAUR) =======================
  grass_vine_whip: {
    id: 'grass_vine_whip',
    kind: 'active',
    name: 'Chicote de Vinha',
    icon: '🌿',
    maxLevel: 3,
    allowedElements: ['planta'],
    isUnique: true,
    describe: (l) =>
      `A cada ${(4.2 - l * 0.6).toFixed(1)}s chicoteia na direção do alvo, empurrando e causando ${36 + l * 18} de dano.`,
  },
  grass_leech_seed: {
    id: 'grass_leech_seed',
    kind: 'active',
    name: 'Semente Sanguessuga',
    icon: '🌱',
    maxLevel: 3,
    allowedElements: ['planta'],
    isUnique: true,
    describe: (l) =>
      `Acertos têm ${22 + l * 12}% de chance de drenar vida do alvo e curar ${2 + l * 2} de HP.`,
  },
  grass_poison_powder: {
    id: 'grass_poison_powder',
    kind: 'active',
    name: 'Pó Venenoso',
    icon: '☠️',
    maxLevel: 3,
    allowedElements: ['planta'],
    isUnique: true,
    describe: (l) =>
      `Golpes liberam nuvens tóxicas no chão que causam lentidão e ${7 + l * 5}/s de veneno.`,
  },
  grass_effect_spore: {
    id: 'grass_effect_spore',
    kind: 'passive',
    name: 'Esporo de Efeito',
    icon: '🍄',
    maxLevel: 5,
    allowedElements: ['planta'],
    isUnique: true,
    describe: (l) =>
      `Chance de Envenenar no ataque básico +${l * 8}% (sobre os 5% base) e dano do veneno +${l * 24}%.`,
  },
  grass_chlorophyll: {
    id: 'grass_chlorophyll',
    kind: 'passive',
    name: 'Clorofila Solar',
    icon: '🌻',
    maxLevel: 5,
    allowedElements: ['planta'],
    isUnique: true,
    describe: (l) =>
      `Velocidade +${l * 7}%, recarga da ULT +${l * 16}% e regenera ${(l * 0.6).toFixed(1)}% de HP/s.`,
  },

  // ======================= EXCLUSIVAS: ÁGUA (SQUIRTLE / WARTORTLE / BLASTOISE) =======================
  water_aqua_ring: {
    id: 'water_aqua_ring',
    kind: 'active',
    name: 'Anel de Água',
    icon: '💧',
    maxLevel: 3,
    allowedElements: ['agua'],
    isUnique: true,
    describe: (l) =>
      `${l + 1} jatos orbitais protegem você causando ${30 + l * 12}% de dano e curando ${l * 2} HP a cada 4s.`,
  },
  water_icy_wind: {
    id: 'water_icy_wind',
    kind: 'active',
    name: 'Vento Congelante',
    icon: '❄️',
    maxLevel: 3,
    allowedElements: ['agua'],
    isUnique: true,
    describe: (l) =>
      `A cada ${7 - l}s dispara uma onda glacial em 360° que empurra e congela por ${(1.1 + l * 0.25).toFixed(2)}s.`,
  },
  water_hydro_cannon: {
    id: 'water_hydro_cannon',
    kind: 'active',
    name: 'Hidro Canhão',
    icon: '🌊',
    maxLevel: 3,
    allowedElements: ['agua'],
    isUnique: true,
    describe: (l) =>
      `A cada ${Math.max(2, 5 - l)} ataques dispara um torpedo de alta pressão que explode causando ${46 + l * 22} de dano.`,
  },
  water_rain_dish: {
    id: 'water_rain_dish',
    kind: 'passive',
    name: 'Cura da Chuva',
    icon: '🌧️',
    maxLevel: 5,
    allowedElements: ['agua'],
    isUnique: true,
    describe: (l) =>
      `Regenera +${(l * 1.1).toFixed(1)}% do HP máx./s e chance de Encharcar +${l * 8}% (sobre os 5% base).`,
  },
  water_mega_launcher: {
    id: 'water_mega_launcher',
    kind: 'passive',
    name: 'Mega Disparador',
    icon: '🛡️',
    maxLevel: 5,
    allowedElements: ['agua'],
    isUnique: true,
    describe: (l) =>
      `Dano dos pulsos de Água +${l * 14}% e redução de dano recebido +${l * 5}%.`,
  },

  // ======================= EXCLUSIVAS: FADA / SOM (JIGGLYPUFF / WIGGLYTUFF) =======================
  fairy_moonblast: {
    id: 'fairy_moonblast',
    kind: 'active',
    name: 'Força Lunar',
    icon: '🌙',
    maxLevel: 3,
    allowedElements: ['fada'],
    isUnique: true,
    describe: (l) =>
      `A cada ${(3.8 - l * 0.5).toFixed(1)}s dispara ${l} crescente(s) lunar(es) direcionado(s) causando ${38 + l * 16} de dano.`,
  },
  fairy_hyper_voice: {
    id: 'fairy_hyper_voice',
    kind: 'active',
    name: 'Hiper Voz',
    icon: '🎵',
    maxLevel: 3,
    allowedElements: ['fada'],
    isUnique: true,
    describe: (l) =>
      `Ondas sonoras ganham +${l * 18}% de área e emitem reverberação harmônica de +${25 + l * 12}% de dano.`,
  },
  fairy_wish_barrier: {
    id: 'fairy_wish_barrier',
    kind: 'active',
    name: 'Desejo Estelar',
    icon: '✨',
    maxLevel: 3,
    allowedElements: ['fada'],
    isUnique: true,
    describe: (l) =>
      `Barreira feérica que bloqueia 1 golpe, encanta inimigos ao redor e cura ${12 + l * 9} HP (recarga: ${17 - l * 3}s).`,
  },
  fairy_pixilate: {
    id: 'fairy_pixilate',
    kind: 'passive',
    name: 'Pele Feérica',
    icon: '💖',
    maxLevel: 5,
    allowedElements: ['fada'],
    isUnique: true,
    describe: (l) =>
      `Chance de Encantar +${l * 8}% (sobre os 5% base) e dano de Fada/Som +${l * 14}%.`,
  },
  fairy_friend_guard: {
    id: 'fairy_friend_guard',
    kind: 'passive',
    name: 'Guarda Amiga',
    icon: '🎀',
    maxLevel: 5,
    allowedElements: ['fada'],
    isUnique: true,
    describe: (l) =>
      `Eficiência de todas as curas +${l * 18}% e redução de dano recebido +${l * 5}%.`,
  },

  // ======================= PASSIVAS GENÉRICAS =======================
  power: {
    id: 'power',
    kind: 'passive',
    name: 'Faixa Musculosa',
    icon: '💪',
    maxLevel: 5,
    describe: (l) => `Todo dano causado aumenta em +${l * 12}%.`,
  },
  agility: {
    id: 'agility',
    kind: 'passive',
    name: 'Pedra Leve',
    icon: '👟',
    maxLevel: 5,
    describe: (l) => `Velocidade de movimento aumenta em +${l * 8}%.`,
  },
  vigor: {
    id: 'vigor',
    kind: 'passive',
    name: 'Restos Vitais',
    icon: '❤️',
    maxLevel: 5,
    describe: (l) => `HP máximo +${l * 15}% (cura imediatamente ao subir).`,
  },
  haste: {
    id: 'haste',
    kind: 'passive',
    name: 'Garra Rápida',
    icon: '⏱️',
    maxLevel: 5,
    describe: (l) => `Tempo de recarga do ataque básico -${l * 8}%.`,
  },
  crit: {
    id: 'crit',
    kind: 'passive',
    name: 'Lente de Mira',
    icon: '🎯',
    maxLevel: 5,
    describe: (l) =>
      `Chance de acerto crítico +${l * 6}% e dano crítico +${l * 12}%.`,
  },
  lifesteal: {
    id: 'lifesteal',
    kind: 'passive',
    name: 'Concha Sino',
    icon: '🩸',
    maxLevel: 5,
    describe: (l) =>
      `Recupera ${(l * 2.5).toFixed(1)}% do dano causado como cura direta.`,
  },
  energy: {
    id: 'energy',
    kind: 'passive',
    name: 'Cinto Especialista',
    icon: '🔮',
    maxLevel: 5,
    describe: (l) =>
      `Velocidade de carga da ULT +${l * 20}% e dano da ULT +${l * 10}%.`,
  },
  magnet: {
    id: 'magnet',
    kind: 'passive',
    name: 'Moeda Amuleto',
    icon: '🧲',
    maxLevel: 5,
    describe: (l) =>
      `Raio de coleta de XP +${l * 40}% e XP ganho +${l * 8}%.`,
  },
  quick_charge: {
    id: 'quick_charge',
    kind: 'passive',
    name: 'Esquiva Ágil',
    icon: '💨',
    maxLevel: 5,
    describe: (l) =>
      `Tempo de recarga do Dash -${(l * 0.22).toFixed(2)}s (base: 2.0s).`,
  },
  execute: {
    id: 'execute',
    kind: 'passive',
    name: 'Instinto Predador',
    icon: '🗡️',
    maxLevel: 5,
    describe: (l) =>
      `Causa +${l * 18}% de dano contra inimigos com menos de 45% de HP.`,
  },
  shield_regen: {
    id: 'shield_regen',
    kind: 'passive',
    name: 'Faixa de Foco',
    icon: '🛡️',
    maxLevel: 5,
    describe: (l) =>
      `Concede escudo de ${l * 28} de absorção que recarrega após 3.5s sem sofrer dano.`,
  },
  bounty: {
    id: 'bounty',
    kind: 'passive',
    name: 'Ovo da Sorte',
    icon: '🍀',
    maxLevel: 5,
    describe: (l) =>
      `Orbes de XP têm ${l * 14}% de chance de serem Douradas (3x XP e curam 3 HP).`,
  },
};

export interface AbilityChoice {
  id: AbilityId;
  currentLevel: number;
}

/**
 * Sorteia opções de habilidade filtradas estritamente pelo elemento do Pokémon,
 * garantindo que nenhum Pokémon receba habilidades de um tipo que não lhe pertence,
 * e oferecendo sempre boa variedade entre Exclusivas do Pokémon, Ativas e Passivas.
 */
export function rollAbilityChoices(
  levels: Map<AbilityId, number>,
  pokemonElement: ElementType,
  count = 3
): AbilityChoice[] {
  const available = (Object.keys(ABILITIES) as AbilityId[]).filter((id) => {
    const def = ABILITIES[id];
    if ((levels.get(id) ?? 0) >= def.maxLevel) return false;
    if (def.allowedElements && !def.allowedElements.includes(pokemonElement)) {
      return false;
    }
    return true;
  });

  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const uniques = shuffle(available.filter((id) => ABILITIES[id].isUnique));
  const picked = new Set<AbilityId>();

  // Garante ao menos 1 habilidade exclusiva do Pokémon sempre que disponível
  if (uniques.length > 0) {
    picked.add(uniques[0]);
  }

  // Garante diversidade entre Ativas e Passivas
  const remainingActives = shuffle(
    available.filter((id) => !picked.has(id) && ABILITIES[id].kind === 'active')
  );
  const remainingPassives = shuffle(
    available.filter((id) => !picked.has(id) && ABILITIES[id].kind === 'passive')
  );

  const hasActivePicked = [...picked].some((id) => ABILITIES[id].kind === 'active');
  const hasPassivePicked = [...picked].some(
    (id) => ABILITIES[id].kind === 'passive'
  );

  if (!hasActivePicked && remainingActives.length > 0 && picked.size < count) {
    picked.add(remainingActives.shift()!);
  }
  if (!hasPassivePicked && remainingPassives.length > 0 && picked.size < count) {
    picked.add(remainingPassives.shift()!);
  }

  const pool = shuffle(available.filter((id) => !picked.has(id)));
  while (picked.size < count && pool.length > 0) {
    picked.add(pool.shift()!);
  }

  return shuffle([...picked]).map((id) => ({
    id,
    currentLevel: levels.get(id) ?? 0,
  }));
}

// ======================= ESPECIAIS (ULT) =======================

export interface SpecialDefinition {
  name: string;
  icon: string;
  description: string;
}

export const SPECIALS: Record<PokemonAttackProfile['style'], SpecialDefinition> = {
  ranged_bolt: {
    name: 'Trovão Supremo',
    icon: '⚡',
    description:
      'Escudo elétrico explosivo e raios celestiais que Paralisam todos os alvos.',
  },
  melee_flame: {
    name: 'Lança-Chamas Devastador',
    icon: '🔥',
    description:
      'Torrente contínua de fogo na direção visada que aplica Queimadura Intensa.',
  },
  control_leaf: {
    name: 'Raio Solar Tóxico',
    icon: '☀️',
    description:
      'Feixe solar concentrado que atravessa inimigos e aplica Envenenamento Tóxico garantido.',
  },
  wave_water: {
    name: 'Hidro Vórtice',
    icon: '🌀',
    description:
      'Redemoinho gigante que puxa inimigos, Encharca a área e detona em tsunami.',
  },
  support_song: {
    name: 'Sinfonia Celestial',
    icon: '💖',
    description:
      'Mandala harmônica estelar que Adormece os inimigos na área e cura seu Pokémon.',
  },
};
