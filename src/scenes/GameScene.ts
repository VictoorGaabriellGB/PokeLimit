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
  private runSaved = false;

  private hudText!: Phaser.GameObjects.Text;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private dashBarFill!: Phaser.GameObjects.Rectangle;
  private specialBarFill!: Phaser.GameObjects.Rectangle;
  private dashLabelText!: Phaser.GameObjects.Text;
  private specialLabelText!: Phaser.GameObjects.Text;
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
    if (this.isModalOpen || this.bossDefeated) return;

    if (this.mapManager.getIsTransitioning()) {
      this.player.sprite.setVelocity(0, 0);
      return;
    }

    if (this.player.isDead) {
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

    // 1. Tempo do mapa e transição suave por Portal (apenas fora da Arena do Boss)
    if (!this.mapManager.isBossMapActive()) {
      if (!this.mapManager.isNextMapGateOpen()) {
        this.mapElapsedSeconds += dtSeconds;
        if (this.mapElapsedSeconds >= GAME_SETTINGS.MAP_DURATION_SECONDS) {
          this.openNextMapPassage();
        }
        this.compassText.setVisible(false);
      } else {
        const triggered = this.mapManager.checkPlayerEnteredPortal(
          px,
          py,
          (newMapDef, newSpawnPos, enteredBossArena) => {
            this.onMapSwapCompleted(
              newMapDef.name,
              newSpawnPos,
              enteredBossArena
            );
          }
        );
        if (!triggered) {
          this.updateCompassIndicator(px, py);
        }
      }
    } else {
      this.compassText.setVisible(false);
    }

    // 2. Spawner de inimigos (na Arena do Boss, nascem menos lacaios para focar no Onix)
    this.spawnTimerMs += delta;
    const isBossArena = this.mapManager.isBossMapActive();
    const maxEnemies = isBossArena
      ? 7
      : Math.min(26, 16 + Math.floor(this.runTimeSeconds / 30) * 2);
    const spawnInterval = isBossArena ? 4200 : 2000;

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
      // Assim que o jogador atinge o nível máximo (Nv.10) e escolhe sua última habilidade, inicia o Boss Onix!
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

  // ===================== BOSS ONIX & VITÓRIA =====================

  private triggerBossArenaTransition(): void {
    if (this.bossEncounterStarted) return;
    this.bossEncounterStarted = true;

    if (this.mapManager.isBossMapActive()) {
      this.spawnBossOnix();
      return;
    }

    this.showBanner(
      `🔥 NÍVEL MÁXIMO (${MAX_PLAYER_LEVEL}) ALCANÇADO! ENTRANDO NA ARENA DO BOSS ONIX...`
    );

    this.mapManager.transitionToBossArena((bossMapDef, spawnPos) => {
      this.onMapSwapCompleted(bossMapDef.name, spawnPos, true);
    });
  }

  private spawnBossOnix(): void {
    if (this.bossEnemy && !this.bossEnemy.isDead) return;

    this.bossEncounterStarted = true;
    const bounds = this.mapManager.getCurrentMapBounds();
    const rawBossX = bounds.x + bounds.width * 0.5;
    const rawBossY = bounds.y + bounds.height * 0.44;
    const safeBossPos = this.mapManager.findNearestWalkablePosition(
      rawBossX,
      rawBossY
    );

    const hpMultiplier = 1 + (this.player.level - 1) * 0.12;
    this.bossEnemy = new Enemy(
      this,
      safeBossPos.x,
      safeBossPos.y,
      BOSS_ID,
      hpMultiplier
    );
    this.enemies.push(this.bossEnemy);
    this.enemyGroup.add(this.bossEnemy.sprite);

    // Cura parcial para o confronto final
    this.player.hp = Math.min(
      this.player.maxHp,
      this.player.hp + Math.round(this.player.maxHp * 0.45)
    );

    this.cameras.main.shake(420, 0.008);
    this.bossHudContainer.setVisible(true);
    this.showBanner('👑 DESAFIO FINAL: DERROTE O BOSS ONIX PARA VENCER!');
  }

  private onBossDefeated(): void {
    if (this.bossDefeated) return;
    this.bossDefeated = true;
    this.bossHudContainer.setVisible(false);

    // Elimina lacaios restantes e orbes
    this.clearAllActiveEnemiesAndOrbs();
    this.cameras.main.shake(500, 0.01);
    this.cameras.main.flash(450, 255, 230, 120);

    this.openVictoryModal();
  }

  private openVictoryModal(): void {
    this.isModalOpen = true;
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
    if (!this.isModalOpen) return;

    this.player.learnAbility(id);
    this.pendingAbilityPicks = Math.max(0, this.pendingAbilityPicks - 1);

    if (this.modalContainer) {
      this.modalContainer.destroy();
      this.modalContainer = null;
    }
    this.isModalOpen = false;
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
      .rectangle(0, 0, 520, 340, 0x0b1528, 0.98)
      .setStrokeStyle(4, 0xe63946, 1);

    const title = this.add
      .text(0, -120, '💀 FIM DA JORNADA', {
        fontFamily: 'monospace',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#f87171',
      })
      .setOrigin(0.5);

    const statsTxt = this.add
      .text(
        0,
        -15,
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

    const btn = this.add
      .text(0, 112, '🏠 VOLTAR À TELA INICIAL [ENTER / ESC]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#091326',
        backgroundColor: '#ffcb05',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => this.scene.start('MenuScene'));

    container.add([dim, box, title, statsTxt, btn]);
    this.modalContainer = container;
  }

  // ===================== MAPA & SPAWN =====================

  private openNextMapPassage(): void {
    const nextDef = this.mapManager.spawnNextConnectedMap();
    this.showBanner(
      `🌀 Portal aberto ao NORTE para: ${nextDef.name}! Entre no portal!`
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

  private onMapSwapCompleted(
    newMapName: string,
    newSpawnPos: { x: number; y: number },
    enteredBossArena: boolean
  ): void {
    this.mapElapsedSeconds = 0;
    this.compassText.setVisible(false);

    this.clearAllActiveEnemiesAndOrbs();
    this.player.sprite.setPosition(newSpawnPos.x, newSpawnPos.y);
    this.player.sprite.setVelocity(0, 0);

    if (enteredBossArena) {
      this.spawnBossOnix();
    } else {
      this.showBanner(`📍 Você chegou em: ${newMapName}`);
    }
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
      `${arrow} PORTAL NORTE (${Math.max(0, Math.round(dist / 24))}m)`
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
      } else {
        this.returnToMainMenu();
      }
    });

    kb.on('keydown-ENTER', () => {
      if (this.player.isDead || this.bossDefeated) {
        this.scene.start('MenuScene');
      }
    });

    kb.on('keydown-ONE', () => {
      if (this.isModalOpen && this.currentModalChoices[0]) {
        this.selectModalAbility(this.currentModalChoices[0].id);
      }
    });
    kb.on('keydown-TWO', () => {
      if (this.isModalOpen && this.currentModalChoices[1]) {
        this.selectModalAbility(this.currentModalChoices[1].id);
      }
    });
    kb.on('keydown-THREE', () => {
      if (this.isModalOpen && this.currentModalChoices[2]) {
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

  // ===================== HUD =====================

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
    const topLeft = this.toZoomedHudCoord(14, 12);
    this.hudText = this.add
      .text(topLeft.x, topLeft.y, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: '#091326dd',
        padding: { x: 12, y: 7 },
        lineSpacing: 3,
      })
      .setScrollFactor(0)
      .setScale(topLeft.scale)
      .setDepth(DEPTH.HUD);

    // Barra de XP
    const xpBarPos = this.toZoomedHudCoord(14, 84);
    this.add
      .rectangle(xpBarPos.x, xpBarPos.y, 460, 11, 0x091326, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1.5, 0x38bdf8, 0.9)
      .setScrollFactor(0)
      .setScale(xpBarPos.scale)
      .setDepth(DEPTH.HUD);

    this.xpBarFill = this.add
      .rectangle(xpBarPos.x + 2, xpBarPos.y, 0, 7, 0x38bdf8, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(xpBarPos.scale)
      .setDepth(DEPTH.HUD + 1);

    // Barra de Esquiva (Dash - 2s recarga)
    const dashPos = this.toZoomedHudCoord(14, 104);
    this.add
      .rectangle(dashPos.x, dashPos.y, 222, 16, 0x091326, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1.5, 0x4ade80, 0.9)
      .setScrollFactor(0)
      .setScale(dashPos.scale)
      .setDepth(DEPTH.HUD);

    this.dashBarFill = this.add
      .rectangle(dashPos.x + 2, dashPos.y, 218, 12, 0x4ade80, 0.85)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(dashPos.scale)
      .setDepth(DEPTH.HUD + 1);

    const dashLblPos = this.toZoomedHudCoord(22, 104);
    this.dashLabelText = this.add
      .text(dashLblPos.x, dashLblPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(dashLblPos.scale)
      .setDepth(DEPTH.HUD + 2);

    // Barra de Especial [E / Q]
    const specPos = this.toZoomedHudCoord(248, 104);
    this.add
      .rectangle(specPos.x, specPos.y, 226, 16, 0x091326, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1.5, 0xf59e0b, 0.9)
      .setScrollFactor(0)
      .setScale(specPos.scale)
      .setDepth(DEPTH.HUD);

    this.specialBarFill = this.add
      .rectangle(specPos.x + 2, specPos.y, 0, 12, 0xf59e0b, 0.9)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(specPos.scale)
      .setDepth(DEPTH.HUD + 1);

    const specLblPos = this.toZoomedHudCoord(256, 104);
    this.specialLabelText = this.add
      .text(specLblPos.x, specLblPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setScale(specLblPos.scale)
      .setDepth(DEPTH.HUD + 2);

    // Lista compacta de Habilidades Aprendidas
    const abilPos = this.toZoomedHudCoord(14, 124);
    this.abilitiesSummaryText = this.add
      .text(abilPos.x, abilPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#fde047',
        backgroundColor: '#091326cc',
        padding: { x: 8, y: 3 },
      })
      .setScrollFactor(0)
      .setScale(abilPos.scale)
      .setDepth(DEPTH.HUD);

    // Barra de Vida do Boss Onix (centralizada no topo-inferior do HUD)
    const bossHudPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH / 2, 62);
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

    // Botão de voltar ao Menu Inicial
    const menuBtnPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH - 16, 28);
    const menuBtn = this.add
      .text(menuBtnPos.x, menuBtnPos.y, '🏠 SALVAR & VOLTAR AO MENU [ESC]', {
        fontFamily: 'monospace',
        fontSize: '13.5px',
        fontStyle: 'bold',
        color: '#091326',
        backgroundColor: '#ffcb05',
        padding: { x: 12, y: 7 },
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setScale(menuBtnPos.scale)
      .setDepth(DEPTH.HUD + 2)
      .setInteractive({ useHandCursor: true });

    menuBtn.on('pointerdown', () => this.returnToMainMenu());

    const bannerPos = this.toZoomedHudCoord(GAME_SETTINGS.WIDTH / 2, 156);
    this.bannerText = this.add
      .text(bannerPos.x, bannerPos.y, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
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
    const classDef = this.player.getClassDefinition();
    const specDef = this.player.getSpecialDefinition();

    let mapStatusText: string;
    if (this.mapManager.isBossMapActive()) {
      mapStatusText = '👑 CONFRONTO FINAL: DERROTE ONIX!';
    } else if (this.mapManager.isNextMapGateOpen()) {
      mapStatusText = '🌀 PORTAL ABERTO AO NORTE!';
    } else {
      const remaining = Math.max(
        0,
        Math.ceil(GAME_SETTINGS.MAP_DURATION_SECONDS - this.mapElapsedSeconds)
      );
      mapStatusText = `⏳ Próximo mapa: ${remaining}s [M]`;
    }

    const nextEvoInfo =
      pokeDef.evolvesToId && pokeDef.evolveAtLevel
        ? ` (Evolui Nv.${pokeDef.evolveAtLevel})`
        : ' (Máx)';

    const timeStr = RunHistory.formatTime(this.runTimeSeconds);
    const score = this.computeCurrentScore();

    const xpStatus =
      this.player.level >= MAX_PLAYER_LEVEL
        ? `✨ NÍVEL MÁXIMO (${MAX_PLAYER_LEVEL}/${MAX_PLAYER_LEVEL})`
        : `✨ XP: ${this.player.xp}/${this.player.xpToNextLevel} (Boss no Nv.${MAX_PLAYER_LEVEL})`;

    this.hudText.setText(
      [
        `🗺️ ${mapDef.name}  |  ${mapStatusText}  |  ⏱️ ${timeStr}  |  🏆 ${score} pts`,
        `${classDef.iconSymbol} ${pokeDef.name} Nv.${this.player.level}${nextEvoInfo} [${classDef.title}]  |  ❤️ HP: ${this.player.hp}/${this.player.maxHp}  |  💀 ${this.defeatedCount}`,
        `${xpStatus}  |  ⚔️ Básico: ${pokeDef.attackProfile?.name}`,
      ].join('\n')
    );

    const xpRatio =
      this.player.level >= MAX_PLAYER_LEVEL
        ? 1
        : Phaser.Math.Clamp(
            this.player.xp / Math.max(1, this.player.xpToNextLevel),
            0,
            1
          );
    this.xpBarFill.width = 456 * xpRatio;

    // Atualiza barra de vida do Boss Onix se estiver ativa
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

    // Atualiza barra de Esquiva (Dash - 2s)
    const dashReadyRatio = Phaser.Math.Clamp(
      1 - this.player.dashCooldownRemaining / DASH_COOLDOWN_MS,
      0,
      1
    );
    this.dashBarFill.width = 218 * dashReadyRatio;
    this.dashBarFill.setFillStyle(
      dashReadyRatio >= 1 ? 0x4ade80 : 0x38bdf8,
      0.9
    );
    this.dashLabelText.setText(
      dashReadyRatio >= 1
        ? '💨 [SHIFT] DASH: PRONTO'
        : `💨 [SHIFT] ${(this.player.dashCooldownRemaining / 1000).toFixed(1)}s`
    );

    // Atualiza barra de Especial [E / Q]
    const specRatio = Phaser.Math.Clamp(
      this.player.specialEnergy / SPECIAL_MAX_ENERGY,
      0,
      1
    );
    this.specialBarFill.width = 222 * specRatio;
    this.specialBarFill.setFillStyle(
      specRatio >= 1 ? 0xffcb05 : 0xf59e0b,
      0.95
    );
    this.specialLabelText.setText(
      specRatio >= 1
        ? `${specDef.icon} [E/Q] ${specDef.name}: PRONTO!`
        : `${specDef.icon} [E/Q] ${specDef.name}: ${Math.floor(specRatio * 100)}%`
    );

    // Exibe ícones das habilidades aprendidas
    const learned: string[] = [];
    for (const [id, lvl] of this.player.getAbilityLevels().entries()) {
      if (lvl > 0) {
        learned.push(`${ABILITIES[id].icon}${ABILITIES[id].name} Nv.${lvl}`);
      }
    }
    this.abilitiesSummaryText.setVisible(learned.length > 0);
    if (learned.length > 0) {
      this.abilitiesSummaryText.setText(
        `Habilidades: ${learned.join('  •  ')}`
      );
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
