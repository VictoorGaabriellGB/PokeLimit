import Phaser from 'phaser';
import { GAME_SETTINGS } from '../config/gameConfig';
import { AttackVisualManager } from '../systems/AttackVisualManager';
import { MapManager } from '../systems/MapManager';
import { PokemonAnimationManager } from '../systems/PokemonAnimationManager';

/**
 * BootScene:
 * Responsável por carregar os mapas, spritesheets do PMD Collab e sprites de ataque,
 * processando animações transparentes e registrando todas as animações antes de iniciar o jogo.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createLoadingBar();

    // 1. Carrega os mapas numerados (map1 a map7 + map5-BOSS)
    MapManager.preloadAll(this);

    // 2. Carrega todos os spritesheets do PMD Collab
    PokemonAnimationManager.preloadAll(this);

    // 3. Carrega os spritesheets de ataques e especiais
    AttackVisualManager.preloadAll(this);
  }

  create(): void {
    // Registra as animações de 8 direções (Walk, Idle, Attack) para cada Pokémon
    PokemonAnimationManager.registerAllAnimations(this);

    // Processa e registra as animações transparentes de ataques e especiais
    AttackVisualManager.registerAll(this);

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
