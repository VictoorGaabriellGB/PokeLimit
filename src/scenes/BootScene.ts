import Phaser from 'phaser';
import { GAME_SETTINGS } from '../config/gameConfig';
import { MapManager } from '../systems/MapManager';
import { PokemonAnimationManager } from '../systems/PokemonAnimationManager';

/**
 * BootScene:
 * Responsável por carregar os mapas e os spritesheets do PMD Collab
 * e registrar todas as animações de 8 direções antes da partida começar.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createLoadingBar();

    // 1. Carrega os mapas numerados (map1, map2, map3, map4, map6, map7)
    MapManager.preloadAll(this);

    // 2. Carrega todos os spritesheets do PMD Collab (#0025, #0001, #0004, #0007, #0019, #0041)
    PokemonAnimationManager.preloadAll(this);
  }

  create(): void {
    // Registra as animações de 8 direções (Walk, Idle, Attack) para cada Pokémon
    PokemonAnimationManager.registerAllAnimations(this);

    this.scene.start('MenuScene');
  }

  private createLoadingBar(): void {
    const cx = GAME_SETTINGS.WIDTH / 2;
    const cy = GAME_SETTINGS.HEIGHT / 2;

    const title = this.add
      .text(cx, cy - 45, 'Carregando PokéLimit...', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#f7d02c',
      })
      .setOrigin(0.5);

    const barBg = this.add.rectangle(cx, cy, 420, 22, 0x223026).setOrigin(0.5);
    const barFill = this.add
      .rectangle(cx - 206, cy, 0, 14, 0x57c885)
      .setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      barFill.width = 412 * value;
    });

    this.load.on('complete', () => {
      title.destroy();
      barBg.destroy();
      barFill.destroy();
    });
  }
}
