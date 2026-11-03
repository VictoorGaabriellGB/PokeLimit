import Phaser from 'phaser';
import {
  POKEMON_MANIFEST,
  PokemonAnimType,
  PokemonDefinition,
} from '../config/pokemonManifest';
import { DEPTH, depthForY } from '../systems/depth';
import {
  Direction8,
  PokemonAnimationManager,
} from '../systems/PokemonAnimationManager';

const ENEMY_HITBOX_RADIUS = 8;
const BOSS_HITBOX_RADIUS = 24;

export class Enemy {
  public readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private shadow: Phaser.GameObjects.Ellipse;
  private scene: Phaser.Scene;
  private pokemonDef: PokemonDefinition;
  private currentDir: Direction8 = 0;
  private currentState: PokemonAnimType = 'Walk';

  public readonly isBoss: boolean;
  public readonly isMiniboss: boolean;
  private minibossAura: Phaser.GameObjects.Arc | null = null;
  private minibossSkillTimerMs = 0;
  private geodudeAttackCycle = 0;
  public hp: number;
  public readonly maxHp: number;
  public isDead = false;

  private knockbackTimer = 0;
  private slowTimerMs = 0;
  private slowFactor = 1;
  private poisonTimerMs = 0;
  private poisonTickAccumMs = 0;
  private poisonDamagePerSec = 0;
  private activeStatusTint: number | null = null;
  private bossSkillTimerMs = 0;
  private sleepIcon: Phaser.GameObjects.Text | null = null;
  private sleepTimerMs = 0;
  public isCharging = false;
  private onixPhase: 'pursue' | 'warning' | 'charge' | 'rest' = 'pursue';
  private onixPhaseTimerMs = 0;
  private onixChargeAngle = 0;
  private onixWarningGfx: Phaser.GameObjects.Rectangle | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    pokemonId: string,
    hpMultiplier = 1,
    isMiniboss = false
  ) {
    this.scene = scene;
    this.pokemonDef = POKEMON_MANIFEST[pokemonId];
    this.isBoss = this.pokemonDef.role === "boss";
    this.isMiniboss = isMiniboss;
    this.maxHp = Math.round(
      this.pokemonDef.baseHp * hpMultiplier * (isMiniboss ? 3.6 : 1)
    );
    this.hp = this.maxHp;

    this.shadow = scene.add
      .ellipse(
        x,
        y + (this.isBoss ? 22 : isMiniboss ? 14 : 10),
        this.isBoss ? 64 : isMiniboss ? 34 : 22,
        this.isBoss ? 22 : isMiniboss ? 13 : 9,
        0x000000,
        this.isBoss ? 0.45 : isMiniboss ? 0.4 : 0.3
      )
      .setDepth(DEPTH.SHADOW);

    if (this.isMiniboss) {
      this.minibossAura = scene.add
        .circle(x, y + 12, 26, 0xf59e0b, 0.35)
        .setStrokeStyle(2.5, 0xfef08a, 0.9)
        .setDepth(DEPTH.SHADOW + 1);
    }

    const initialTex = PokemonAnimationManager.getTextureKey(pokemonId, "Walk");
    this.sprite = scene.physics.add
      .sprite(x, y, initialTex, 0)
      .setScale(this.pokemonDef.scale * (this.isMiniboss ? 1.35 : 1))
      .setDepth(depthForY(y));

    this.sprite.setCollideWorldBounds(true);
    (this.sprite as any).enemyRef = this;
    this.sprite.setData("enemy", this);
    this.syncHitbox();
    this.playAnim(true);
  }

  getName(): string {
    return this.pokemonDef.name;
  }

  getContactRadius(): number {
    return this.isBoss ? 38 : this.isMiniboss ? 26 : 20;
  }

  canFly(): boolean {
    return (
      this.pokemonDef.canFly === true ||
      this.pokemonDef.id === '0041' ||
      this.pokemonDef.id === '0042' ||
      this.pokemonDef.id === '0123'
    );
  }

  canSwim(): boolean {
    return (
      this.pokemonDef.canSwim === true ||
      this.pokemonDef.id === '0062' ||
      this.pokemonDef.id === '0131'
    );
  }

  dormir(durationMs = 3000): void {
    this.applySleep(durationMs);
  }

  isSleeping(): boolean {
    return this.sleepTimerMs > 0;
  }

  applySleep(durationMs = 3000): void {
    if (this.isDead) return;
    const dur = this.isBoss ? Math.round(durationMs * 0.67) : durationMs;
    this.sleepTimerMs = Math.max(this.sleepTimerMs, dur);
    this.sprite.setVelocity(0, 0);
    this.currentState = 'Idle';
    this.playAnim(false);

    if (this.sprite.active) {
      this.sprite.setTint(0xc084fc);
    }

    if (!this.sleepIcon) {
      this.sleepIcon = this.scene.add
        .text(
          this.sprite.x + 8,
          this.sprite.y - (this.isBoss ? 52 : 26),
          '💤',
          {
            fontFamily: 'monospace',
            fontSize: '15px',
          }
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.FLOATING_TEXT);
    }
  }

  isIncapacitated(): boolean {
    return this.isSleeping() || (this.slowTimerMs > 0 && this.slowFactor < 0.05);
  }

  hasSlowOrParalysis(): boolean {
    return this.slowTimerMs > 0 || this.isSleeping();
  }

  update(
    delta: number,
    targetX: number,
    targetY: number,
    onEnemyDeath?: () => void,
    onBossHazardHitPlayer?: (damage: number) => void,
    onBossChargeStarted?: (startX: number, startY: number) => void,
    onBossChargeStep?: (currX: number, currY: number) => void
  ): void {
    if (this.isDead) return;

    if (this.sleepTimerMs > 0) {
      this.sleepTimerMs -= delta;
      this.sprite.setVelocity(0, 0);
      this.currentState = 'Idle';
      this.playAnim(false);

      if (!this.sleepIcon) {
        this.sleepIcon = this.scene.add
          .text(
            this.sprite.x + 8,
            this.sprite.y - (this.isBoss ? 52 : 26),
            '💤',
            {
              fontFamily: 'monospace',
              fontSize: '15px',
            }
          )
          .setOrigin(0.5)
          .setDepth(DEPTH.FLOATING_TEXT);
      }
      const bob = Math.sin(this.scene.time.now / 180) * 3;
      this.sleepIcon.setPosition(
        this.sprite.x + 8,
        this.sprite.y - (this.isBoss ? 52 : 26) + bob
      );

      if (this.sleepTimerMs <= 0) {
        this.clearSleepIcon();
        if (this.sprite.active) {
          if (this.activeStatusTint !== null) {
            this.sprite.setTint(this.activeStatusTint);
          } else {
            this.sprite.clearTint();
          }
        }
      }
      this.syncShadowAndDepth();
      return;
    }

    if (this.slowTimerMs > 0) {
      this.slowTimerMs -= delta;
      if (this.slowTimerMs <= 0) {
        this.slowFactor = 1;
        if (this.poisonTimerMs <= 0) {
          this.activeStatusTint = null;
          this.clearSleepIcon();
          if (this.sprite.active) {
            this.sprite.clearTint();
          }
        }
      }
    }

    if (this.poisonTimerMs > 0) {
      this.poisonTimerMs -= delta;
      this.poisonTickAccumMs += delta;
      if (this.poisonTickAccumMs >= 500) {
        this.poisonTickAccumMs -= 500;
        this.hp -= this.poisonDamagePerSec * 0.5;
        if (this.hp <= 0) {
          this.die();
          if (onEnemyDeath) onEnemyDeath();
          return;
        }
      }
      if (this.poisonTimerMs <= 0) {
        this.poisonDamagePerSec = 0;
        if (this.slowTimerMs <= 0) {
          this.activeStatusTint = null;
          this.clearSleepIcon();
          if (this.sprite.active) {
            this.sprite.clearTint();
          }
        }
      }
    }

    if (this.sleepIcon && !this.isSleeping) {
      this.sleepIcon.setPosition(
        this.sprite.x + 10,
        this.sprite.y - (this.isBoss ? 52 : 26)
      );
    }

    // Ataques periódicos de Chefes (Geodude e Onix) e Minibosses
    if (this.isBoss && !this.isIncapacitated()) {
      this.bossSkillTimerMs += delta;
      const interval = this.pokemonDef.id === "0074" ? 2400 : 2900;
      if (this.bossSkillTimerMs >= interval) {
        this.bossSkillTimerMs = 0;
        if (this.pokemonDef.id === "0074") {
          this.executeGeodudeSkill(targetX, targetY, onBossHazardHitPlayer);
        } else {
          this.executeBossSkill(targetX, targetY, onBossHazardHitPlayer);
        }
      }
    }

    if (this.isMiniboss && !this.isIncapacitated()) {
      this.minibossSkillTimerMs += delta;
      if (this.minibossSkillTimerMs >= 3200) {
        this.minibossSkillTimerMs = 0;
        this.executeMinibossSkill(targetX, targetY, onBossHazardHitPlayer);
      }
    }

    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= delta;
      this.syncShadowAndDepth();
      return;
    }

    // ===================== BOSS ONIX — INVESTIDA TELEGRAFADA (CHEFES.onix) =====================
    if (this.isBoss) {
      this.onixPhaseTimerMs += delta;

      if (this.onixPhase === 'pursue') {
        this.isCharging = false;
        const dx = targetX - this.sprite.x;
        const dy = targetY - this.sprite.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 30) {
          const vx = (dx / dist) * 115 * this.slowFactor;
          const vy = (dy / dist) * 115 * this.slowFactor;
          this.sprite.setVelocity(vx, vy);
          this.currentDir = PokemonAnimationManager.vectorToDirection(
            vx,
            vy,
            this.currentDir
          );
          this.currentState = 'Walk';
          this.playAnim(false);
        } else {
          this.sprite.setVelocity(0, 0);
          this.currentState = 'Idle';
          this.playAnim(false);
        }

        if (this.onixPhaseTimerMs >= 2600) {
          this.onixPhase = 'warning';
          this.onixPhaseTimerMs = 0;
          this.sprite.setVelocity(0, 0);
          this.onixChargeAngle = Math.atan2(
            targetY - this.sprite.y,
            targetX - this.sprite.x
          );
          this.currentDir = PokemonAnimationManager.vectorToDirection(
            Math.cos(this.onixChargeAngle),
            Math.sin(this.onixChargeAngle),
            this.currentDir
          );
          this.currentState = 'Idle';
          this.playAnim(true);

          if (this.onixWarningGfx) {
            this.onixWarningGfx.destroy();
          }
          this.onixWarningGfx = this.scene.add
            .rectangle(
              this.sprite.x,
              this.sprite.y,
              440,
              110,
              0xef4444,
              0.28
            )
            .setOrigin(0, 0.5)
            .setRotation(this.onixChargeAngle)
            .setDepth(DEPTH.SHADOW + 1);
        }
      } else if (this.onixPhase === 'warning') {
        this.sprite.setVelocity(0, 0);
        this.currentState = 'Idle';
        this.playAnim(false);

        if (this.onixWarningGfx) {
          const pulse =
            0.2 + 0.26 * Math.abs(Math.sin(this.onixPhaseTimerMs / 70));
          this.onixWarningGfx.setAlpha(pulse);
        }

        if (this.onixPhaseTimerMs >= 900) {
          if (this.onixWarningGfx) {
            this.onixWarningGfx.destroy();
            this.onixWarningGfx = null;
          }
          this.onixPhase = 'charge';
          this.onixPhaseTimerMs = 0;
          this.isCharging = true;
          this.currentState = 'Attack';
          this.playAnim(true);
          this.scene.cameras.main.shake(160, 0.005);
          onBossChargeStarted?.(this.sprite.x, this.sprite.y);
        }
      } else if (this.onixPhase === 'charge') {
        this.isCharging = true;
        const vx = Math.cos(this.onixChargeAngle) * 620;
        const vy = Math.sin(this.onixChargeAngle) * 620;
        this.sprite.setVelocity(vx, vy);
        this.currentState = 'Attack';
        this.playAnim(false);
        onBossChargeStep?.(this.sprite.x, this.sprite.y);

        if (this.onixPhaseTimerMs >= 700) {
          this.onixPhase = 'rest';
          this.onixPhaseTimerMs = 0;
          this.isCharging = false;
          this.sprite.setVelocity(0, 0);
          this.currentState = 'Idle';
          this.playAnim(true);
        }
      } else if (this.onixPhase === 'rest') {
        this.isCharging = false;
        this.sprite.setVelocity(0, 0);
        this.currentState = 'Idle';
        this.playAnim(false);

        if (this.onixPhaseTimerMs >= 1000) {
          this.onixPhase = 'pursue';
          this.onixPhaseTimerMs = 0;
        }
      }

      this.syncShadowAndDepth();
      return;
    }

    // Inimigos comuns
    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    if (this.isIncapacitated()) {
      this.sprite.setVelocity(0, 0);
    } else if (dist > 18) {
      const effectiveSpeed = this.pokemonDef.speed * this.slowFactor;
      const vx = (dx / dist) * effectiveSpeed;
      const vy = (dy / dist) * effectiveSpeed;
      this.sprite.setVelocity(vx, vy);

      this.currentDir = PokemonAnimationManager.vectorToDirection(
        vx,
        vy,
        this.currentDir
      );
      this.currentState = 'Walk';
      this.playAnim(false);
    } else {
      this.sprite.setVelocity(0, 0);
      this.currentState = 'Attack';
      this.playAnim(false);
    }

    this.syncShadowAndDepth();
  }

  /**
   * Golpes especiais do Boss Onix: Deslizamento de Rochas & Terremoto!
   */
  private executeBossSkill(
    targetX: number,
    targetY: number,
    onHitPlayer?: (damage: number) => void
  ): void {
    this.currentState = 'Attack';
    this.playAnim(true);
    this.scene.cameras.main.shake(200, 0.004);

    // 1. Onda Sísmica ao redor do Onix
    const ox = this.sprite.x;
    const oy = this.sprite.y;
    const quakeRing = this.scene.add
      .circle(ox, oy, 28, 0xd97706, 0.35)
      .setStrokeStyle(4, 0xfbbf24, 0.95)
      .setDepth(DEPTH.EFFECTS - 2);

    this.scene.tweens.add({
      targets: quakeRing,
      radius: 135,
      alpha: 0,
      duration: 420,
      onComplete: () => quakeRing.destroy(),
    });

    // 2. Deslizamento de Rochas (3 rochas caem perto do jogador após aviso de 650ms)
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 * i) / 3 + Math.random() * 0.8;
      const dist = i === 0 ? 15 : Phaser.Math.Between(55, 115);
      const rx = targetX + Math.cos(angle) * dist;
      const ry = targetY + Math.sin(angle) * dist;

      const warnCircle = this.scene.add
        .circle(rx, ry, 34, 0xef4444, 0.22)
        .setStrokeStyle(2.5, 0xf87171, 0.9)
        .setDepth(DEPTH.SHADOW + 2);

      const boulder = this.scene.add
        .circle(rx, ry - 180, 18, 0x78716c, 1)
        .setStrokeStyle(3, 0x44403c, 1)
        .setDepth(DEPTH.EFFECTS + 3);

      this.scene.tweens.add({
        targets: boulder,
        y: ry,
        duration: 650,
        ease: 'Quad.easeIn',
        onComplete: () => {
          warnCircle.destroy();
          boulder.destroy();

          const impact = this.scene.add
            .circle(rx, ry, 14, 0xa8a29e, 0.7)
            .setStrokeStyle(3, 0xfef08a, 0.9)
            .setDepth(DEPTH.EFFECTS);

          this.scene.tweens.add({
            targets: impact,
            radius: 38,
            alpha: 0,
            duration: 240,
            onComplete: () => impact.destroy(),
          });

          if (onHitPlayer) {
            onHitPlayer(16);
          }
        },
      });

      // Guarda a coordenada do impacto no círculo para checagem na cena
      warnCircle.setData('hazardX', rx);
      warnCircle.setData('hazardY', ry);
    }
  }

  /**
   * Golpes únicos do Boss Geodude (DIFERENTES do Onix):
   * 1. Rollout Charge: Investida veloz em linha reta com aviso no solo e dano de atropelamento.
   * 2. Rock Blast: Disparo de 6 estilhaços pontiagudos de rocha em leque.
   */
  private executeGeodudeSkill(
    targetX: number,
    targetY: number,
    onHitPlayer?: (damage: number) => void
  ): void {
    this.currentState = 'Attack';
    this.playAnim(true);

    const gx = this.sprite.x;
    const gy = this.sprite.y;
    this.geodudeAttackCycle = (this.geodudeAttackCycle + 1) % 2;

    if (this.geodudeAttackCycle === 0) {
      // 1. ROLLOUT / INVESTIDA GIRATÓRIA
      this.scene.cameras.main.shake(180, 0.003);

      const ang = Math.atan2(targetY - gy, targetX - gx);
      const chargeDist = 260;
      const destX = gx + Math.cos(ang) * chargeDist;
      const destY = gy + Math.sin(ang) * chargeDist;

      const pathLine = this.scene.add.graphics().setDepth(DEPTH.SHADOW + 1);
      pathLine.lineStyle(18, 0xd97706, 0.3);
      pathLine.beginPath();
      pathLine.moveTo(gx, gy);
      pathLine.lineTo(destX, destY);
      pathLine.strokePath();

      const dust = this.scene.add
        .circle(gx, gy, 24, 0x78716c, 0.45)
        .setStrokeStyle(2.5, 0xd6d3d1, 0.8)
        .setDepth(DEPTH.EFFECTS);
      this.scene.tweens.add({
        targets: dust,
        scale: 1.6,
        alpha: 0,
        duration: 350,
        onComplete: () => dust.destroy(),
      });

      this.scene.time.delayedCall(380, () => {
        pathLine.destroy();
        if (this.isDead || !this.sprite.active) return;

        this.sprite.setVelocity(Math.cos(ang) * 440, Math.sin(ang) * 440);

        for (let s = 0; s < 5; s++) {
          this.scene.time.delayedCall(s * 70, () => {
            if (!this.sprite.active || this.isDead) return;
            const puff = this.scene.add
              .circle(
                this.sprite.x + Phaser.Math.Between(-8, 8),
                this.sprite.y + Phaser.Math.Between(-8, 8),
                Phaser.Math.Between(6, 12),
                0xa8a29e,
                0.6
              )
              .setDepth(DEPTH.EFFECTS);
            this.scene.tweens.add({
              targets: puff,
              scale: 1.8,
              alpha: 0,
              duration: 220,
              onComplete: () => puff.destroy(),
            });
          });
        }

        this.scene.time.delayedCall(200, () => {
          if (this.isDead || !this.sprite.active) return;
          const distToPlayer = Math.hypot(this.sprite.x - targetX, this.sprite.y - targetY);
          if (distToPlayer <= 56 && onHitPlayer) {
            onHitPlayer(14);
            this.scene.cameras.main.shake(260, 0.007);
          }
        });
      });
    } else {
      // 2. ROCK BLAST / ESTILHAÇOS DE PEDRA EM LEQUE
      this.scene.cameras.main.shake(220, 0.004);

      const ring = this.scene.add
        .circle(gx, gy, 18, 0x78716c, 0.5)
        .setStrokeStyle(3, 0xf59e0b, 0.9)
        .setDepth(DEPTH.EFFECTS);
      this.scene.tweens.add({
        targets: ring,
        radius: 65,
        alpha: 0,
        duration: 320,
        onComplete: () => ring.destroy(),
      });

      const baseAngle = Math.atan2(targetY - gy, targetX - gx);
      for (let i = 0; i < 6; i++) {
        const spreadAngle = baseAngle + (i - 2.5) * 0.28;
        const shard = this.scene.add
          .circle(gx, gy, 7, 0x57534e, 1)
          .setStrokeStyle(2, 0xd6d3d1, 1)
          .setDepth(DEPTH.EFFECTS + 2);

        const travelDist = 260;
        const endX = gx + Math.cos(spreadAngle) * travelDist;
        const endY = gy + Math.sin(spreadAngle) * travelDist;

        this.scene.tweens.add({
          targets: shard,
          x: endX,
          y: endY,
          duration: 620,
          ease: 'Linear',
          onUpdate: () => {
            if (shard.active) {
              const d = Math.hypot(shard.x - targetX, shard.y - targetY);
              if (d <= 24 && onHitPlayer) {
                shard.destroy();
                onHitPlayer(11);
              }
            }
          },
          onComplete: () => {
            if (shard.active) {
              const burst = this.scene.add
                .circle(shard.x, shard.y, 8, 0xa8a29e, 0.7)
                .setDepth(DEPTH.EFFECTS);
              this.scene.tweens.add({
                targets: burst,
                radius: 18,
                alpha: 0,
                duration: 180,
                onComplete: () => burst.destroy(),
              });
              shard.destroy();
            }
          },
        });
      }
    }
  }

  /**
   * Habilidade especial exclusiva de Miniboss por elemento
   */
  private executeMinibossSkill(
    targetX: number,
    targetY: number,
    onHitPlayer?: (damage: number) => void
  ): void {
    this.currentState = 'Attack';
    this.playAnim(true);

    const mx = this.sprite.x;
    const my = this.sprite.y;
    const baseAngle = Math.atan2(targetY - my, targetX - mx);

    let projColor = 0xf59e0b;
    let projBorder = 0xfef08a;
    const id = this.pokemonDef.id;

    if (id === '0123') {
      // Scyther: Lâminas de Ar Cortante
      projColor = 0x22c55e;
      projBorder = 0x86efac;
    } else if (id === '0126') {
      // Magmar: Lança-Chamas Vulcânico
      projColor = 0xf97316;
      projBorder = 0xef4444;
    } else if (id === '0062') {
      // Poliwrath: Hidro-Bomba de Pressão
      projColor = 0x0284c7;
      projBorder = 0x7dd3fc;
    } else if (id === '0125') {
      // Electabuzz: Descarga Elétrica
      projColor = 0xfacc15;
      projBorder = 0xfef08a;
    } else if (id === '0042') {
      // Golbat: Presas Venenosas & Ecos Hipersônicos
      projColor = 0xa855f7;
      projBorder = 0xd8b4fe;
    } else if (id === '0112') {
      // Rhydon: Rocha Pesada & Estilhaços
      projColor = 0x78716c;
      projBorder = 0xd6d3d1;
    } else if (id === '0131') {
      // Lapras: Rajada Oceânica Glacial
      projColor = 0x06b6d4;
      projBorder = 0xa5f3fc;
    }

    // Alerta sutil no chão
    const ring = this.scene.add
      .circle(mx, my, 14, projColor, 0.4)
      .setStrokeStyle(2, projBorder, 0.9)
      .setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({
      targets: ring,
      radius: 46,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    });

    // Dispara 3 projéteis elementais em leque em direção ao jogador
    for (let i = 0; i < 3; i++) {
      const ang = baseAngle + (i - 1) * 0.32;
      const proj = this.scene.add
        .circle(mx, my, 6, projColor, 1)
        .setStrokeStyle(2, projBorder, 1)
        .setDepth(DEPTH.EFFECTS + 2);

      const dist = 240;
      const endX = mx + Math.cos(ang) * dist;
      const endY = my + Math.sin(ang) * dist;

      this.scene.tweens.add({
        targets: proj,
        x: endX,
        y: endY,
        duration: 580,
        onUpdate: () => {
          if (proj.active) {
            const d = Math.hypot(proj.x - targetX, proj.y - targetY);
            if (d <= 22 && onHitPlayer) {
              proj.destroy();
              onHitPlayer(10);
            }
          }
        },
        onComplete: () => {
          if (proj.active) proj.destroy();
        },
      });
    }
  }

    applyStatusEffect(options: {
    slowFactor?: number;
    slowDurationMs?: number;
    dotDamagePerSec?: number;
    dotDurationMs?: number;
    tintColor?: number;
    showSleepIcon?: boolean;
    statusIcon?: string;
  }): void {
    if (this.isDead) return;

    if (options.slowFactor !== undefined && options.slowDurationMs) {
      // O Boss Onix tem resistência parcial a paralisia/sono (nunca fica 100% parado por muito tempo)
      const effectiveSlow = this.isBoss
        ? Math.max(0.45, options.slowFactor)
        : options.slowFactor;
      const effectiveDur = this.isBoss
        ? Math.round(options.slowDurationMs * 0.5)
        : options.slowDurationMs;

      this.slowFactor = Math.min(
        this.slowTimerMs > 0 ? this.slowFactor : 1,
        effectiveSlow
      );
      this.slowTimerMs = Math.max(this.slowTimerMs, effectiveDur);
    }

    if (options.dotDamagePerSec && options.dotDurationMs) {
      this.poisonDamagePerSec = Math.max(
        this.poisonDamagePerSec,
        options.dotDamagePerSec
      );
      this.poisonTimerMs = Math.max(this.poisonTimerMs, options.dotDurationMs);
    }

    if (options.tintColor) {
      this.activeStatusTint = options.tintColor;
      if (this.sprite.active) {
        this.sprite.setTint(options.tintColor);
      }
    }

    const iconChar = options.statusIcon ?? (options.showSleepIcon ? '💤' : undefined);
    if (iconChar) {
      if (!this.sleepIcon) {
        this.sleepIcon = this.scene.add
          .text(
            this.sprite.x + 10,
            this.sprite.y - (this.isBoss ? 52 : 26),
            iconChar,
            {
              fontFamily: 'monospace',
              fontSize: '13px',
            }
          )
          .setOrigin(0.5)
          .setDepth(DEPTH.FLOATING_TEXT - 1);
      } else {
        this.sleepIcon.setText(iconChar);
      }
    }
  }

  takeDamage(
    amount: number,
    sourceX: number,
    sourceY: number,
    knockbackSpeed = 200,
    isCrit = false
  ): boolean {
    if (this.isDead) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.showFloatingDamage(Math.round(amount), isCrit);

    this.sprite.setTintFill(isCrit ? 0xffcb05 : 0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (!this.isDead && this.sprite.active) {
        if (
          (this.slowTimerMs > 0 || this.poisonTimerMs > 0) &&
          this.activeStatusTint !== null
        ) {
          this.sprite.setTint(this.activeStatusTint);
        } else {
          this.sprite.clearTint();
        }
      }
    });

    const effectiveKb = this.isBoss ? knockbackSpeed * 0.12 : knockbackSpeed;
    if (effectiveKb !== 0) {
      const angle = Math.atan2(this.sprite.y - sourceY, this.sprite.x - sourceX);
      this.sprite.setVelocity(
        Math.cos(angle) * effectiveKb,
        Math.sin(angle) * effectiveKb
      );
      this.knockbackTimer = this.isBoss ? 70 : Math.abs(effectiveKb) > 260 ? 230 : 150;
    }

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  destroy(): void {
    this.isDead = true;
    this.clearSleepIcon();
    if (this.onixWarningGfx) {
      this.onixWarningGfx.destroy();
      this.onixWarningGfx = null;
    }
    this.shadow.destroy();
    if (this.minibossAura) {
      this.minibossAura.destroy();
      this.minibossAura = null;
    }
    this.sprite.destroy();
  }

  private syncShadowAndDepth(): void {
    this.shadow.setPosition(
      this.sprite.x,
      this.sprite.y + (this.isBoss ? 24 : 10)
    );
    if (this.minibossAura) {
      this.minibossAura.setPosition(this.sprite.x, this.sprite.y + 12);
    }
    this.sprite.setDepth(depthForY(this.sprite.y));
  }

  private clearSleepIcon(): void {
    if (this.sleepIcon) {
      this.sleepIcon.destroy();
      this.sleepIcon = null;
    }
  }

  private showFloatingDamage(value: number, isCrit: boolean): void {
    const txt = this.scene.add
      .text(
        this.sprite.x,
        this.sprite.y - (this.isBoss ? 42 : 18),
        isCrit ? `${value}!` : `${value}`,
        {
          fontFamily: 'monospace',
          fontSize: isCrit ? '16px' : '13px',
          fontStyle: 'bold',
          color: isCrit ? '#ffcb05' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        }
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.FLOATING_TEXT);

    this.scene.tweens.add({
      targets: txt,
      y: txt.y - 22,
      alpha: 0,
      duration: 520,
      onComplete: () => txt.destroy(),
    });
  }

  private die(): void {
    this.isDead = true;
    this.sprite.body.enable = false;
    this.clearSleepIcon();
    if (this.onixWarningGfx) {
      this.onixWarningGfx.destroy();
      this.onixWarningGfx = null;
    }

    const targets: Phaser.GameObjects.GameObject[] = [this.sprite, this.shadow];
    if (this.minibossAura) targets.push(this.minibossAura);

    this.scene.tweens.add({
      targets,
      alpha: 0,
      scale: 0.3,
      duration: this.isBoss ? 550 : 220,
      onComplete: () => {
        this.shadow.destroy();
        if (this.minibossAura) {
          this.minibossAura.destroy();
          this.minibossAura = null;
        }
        this.sprite.destroy();
      },
    });
  }

  private playAnim(force: boolean): void {
    const animKey = PokemonAnimationManager.getAnimKey(
      this.pokemonDef.id,
      this.currentState,
      this.currentDir
    );
    if (force || this.sprite.anims.currentAnim?.key !== animKey) {
      this.sprite.play(animKey, true);
      this.syncHitbox();
    }
  }

  private syncHitbox(): void {
    const radius = this.isBoss ? BOSS_HITBOX_RADIUS : this.isMiniboss ? 15 : ENEMY_HITBOX_RADIUS;
    const cfg = this.pokemonDef.anims[this.currentState];
    const offsetX = cfg.frameWidth / 2 - radius;
    const offsetY = cfg.frameHeight / 2 - radius + (this.isBoss ? 10 : 4);
    this.sprite.body.setCircle(radius, offsetX, offsetY);
  }
}
