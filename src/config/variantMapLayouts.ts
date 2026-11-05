export type TileCollisionType = 0 | 1 | 2; // 0 = Livre, 1 = Bodyguard Sólido, 2 = Água

const GRID_SIZE = 32;

function createGrid(defaultVal: TileCollisionType = 0): TileCollisionType[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(defaultVal));
}

function fillRect(
  grid: TileCollisionType[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  val: TileCollisionType
): void {
  for (let r = Math.max(0, r1); r <= Math.min(GRID_SIZE - 1, r2); r++) {
    for (let c = Math.max(0, c1); c <= Math.min(GRID_SIZE - 1, c2); c++) {
      grid[r][c] = val;
    }
  }
}

function fillCircle(
  grid: TileCollisionType[][],
  centerR: number,
  centerC: number,
  radius: number,
  val: TileCollisionType
): void {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (Math.hypot(r - centerR, c - centerC) <= radius) {
        grid[r][c] = val;
      }
    }
  }
}

export function buildVariantBodyblockGrid(mapIndex: number): TileCollisionType[][] {
  switch (mapIndex) {
    // MAPA 1 (map1_var.jpeg): Vila Verdejante - Lotes cercados 100% fechados para ninguém prender lá dentro
    case 0: {
      const g = createGrid(0);
      // Lote Superior Esquerdo (Casa Vermelha + Cercado + Árvores de fundo)
      fillRect(g, 2, 3, 13, 13, 1);
      // Lote Superior Direito (Casa Azul + Cercado + Árvores de fundo)
      fillRect(g, 2, 18, 13, 29, 1);

      // Lote Inferior Esquerdo (Árvores, Cercas e Banco - mantendo clareira oeste aberta)
      fillRect(g, 17, 3, 21, 13, 1);
      fillRect(g, 24, 3, 29, 13, 1);

      // Lote Inferior Direito (Lago + Bosques nos 4 cantos do lago)
      fillCircle(g, 23.5, 23.5, 4.0, 2); // Água do lago
      fillRect(g, 17, 18, 22, 21, 1);
      fillRect(g, 17, 25, 22, 29, 1);
      fillRect(g, 25, 18, 29, 21, 1);
      fillRect(g, 25, 25, 29, 29, 1);
      return g;
    }

    // MAPA 2 (map2_var.jpeg): Vale das Falésias - Platôs rochosos maciços (sem buracos internos para prender)
    case 1: {
      const g = createGrid(0);
      fillRect(g, 2, 2, 11, 13, 1);   // Grande Platô Noroeste
      fillRect(g, 15, 3, 20, 11, 1);  // Platô Médio Oeste
      fillRect(g, 22, 2, 30, 12, 1);  // Grande Platô Sudoeste
      fillRect(g, 2, 19, 8, 30, 1);   // Platô Nordeste Superior
      fillRect(g, 8, 24, 14, 30, 1);  // Braço Leste do Platô Nordeste
      fillRect(g, 16, 17, 30, 30, 1); // Grande Maciço Rochoso Sudeste
      return g;
    }

    // MAPA 3 (map3_var.jpeg): Rota da Clareira - Rio circular, 4 pontes e bosques maciços nos cantos
    case 2: {
      const g = createGrid(0);
      fillCircle(g, 15.5, 15.5, 7.2, 2); // Rio circular (Água = 2)
      fillCircle(g, 15.5, 15.5, 4.0, 0); // Ilha Central (Livre = 0)

      // 4 Pontes de Madeira (Norte, Sul, Leste, Oeste)
      fillRect(g, 7, 14, 24, 17, 0);
      fillRect(g, 14, 7, 17, 24, 0);

      // 2 Árvores da Ilha Central
      fillRect(g, 12, 12, 14, 14, 1);
      fillRect(g, 12, 17, 14, 19, 1);

      // Bosques fechados nos 4 cantos + barranco noroeste
      fillRect(g, 2, 2, 11, 10, 1);
      fillRect(g, 2, 21, 10, 29, 1);
      fillRect(g, 19, 2, 29, 10, 1);
      fillRect(g, 19, 21, 29, 29, 1);
      return g;
    }

    // MAPA 4 (map4_var.jpeg): Cidade Pokémon - Quarteirões de prédios/cercas e monumento central sólidos
    case 3: {
      const g = createGrid(0);
      fillCircle(g, 15.5, 15.5, 3.2, 1); // Monumento Octogonal Central

      // Quarteirão Noroeste (Casas, Mart e Cercas)
      fillRect(g, 2, 2, 13, 13, 1);
      fillRect(g, 7, 4, 8, 13, 0); // Calçada interna livre

      // Quarteirão Nordeste (Centro Pokémon, Casa Azul e Cercas)
      fillRect(g, 2, 18, 13, 29, 1);
      fillRect(g, 8, 18, 13, 23, 0); // Pátio aberto em frente ao Centro Pokémon

      // Quarteirão Sudoeste (Casas, Jardim cercado e Sebes)
      fillRect(g, 17, 2, 29, 13, 1);

      // Quarteirão Sudeste (Lojas Azuis, Cercas e Sebes)
      fillRect(g, 17, 18, 29, 29, 1);
      return g;
    }

    // MAPA 5 (map5_var.jpeg): Costa das Marés - Água com Ilhas e Pontes Conectadas
    case 4: {
      const g = createGrid(2); // Base de Água (2)

      // Eixo Central Norte-Sul (Bancos de Areia + Pontes + Ilha Central)
      fillRect(g, 0, 14, 31, 17, 0);
      fillRect(g, 5, 11, 10, 19, 0);
      fillRect(g, 13, 11, 19, 19, 0);
      fillRect(g, 22, 13, 31, 18, 0);

      // Ilhas e Pontes Oeste
      fillRect(g, 0, 0, 5, 7, 0);
      fillRect(g, 5, 4, 12, 11, 0);
      fillRect(g, 12, 7, 17, 9, 0);
      fillRect(g, 15, 9, 17, 13, 0);
      fillRect(g, 15, 4, 27, 10, 0);
      fillRect(g, 12, 0, 20, 2, 0);

      // Ilhas e Pontes Leste
      fillRect(g, 6, 18, 8, 24, 0);
      fillRect(g, 0, 23, 11, 31, 0);
      fillRect(g, 8, 23, 21, 26, 0);
      fillRect(g, 20, 21, 27, 28, 0);
      fillRect(g, 23, 17, 25, 22, 0);
      fillRect(g, 12, 29, 20, 31, 0);

      // Rochas e Coqueiros Sólidos (1)
      fillRect(g, 2, 19, 4, 21, 1);
      fillRect(g, 9, 20, 11, 22, 1);
      return g;
    }

    // MAPAS 6 e 7 (map6_var.jpeg): Caverna Rochosa e Ruínas - Platôs e Muros Fechados
    case 5:
    case 6:
    default: {
      const g = createGrid(0);
      // Platô Rochoso Noroeste + Cristais
      fillRect(g, 3, 2, 11, 13, 1);

      // Ruínas Nordeste (Bloco fechado nos muros para evitar que inimigos fiquem presos nos cantos)
      fillRect(g, 3, 18, 12, 29, 1);
      fillRect(g, 6, 22, 13, 25, 0); // Corredor sul das ruínas

      // Ruínas Sudoeste + Lago Subterrâneo
      fillRect(g, 18, 2, 24, 13, 1);
      fillRect(g, 24, 3, 29, 10, 2); // Lago subterrâneo (Água = 2)

      // Platô Rochoso Sudeste + Poça
      fillRect(g, 19, 19, 28, 29, 1);
      fillRect(g, 26, 26, 29, 29, 2);
      return g;
    }
  }
}
