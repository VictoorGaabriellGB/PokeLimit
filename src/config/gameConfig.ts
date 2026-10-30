import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { MenuScene } from '../scenes/MenuScene';

export const GAME_SETTINGS = {
  WIDTH: 1280,
  HEIGHT: 720,
  BG_COLOR: '#162018',
  /** Tempo em segundos até a passagem para o próximo mapa se abrir */
  MAP_DURATION_SECONDS: 40,
} as const;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_SETTINGS.WIDTH,
  height: GAME_SETTINGS.HEIGHT,
  backgroundColor: GAME_SETTINGS.BG_COLOR,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, GameScene],
};
