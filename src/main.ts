import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

/**
 * Ponto de entrada (Entry Point) da aplicação.
 * Mantemos o main.ts o mais enxuto possível: ele apenas instancia o jogo com a configuração.
 */
new Phaser.Game(gameConfig);

