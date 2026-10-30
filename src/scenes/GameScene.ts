import Phaser from 'phaser';
import {
  ABILITIES,
  AbilityChoice,
  AbilityId,
  rollAbilityChoices,
} from '../config/abilities';
import { GAME_SETTINGS } from '../config/gameConfig';
import {
  BOSS_ID,
  ENEMY_IDS,
  MAX_PLAYER_LEVEL,
} from '../config/pokemonManifest';
import { Enemy } from '../entities/Enemy';
import {
  DASH_COOLDOWN_MS,
  Player,
  SPECIAL_MAX_ENERGY,
} from '../entities/Player';
import { DEPTH } from '../systems/depth';
import { MapManager } from '../systems/MapManager';
import { PokemonAnimationManager } from '../systems/PokemonAnimationManager';
import { RunHistory } from '../systems/RunHistory';

/**
 * Zoom mais aproximado no jogador para dar sensação de imersão e amplitude ao mapa.
 */
const CAMERA_ZOOM = 1.62;

interface XpOrb {
  gfx: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  xpAmount: number;
  ageMs: number;
}

export class GameScene extends Phaser.Scene {
  private selectedPokemonId = '0025';
  private mapManager!: MapManager;
  private player!: Player;
  private enemies: Enemy[] = [];
  private xpOrbs: XpOrb[] = [];
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private processedDeaths = new WeakSet<Enemy>();

  private bossEnemy: Enemy | null = null;
  private bossEncounterStarted = false;
  private bossDefeated = false;

  private runTimeSeconds = 0;
  private mapElapsedSeconds = 0;
  private spawnTimerMs = 0;
  private defeatedCount = 0;
  private pendingAbilityPicks = 0;
  private isModalOpen = false;
  private activeModalType: 'none' | 'ability' | 'pause' | 'gameover' | 'victory' =
    'none';
  private runSaved = false;

  // Elementos da nova HUD In-Game (estilo imagem anexa)
  private hudPortraitFrame!: Phaser.GameObjects.Rectangle;
  private hudPortraitImage!: Phaser.GameObjects.Image;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpLabelText!: Phaser.GameObjects.Text;
  private specialBarFill!: Phaser.GameObjects.Rectangle;
  private specialLabelText!: Phaser.GameObjects.Text;
  private dashBarFill!: Phaser.GameObjects.Rectangle;
  private dashLabelText!: Phaser.GameObjects.Text;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private xpLabelText!: Phaser.GameObjects.Text;
  private centerTimerText!: Phaser.GameObjects.Text;
  private mapSubStatusText!: Phaser.GameObjects.Text;
  private rightStatsText!: Phaser.GameObjects.Text;
  private abilitiesSummaryText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private compassText!: Phaser.GameObjects.Text;

  // HUD da Barra de Vida do Boss Onix
  private bossHudContainer!: Phaser.GameObjects.Container;
  private bossHpBarFill!: Phaser.GameObjects.Rectangle;
  private bossHpText!: Phaser.GameObjects.Text;

  private modalContainer: Phaser.GameObjects.Container | null = null;
  private currentModalChoices: AbilityChoice[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data?: { pokemonId?: string }): void {
    if (data?.pokemonId) {
      this.selectedPokemonId = data.pokemonId;
    }
    this.enemies = [];
    this.xpOrbs = [];
    this.processedDeaths = new WeakSet<Enemy>();
    this.bossEnemy = null;
    this.bossEncounterStarted = false;
    this.bossDefeated = false;
    this.runTimeSeconds = 0;
    this.mapElapsedSeconds = 0;
    this.spawnTimerMs = 0;
    this.defeatedCount = 0;
    this.pendingAbilityPicks = 0;
    this.isModalOpen = false;
    this.activeModalType = 'none';
    this.runSaved = false;
    this.modalContainer = null;
    this.currentModalChoices = [];
  }

  create(): void {
    this.mapManager = new MapManager(this);
    this.mapManager.init();

    const spawnPos = this.mapManager.getInitialSpawnPoint();

    this.player = new Player(
      this,
      spawnPos.x,
      spawnPos.y,
      this.selectedPokemonId
    );
    this.player.setCombatContext(
      () => this.enemies,
      (killedEnemy) => this.onEnemyDefeated(killedEnemy)
    );

    this.enemyGroup = this.physics.add.group();
    this.physics.add.collider(
      this.player.sprite,
      this.mapManager.getObstaclesGroup()
    );
    this.physics.add.collider(
      this.enemyGroup,
      this.mapManager.getObstaclesGroup()
    );
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);

    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);

    this.setupShortcuts();
    this.createHud();
    this.showBanner(`📍 ${this.mapManager.getCurrentMapDefinition().name}`);
  }

  update(_time: number, delta: number): void {
    if (this.isModalOpen || this.bossDefeated) {
      this.updateHud();
      return;
    }

    if (this.player.isDead) {
      this.updateHud();
      this.openGameOverModal();
      return;
    }

    const dtSeconds = delta / 1000;
    this.runTimeSeconds += dtSeconds;

    const actions = this.player.update(delta);
    if (actions.specialUsed) {
      const spec = this.player.getSpecialDefinition();
      this.showBanner(`${spec.icon} ESPECIAL: ${spec.name.toUpperCase()}!`);
    } else if (actions.specialNotReady) {
      this.showBanner(
        `⚡ Energia insuficiente para o Especial (${Math.floor(this.player.specialEnergy)}/${SPECIAL_MAX_ENERGY})`
      );
    }

    const px = this.player.sprite.x;
    const py = this.player.sprite.y;

    // 1. Tempo do mapa e transição conectada suave com pontezinha (apenas antes da Arena Boss)
    if (!this.mapManager.isBossMapActive()) {
      if (!this.mapManager.isNextMapGateOpen()) {
        this.mapElapsedSeconds += dtSeconds;
        if (this.mapElapsedSeconds >= GAME_SETTINGS.MAP_DURATION_SECONDS) {
          this.openNextMapPassage();
        }
        this.compassText.setVisible(false);
      } else {
        const enteredMapDef = this.mapManager.checkPlayerEnteredNextMap(px, py);
        if (enteredMapDef) {
          this.onPlayerCompletedMapTransition(enteredMapDef.name);
        } else {
          this.updateCompassIndicator(px, py);
        }
      }
    } else {
      this.compassText.setVisible(false);
    }

    // 2. Spawner de inimigos (na arena do Boss, o foco é o duelo com o Onix + poucos lacaios)
    this.spawnTimerMs += delta;
    const isBossActive = Boolean(this.bossEnemy && !this.bossEnemy.isDead);
    const maxEnemies = isBossActive
      ? 5
      : Math.min(26, 16 + Math.floor(this.runTimeSeconds / 30) * 2);
    const spawnInterval = isBossActive ? 5200 : 2000;

    if (this.spawnTimerMs >= spawnInterval && this.enemies.length < maxEnemies) {
      this.spawnTimerMs = 0;
      this.spawnWildPokemon();
    }

    // 3. Atualiza inimigos e verifica dano de contato / habilidades do Boss Onix
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.isDead) return false;

      enemy.update(
        delta,
        px,
        py,
        () => {
          this.onEnemyDefeated(enemy);
        },
        (hazardDamage) => {
          if (this.player.isDead) return;
          const distNow = Phaser.Math.Distance.Between(
            this.player.sprite.x,
            this.player.sprite.y,
            px,
            py
          );
          if (distNow <= 56) {
            this.player.receiveDamage(hazardDamage);
          }
        }
      );

      if (!enemy.isDead && !enemy.isIncapacitated()) {
        const distToPlayer = Phaser.Math.Distance.Between(
          px,
          py,
          enemy.sprite.x,
          enemy.sprite.y
        );
        if (distToPlayer <= enemy.getContactRadius()) {
          const contactDmg = enemy.isBoss
            ? 22
            : 8 + this.mapManager.mapsCleared * 2;
          this.player.receiveDamage(contactDmg);
        }
      }

      return !enemy.isDead;
    });

    // 4. Atualiza Orbes de XP
    this.updateXpOrbs(delta, px, py);

    // 5. Se subiu de nível, abre o modal de escolha de Habilidade Ativa/Passiva
    if (this.pendingAbilityPicks > 0 && !this.isModalOpen) {
      this.openAbilityChoiceModal();
    } else if (
      this.player.level >= MAX_PLAYER_LEVEL &&
      !this.bossEncounterStarted &&
      !this.isModalOpen
    ) {
      // Assim que o jogador atinge o nível 10, teleporta para a arena do map5-BOSS!
      this.triggerBossArenaTransition();
    }

    this.updateHud();
  }

  private onEnemyDefeated(enemy: Enemy): void {
    if (this.processedDeaths.has(enemy)) return;
    this.processedDeaths.add(enemy);

    const x = enemy.sprite.x;
    const y = enemy.sprite.y;
    this.defeatedCount++;

    if (enemy.isBoss) {
      this.onBossDefeated();
      return;
    }

    const orbGfx = this.add
      .circle(x, y, 6, 0x38bdf8, 1)
      .setStrokeStyle(2, 0xe0f2fe, 1)
      .setDepth(DEPTH.XP_ORB);

    this.xpOrbs.push({
      gfx: orbGfx,
      x,
      y,
      xpAmount: 16,
      ageMs: 0,
    });
  }

  private updateXpOrbs(delta: number, px: number, py: number): void {
    const dt = delta / 1000;
    const pickupRadius = this.player.getXpPickupRadius();

    this.xpOrbs = this.xpOrbs.filter((orb) => {
      orb.ageMs += delta;
      const dx = px - orb.x;
      const dy = py - orb.y;
      const dist = Math.hypot(dx, dy);

      if (dist < pickupRadius || orb.ageMs > 1200) {
        const pullSpeed = 390;
        orb.x += (dx / Math.max(1, dist)) * pullSpeed * dt;
        orb.y += (dy / Math.max(1, dist)) * pullSpeed * dt;
        orb.gfx.setPosition(orb.x, orb.y);
      }

      if (dist <= 22) {
        orb.gfx.destroy();
        if (this.player.level < MAX_PLAYER_LEVEL) {
          const res = this.player.gainXp(orb.xpAmount);
          if (res.levelsGained > 0) {
            this.pendingAbilityPicks += res.levelsGained;
            if (res.evolvedTo) {
              this.showBanner(
                `🌟 PARABÉNS! ${res.evolvedFrom} evoluiu para ${res.evolvedTo.toUpperCase()} (Nv.${res.newLevel})!`
              );
            }
          }
        }
        return false;
      }

      return true;
    });
  }

  // ===================== TELEPORTE NÍVEL 10 -> ARENA BOSS ONIX =====================

  private triggerBossArenaTransition(): void {
    if (this.bossEncounterStarted) return;
    this.bossEncounterStarted = true;

    // Limpa inimigos e orbes dos mapas anteriores
    this.clearAllActiveEnemiesAndOrbs();
    this.compassText.setVisible(false);

    // Teleporta para o map5-BOSS na arena fechada
    const { playerSpawn, bossSpawn } = this.mapManager.teleportToBossArena();
    this.player.teleportTo(playerSpawn.x, playerSpawn.y);
    this.cameras.main.flash(380, 255, 255, 255);

    this.spawnBossOnix(bossSpawn.x, bossSpawn.y);
  }

  private spawnBossOnix(bossX: number, bossY: number): void {
    if (this.bossEnemy && !this.bossEnemy.isDead) return;

    const hpMultiplier = 1 + (this.player.level - 1) * 0.12;
    this.bossEnemy = new Enemy(
      this,
      bossX,
      bossY,
      BOSS_ID,
      hpMultiplier
    );
    this.enemies.push(this.bossEnemy);
    this.enemyGroup.add(this.bossEnemy.sprite);

    // Cura parcial para o confronto final
    this.player.hp = Math.min(
      this.player.maxHp,
      this.player.hp + Math.round(this.player.maxHp * 0.5)
    );

    this.cameras.main.shake(420, 0.008);
    this.bossHudContainer.setVisible(true);
    this.showBanner('👑 ARENA FINAL! DERROTE O BOSS ONIX PARA VENCER!');
  }

  private onBossDefeated(): void {
    if (this.bossDefeated) return;
    this.bossDefeated = true;
    this.bossHudContainer.setVisible(false);

    this.clearAllActiveEnemiesAndOrbs();
    this.cameras.main.shake(500, 0.01);
    this.cameras.main.flash(450, 255, 230, 120);

    this.openVictoryModal();
  }

  // ===================== MENU DE PAUSA [ESC] (3 OPÇÕES) =====================

  private openPauseModal(): void {
    if (this.isModalOpen || this.player.isDead || this.bossDefeated) return;

    this.isModalOpen = true;
    this.activeModalType = 'pause';
    this.physics.world.pause();

    const center = this.toZoomedHudCoord(
      GAME_SETTINGS.WIDTH / 2,
      GAME_SETTINGS.HEIGHT / 2
    );

    const container = this.add
      .container(center.x, center.y)
      .setScrollFactor(0)
      .setScale(center.scale)
      .setDepth(DEPTH.HUD + 70);

    const dim = this.add.rectangle(
      0,
      0,
      GAME_SETTINGS.WIDTH,
      GAME_SETTINGS.HEIGHT,
      0x030712,
      0.82
    );

    const box = this.add
      .rectangle(0, 0, 500, 340, 0x0b1528, 0.98)
      .setStrokeStyle(4, 0xffcb05, 1);

    const innerBorder = this.add
      .rectangle(0, 0, 486, 326, 0x000000, 0)
      .setStrokeStyle(1.5, 0x38bdf8, 0.5);

    const title = this.add
      .text(0, -122, '⏸️ JOGO PAUSADO', {
        fontFamily: 'monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffcb05',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const poke = this.player.getPokemonDefinition();
    const subtitle = this.add
      .text(
        0,
        -86,
        `${poke.name} (Nv.${this.player.level})  •  Tempo: ${RunHistory.formatTime(this.runTimeSeconds)}  •  Derrotados: ${this.defeatedCount}`,
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cbd5e1',
        }
      )
      .setOrigin(0.5);

    const createOptionBtn = (
      y: number,
      label: string,
      bgHex: string,
      textHex: string,
      strokeColor: number,
      onClick: () => void
    ) => {
      const btnBg = this.add
        .rectangle(0, y, 410, 48, Phaser.Display.Color.HexStringToColor(bgHex).color, 0.96)
        .setStrokeStyle(2.5, strokeColor, 1)
        .setInteractive({ useHandCursor: true });

      const btnTxt = this.add
        .text(0, y, label, {
          fontFamily: 'monospace',
          fontSize: '15.5px',
          fontStyle: 'bold',
          color: textHex,
        })
        .setOrigin(0.5);

      btnBg.on('pointerover', () => {
        btnBg.setStrokeStyle(4, 0xffffff, 1);
        btnBg.setScale(1.02);
      });
      btnBg.on('pointerout', () => {
        btnBg.setStrokeStyle(2.5, strokeColor, 1);
        btnBg.setScale(1);
      });
      btnBg.on('pointerdown', onClick);

      return [btnBg, btnTxt];
    };

    // 1. Retomar o jogo
    const resumeBtn = createOptionBtn(
      -22,
      '▶️  RETOMAR AO JOGO [ESC / ENTER]',
      '#22c55e',
      '#052e16',
      0x86efac,
      () => this.resumeFromPauseModal()
    );

    // 2. Reiniciar a run com o mesmo Pokémon inicial
    const restartBtn = createOptionBtn(
      42,
      '🔄  REINICIAR A RUN (MESMO POKÉMON) [R]',
      '#38bdf8',
      '#082f49',
      0xbae6fd,
      () => this.restartRunSamePokemon()
    );

    // 3. Voltar ao menu principal para escolher outro Pokémon
    const menuBtn = createOptionBtn(
      106,
      '🏠  VOLTAR AO MENU DE POKÉMONS [Q]',
      '#f59e0b',
      '#091326',
      0xfde047,
      () => this.returnToMainMenu()
    );

    container.add([
      dim,
      box,
      innerBorder,
      title,
      subtitle,
      ...resumeBtn,
      ...restartBtn,
      ...menuBtn,
    ]);

    this.modalContainer = container;
  }

  private resumeFromPauseModal(): void {
    if (this.activeModalType !== 'pause') return;
    if (this.modalContainer) {
      this.modalContainer.destroy();
      this.modalContainer = null;
    }
    this.isModalOpen = false;
    this.activeModalType = 'none';
    this.physics.world.resume();
  }

  private restartRunSamePokemon(): void {
    this.saveCurrentRunIfEligible('abandono');
    if (this.modalContainer) {
      this.modalContainer.destroy();
      this.modalContainer = null;
    }
    this.isModalOpen = false;
    this.activeModalType = 'none';
    this.scene.restart({ pokemonId: this.selectedPokemonId });
  }

  // ===================== MODAL DE VITÓRIA =====================

  private openVictoryModal(): void {
    this.isModalOpen = true;
    this.activeModalType = 'victory';
    this.physics.world.pause();

    const isNewRecord = this.saveCurrentRunIfEligible('vitoria');
    const score = this.computeCurrentScore() + 1500;
    const timeStr = RunHistory.formatTime(this.runTimeSeconds);
    const poke = this.player.getPokemonDefinition();

    const center = this.toZoomedHudCoord(
      GAME_SETTINGS.WIDTH / 2,
      GAME_SETTINGS.HEIGHT / 2
    );

    const container = this.add
      .container(center.x, center.y)
      .setScrollFactor(0)
      .setScale(center.scale)
      .setDepth(DEPTH.HUD + 65);

    const dim = this.add.rectangle(
      0,
      0,
      GAME_SETTINGS.WIDTH,
      GAME_SETTINGS.HEIGHT,
      0x030712,
      0.86
    );

    const box = this.add
      .rectangle(0, 0, 580, 380, 0x0b1528, 0.98)
      .setStrokeStyle(4, 0xffcb05, 1);

    const innerBorder = this.add
      .rectangle(0, 0, 566, 366, 0x000000, 0)
      .setStrokeStyle(1.5, 0x4ade80, 0.6);

    const title = this.add
      .text(0, -142, '🏆 VITÓRIA! BOSS ONIX DERROTADO!', {
        fontFamily: 'monospace',
        fontSize: '25px',
        fontStyle: 'bold',
        color: '#ffcb05',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const subTitle = this.add
      .text(0, -104, 'Você conquistou o Ginásio de Pedra e venceu a jornada!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#4ade80',
      })
      .setOrigin(0.5);

    const statsTxt = this.add
      .text(
        0,
        -6,
        [
          `Campeão: ${poke.name} (Nível ${this.player.level})`,
          `Pontuação Final (+Bônus Boss): ${score} pts ${isNewRecord ? '🌟 (NOVO RECORDE!)' : ''}`,
          `Tempo Total da Vitória: ${timeStr}`,
          `Pokémons Derrotados: ${this.defeatedCount}`,
          `Mapas Conquistados: ${this.mapManager.mapsCleared + 1}`,
        ].join('\n'),
        {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#f8fafc',
          align: 'center',
          lineSpacing: 8,
        }
      )
      .setOrigin(0.5);

    const btn = this.add
      .text(0, 126, '👑 VOLTAR AO MENU PRINCIPAL [ENTER / ESC]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#091326',
        backgroundColor: '#ffcb05',
        padding: { x: 20, y: 11 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => this.scene.start('MenuScene'));

    container.add([dim, box, innerBorder, title, subTitle, statsTxt, btn]);
    this.modalContainer = container;
  }

  // ===================== MODAL DE HABILIDADES (LEVEL UP) =====================

  private openAbilityChoiceModal(): void {
    const choices = rollAbilityChoices(this.player.getAbilityLevels(), 3);
    if (choices.length === 0) {
      this.pendingAbilityPicks = 0;
      return;
    }

    this.isModalOpen = true;
    this.activeModalType = 'ability';
    this.currentModalChoices = choices;
    this.physics.world.pause();

    const center = this.toZoomedHudCoord(
      GAME_SETTINGS.WIDTH / 2,
      GAME_SETTINGS.HEIGHT / 2
    );

    const container = this.add
      .container(center.x, center.y)
      .setScrollFactor(0)
      .setScale(center.scale)
      .setDepth(DEPTH.HUD + 50);

    const dim = this.add.rectangle(
      0,
      0,
      GAME_SETTINGS.WIDTH,
      GAME_SETTINGS.HEIGHT,
      0x030712,
      0.78
    );

    const title = this.add
      .text(0, -238, `⬆️ NÍVEL ${this.player.level}! ESCOLHA UMA HABILIDADE`, {
        fontFamily: 'monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffcb05',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const subtitle = this.add
      .text(
        0,
        -202,
        'Clique em uma carta ou pressione [1], [2] ou [3] no teclado',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#cbd5e1',
        }
      )
      .setOrigin(0.5);

    container.add([dim, title, subtitle]);

    const cardW = 310;
    const cardH = 340;
    const gap = 24;
    const startX = -((choices.length - 1) * (cardW + gap)) / 2;

    choices.forEach((choice, idx) => {
      const def = ABILITIES[choice.id];
      const nextLvl = choice.currentLevel + 1;
      const isAct = def.kind === 'active';
      const themeColor = isAct ? 0xf59e0b : 0x38bdf8;
      const themeHex = isAct ? '#fbbf24' : '#38bdf8';
      const cx = startX + idx * (cardW + gap);
      const cy = 12;

      const cardBg = this.add
        .rectangle(cx, cy, cardW, cardH, 0x0b1528, 0.98)
        .setStrokeStyle(3.5, themeColor, 1)
        .setInteractive({ useHandCursor: true });

      const kindBanner = this.add
        .rectangle(cx, cy - cardH / 2 + 28, cardW - 14, 38, themeColor, 0.28)
        .setStrokeStyle(1.5, themeColor, 1);

      const kindText = this.add
        .text(
          cx,
          cy - cardH / 2 + 28,
          isAct ? '⚔️ HABILIDADE ATIVA' : '🛡️ HABILIDADE PASSIVA',
          {
            fontFamily: 'monospace',
            fontSize: '13.5px',
            fontStyle: 'bold',
            color: themeHex,
          }
        )
        .setOrigin(0.5);

      const iconCircle = this.add
        .circle(cx, cy - 58, 36, themeColor, 0.2)
        .setStrokeStyle(2, themeColor, 0.9);

      const iconTxt = this.add
        .text(cx, cy - 58, def.icon, {
          fontFamily: 'monospace',
          fontSize: '34px',
        })
        .setOrigin(0.5);

      const nameTxt = this.add
        .text(cx, cy + 2, def.name.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      const lvlTxt = this.add
        .text(
          cx,
          cy + 28,
          choice.currentLevel === 0
            ? `NOVO! (Nível 1/${def.maxLevel})`
            : `Nível ${choice.currentLevel} ➔ Nível ${nextLvl}/${def.maxLevel}`,
          {
            fontFamily: 'monospace',
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#4ade80',
          }
        )
        .setOrigin(0.5);

      const descTxt = this.add
        .text(cx, cy + 84, def.describe(nextLvl), {
          fontFamily: 'monospace',
          fontSize: '13.5px',
          color: '#e2e8f0',
          align: 'center',
          wordWrap: { width: cardW - 34 },
          lineSpacing: 4,
        })
        .setOrigin(0.5);

      const keyHint = this.add
        .text(cx, cy + cardH / 2 - 24, `[Tecla ${idx + 1}] Selecionar`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#091326',
          backgroundColor: themeHex,
          padding: { x: 14, y: 5 },
        })
        .setOrigin(0.5);

      cardBg.on('pointerover', () => cardBg.setStrokeStyle(5, 0xffffff, 1));
      cardBg.on('pointerout', () => cardBg.setStrokeStyle(3.5, themeColor, 1));
      cardBg.on('pointerdown', () => this.selectModalAbility(choice.id));

      container.add([
        cardBg,
        kindBanner,
        kindText,
        iconCircle,
        iconTxt,
        nameTxt,
        lvlTxt,
        descTxt,
        keyHint,
      ]);
    });

    this.modalContainer = container;
  }

  private selectModalAbility(id: AbilityId): void {
    if (!this.isModalOpen || this.activeModalType !== 'ability') return;

    this.player.learnAbility(id);
    this.pendingAbilityPicks = Math.max(0, this.pendingAbilityPicks - 1);

    if (this.modalContainer) {
      this.modalContainer.destroy();
      this.modalContainer = null;
    }
    this.isModalOpen = false;
    this.activeModalType = 'none';
    this.currentModalChoices = [];

    const def = ABILITIES[id];
    const newLvl = this.player.getAbilityLevel(id);
    this.showBanner(`✨ ${def.icon} ${def.name} (Nv.${newLvl}) aprendido!`);

    if (this.pendingAbilityPicks > 0) {
      this.openAbilityChoiceModal();
    } else {
      this.physics.world.resume();
      if (
        this.player.level >= MAX_PLAYER_LEVEL &&
        !this.bossEncounterStarted
      ) {
        this.triggerBossArenaTransition();
      }
    }
  }

  // ===================== FIM DE PARTIDA & HISTÓRICO =====================

  private computeCurrentScore(): number {
    return RunHistory.computeScore({
      defeated: this.defeatedCount,
      level: this.player.level,
      mapsCleared: this.mapManager.mapsCleared,
      timeSeconds: this.runTimeSeconds,
    });
  }

  private saveCurrentRunIfEligible(
    reason: 'vitoria' | 'derrota' | 'abandono'
  ): boolean {
    if (this.runSaved) return false;
    if (
      reason !== 'vitoria' &&
      this.defeatedCount === 0 &&
      this.runTimeSeconds < 5
    ) {
      return false;
    }

    this.runSaved = true;
    const poke = this.player.getPokemonDefinition();
    const cls = this.player.getClassDefinition();
    const victoryBonus = reason === 'vitoria' ? 1500 : 0;

    return RunHistory.save({
      starterId: this.selectedPokemonId,
      finalPokemonId: poke.id,
      finalPokemonName: poke.name,
      classId: cls.title,
      score: this.computeCurrentScore() + victoryBonus,
      timeSeconds: Math.floor(this.runTimeSeconds),
      level: this.player.level,
      defeated: this.defeatedCount,
      mapsCleared: this.mapManager.mapsCleared,
      endReason: reason,
      dateIso: new Date().toISOString(),
    });
  }

  private openGameOverModal(): void {
    if (this.isModalOpen) return;
    this.isModalOpen = true;
    this.activeModalType = 'gameover';
    this.physics.world.pause();

    const isNewRecord = this.saveCurrentRunIfEligible('derrota');
    const score = this.computeCurrentScore();
    const timeStr = RunHistory.formatTime(this.runTimeSeconds);
    const poke = this.player.getPokemonDefinition();

    const center = this.toZoomedHudCoord(
      GAME_SETTINGS.WIDTH / 2,
      GAME_SETTINGS.HEIGHT / 2
    );

    const container = this.add
      .container(center.x, center.y)
      .setScrollFactor(0)
      .setScale(center.scale)
      .setDepth(DEPTH.HUD + 60);

    const dim = this.add.rectangle(
      0,
      0,
      GAME_SETTINGS.WIDTH,
      GAME_SETTINGS.HEIGHT,
      0x030712,
      0.84
    );

    const box = this.add
      .rectangle(0, 0, 520, 360, 0x0b1528, 0.98)
      .setStrokeStyle(4, 0xe63946, 1);

    const title = this.add
      .text(0, -130, '💀 FIM DA JORNADA', {
        fontFamily: 'monospace',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#f87171',
      })
      .setOrigin(0.5);

    const statsTxt = this.add
      .text(
        0,
        -25,
        [
          `Pokémon Final: ${poke.name} (Nível ${this.player.level})`,
          `Pontuação Final: ${score} pts ${isNewRecord ? '🏆 (NOVO RECORDE!)' : ''}`,
          `Tempo Sobrevivido: ${timeStr}`,
          `Inimigos Derrotados: ${this.defeatedCount}`,
          `Mapas Alcançados: ${this.mapManager.mapsCleared + 1}`,
        ].join('\n'),
        {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#f1f5f9',
          align: 'center',
          lineSpacing: 8,
        }
      )
      .setOrigin(0.5);

    const retryBtn = this.add
      .text(0, 82, '🔄 REINICIAR COM O MESMO POKÉMON [R]', {
        fontFamily: 'monospace',
        fontSize: '14.5px',
        fontStyle: 'bold',
        color: '#082f49',
        backgroundColor: '#38bdf8',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    retryBtn.on('pointerdown', () =>
      this.scene.restart({ pokemonId: this.selectedPokemonId })
    );

    const btn = this.add
      .text(0, 132, '🏠 VOLTAR AO MENU DE POKÉMONS [ENTER / ESC]', {
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#091326',
        backgroundColor: '#ffcb05',
        padding: { x: 18, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => this.scene.start('MenuScene'));

    container.add([dim, box, title, statsTxt, retryBtn, btn]);
    this.modalContainer = container;
  }

  // ===================== MAPA & SPAWN =====================

  private openNextMapPassage(): void {
    if (this.mapManager.isBossMapActive()) return;
    const nextDef = this.mapManager.spawnNextConnectedMap();
    this.showBanner(
      `🌉 Pontezinha aberta ao NORTE para: ${nextDef.name}!`
    );
  }

  private clearAllActiveEnemiesAndOrbs(): void {
    for (const enemy of this.enemies) {
      if (!enemy.isDead) {
        enemy.destroy();
      }
    }
    this.enemies = [];

    for (const orb of this.xpOrbs) {
      orb.gfx.destroy();
    }
    this.xpOrbs = [];
  }

  private onPlayerCompletedMapTransition(newMapName: string): void {
    this.mapElapsedSeconds = 0;
    this.compassText.setVisible(false);

    const bounds = this.mapManager.getCurrentMapBounds();
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.isDead) return false;
      if (enemy.isBoss) return true;
      const insideNewMap =
        enemy.sprite.x >= bounds.x &&
        enemy.sprite.x <= bounds.x + bounds.width &&
        enemy.sprite.y >= bounds.y &&
        enemy.sprite.y <= bounds.y + bounds.height;

      if (!insideNewMap) {
        enemy.destroy();
        return false;
      }
      return true;
    });

    this.showBanner(`📍 Você chegou em: ${newMapName}`);
  }

  private updateCompassIndicator(px: number, py: number): void {
    const target = this.mapManager.getTransitionTarget(py);
    const dist = Math.round(
      Phaser.Math.Distance.Between(px, py, target.x, target.y)
    );
    const angle = Math.atan2(target.y - py, target.x - px);
    const deg = Phaser.Math.RadToDeg(angle);

    let arrow = '⬆️';
    if (deg >= -22.5 && deg < 22.5) arrow = '➡️';
    else if (deg >= 22.5 && deg < 67.5) arrow = '↘️';
    else if (deg >= 67.5 && deg < 112.5) arrow = '⬇️';
    else if (deg >= 112.5 && deg < 157.5) arrow = '↙️';
    else if (deg >= 157.5 || deg < -157.5) arrow = '⬅️';
    else if (deg >= -157.5 && deg < -112.5) arrow = '↖️';
    else if (deg >= -67.5 && deg < -22.5) arrow = '↗️';

    this.compassText.setVisible(true);
    this.compassText.setPosition(px, py - 40);
    this.compassText.setText(
      target.passedSeam
        ? `⬆️ ATRAVESSE A PONTE (${Math.max(1, Math.round(dist / 24))}m)`
        : `${arrow} PONTE AO NORTE (${Math.max(0, Math.round(dist / 24))}m)`
    );
  }

  private spawnWildPokemon(): void {
    const bounds = this.mapManager.getCurrentMapBounds();
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(195, 310);

    const rawX = Phaser.Math.Clamp(
      this.player.sprite.x + Math.cos(angle) * distance,
      bounds.x + 64,
      bounds.x + bounds.width - 64
    );
    const rawY = Phaser.Math.Clamp(
      this.player.sprite.y + Math.sin(angle) * distance,
      bounds.y + 64,
      bounds.y + bounds.height - 64
    );

    const spawnPos = this.mapManager.findNearestWalkablePosition(rawX, rawY);
    const randomEnemyId = Phaser.Utils.Array.GetRandom([...ENEMY_IDS]);
    const hpScale =
      1 + this.mapManager.mapsCleared * 0.25 + (this.player.level - 1) * 0.08;

    const enemy = new Enemy(
      this,
      spawnPos.x,
      spawnPos.y,
      randomEnemyId,
      hpScale
    );
    this.enemies.push(enemy);
    this.enemyGroup.add(enemy.sprite);
  }

  private setupShortcuts(): void {
    const kb = this.input.keyboard;
    if (!kb) return;

    kb.on('keydown-ESC', () => {
      if (this.bossDefeated || this.player.isDead) {
        this.scene.start('MenuScene');
      } else if (this.activeModalType === 'pause') {
        this.resumeFromPauseModal();
      } else if (!this.isModalOpen) {
        this.openPauseModal();
      }
    });

    kb.on('keydown-ENTER', () => {
      if (this.player.isDead || this.bossDefeated) {
        this.scene.start('MenuScene');
      } else if (this.activeModalType === 'pause') {
        this.resumeFromPauseModal();
      }
    });

    kb.on('keydown-R', () => {
      if (
        this.activeModalType === 'pause' ||
        this.activeModalType === 'gameover'
      ) {
        this.restartRunSamePokemon();
      }
    });

    kb.on('keydown-Q', () => {
      if (this.activeModalType === 'pause') {
        this.returnToMainMenu();
      }
    });

    kb.on('keydown-ONE', () => {
      if (
        this.activeModalType === 'ability' &&
        this.currentModalChoices[0]
      ) {
        this.selectModalAbility(this.currentModalChoices[0].id);
      }
    });
    kb.on('keydown-TWO', () => {
      if (
        this.activeModalType === 'ability' &&
        this.currentModalChoices[1]
      ) {
        this.selectModalAbility(this.currentModalChoices[1].id);
      }
    });
    kb.on('keydown-THREE', () => {
      if (
        this.activeModalType === 'ability' &&
        this.currentModalChoices[2]
      ) {
        this.selectModalAbility(this.currentModalChoices[2].id);
      }
    });

    kb.on('keydown-M', () => {
      if (
        !this.mapManager.isNextMapGateOpen() &&
        !this.mapManager.isBossMapActive() &&
        !this.isModalOpen
      ) {
        this.openNextMapPassage();
      }
    });

    kb.on('keydown-F2', () => {
      const active = this.mapManager.toggleDebug();
      this.showBanner(
        active ? '🛠️ Debug de Colisão ATIVO' : '🛠️ Debug de Colisão OCULTO'
      );
    });
  }

  private returnToMainMenu(): void {
    this.saveCurrentRunIfEligible('abandono');
    this.scene.start('MenuScene');
  }

  // ===================== HUD IN-GAME (ESTILO IMAGEM ANEXA) =====================

  private toZoomedHudCoord(
    screenX: number,
    screenY: number
  ): { x: number; y: number; scale: number } {
    const cx = GAME_SETTINGS.WIDTH / 2;
    const cy = GAME_SETTINGS.HEIGHT / 2;
    return {
      x: cx + (screenX - cx) / CAMERA_ZOOM,
      y: cy + (screenY - cy) / CAMERA_ZOOM,
      scale: 1 / CAMERA_ZOOM,
    };
  }

  private createHud(): void {
    // 1. Retrato do Pokémon (canto superior esquerdo) com moldura branca estilo PMD
    const portraitPos = this.toZoomedHudCoord(46, 46);
    this.hudPortraitFrame = this.add
      .rectangle(portraitPos.x, portraitPos.y, 70, 70, 0x0b1528, 0.95)
      .setStrokeStyle(3, 0xffffff, 1)
      .setScrollFactor(0)
      .setScale(portraitPos.scale)
      .setDepth(DEPTH.HUD);

    const initialPortraitKey = PokemonAnimationManager.getPortraitKey(
      this.player.getPokemonDefinition().id,
      'Normal'
    );
    this.hudPortraitImage = this.add
      .image(portraitPos.x, portraitPos.y, initialPortraitKey)
      .setDisplaySize(64, 64)
      .setScrollFactor(0)
      .setScale(portraitPos.scale * (64 / 40))
      .setDepth(DEPTH.HUD + 1);

    // 2. Barra de HP verde grande (70 / 70)
    const hpBarPos = this.toZoomedHudCoord(88, 22);
    this.add
      .rectangle(hpBarPos.x, hpBarPos.y, 198, 22, 0x111c14, 0.88)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1.5, 0x1f2937, 0.9)
      .setScrollFactor(0)
      .setScale(hpBarPos.scale)
      .setDepth(DEPTH.HUD);

    this.hpBarFill = this.add
      .rectangle(hpBarPos.x, hpBarPos.y, 198, 22, 0x65d643, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(hpBarPos.scale)
      .setDepth(DEPTH.HUD + 1);

    const hpTextPos = this.toZoomedHudCoord(96, 22);
    this.hpLabelText = this.add
      .text(hpTextPos.x, hpTextPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(hpTextPos.scale)
      .setDepth(DEPTH.HUD + 2);

    // 3. Barra de ULT (Especial) roxa/escura (ULT 11%)
    const ultBarPos = this.toZoomedHudCoord(88, 49);
    this.add
      .rectangle(ultBarPos.x, ultBarPos.y, 198, 17, 0x0d1512, 0.92)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(ultBarPos.scale)
      .setDepth(DEPTH.HUD);

    this.specialBarFill = this.add
      .rectangle(ultBarPos.x, ultBarPos.y, 0, 17, 0x9b6dff, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(ultBarPos.scale)
      .setDepth(DEPTH.HUD + 1);

    const ultTextPos = this.toZoomedHudCoord(96, 49);
    this.specialLabelText = this.add
      .text(ultTextPos.x, ultTextPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(ultTextPos.scale)
      .setDepth(DEPTH.HUD + 2);

    // 4. Barra de DASH azul-clara (DASH [SHIFT])
    const dashBarPos = this.toZoomedHudCoord(88, 70);
    this.add
      .rectangle(dashBarPos.x, dashBarPos.y, 198, 16, 0x0d1512, 0.92)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(dashBarPos.scale)
      .setDepth(DEPTH.HUD);

    this.dashBarFill = this.add
      .rectangle(dashBarPos.x, dashBarPos.y, 198, 16, 0x56b9ff, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(dashBarPos.scale)
      .setDepth(DEPTH.HUD + 1);

    const dashTextPos = this.toZoomedHudCoord(96, 70);
    this.dashLabelText = this.add
      .text(dashTextPos.x, dashTextPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(dashTextPos.scale)
      .setDepth(DEPTH.HUD + 2);

    // 5. Barra compacta de Nível & XP logo abaixo do bloco principal
    const xpBarPos = this.toZoomedHudCoord(12, 92);
    this.add
      .rectangle(xpBarPos.x, xpBarPos.y, 274, 12, 0x091326, 0.9)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x38bdf8, 0.8)
      .setScrollFactor(0)
      .setScale(xpBarPos.scale)
      .setDepth(DEPTH.HUD);

    this.xpBarFill = this.add
      .rectangle(xpBarPos.x + 1, xpBarPos.y, 0, 10, 0xfacc15, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(xpBarPos.scale)
      .setDepth(DEPTH.HUD + 1);

    const xpTextPos = this.toZoomedHudCoord(18, 92);
    this.xpLabelText = this.add
      .text(xpTextPos.x, xpTextPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '10.5px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2.5,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(xpTextPos.scale)
      .setDepth(DEPTH.HUD + 2);

    // Lista compacta de Habilidades Aprendidas
    const abilPos = this.toZoomedHudCoord(12, 110);
    this.abilitiesSummaryText = this.add
      .text(abilPos.x, abilPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#fde047',
        backgroundColor: '#091326cc',
        padding: { x: 6, y: 2 },
      })
      .setScrollFactor(0)
      .setScale(abilPos.scale)
      .setDepth(DEPTH.HUD);

    // 6. Relógio Central (00:03) estilo imagem anexa
    const centerPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH / 2, 28);
    this.centerTimerText = this.add
      .text(centerPos.x, centerPos.y, '00:00', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#0a140acc',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setScale(centerPos.scale)
      .setDepth(DEPTH.HUD);

    const subMapPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH / 2, 56);
    this.mapSubStatusText = this.add
      .text(subMapPos.x, subMapPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '11.5px',
        color: '#e2e8f0',
        backgroundColor: '#0a140ab3',
        padding: { x: 8, y: 2 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setScale(subMapPos.scale)
      .setDepth(DEPTH.HUD);

    // 7. Painel Superior Direito ("Derrotados: X   Inimigos: Y") estilo imagem anexa
    const rightPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH - 14, 26);
    this.rightStatsText = this.add
      .text(rightPos.x, rightPos.y, 'Derrotados: 0   Inimigos: 0', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#0a140acc',
        padding: { x: 14, y: 7 },
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setScale(rightPos.scale)
      .setDepth(DEPTH.HUD);

    // Botão discreto de Pausa [ESC] abaixo do contador direito
    const pauseBtnPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH - 14, 56);
    const pauseBtn = this.add
      .text(pauseBtnPos.x, pauseBtnPos.y, '⏸️ PAUSAR [ESC]', {
        fontFamily: 'monospace',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#ffcb05',
        backgroundColor: '#0a140acc',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setScale(pauseBtnPos.scale)
      .setDepth(DEPTH.HUD)
      .setInteractive({ useHandCursor: true });

    pauseBtn.on('pointerdown', () => {
      if (!this.isModalOpen) this.openPauseModal();
    });

    // Barra de Vida do Boss Onix (centralizada no topo quando na Arena Final)
    const bossHudPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH / 2, 86);
    this.bossHudContainer = this.add
      .container(bossHudPos.x, bossHudPos.y)
      .setScrollFactor(0)
      .setScale(bossHudPos.scale)
      .setDepth(DEPTH.HUD + 4)
      .setVisible(false);

    const bossBarBg = this.add
      .rectangle(0, 0, 420, 24, 0x091326, 0.95)
      .setStrokeStyle(2.5, 0xf59e0b, 1);

    this.bossHpBarFill = this.add
      .rectangle(-206, 0, 412, 18, 0xdc2626, 1)
      .setOrigin(0, 0.5);

    this.bossHpText = this.add
      .text(0, 0, '👑 BOSS ONIX', {
        fontFamily: 'monospace',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.bossHudContainer.add([bossBarBg, this.bossHpBarFill, this.bossHpText]);

    const bannerPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH / 2, 128);
    this.bannerText = this.add
      .text(bannerPos.x, bannerPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '15.5px',
        fontStyle: 'bold',
        color: '#ffcb05',
        backgroundColor: '#091326ee',
        padding: { x: 16, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setScale(bannerPos.scale)
      .setDepth(DEPTH.HUD + 3)
      .setAlpha(0);

    this.compassText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#ffcb05',
        backgroundColor: '#000000cc',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.FLOATING_TEXT + 5)
      .setVisible(false);
  }

  private updateHud(): void {
    const mapDef = this.mapManager.getCurrentMapDefinition();
    const pokeDef = this.player.getPokemonDefinition();

    // 1. Atualiza o Retrato (Normal vs Dor quando leva dano, e acompanha evoluções!)
    const inPain = this.player.isInPain();
    const desiredPortraitKey = PokemonAnimationManager.getPortraitKey(
      pokeDef.id,
      inPain ? 'Pain' : 'Normal'
    );
    const fallbackPortraitKey = PokemonAnimationManager.getPortraitKey(
      pokeDef.id,
      'Normal'
    );
    const keyToUse = this.textures.exists(desiredPortraitKey)
      ? desiredPortraitKey
      : fallbackPortraitKey;

    if (this.hudPortraitImage.texture.key !== keyToUse) {
      this.hudPortraitImage.setTexture(keyToUse);
    }
    this.hudPortraitFrame.setStrokeStyle(
      3,
      inPain ? 0xff4d4d : 0xffffff,
      1
    );

    // 2. Barra de HP ("70 / 70")
    const hpRatio = Phaser.Math.Clamp(
      this.player.hp / Math.max(1, this.player.maxHp),
      0,
      1
    );
    this.hpBarFill.width = 198 * hpRatio;
    this.hpBarFill.setFillStyle(
      hpRatio > 0.5 ? 0x65d643 : hpRatio > 0.25 ? 0xfacc15 : 0xef4444,
      1
    );
    this.hpLabelText.setText(`${this.player.hp} / ${this.player.maxHp}`);

    // 3. Barra de ULT ("ULT 11%" ou "ULT PRONTO! [E/Q]")
    const specRatio = Phaser.Math.Clamp(
      this.player.specialEnergy / SPECIAL_MAX_ENERGY,
      0,
      1
    );
    this.specialBarFill.width = 198 * specRatio;
    this.specialBarFill.setFillStyle(
      specRatio >= 1 ? 0xc084fc : 0x9b6dff,
      1
    );
    this.specialLabelText.setText(
      specRatio >= 1
        ? 'ULT 100% [E/Q]'
        : `ULT ${Math.floor(specRatio * 100)}%`
    );

    // 4. Barra de DASH ("DASH  [SHIFT]")
    const dashReadyRatio = Phaser.Math.Clamp(
      1 - this.player.dashCooldownRemaining / DASH_COOLDOWN_MS,
      0,
      1
    );
    this.dashBarFill.width = 198 * dashReadyRatio;
    this.dashBarFill.setFillStyle(
      dashReadyRatio >= 1 ? 0x56b9ff : 0x38bdf8,
      1
    );
    this.dashLabelText.setText(
      dashReadyRatio >= 1
        ? 'DASH  [SHIFT]'
        : `DASH  ${(this.player.dashCooldownRemaining / 1000).toFixed(1)}s`
    );

    // 5. Barra de Nível & XP
    const xpRatio =
      this.player.level >= MAX_PLAYER_LEVEL
        ? 1
        : Phaser.Math.Clamp(
            this.player.xp / Math.max(1, this.player.xpToNextLevel),
            0,
            1
          );
    this.xpBarFill.width = 272 * xpRatio;
    this.xpLabelText.setText(
      this.player.level >= MAX_PLAYER_LEVEL
        ? `${pokeDef.name} Nv.${this.player.level} (MÁX — ARENA BOSS)`
        : `${pokeDef.name} Nv.${this.player.level}  •  XP ${this.player.xp}/${this.player.xpToNextLevel}`
    );

    // 6. Relógio Central (00:03) + Substatus do Mapa/Ponte
    this.centerTimerText.setText(RunHistory.formatTime(this.runTimeSeconds));

    if (this.mapManager.isBossMapActive()) {
      this.mapSubStatusText.setText('👑 Arena Final — Ginásio de Pedra');
    } else if (this.mapManager.isNextMapGateOpen()) {
      this.mapSubStatusText.setText(`🌉 Ponte aberta ao Norte!`);
    } else {
      const remaining = Math.max(
        0,
        Math.ceil(GAME_SETTINGS.MAP_DURATION_SECONDS - this.mapElapsedSeconds)
      );
      this.mapSubStatusText.setText(`${mapDef.name}  •  Ponte em ${remaining}s`);
    }

    // 7. Contador Superior Direito ("Derrotados: 1   Inimigos: 2")
    this.rightStatsText.setText(
      `Derrotados: ${this.defeatedCount}   Inimigos: ${this.enemies.length}`
    );

    // 8. Barra de Vida do Boss Onix
    if (this.bossEnemy && !this.bossEnemy.isDead) {
      this.bossHudContainer.setVisible(true);
      const bossRatio = Phaser.Math.Clamp(
        this.bossEnemy.hp / Math.max(1, this.bossEnemy.maxHp),
        0,
        1
      );
      this.bossHpBarFill.width = 412 * bossRatio;
      this.bossHpText.setText(
        `👑 BOSS ONIX — HP: ${Math.ceil(this.bossEnemy.hp)} / ${this.bossEnemy.maxHp}`
      );
    } else {
      this.bossHudContainer.setVisible(false);
    }

    // 9. Habilidades aprendidas
    const learned: string[] = [];
    for (const [id, lvl] of this.player.getAbilityLevels().entries()) {
      if (lvl > 0) {
        learned.push(`${ABILITIES[id].icon}Nv.${lvl}`);
      }
    }
    this.abilitiesSummaryText.setVisible(learned.length > 0);
    if (learned.length > 0) {
      this.abilitiesSummaryText.setText(learned.join('  '));
    }
  }

  private showBanner(message: string): void {
    this.bannerText.setText(message);
    this.tweens.killTweensOf(this.bannerText);
    this.bannerText.setAlpha(1);

    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      delay: 2800,
      duration: 500,
    });
  }
}
