import Phaser from 'phaser';
import {
  ABILITIES,
  AbilityChoice,
  rollAbilityChoices,
} from '../config/abilities';
import { GAME_SETTINGS } from '../config/gameConfig';
import {
  BOSS_GEODUDE_ID,
  BOSS_ONIX_ID,
  ENEMY_IDS,
  MAP_MINIBOSS_CONFIGS,
  MAX_PLAYER_LEVEL,
} from '../config/pokemonManifest';
import { Enemy } from '../entities/Enemy';
import { Player, SPECIAL_MAX_ENERGY } from '../entities/Player';
import { AttackVisualManager } from '../systems/AttackVisualManager';
import { DEPTH } from '../systems/depth';
import { MapManager } from '../systems/MapManager';
import { PokemonAnimationManager } from '../systems/PokemonAnimationManager';
import { RunHistory } from '../systems/RunHistory';

/**
 * Zoom aproximado no jogador para dar sensação de imersão e amplitude ao mapa.
 */
const CAMERA_ZOOM = 1.62;

interface XpOrb {
  gfx: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  xpAmount: number;
  isGolden?: boolean;
  ageMs: number;
}

interface ModalCardSlot {
  choice: AbilityChoice;
  container: Phaser.GameObjects.Container;
  cardBg: Phaser.GameObjects.Rectangle;
  glowRect: Phaser.GameObjects.Rectangle;
  footerPill: Phaser.GameObjects.Text;
  themeColor: number;
  themeHex: string;
  baseY: number;
}

export class GameScene extends Phaser.Scene {
  private selectedPokemonId = '0025';
  private mapManager!: MapManager;
  private player!: Player;
  private enemies: Enemy[] = [];
  private xpOrbs: XpOrb[] = [];
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private processedDeaths = new WeakSet<Enemy>();

  private currentMiniboss: Enemy | null = null;
  private minibossSpawned = false;
  private minibossDefeated = false;
  private minibossKillsInMap = 0;

  private bossPhase: 1 | 2 = 1;
  private bossEnemy: Enemy | null = null;
  private bossEncounterStarted = false;
  private bossDefeated = false;

  private runTimeSeconds = 0;
  private mapElapsedSeconds = 0;
  private spawnTimerMs = 0;
  private defeatedCount = 0;
  private pendingAbilityPicks = 0;
  private isModalOpen = false;
  private activeModalType:
    | 'none'
    | 'ability'
    | 'pause'
    | 'gameover'
    | 'victory' = 'none';
  private runSaved = false;

  // Raiz da HUD 1:1 em coordenadas de tela (1280x720)
  private hudRoot!: Phaser.GameObjects.Container;
  private hudBackingGfx!: Phaser.GameObjects.Graphics;
  private lastHudElementColor = -1;
  private hudPortraitFrame!: Phaser.GameObjects.Rectangle;
  private hudPortraitImage!: Phaser.GameObjects.Image;
  private hudLevelBadgeText!: Phaser.GameObjects.Text;

  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpBarShine!: Phaser.GameObjects.Rectangle;
  private shieldBarFill!: Phaser.GameObjects.Rectangle;
  private hpLabelText!: Phaser.GameObjects.Text;

  private specialBarFill!: Phaser.GameObjects.Rectangle;
  private specialBarShine!: Phaser.GameObjects.Rectangle;
  private specialLabelText!: Phaser.GameObjects.Text;
  private hudUltIcon!: Phaser.GameObjects.Image;

  private dashBarFill!: Phaser.GameObjects.Rectangle;
  private dashBarShine!: Phaser.GameObjects.Rectangle;
  private dashLabelText!: Phaser.GameObjects.Text;

  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private xpLabelText!: Phaser.GameObjects.Text;

  private abilitySlotsContainer!: Phaser.GameObjects.Container;
  private lastAbilitySignature = '';

  private centerTimerText!: Phaser.GameObjects.Text;
  private mapSubStatusText!: Phaser.GameObjects.Text;
  private rightStatsText!: Phaser.GameObjects.Text;
  private bannerContainer!: Phaser.GameObjects.Container;
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private bannerText!: Phaser.GameObjects.Text;
  private compassText!: Phaser.GameObjects.Text;

  // HUD da Barra de Vida do Boss Onix
  private bossHudContainer!: Phaser.GameObjects.Container;
  private bossHpBarFill!: Phaser.GameObjects.Rectangle;
  private bossHpText!: Phaser.GameObjects.Text;

  // Controle de Modal & Seleção em 2 Etapas (Selecionar -> Confirmar)
  private modalContainer: Phaser.GameObjects.Container | null = null;
  private currentModalChoices: AbilityChoice[] = [];
  private modalCardSlots: ModalCardSlot[] = [];
  private selectedModalIndex: number | null = null;
  private confirmBtnContainer: Phaser.GameObjects.Container | null = null;
  private confirmBtnLabel: Phaser.GameObjects.Text | null = null;

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
    this.currentMiniboss = null;
    this.minibossSpawned = false;
    this.minibossDefeated = false;
    this.minibossKillsInMap = 0;
    this.bossPhase = 1;
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
    this.modalCardSlots = [];
    this.selectedModalIndex = null;
    this.confirmBtnContainer = null;
    this.confirmBtnLabel = null;
    this.lastHudElementColor = -1;
    this.lastAbilitySignature = '';
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

    // Colisão do Jogador com o Cenário:
    // - Pokémons de Água (Squirtle/Wartortle/Blastoise) podem entrar nos lagos e nadar!
    // - Pokémons Voadores (Charizard) podem voar livremente sobre lagos e casas!
    // - Demais tipos de Pokémon são rigorosamente bloqueados por lagos e casas!
    this.physics.add.collider(
      this.player.sprite,
      this.mapManager.getObstaclesGroup(),
      undefined,
      (_playerObj, zoneObj) => {
        const type = (zoneObj as Phaser.GameObjects.Zone).getData('obstacleType');
        if (type === 'water') {
          if (this.player.canSwim() || this.player.canFly()) return false;
          return true;
        }
        if (type === 'building') {
          if (this.player.canFly()) return false;
          return true;
        }
        return true;
      }
    );

    // Colisão dos Inimigos com o Cenário:
    // - Inimigos Voadores (Zubat) podem passar sobre lagos e casas!
    // - Inimigos Terrestres (Rattata, Onix) são bloqueados por lagos e casas!
    this.physics.add.collider(
      this.enemyGroup,
      this.mapManager.getObstaclesGroup(),
      undefined,
      (enemySpriteObj, zoneObj) => {
        const enemy = (enemySpriteObj as any).enemyRef as Enemy;
        const isFlying = enemy ? enemy.canFly() : false;
        const type = (zoneObj as Phaser.GameObjects.Zone).getData('obstacleType');
        if (isFlying) {
          if (type === 'water' || type === 'building') return false;
        }
        return true;
      }
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
    this.mapManager.update(delta);

    const actions = this.player.update(delta);
    if (actions.specialUsed) {
      const spec = this.player.getSpecialDefinition();
      this.showBanner(`${spec.icon} ESPECIAL: ${spec.name.toUpperCase()}!`);
    } else if (actions.specialNotReady) {
      this.showBanner(
        `⚡ Energia insuficiente para a ULT (${Math.floor(this.player.specialEnergy)}/${SPECIAL_MAX_ENERGY})`
      );
    }

        const px = this.player.sprite.x;
    const py = this.player.sprite.y;

    // Atualiza estado de nado exclusivo para Pokémons aquáticos
    if (this.player.canSwim()) {
      const inWater = this.mapManager.isWaterAt(px, py);
      this.player.setSwimming(inWater);
    }

    // 1. Tempo do mapa, Miniboss e transição conectada com pontezinha
    if (!this.mapManager.isBossMapActive()) {
      // Condição de Miniboss: surge aos 24s de exploração OU após 14 abates no mapa
      if (!this.minibossSpawned) {
        this.mapElapsedSeconds += dtSeconds;
        if (this.mapElapsedSeconds >= 24 || this.minibossKillsInMap >= 14) {
          this.minibossSpawned = true;
          this.spawnCurrentMapMiniboss();
        }
      }

      // A passagem só é aberta e apontada pela bússola após derrotar o Miniboss do mapa
      if (this.minibossDefeated && this.mapManager.isNextMapGateOpen()) {
        const enteredMapDef = this.mapManager.checkPlayerEnteredNextMap(px, py);
        if (enteredMapDef) {
          this.onPlayerCompletedMapTransition(enteredMapDef.name);
        } else {
          this.updateCompassIndicator(px, py);
        }
      } else {
        this.compassText.setVisible(false);
      }
    } else {
      this.compassText.setVisible(false);
    }

    // 2. Spawner de inimigos intensificado com ondas dinâmicas
    this.spawnTimerMs += delta;
    const isBossActive = Boolean(this.bossEnemy && !this.bossEnemy.isDead);
    const maxEnemies = isBossActive
      ? 8
      : Math.min(55, 30 + Math.floor(this.runTimeSeconds / 20) * 3);
    const spawnInterval = isBossActive
      ? 3800
      : Math.max(750, 1600 - Math.floor(this.runTimeSeconds / 15) * 80);

    if (this.spawnTimerMs >= spawnInterval && this.enemies.length < maxEnemies) {
      this.spawnTimerMs = 0;
      const countToSpawn = Math.min(
        maxEnemies - this.enemies.length,
        1 + Math.floor(this.runTimeSeconds / 45)
      );
      for (let s = 0; s < countToSpawn; s++) {
        this.spawnWildPokemon();
      }
    }

    // 3. Atualiza inimigos, despawn por distância e verificação de dano de contato
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.isDead) return false;

      const distToPlayer = Phaser.Math.Distance.Between(
        px,
        py,
        enemy.sprite.x,
        enemy.sprite.y
      );

      // Despawn por distância: inimigos comuns somem se ficarem muito distantes (>640px)
      const DESPAWN_DISTANCE = 640;
      if (!enemy.isBoss && !enemy.isMiniboss && distToPlayer > DESPAWN_DISTANCE) {
        enemy.destroy();
        this.spawnWildPokemon();
        return false;
      }

      // Miniboss persegue ativamente o jogador se ficar longe (>750px)
      if (enemy.isMiniboss && distToPlayer > 750) {
        const repAngle = Phaser.Math.Angle.Between(px, py, enemy.sprite.x, enemy.sprite.y);
        const repX = px + Math.cos(repAngle) * 320;
        const repY = py + Math.sin(repAngle) * 320;
        const safePos = this.mapManager.findNearestWalkablePosition(repX, repY);
        enemy.sprite.setPosition(safePos.x, safePos.y);
      }

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

      // Inimigos dormindo ou incapacitados NÃO causam dano de contato!
      if (!enemy.isDead && !enemy.isIncapacitated() && !enemy.isSleeping()) {
        if (distToPlayer <= enemy.getContactRadius()) {
          const contactDmg = enemy.isBoss
            ? 22
            : enemy.isMiniboss
            ? 14 + this.mapManager.mapsCleared * 2
            : 8 + this.mapManager.mapsCleared * 2;
          this.player.receiveDamage(contactDmg, enemy);
        }
      }

      return !enemy.isDead;
    });

    // 4. Atualiza Orbes de XP
    this.updateXpOrbs(delta, px, py);

    // 5. Modal de escolha de Habilidade ou Transição Nível 10 para Boss
    if (this.pendingAbilityPicks > 0 && !this.isModalOpen) {
      this.openAbilityChoiceModal();
    } else if (
      (this.player.level >= MAX_PLAYER_LEVEL ||
        this.mapManager.mapsCleared >= 6) &&
      !this.bossEncounterStarted &&
      !this.isModalOpen
    ) {
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

    // 1. Chefes da Arena Final (Fase 1: Geodude -> Fase 2: Onix)
    if (enemy.isBoss) {
      if (this.bossPhase === 1) {
        // Geodude derrotado! Dropa 10 orbes dourados de XP e inicia o tremor de terra
        for (let i = 0; i < 10; i++) {
          const ox = x + Phaser.Math.Between(-40, 40);
          const oy = y + Phaser.Math.Between(-40, 40);
          const orbGfx = this.add
            .circle(ox, oy, 8, 0xffd700, 1)
            .setStrokeStyle(2.5, 0xfffbeb, 1)
            .setDepth(DEPTH.XP_ORB);
          this.xpOrbs.push({
            gfx: orbGfx,
            x: ox,
            y: oy,
            xpAmount: 22,
            isGolden: true,
            ageMs: 0,
          });
        }

        this.bossEnemy = null;
        this.cameras.main.shake(650, 0.012);
        this.cameras.main.flash(450, 255, 230, 120);
        this.showBanner('💥 GEODUDE DERROTADO! O SOLO ESTÁ RACHANDO... ONIX ESTÁ DESPERTANDO!');

        this.time.delayedCall(2200, () => {
          if (this.player.isDead) return;
          this.bossPhase = 2;
          const { bossSpawn } = this.mapManager.getBossArenaSpawns();
          this.spawnBossOnix(bossSpawn.x, bossSpawn.y);
        });
        return;
      } else {
        // Fase 2: Onix derrotado! Vitória definitiva
        this.onBossDefeated();
        return;
      }
    }

    // 2. Miniboss do Mapa Derrotado: Desbloqueia a ponte para o próximo mapa!
    if (enemy === this.currentMiniboss || enemy.isMiniboss) {
      this.minibossDefeated = true;
      this.currentMiniboss = null;

      // Dropa recompensa substancial de 5 orbes dourados
      for (let i = 0; i < 5; i++) {
        const ox = x + Phaser.Math.Between(-32, 32);
        const oy = y + Phaser.Math.Between(-32, 32);
        const orbGfx = this.add
          .circle(ox, oy, 7.5, 0xffd700, 1)
          .setStrokeStyle(2.5, 0xfffbeb, 1)
          .setDepth(DEPTH.XP_ORB);
        this.xpOrbs.push({
          gfx: orbGfx,
          x: ox,
          y: oy,
          xpAmount: 20,
          isGolden: true,
          ageMs: 0,
        });
      }

      this.cameras.main.shake(450, 0.008);
      this.showBanner('🎉 MINIBOSS DERROTADO! A PASSAGEM PARA O PRÓXIMO MAPA FOI DESBLOQUEADA!');
      this.openNextMapPassage();
      return;
    }

    // 3. Inimigos Comuns: orbes rebalanceados para maior desafio e progressão consistente
    this.minibossKillsInMap++;

    const bountyLvl = this.player.getAbilityLevel('bounty');
    const isGolden = bountyLvl > 0 && Math.random() < bountyLvl * 0.14;

    const orbGfx = isGolden
      ? this.add
          .circle(x, y, 7.5, 0xffd700, 1)
          .setStrokeStyle(2.5, 0xfffbeb, 1)
          .setDepth(DEPTH.XP_ORB)
      : this.add
          .circle(x, y, 6, 0x38bdf8, 1)
          .setStrokeStyle(2, 0xe0f2fe, 1)
          .setDepth(DEPTH.XP_ORB);

    this.xpOrbs.push({
      gfx: orbGfx,
      x,
      y,
      xpAmount: isGolden ? 20 : 7,
      isGolden,
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
        if (orb.isGolden) {
          this.player.heal(3);
        }
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
    this.bossPhase = 1;

    this.clearAllActiveEnemiesAndOrbs();
    this.compassText.setVisible(false);

    const { playerSpawn, bossSpawn } = this.mapManager.teleportToBossArena();
    this.player.teleportTo(playerSpawn.x, playerSpawn.y);
    this.cameras.main.flash(380, 255, 255, 255);

    // Inicia a Fase 1 com o Geodude
    this.spawnBossGeodude(bossSpawn.x, bossSpawn.y);
  }

  private spawnBossGeodude(bossX: number, bossY: number): void {
    if (this.bossEnemy && !this.bossEnemy.isDead) return;

    const hpMultiplier = 1 + (this.player.level - 1) * 0.12;
    this.bossEnemy = new Enemy(this, bossX, bossY, BOSS_GEODUDE_ID, hpMultiplier);
    this.enemies.push(this.bossEnemy);
    this.enemyGroup.add(this.bossEnemy.sprite);

    this.player.hp = Math.min(
      this.player.maxHp,
      this.player.hp + Math.round(this.player.maxHp * 0.5)
    );

    this.cameras.main.shake(420, 0.008);
    this.bossHudContainer.setVisible(true);
    this.showBanner('⚔️ CHEFE 1/2: GEODUDE DESAFIA VOCÊ! DERROTE-O!');
  }

  private spawnBossOnix(bossX: number, bossY: number): void {
    if (this.bossEnemy && !this.bossEnemy.isDead) return;

    const hpMultiplier = 1 + (this.player.level - 1) * 0.15;
    this.bossEnemy = new Enemy(this, bossX, bossY, BOSS_ONIX_ID, hpMultiplier);
    this.enemies.push(this.bossEnemy);
    this.enemyGroup.add(this.bossEnemy.sprite);

    this.player.hp = Math.min(
      this.player.maxHp,
      this.player.hp + Math.round(this.player.maxHp * 0.4)
    );

    this.cameras.main.shake(550, 0.012);
    this.bossHudContainer.setVisible(true);
    this.showBanner('👑 CHEFE FINAL 2/2: ONIX GIGANTE DESPERTOU! DERROTE-O PARA VENCER!');
  }

  private spawnCurrentMapMiniboss(): void {
    if (this.currentMiniboss && !this.currentMiniboss.isDead) return;

    const currentDef = this.mapManager.getCurrentMapDefinition();
    const cfg = MAP_MINIBOSS_CONFIGS[currentDef.key] ?? {
      id: '0002',
      name: 'Ivysaur Alfa',
      title: '🌱 Guardião da Floresta',
      element: 'planta',
    };

    const bounds = this.mapManager.getCurrentMapBounds();
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = 250;
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

    const hpMultiplier =
      (1 + this.mapManager.mapsCleared * 0.35 + (this.player.level - 1) * 0.12) * 1.2;

    this.currentMiniboss = new Enemy(
      this,
      spawnPos.x,
      spawnPos.y,
      cfg.id,
      hpMultiplier,
      true // isMiniboss = true
    );
    this.enemies.push(this.currentMiniboss);
    this.enemyGroup.add(this.currentMiniboss.sprite);

    this.cameras.main.shake(380, 0.007);
    this.showBanner(`⚠️ MINIBOSS APROXIMANDO-SE: ${cfg.title}! Derrote-o para desbloquear a ponte!`);
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

    const panelGfx = this.add.graphics();
    panelGfx.fillStyle(0x000000, 0.45);
    panelGfx.fillRoundedRect(-256, -174, 512, 356, 16);
    panelGfx.fillStyle(0x091324, 0.97);
    panelGfx.fillRoundedRect(-252, -172, 504, 344, 14);
    panelGfx.fillStyle(0xffffff, 0.04);
    panelGfx.fillRoundedRect(-248, -168, 496, 76, 12);
    panelGfx.lineStyle(3, 0xffcb05, 0.95);
    panelGfx.strokeRoundedRect(-252, -172, 504, 344, 14);
    panelGfx.lineStyle(1, 0x38bdf8, 0.35);
    panelGfx.strokeRoundedRect(-244, -164, 488, 328, 10);

    const title = this.add
      .text(0, -124, '⏸  JOGO PAUSADO', {
        fontFamily: 'monospace',
        fontSize: '25px',
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
        -88,
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
        .rectangle(
          0,
          y,
          414,
          48,
          Phaser.Display.Color.HexStringToColor(bgHex).color,
          0.96
        )
        .setStrokeStyle(2.5, strokeColor, 1)
        .setInteractive({ useHandCursor: true });

      const btnTxt = this.add
        .text(0, y, label, {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: textHex,
        })
        .setOrigin(0.5);

      btnBg.on('pointerover', () => {
        btnBg.setStrokeStyle(3.5, 0xffffff, 1);
        btnBg.setScale(1.02);
      });
      btnBg.on('pointerout', () => {
        btnBg.setStrokeStyle(2.5, strokeColor, 1);
        btnBg.setScale(1);
      });
      btnBg.on('pointerdown', onClick);

      return [btnBg, btnTxt];
    };

    const resumeBtn = createOptionBtn(
      -22,
      '▶️  RETOMAR AO JOGO [ESC / ENTER]',
      '#22c55e',
      '#052e16',
      0x86efac,
      () => this.resumeFromPauseModal()
    );

    const restartBtn = createOptionBtn(
      42,
      '🔄  REINICIAR A RUN (MESMO POKÉMON) [R]',
      '#38bdf8',
      '#082f49',
      0xbae6fd,
      () => this.restartRunSamePokemon()
    );

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
      panelGfx,
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
      .rectangle(0, 0, 580, 380, 0x091324, 0.98)
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

  // ===================== MODAL DE HABILIDADES (SELECIONAR -> CONFIRMAR) =====================

  private openAbilityChoiceModal(): void {
    const pokeDef = this.player.getPokemonDefinition();
    const element = pokeDef.attackProfile!.element;
    const choices = rollAbilityChoices(
      this.player.getAbilityLevels(),
      element,
      3
    );

    if (choices.length === 0) {
      this.pendingAbilityPicks = 0;
      return;
    }

    this.isModalOpen = true;
    this.activeModalType = 'ability';
    this.currentModalChoices = choices;
    this.modalCardSlots = [];
    this.selectedModalIndex = null;
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
      0.82
    );

    const headerPlate = this.add.graphics();
    headerPlate.fillStyle(0x091324, 0.95);
    headerPlate.fillRoundedRect(-370, -296, 740, 82, 12);
    headerPlate.lineStyle(2, 0xffcb05, 0.85);
    headerPlate.strokeRoundedRect(-370, -296, 740, 82, 12);

    const title = this.add
      .text(
        0,
        -269,
        `⬆️ NÍVEL ${this.player.level}! APRIMORE ${pokeDef.name.toUpperCase()}`,
        {
          fontFamily: 'monospace',
          fontSize: '23px',
          fontStyle: 'bold',
          color: '#ffcb05',
          stroke: '#000000',
          strokeThickness: 5,
        }
      )
      .setOrigin(0.5);

    const subtitle = this.add
      .text(
        0,
        -236,
        '1º Selecione uma habilidade (Clique ou [1] [2] [3])  •  2º Clique em CONFIRMAR',
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cbd5e1',
        }
      )
      .setOrigin(0.5);

    container.add([dim, headerPlate, title, subtitle]);

    const cardW = 314;
    const cardH = 348;
    const gap = 22;
    const startX = -((choices.length - 1) * (cardW + gap)) / 2;
    const baseY = -12;

    choices.forEach((choice, idx) => {
      const def = ABILITIES[choice.id];
      const nextLvl = choice.currentLevel + 1;
      const isAct = def.kind === 'active';
      const isUnique = Boolean(def.isUnique);

      const themeColor = isUnique
        ? pokeDef.attackProfile!.elementColor
        : isAct
          ? 0xf59e0b
          : 0x38bdf8;
      const themeHex = isUnique
        ? '#fde047'
        : isAct
          ? '#fbbf24'
          : '#38bdf8';
      const cx = startX + idx * (cardW + gap);

      const cardContainer = this.add.container(cx, baseY);

      const glowRect = this.add
        .rectangle(0, 0, cardW + 10, cardH + 10, 0xffcb05, 0)
        .setStrokeStyle(3.5, 0xffcb05, 0);

      const cardBg = this.add
        .rectangle(0, 0, cardW, cardH, 0x091426, 0.98)
        .setStrokeStyle(3, themeColor, 0.9)
        .setInteractive({ useHandCursor: true });

      const innerTrim = this.add
        .rectangle(0, 0, cardW - 10, cardH - 10, 0x000000, 0)
        .setStrokeStyle(1, 0xffffff, 0.12);

      const kindBanner = this.add
        .rectangle(0, -cardH / 2 + 26, cardW - 16, 34, themeColor, 0.25)
        .setStrokeStyle(1.5, themeColor, 0.95);

      const bannerLabel = isUnique
        ? `★ EXCLUSIVA ${pokeDef.attackProfile!.elementLabel.toUpperCase()} • ${isAct ? 'ATIVA' : 'PASSIVA'}`
        : isAct
          ? '⚔️ HABILIDADE ATIVA'
          : '🛡️ HABILIDADE PASSIVA';

      const kindText = this.add
        .text(0, -cardH / 2 + 26, bannerLabel, {
          fontFamily: 'monospace',
          fontSize: isUnique ? '11.5px' : '12.5px',
          fontStyle: 'bold',
          color: themeHex,
        })
        .setOrigin(0.5);

      const iconHalo = this.add
        .circle(0, -68, 38, themeColor, 0.16)
        .setStrokeStyle(2, themeColor, 0.75);

      const iconKey = AttackVisualManager.getAbilityIconKey(choice.id);
      let iconObj: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
      if (this.textures.exists(iconKey)) {
        iconObj = this.add.image(0, -68, iconKey).setDisplaySize(54, 54);
      } else {
        iconObj = this.add
          .text(0, -68, def.icon, {
            fontFamily: 'monospace',
            fontSize: '32px',
          })
          .setOrigin(0.5);
      }

      const nameTxt = this.add
        .text(0, -8, def.name.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      const lvlTxt = this.add
        .text(
          0,
          18,
          choice.currentLevel === 0
            ? `NOVO! (Nível 1/${def.maxLevel})`
            : `Nível ${choice.currentLevel} ➔ Nível ${nextLvl}/${def.maxLevel}`,
          {
            fontFamily: 'monospace',
            fontSize: '12.5px',
            fontStyle: 'bold',
            color: '#4ade80',
          }
        )
        .setOrigin(0.5);

      const descTxt = this.add
        .text(0, 76, def.describe(nextLvl), {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#e2e8f0',
          align: 'center',
          wordWrap: { width: cardW - 36 },
          lineSpacing: 4,
        })
        .setOrigin(0.5);

      const footerPill = this.add
        .text(0, cardH / 2 - 24, `[Tecla ${idx + 1}] Selecionar`, {
          fontFamily: 'monospace',
          fontSize: '12.5px',
          fontStyle: 'bold',
          color: '#e2e8f0',
          backgroundColor: '#1e293b',
          padding: { x: 14, y: 5 },
        })
        .setOrigin(0.5);

      cardBg.on('pointerover', () => {
        if (this.selectedModalIndex !== idx) {
          cardBg.setStrokeStyle(3.5, 0xffffff, 0.95);
        }
      });
      cardBg.on('pointerout', () => {
        if (this.selectedModalIndex !== idx) {
          cardBg.setStrokeStyle(3, themeColor, 0.9);
        }
      });
      cardBg.on('pointerdown', () => {
        this.highlightModalAbilityCard(idx);
      });

      cardContainer.add([
        glowRect,
        cardBg,
        innerTrim,
        kindBanner,
        kindText,
        iconHalo,
        iconObj,
        nameTxt,
        lvlTxt,
        descTxt,
        footerPill,
      ]);

      container.add(cardContainer);
      this.modalCardSlots.push({
        choice,
        container: cardContainer,
        cardBg,
        glowRect,
        footerPill,
        themeColor,
        themeHex,
        baseY,
      });
    });

    // Botão de Confirmação (aparece assim que o jogador seleciona uma habilidade!)
    const confirmContainer = this.add
      .container(0, 224)
      .setVisible(false);

    const confirmShadow = this.add.rectangle(0, 4, 434, 54, 0x000000, 0.45);
    const confirmBg = this.add
      .rectangle(0, 0, 430, 52, 0x22c55e, 1)
      .setStrokeStyle(3, 0xfef08a, 1)
      .setInteractive({ useHandCursor: true });

    const confirmShine = this.add
      .rectangle(0, -13, 422, 16, 0xffffff, 0.22);

    const confirmTxt = this.add
      .text(0, 0, '✅ CONFIRMAR HABILIDADE [ENTER]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#052e16',
      })
      .setOrigin(0.5);

    confirmBg.on('pointerover', () => {
      confirmBg.setFillStyle(0x4ade80, 1);
      confirmContainer.setScale(1.03);
    });
    confirmBg.on('pointerout', () => {
      confirmBg.setFillStyle(0x22c55e, 1);
      confirmContainer.setScale(1);
    });
    confirmBg.on('pointerdown', () => this.confirmSelectedModalAbility());

    confirmContainer.add([confirmShadow, confirmBg, confirmShine, confirmTxt]);
    container.add(confirmContainer);

    this.confirmBtnContainer = confirmContainer;
    this.confirmBtnLabel = confirmTxt;
    this.modalContainer = container;
  }

  private highlightModalAbilityCard(index: number): void {
    if (
      !this.isModalOpen ||
      this.activeModalType !== 'ability' ||
      index < 0 ||
      index >= this.modalCardSlots.length
    ) {
      return;
    }

    this.selectedModalIndex = index;

    this.modalCardSlots.forEach((slot, idx) => {
      const isSelected = idx === index;
      this.tweens.killTweensOf(slot.container);

      if (isSelected) {
        slot.cardBg.setStrokeStyle(4.5, 0xffcb05, 1);
        slot.glowRect.setFillStyle(0xffcb05, 0.12);
        slot.glowRect.setStrokeStyle(3.5, 0xffcb05, 0.95);
        slot.footerPill.setText('✓ SELECIONADA');
        slot.footerPill.setStyle({
          color: '#091326',
          backgroundColor: '#ffcb05',
        });
        slot.container.setAlpha(1);
        this.tweens.add({
          targets: slot.container,
          y: slot.baseY - 12,
          scaleX: 1.035,
          scaleY: 1.035,
          duration: 160,
          ease: 'Back.easeOut',
        });
      } else {
        slot.cardBg.setStrokeStyle(2.5, slot.themeColor, 0.72);
        slot.glowRect.setFillStyle(0xffcb05, 0);
        slot.glowRect.setStrokeStyle(3.5, 0xffcb05, 0);
        slot.footerPill.setText(`[Tecla ${idx + 1}] Selecionar`);
        slot.footerPill.setStyle({
          color: '#cbd5e1',
          backgroundColor: '#1e293b',
        });
        slot.container.setAlpha(0.86);
        this.tweens.add({
          targets: slot.container,
          y: slot.baseY,
          scaleX: 0.975,
          scaleY: 0.975,
          duration: 160,
          ease: 'Sine.easeOut',
        });
      }
    });

    if (this.confirmBtnContainer && this.confirmBtnLabel) {
      const chosenDef = ABILITIES[this.modalCardSlots[index].choice.id];
      this.confirmBtnLabel.setText(
        `✅ CONFIRMAR: ${chosenDef.name.toUpperCase()} [ENTER]`
      );
      if (!this.confirmBtnContainer.visible) {
        this.confirmBtnContainer.setVisible(true);
        this.confirmBtnContainer.setScale(0.9);
        this.tweens.add({
          targets: this.confirmBtnContainer,
          scaleX: 1,
          scaleY: 1,
          duration: 160,
          ease: 'Back.easeOut',
        });
      }
    }
  }

  private confirmSelectedModalAbility(): void {
    if (
      !this.isModalOpen ||
      this.activeModalType !== 'ability' ||
      this.selectedModalIndex === null
    ) {
      return;
    }

    const choice = this.currentModalChoices[this.selectedModalIndex];
    if (!choice) return;
    const id = choice.id;

    this.player.learnAbility(id);
    this.pendingAbilityPicks = Math.max(0, this.pendingAbilityPicks - 1);

    if (this.modalContainer) {
      this.modalContainer.destroy();
      this.modalContainer = null;
    }
    this.isModalOpen = false;
    this.activeModalType = 'none';
    this.currentModalChoices = [];
    this.modalCardSlots = [];
    this.selectedModalIndex = null;
    this.confirmBtnContainer = null;
    this.confirmBtnLabel = null;

    const def = ABILITIES[id];
    const newLvl = this.player.getAbilityLevel(id);
    this.showBanner(`✨ ${def.icon} ${def.name} (Nv.${newLvl}) confirmado!`);

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
      .rectangle(0, 0, 520, 360, 0x091324, 0.98)
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
    this.showBanner(`🌉 Pontezinha aberta ao NORTE para: ${nextDef.name}!`);
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
    this.minibossSpawned = false;
    this.minibossDefeated = false;
    this.currentMiniboss = null;
    this.minibossKillsInMap = 0;
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
      } else if (
        this.activeModalType === 'ability' &&
        this.selectedModalIndex !== null
      ) {
        this.confirmSelectedModalAbility();
      }
    });

    kb.on('keydown-SPACE', () => {
      if (
        this.activeModalType === 'ability' &&
        this.selectedModalIndex !== null
      ) {
        this.confirmSelectedModalAbility();
      }
    });

    kb.on('keydown-LEFT', () => {
      if (
        this.activeModalType === 'ability' &&
        this.modalCardSlots.length > 0
      ) {
        const next =
          this.selectedModalIndex === null
            ? 0
            : (this.selectedModalIndex - 1 + this.modalCardSlots.length) %
              this.modalCardSlots.length;
        this.highlightModalAbilityCard(next);
      }
    });

    kb.on('keydown-RIGHT', () => {
      if (
        this.activeModalType === 'ability' &&
        this.modalCardSlots.length > 0
      ) {
        const next =
          this.selectedModalIndex === null
            ? 0
            : (this.selectedModalIndex + 1) % this.modalCardSlots.length;
        this.highlightModalAbilityCard(next);
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
        this.highlightModalAbilityCard(0);
      }
    });
    kb.on('keydown-TWO', () => {
      if (
        this.activeModalType === 'ability' &&
        this.currentModalChoices[1]
      ) {
        this.highlightModalAbilityCard(1);
      }
    });
    kb.on('keydown-THREE', () => {
      if (
        this.activeModalType === 'ability' &&
        this.currentModalChoices[2]
      ) {
        this.highlightModalAbilityCard(2);
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

  // ===================== HUD PROFISSIONAL COM FUNDO DISCRETO =====================

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

  private drawTopLeftBackingPlate(elementColor: number): void {
    this.hudBackingGfx.clear();

    // Sombra suave projetada
    this.hudBackingGfx.fillStyle(0x000000, 0.36);
    this.hudBackingGfx.fillRoundedRect(10, 11, 304, 102, 11);

    // Placa escura translúcida discreta atrás do retrato + barras de vida/ULT/Dash/XP
    this.hudBackingGfx.fillStyle(0x07101d, 0.76);
    this.hudBackingGfx.fillRoundedRect(8, 8, 304, 102, 10);

    // Reflexo vítreo superior discreto
    this.hudBackingGfx.fillStyle(0xffffff, 0.045);
    this.hudBackingGfx.fillRoundedRect(10, 10, 300, 38, 8);

    // Friso lateral esquerdo na cor elemental do Pokémon
    this.hudBackingGfx.fillStyle(elementColor, 0.95);
    this.hudBackingGfx.fillRoundedRect(8, 16, 4, 86, 2);

    // Contorno metálico escuro discreto
    this.hudBackingGfx.lineStyle(1.5, 0x334155, 0.85);
    this.hudBackingGfx.strokeRoundedRect(8, 8, 304, 102, 10);
    this.hudBackingGfx.lineStyle(1, 0xffffff, 0.08);
    this.hudBackingGfx.strokeRoundedRect(10, 10, 300, 98, 9);
  }

  private createHud(): void {
    const origin = this.toZoomedHudCoord(0, 0);
    this.hudRoot = this.add
      .container(origin.x, origin.y)
      .setScrollFactor(0)
      .setScale(origin.scale)
      .setDepth(DEPTH.HUD);

    const pokeDef = this.player.getPokemonDefinition();
    const elemColor = pokeDef.attackProfile!.elementColor;

    // 1. Placa de fundo discreta atrás da área de vida e retrato (canto superior esquerdo)
    this.hudBackingGfx = this.add.graphics();
    this.drawTopLeftBackingPlate(elemColor);
    this.lastHudElementColor = elemColor;

    // 2. Retrato estilo PMD com moldura dupla e badge de Nível
    const portraitShadow = this.add.rectangle(50, 49, 70, 70, 0x000000, 0.45);
    this.hudPortraitFrame = this.add
      .rectangle(49, 48, 66, 66, 0x0b1528, 0.98)
      .setStrokeStyle(2.5, 0xf8fafc, 1);

    const initialPortraitKey = PokemonAnimationManager.getPortraitKey(
      pokeDef.id,
      'Normal'
    );
    this.hudPortraitImage = this.add
      .image(49, 48, initialPortraitKey)
      .setDisplaySize(60, 60);

    const lvlPillBg = this.add
      .rectangle(49, 80, 52, 15, 0x091326, 0.96)
      .setStrokeStyle(1.2, 0xffcb05, 0.95);
    this.hudLevelBadgeText = this.add
      .text(49, 80, 'Nv.1', {
        fontFamily: 'monospace',
        fontSize: '10.5px',
        fontStyle: 'bold',
        color: '#ffcb05',
      })
      .setOrigin(0.5);

    // 3. Barra de HP principal (x: 90, y: 26, largura: 210, altura: 21)
    const barX = 90;
    const barW = 210;

    const hpTrack = this.add
      .rectangle(barX, 26, barW, 21, 0x0b1410, 0.95)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1.2, 0x1e293b, 1);

    this.hpBarFill = this.add
      .rectangle(barX + 1, 26, barW - 2, 19, 0x57d131, 1)
      .setOrigin(0, 0.5);

    this.hpBarShine = this.add
      .rectangle(barX + 1, 20, barW - 2, 5, 0xffffff, 0.24)
      .setOrigin(0, 0.5);

    this.shieldBarFill = this.add
      .rectangle(barX + 1, 33, 0, 4, 0x38bdf8, 0.95)
      .setOrigin(0, 0.5);

    this.hpLabelText = this.add
      .text(barX + 9, 26, '', {
        fontFamily: 'monospace',
        fontSize: '13.5px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);

    // 4. Barra de ULT (y: 51, altura: 17) com mini-ícone customizado
    const ultTrack = this.add
      .rectangle(barX, 51, barW, 17, 0x0b101b, 0.95)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x1e293b, 0.95);

    this.specialBarFill = this.add
      .rectangle(barX + 1, 51, 0, 15, 0x9b6dff, 1)
      .setOrigin(0, 0.5);

    this.specialBarShine = this.add
      .rectangle(barX + 1, 46.5, 0, 4, 0xffffff, 0.22)
      .setOrigin(0, 0.5);

    const ultIconKey = AttackVisualManager.getMoveIconKey(
      pokeDef.attackProfile!.element,
      'ult'
    );
    this.hudUltIcon = this.add
      .image(barX + barW - 11, 51, ultIconKey)
      .setDisplaySize(15, 15);

    this.specialLabelText = this.add
      .text(barX + 9, 51, '', {
        fontFamily: 'monospace',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);

    // 5. Barra de DASH (y: 72, altura: 16)
    const dashTrack = this.add
      .rectangle(barX, 72, barW, 16, 0x0b131c, 0.95)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x1e293b, 0.95);

    this.dashBarFill = this.add
      .rectangle(barX + 1, 72, barW - 2, 14, 0x38bdf8, 1)
      .setOrigin(0, 0.5);

    this.dashBarShine = this.add
      .rectangle(barX + 1, 68, barW - 2, 4, 0xffffff, 0.22)
      .setOrigin(0, 0.5);

    this.dashLabelText = this.add
      .text(barX + 9, 72, '', {
        fontFamily: 'monospace',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);

    // 6. Barra integrada de XP na base da placa (x: 16, y: 97, largura: 284, altura: 11)
    const xpTrack = this.add
      .rectangle(16, 97, 284, 11, 0x050b14, 0.95)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x334155, 0.9);

    this.xpBarFill = this.add
      .rectangle(17, 97, 0, 9, 0xfacc15, 1)
      .setOrigin(0, 0.5);

    this.xpLabelText = this.add
      .text(22, 97, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#f8fafc',
        stroke: '#000000',
        strokeThickness: 2.5,
      })
      .setOrigin(0, 0.5);

    // 7. Faixa de Ícones de Passiva Inata + Habilidades Aprendidas abaixo da placa
    this.abilitySlotsContainer = this.add.container(10, 116);

    // 8. Relógio Central + Substatus em placa discreta arredondada
    const centerHudGfx = this.add.graphics();
    centerHudGfx.fillStyle(0x000000, 0.32);
    centerHudGfx.fillRoundedRect(GAME_SETTINGS.WIDTH / 2 - 134, 10, 268, 56, 10);
    centerHudGfx.fillStyle(0x07101d, 0.76);
    centerHudGfx.fillRoundedRect(GAME_SETTINGS.WIDTH / 2 - 136, 8, 268, 56, 10);
    centerHudGfx.lineStyle(1.5, 0x334155, 0.85);
    centerHudGfx.strokeRoundedRect(GAME_SETTINGS.WIDTH / 2 - 136, 8, 268, 56, 10);

    this.centerTimerText = this.add
      .text(GAME_SETTINGS.WIDTH / 2 - 2, 26, '00:00', {
        fontFamily: 'monospace',
        fontSize: '21px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.mapSubStatusText = this.add
      .text(GAME_SETTINGS.WIDTH / 2 - 2, 50, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    // 9. Contador Superior Direito + Botão Pausar [ESC] em placa discreta
    const rightGfx = this.add.graphics();
    rightGfx.fillStyle(0x000000, 0.32);
    rightGfx.fillRoundedRect(GAME_SETTINGS.WIDTH - 280, 10, 272, 34, 9);
    rightGfx.fillStyle(0x07101d, 0.76);
    rightGfx.fillRoundedRect(GAME_SETTINGS.WIDTH - 282, 8, 272, 34, 9);
    rightGfx.lineStyle(1.5, 0x334155, 0.85);
    rightGfx.strokeRoundedRect(GAME_SETTINGS.WIDTH - 282, 8, 272, 34, 9);

    this.rightStatsText = this.add
      .text(GAME_SETTINGS.WIDTH - 22, 25, 'Derrotados: 0   Inimigos: 0', {
        fontFamily: 'monospace',
        fontSize: '13.5px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setOrigin(1, 0.5);

    const pauseBtnBg = this.add
      .rectangle(GAME_SETTINGS.WIDTH - 72, 56, 124, 24, 0x07101d, 0.82)
      .setStrokeStyle(1.2, 0xffcb05, 0.75)
      .setInteractive({ useHandCursor: true });

    const pauseBtnTxt = this.add
      .text(GAME_SETTINGS.WIDTH - 72, 56, '⏸ PAUSAR [ESC]', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffcb05',
      })
      .setOrigin(0.5);

    pauseBtnBg.on('pointerover', () => {
      pauseBtnBg.setFillStyle(0x13233f, 0.95);
      pauseBtnBg.setStrokeStyle(1.8, 0xffffff, 1);
    });
    pauseBtnBg.on('pointerout', () => {
      pauseBtnBg.setFillStyle(0x07101d, 0.82);
      pauseBtnBg.setStrokeStyle(1.2, 0xffcb05, 0.75);
    });
    pauseBtnBg.on('pointerdown', () => {
      if (!this.isModalOpen) this.openPauseModal();
    });

    // 10. Barra de Vida do Boss Onix
    this.bossHudContainer = this.add
      .container(GAME_SETTINGS.WIDTH / 2, 86)
      .setVisible(false);

    const bossBarBg = this.add
      .rectangle(0, 0, 430, 25, 0x091326, 0.95)
      .setStrokeStyle(2.5, 0xf59e0b, 1);

    this.bossHpBarFill = this.add
      .rectangle(-211, 0, 422, 19, 0xdc2626, 1)
      .setOrigin(0, 0.5);

    const bossBarShine = this.add
      .rectangle(-211, -5, 422, 5, 0xffffff, 0.22)
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

    this.bossHudContainer.add([
      bossBarBg,
      this.bossHpBarFill,
      bossBarShine,
      this.bossHpText,
    ]);

    // 11. Banner de avisos elegante
    this.bannerContainer = this.add
      .container(GAME_SETTINGS.WIDTH / 2, 128)
      .setAlpha(0);
    this.bannerBg = this.add
      .rectangle(0, 0, 420, 32, 0x07101d, 0.92)
      .setStrokeStyle(1.5, 0xffcb05, 0.9);
    this.bannerText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '14.5px',
        fontStyle: 'bold',
        color: '#ffcb05',
      })
      .setOrigin(0.5);
    this.bannerContainer.add([this.bannerBg, this.bannerText]);

    this.hudRoot.add([
      this.hudBackingGfx,
      portraitShadow,
      this.hudPortraitFrame,
      this.hudPortraitImage,
      lvlPillBg,
      this.hudLevelBadgeText,
      hpTrack,
      this.hpBarFill,
      this.hpBarShine,
      this.shieldBarFill,
      this.hpLabelText,
      ultTrack,
      this.specialBarFill,
      this.specialBarShine,
      this.hudUltIcon,
      this.specialLabelText,
      dashTrack,
      this.dashBarFill,
      this.dashBarShine,
      this.dashLabelText,
      xpTrack,
      this.xpBarFill,
      this.xpLabelText,
      this.abilitySlotsContainer,
      centerHudGfx,
      this.centerTimerText,
      this.mapSubStatusText,
      rightGfx,
      this.rightStatsText,
      pauseBtnBg,
      pauseBtnTxt,
      this.bossHudContainer,
      this.bannerContainer,
    ]);

    this.compassText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#ffcb05',
        backgroundColor: '#07101ddd',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.FLOATING_TEXT + 5)
      .setVisible(false);
  }

  private refreshAbilityIconStrip(): void {
    const pokeDef = this.player.getPokemonDefinition();
    const entries: string[] = [pokeDef.id];
    for (const [id, lvl] of this.player.getAbilityLevels().entries()) {
      if (lvl > 0) entries.push(`${id}:${lvl}`);
    }
    const sig = entries.join('|');
    if (sig === this.lastAbilitySignature) return;
    this.lastAbilitySignature = sig;

    this.abilitySlotsContainer.removeAll(true);

    let xCursor = 0;

    // 1º Badge discreto: Passiva Inata do Pokémon
    if (pokeDef.innatePassive && pokeDef.attackProfile) {
      const innateTex = AttackVisualManager.getMoveIconKey(
        pokeDef.attackProfile.element,
        'innate'
      );
      const slotBg = this.add
        .rectangle(xCursor + 14, 14, 28, 28, 0x07101d, 0.85)
        .setStrokeStyle(1.5, pokeDef.attackProfile.elementColor, 0.95);
      this.abilitySlotsContainer.add(slotBg);

      if (this.textures.exists(innateTex)) {
        const img = this.add
          .image(xCursor + 14, 14, innateTex)
          .setDisplaySize(24, 24);
        this.abilitySlotsContainer.add(img);
      }

      const tag = this.add
        .text(xCursor + 26, 26, '★', {
          fontFamily: 'monospace',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#ffcb05',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(1, 1);
      this.abilitySlotsContainer.add(tag);
      xCursor += 33;
    }

    // Demais badges: Habilidades aprendidas na run com seus ícones customizados!
    for (const [id, lvl] of this.player.getAbilityLevels().entries()) {
      if (lvl <= 0) continue;
      const def = ABILITIES[id];
      const texKey = AttackVisualManager.getAbilityIconKey(id);
      const borderCol = def.isUnique
        ? pokeDef.attackProfile!.elementColor
        : def.kind === 'active'
          ? 0xf59e0b
          : 0x38bdf8;

      const slotBg = this.add
        .rectangle(xCursor + 14, 14, 28, 28, 0x07101d, 0.85)
        .setStrokeStyle(1.5, borderCol, 0.9);
      this.abilitySlotsContainer.add(slotBg);

      if (this.textures.exists(texKey)) {
        const img = this.add
          .image(xCursor + 14, 14, texKey)
          .setDisplaySize(24, 24);
        this.abilitySlotsContainer.add(img);
      } else {
        const fallback = this.add
          .text(xCursor + 14, 14, def.icon, {
            fontFamily: 'monospace',
            fontSize: '14px',
          })
          .setOrigin(0.5);
        this.abilitySlotsContainer.add(fallback);
      }

      const lvlTxt = this.add
        .text(xCursor + 27, 27, `${lvl}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2.5,
        })
        .setOrigin(1, 1);
      this.abilitySlotsContainer.add(lvlTxt);

      xCursor += 32;
    }
  }

  private updateHud(): void {
    const mapDef = this.mapManager.getCurrentMapDefinition();
    const pokeDef = this.player.getPokemonDefinition();
    const elemColor = pokeDef.attackProfile!.elementColor;

    if (elemColor !== this.lastHudElementColor) {
      this.drawTopLeftBackingPlate(elemColor);
      this.lastHudElementColor = elemColor;
    }

    // 1. Retrato Normal vs Dor
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
      this.hudPortraitImage.setDisplaySize(60, 60);
    }
    this.hudPortraitFrame.setStrokeStyle(
      2.5,
      inPain ? 0xff4d4d : 0xf8fafc,
      1
    );
    this.hudLevelBadgeText.setText(`Nv.${this.player.level}`);

    // 2. Barra de HP + Escudo
    const barMaxW = 208;
    const hpRatio = Phaser.Math.Clamp(
      this.player.hp / Math.max(1, this.player.maxHp),
      0,
      1
    );
    this.hpBarFill.width = barMaxW * hpRatio;
    this.hpBarShine.width = barMaxW * hpRatio;
    this.hpBarFill.setFillStyle(
      hpRatio > 0.5 ? 0x57d131 : hpRatio > 0.25 ? 0xfacc15 : 0xef4444,
      1
    );

    if (this.player.shieldHp > 0 && this.player.maxShieldHp > 0) {
      const shRatio = Phaser.Math.Clamp(
        this.player.shieldHp / this.player.maxShieldHp,
        0,
        1
      );
      this.shieldBarFill.width = barMaxW * shRatio;
      this.hpLabelText.setText(
        `${this.player.hp} / ${this.player.maxHp} (+${this.player.shieldHp})`
      );
    } else {
      this.shieldBarFill.width = 0;
      this.hpLabelText.setText(`${this.player.hp} / ${this.player.maxHp}`);
    }

    // 3. Barra de ULT
    const specRatio = Phaser.Math.Clamp(
      this.player.specialEnergy / SPECIAL_MAX_ENERGY,
      0,
      1
    );
    this.specialBarFill.width = barMaxW * specRatio;
    this.specialBarShine.width = barMaxW * specRatio;
    this.specialBarFill.setFillStyle(
      specRatio >= 1 ? 0xc084fc : 0x9b6dff,
      1
    );
    this.specialLabelText.setText(
      specRatio >= 1
        ? 'ULT PRONTO! [E/Q]'
        : `ULT ${Math.floor(specRatio * 100)}%`
    );

    // 4. Barra de DASH
    const effDashCd = this.player.getEffectiveDashCooldownMs();
    const dashReadyRatio = Phaser.Math.Clamp(
      1 - this.player.dashCooldownRemaining / effDashCd,
      0,
      1
    );
    this.dashBarFill.width = barMaxW * dashReadyRatio;
    this.dashBarShine.width = barMaxW * dashReadyRatio;
    this.dashBarFill.setFillStyle(
      dashReadyRatio >= 1 ? 0x56b9ff : 0x0284c7,
      1
    );
    this.dashLabelText.setText(
      dashReadyRatio >= 1
        ? 'DASH  [SHIFT]'
        : `DASH  ${(this.player.dashCooldownRemaining / 1000).toFixed(1)}s`
    );

    // 5. Barra de XP
    const xpRatio =
      this.player.level >= MAX_PLAYER_LEVEL
        ? 1
        : Phaser.Math.Clamp(
            this.player.xp / Math.max(1, this.player.xpToNextLevel),
            0,
            1
          );
    this.xpBarFill.width = 282 * xpRatio;
    this.xpLabelText.setText(
      this.player.level >= MAX_PLAYER_LEVEL
        ? `${pokeDef.name}  •  NÍVEL MÁXIMO (ARENA BOSS)`
        : `${pokeDef.name}  •  XP ${this.player.xp} / ${this.player.xpToNextLevel}`
    );

    // 6. Ícones de Passiva Inata & Habilidades
    this.refreshAbilityIconStrip();

    // 7. Relógio Central + Substatus
    this.centerTimerText.setText(RunHistory.formatTime(this.runTimeSeconds));
    if (this.mapManager.isBossMapActive()) {
      this.mapSubStatusText.setText('👑 Arena Final — Ginásio de Pedra');
    } else if (this.mapManager.isNextMapGateOpen()) {
      this.mapSubStatusText.setText('🌉 Ponte aberta ao Norte!');
    } else {
      const remaining = Math.max(
        0,
        Math.ceil(GAME_SETTINGS.MAP_DURATION_SECONDS - this.mapElapsedSeconds)
      );
      this.mapSubStatusText.setText(`${mapDef.name} • ${remaining}s`);
    }

    // 8. Contador Superior Direito
    this.rightStatsText.setText(
      `Derrotados: ${this.defeatedCount}   Inimigos: ${this.enemies.length}`
    );

    // 9. Barra de Chefe (Geodude / Onix) ou Miniboss do Mapa
    if (this.bossEnemy && !this.bossEnemy.isDead) {
      this.bossHudContainer.setVisible(true);
      this.bossHpBarFill.setFillStyle(0xd97706);
      const bossRatio = Phaser.Math.Clamp(
        this.bossEnemy.hp / Math.max(1, this.bossEnemy.maxHp),
        0,
        1
      );
      this.bossHpBarFill.width = 422 * bossRatio;
      if (this.bossPhase === 1) {
        this.bossHpText.setText(
          `⚔️ CHEFE 1/2: GEODUDE — HP: ${Math.ceil(this.bossEnemy.hp)} / ${this.bossEnemy.maxHp}`
        );
      } else {
        this.bossHpText.setText(
          `👑 CHEFE FINAL 2/2: ONIX — HP: ${Math.ceil(this.bossEnemy.hp)} / ${this.bossEnemy.maxHp}`
        );
      }
    } else if (this.currentMiniboss && !this.currentMiniboss.isDead) {
      this.bossHudContainer.setVisible(true);
      this.bossHpBarFill.setFillStyle(0xe11d48);
      const miniRatio = Phaser.Math.Clamp(
        this.currentMiniboss.hp / Math.max(1, this.currentMiniboss.maxHp),
        0,
        1
      );
      this.bossHpBarFill.width = 422 * miniRatio;
      const curDef = this.mapManager.getCurrentMapDefinition();
      const cfg = MAP_MINIBOSS_CONFIGS[curDef.key];
      const name = cfg ? cfg.name.toUpperCase() : 'MINIBOSS';
      this.bossHpText.setText(
        `⚠️ MINIBOSS: ${name} — HP: ${Math.ceil(this.currentMiniboss.hp)} / ${this.currentMiniboss.maxHp}`
      );
    } else {
      this.bossHudContainer.setVisible(false);
    }
  }

  private showBanner(message: string): void {
    this.bannerText.setText(message);
    this.bannerBg.width = Math.max(320, this.bannerText.width + 38);
    this.tweens.killTweensOf(this.bannerContainer);
    this.bannerContainer.setAlpha(1);

    this.tweens.add({
      targets: this.bannerContainer,
      alpha: 0,
      delay: 2800,
      duration: 500,
    });
  }
}
