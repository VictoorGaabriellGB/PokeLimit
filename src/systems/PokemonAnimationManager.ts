import Phaser from 'phaser';
import {
  POKEMON_MANIFEST,
  PokemonAnimType,
  PokemonDefinition,
} from '../config/pokemonManifest';

/**
 * As 8 direções do PMD Collab (ordenadas pelas linhas 0 a 7 de cada spritesheet):
 * 0: Baixo (S)
 * 1: Baixo-Direita (SE)
 * 2: Direita (E)
 * 3: Cima-Direita (NE)
 * 4: Cima (N)
 * 5: Cima-Esquerda (NW)
 * 6: Esquerda (W)
 * 7: Baixo-Esquerda (SW)
 */
export type Direction8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export class PokemonAnimationManager {
  /**
   * Faz o preload de todos os spritesheets, retratos (Normal e Pain) e sprites de ataque na BootScene.
   */
  static preloadAll(scene: Phaser.Scene): void {
    for (const poke of Object.values(POKEMON_MANIFEST)) {
      const animTypes: PokemonAnimType[] = ['Walk', 'Idle', 'Attack'];
      for (const animType of animTypes) {
        const cfg = poke.anims[animType];
        const textureKey = this.getTextureKey(poke.id, animType);
        scene.load.spritesheet(textureKey, cfg.file, {
          frameWidth: cfg.frameWidth,
          frameHeight: cfg.frameHeight,
        });
      }

      // Preload dos retratos da HUD (Normal e Dor/Pain) do PMD Collab
      scene.load.image(
        this.getPortraitKey(poke.id, 'Normal'),
        `assets/sprites/${poke.id}/Portrait-Normal.png`
      );
      if (poke.role !== 'boss') {
        scene.load.image(
          this.getPortraitKey(poke.id, 'Pain'),
          `assets/sprites/${poke.id}/Portrait-Pain.png`
        );
      }

      // Preload de sprite estático de ataque caso configurado no manifesto
      if (poke.attackProfile?.spriteFile) {
        scene.load.image(
          this.getAttackSpriteKey(poke.id),
          poke.attackProfile.spriteFile
        );
      }
    }
  }

  /**
   * Registra todas as animações (8 direções x 3 estados) no AnimationManager do Phaser.
   */
  static registerAllAnimations(scene: Phaser.Scene): void {
    for (const poke of Object.values(POKEMON_MANIFEST)) {
      this.registerPokemonAnimations(scene, poke);
    }
  }

  private static registerPokemonAnimations(
    scene: Phaser.Scene,
    poke: PokemonDefinition
  ): void {
    const animTypes: PokemonAnimType[] = ['Walk', 'Idle', 'Attack'];

    for (const animType of animTypes) {
      const cfg = poke.anims[animType];
      const textureKey = this.getTextureKey(poke.id, animType);

      for (let dir = 0 as Direction8; dir < 8; dir = (dir + 1) as Direction8) {
        const animKey = this.getAnimKey(poke.id, animType, dir);
        if (scene.anims.exists(animKey)) continue;

        const startFrame = dir * cfg.frameCount;
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];

        for (let i = 0; i < cfg.frameCount; i++) {
          // No PMD Collab, cada unidade de Duration equivale a ~1 frame de 60fps (16.6ms)
          const tickDuration = cfg.durations[i] ?? 6;
          frames.push({
            key: textureKey,
            frame: startFrame + i,
            duration: Math.max(28, Math.round(tickDuration * 16.6)),
          });
        }

        scene.anims.create({
          key: animKey,
          frames,
          repeat: animType === 'Attack' ? 0 : -1,
        });
      }
    }
  }

  static getTextureKey(pokemonId: string, animType: PokemonAnimType): string {
    return `poke-${pokemonId}-${animType}`;
  }

  static getPortraitKey(
    pokemonId: string,
    emotion: 'Normal' | 'Pain' = 'Normal'
  ): string {
    return `poke-${pokemonId}-portrait-${emotion}`;
  }

  static getAttackSpriteKey(pokemonId: string): string {
    return `poke-${pokemonId}-attack-sprite`;
  }

  static getAnimKey(
    pokemonId: string,
    animType: PokemonAnimType,
    dir: Direction8
  ): string {
    return `poke-${pokemonId}-${animType}-dir${dir}`;
  }

  /**
   * Converte um vetor de movimento (vx, vy) para uma das 8 direções do PMD Collab.
   */
  static vectorToDirection(
    vx: number,
    vy: number,
    fallback: Direction8 = 0
  ): Direction8 {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) {
      return fallback;
    }

    // atan2 retorna ângulo em radianos: 0 = Direita (E), PI/2 = Baixo (S), -PI/2 = Cima (N)
    const angleDeg = Phaser.Math.RadToDeg(Math.atan2(vy, vx));

    // Normaliza e mapeia para os setores de 45 graus do PMD Collab
    if (angleDeg >= 67.5 && angleDeg < 112.5) return 0; // Baixo (S)
    if (angleDeg >= 22.5 && angleDeg < 67.5) return 1; // Baixo-Direita (SE)
    if (angleDeg >= -22.5 && angleDeg < 22.5) return 2; // Direita (E)
    if (angleDeg >= -67.5 && angleDeg < -22.5) return 3; // Cima-Direita (NE)
    if (angleDeg >= -112.5 && angleDeg < -67.5) return 4; // Cima (N)
    if (angleDeg >= -157.5 && angleDeg < -112.5) return 5; // Cima-Esquerda (NW)
    if (angleDeg >= 157.5 || angleDeg < -157.5) return 6; // Esquerda (W)
    return 7; // Baixo-Esquerda (SW)
  }
}
