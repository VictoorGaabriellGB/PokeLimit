import Phaser from 'phaser';

/**
 * Camadas de renderização centralizadas.
 *
 * BUG CORRIGIDO: antes a profundidade dos sprites era `10 + y * 0.01`.
 * Como os mapas seguintes são posicionados ACIMA do anterior (y negativo),
 * na metade do mapa 2 (y ≈ -1000) a profundidade ficava <= 0 e os sprites
 * passavam a ser desenhados por baixo da imagem do mapa (sumiam!).
 *
 * Agora o Y-sorting usa um fator minúsculo em torno de uma base fixa, garantindo
 * que as entidades fiquem sempre entre as camadas do mapa e dos efeitos,
 * independentemente de quão longe (positivo ou negativo) o mundo vá.
 */
export const DEPTH = {
  FILLER: -50,
  MAP: 0,
  SEAM_BLEND: 3,
  SEAM_PATH: 4,
  SHADOW: 40,
  XP_ORB: 60,
  ENTITY_BASE: 100,
  EFFECTS: 520,
  ORBITALS: 540,
  HP_BAR: 600,
  FLOATING_TEXT: 860,
  DEBUG: 900,
  HUD: 1000,
} as const;

/** Profundidade para Y-sorting: sempre entre 90 e 110, mesmo com y = ±1.000.000 */
export function depthForY(y: number): number {
  return DEPTH.ENTITY_BASE + Phaser.Math.Clamp(y / 100000, -10, 10);
}
