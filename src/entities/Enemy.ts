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

  // Mecânicas avançadas de Sono (Bulbasaur Pó do Sono / Jigglypuff)
  public isSleeping = false;
  public sleepRemainingMs = 0;

  // Máquina de estados da investida telegrafada do Boss Onix
  public onixPhase: 'pursue' | 'warning' | 'charge' | 'rest' = 'pursue';
  public onixPhaseTimerMs = 0;
  public onixChargeAngle = 0;
  public onixWarningGfx: Phaser.GameObjects.Rectangle | null = null;
  public isCharging = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    pokemonId: string,
    hpMultiplier = 1
  ) {
    this.scene = scene;
    this.pokemonDef = POKEMON_MANIFEST[pokemonId];
    this.isBoss = this.pokemonDef.role === 'boss';
    this.maxHp = Math.round(this.pokemonDef.baseHp * hpMultiplier);
    this.hp = this.maxHp;

    this.shadow = scene.add
      .ellipse(
        x,
        y + (this.isBoss ? 22 : 10),
        this.isBoss ? 64 : 22,
        this.isBoss ? 22 : 9,
        0x000000,
        this.isBoss ? 0.45 : 0.3
      )
      .setDepth(DEPTH.SHADOW);

    const initialTex = PokemonAnimationManager.getTextureKey(pokemonId, 'Walk');
    this.sprite = scene.physics.add
      .sprite(x, y, initialTex, 0)
      .setScale(this.pokemonDef.scale)
      .setDepth(depthForY(y));

    this.sprite.setCollideWorldBounds(true);
    this.syncHitbox();
    this.playAnim(true);
  }

  getName(): string {
    return this.pokemonDef.name;
  }

  getContactRadius(): number {
    if (this.isSleeping) return 0;
    return this.isBoss ? (this.isCharging ? 46 : 36) : 20;
  }

  isIncapacitated(): boolean {
    return (this.slowTimerMs > 0 && this.slowFactor < 0.05) || this.isSleeping;
  }

  dormir(ms: number): void {
    if (this.isDead) return;
    const effectiveMs = this.isBoss ? Math.min(2000, Math.round(ms * 0.5)) : ms;
    this.isSleeping = true;
    this.sleepRemainingMs = effectiveMs;
    this.sprite.setVelocity(0, 0);
    this.currentState = 'Idle';
    this.playAnim(true);

    if (this.onixWarningGfx) {
      this.onixWarningGfx.destroy();
      this.onixWarningGfx = null;
    }

    if (!this.sleepIcon) {
      this.sleepIcon = this.scene.add
        .text(
          this.sprite.x + 8,
          this.sprite.y - (this.isBoss ? 50 : 26),
          'z z',
          {
            fontFamily: 'monospace',
            fontSize: this.isBoss ? '18px' : '14px',
            fontStyle: 'bold',
            color: '#e8dcff',
            stroke: '#4a3a8a',
            strokeThickness: 3.5,
          }
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.FLOATING_TEXT + 1);
    } else {
      this.sleepIcon.setText('z z');
    }
  }

  hasSlowOrParalysis(): boolean {
    return this.slowTimerMs > 0 || this.isSleeping;
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

    // Mecânica de Sono (Pó do Sono / Canção)
    if (this.isSleeping) {
      this.sleepRemainingMs -= delta;
      this.sprite.setVelocity(0, 0);
      if (this.sleepIcon) {
        this.sleepIcon.setPosition(
          this.sprite.x + 8,
          this.sprite.y -
            (this.isBoss ? 52 : 26) +
            Math.sin(this.scene.time.now / 220) * 3
        );
      }
      if (this.sleepRemainingMs <= 0) {
        this.isSleeping = false;
        this.clearSleepIcon();
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
    this.shadow.destroy();
    this.sprite.destroy();
  }

  private syncShadowAndDepth(): void {
    this.shadow.setPosition(
      this.sprite.x,
      this.sprite.y + (this.isBoss ? 24 : 10)
    );
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

    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      alpha: 0,
      scale: 0.3,
      duration: this.isBoss ? 550 : 220,
      onComplete: () => {
        this.shadow.destroy();
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
    const radius = this.isBoss ? BOSS_HITBOX_RADIUS : ENEMY_HITBOX_RADIUS;
    const cfg = this.pokemonDef.anims[this.currentState];
    const offsetX = cfg.frameWidth / 2 - radius;
    const offsetY = cfg.frameHeight / 2 - radius + (this.isBoss ? 10 : 4);
    this.sprite.body.setCircle(radius, offsetX, offsetY);
  }
}
