import Phaser from 'phaser';
import {
  ABILITIES,
  AbilityId,
  SPECIALS,
  SpecialDefinition,
} from '../config/abilities';
import {
  POKEMON_CLASSES,
  POKEMON_MANIFEST,
  PokemonAnimType,
  PokemonAttackProfile,
  PokemonClassDefinition,
  PokemonDefinition,
} from '../config/pokemonManifest';
import { DEPTH, depthForY } from '../systems/depth';
import {
  Direction8,
  PokemonAnimationManager,
} from '../systems/PokemonAnimationManager';
import { Enemy } from './Enemy';

const HITBOX_RADIUS = 9;

/** Esquiva (Dash) */
export const DASH_COOLDOWN_MS = 2000;
const DASH_DURATION_MS = 180;
const DASH_SPEED = 820;
const DASH_INVULNERABLE_MS = 320;

/** Especial (ULT) */
export const SPECIAL_MAX_ENERGY = 100;
const SPECIAL_PASSIVE_GAIN_PER_SEC = 2.5;
const SPECIAL_GAIN_PER_HIT = 4;

const BASE_XP_PICKUP_RADIUS = 150;

export interface XpGainResult {
  levelsGained: number;
  newLevel: number;
  evolvedFrom?: string;
  evolvedTo?: string;
}

interface DamageOptions {
  special?: boolean;
  knockback?: number;
  fromX?: number;
  fromY?: number;
  secondary?: boolean;
  skipBasicProc?: boolean;
}

interface ProjectileConfig {
  x: number;
  y: number;
  angle: number;
  speed: number;
  range: number;
  hitRadius: number;
  pierce: number;
  sheetKey?: string;
  animKey?: string;
  drawFallback: () => Phaser.GameObjects.Shape | Phaser.GameObjects.Image;
  rotateSpeed?: number;
  trailColor?: number;
  scale?: number;
  onHit: (enemy: Enemy, px: number, py: number) => void;
  onEnd?: (px: number, py: number) => void;
}

interface FlamePatch {
  x: number;
  y: number;
  remainingMs: number;
  dps: number;
  gfx: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
}

interface SporeCloud {
  x: number;
  y: number;
  radius: number;
  remainingMs: number;
  dps: number;
  gfx: Phaser.GameObjects.Arc;
}

export class Player {
  public readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private shadow: Phaser.GameObjects.Ellipse;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private shieldBubbleGfx: Phaser.GameObjects.Arc;
  private wishBubbleGfx: Phaser.GameObjects.Arc;
  private scene: Phaser.Scene;

  private pokemonDef: PokemonDefinition;
  private classDef: PokemonClassDefinition;
  private currentDir: Direction8 = 0;
  private currentState: PokemonAnimType = 'Idle';
  private isAttacking = false;
  private attackAnimSafetyMs = 0;

  public level = 1;
  public xp = 0;
  public xpToNextLevel = 30;

  public maxHp: number;
  public hp: number;
  public isDead = false;

  // Escudo de absorção (Faixa de Foco / shield_regen)
  public shieldHp = 0;
  public maxShieldHp = 0;
  private timeSinceLastDamageMs = 0;

  // Barreira Feérica (Desejo Estelar / fairy_wish_barrier)
  private wishBarrierAvailable = false;
  private wishBarrierTimerMs = 0;

  private invulnerableMs = 0;
  private painPortraitTimerMs = 0;
  private regenAccumMs = 0;
  private supportBuffTimerMs = 0;
  private lifestealAccum = 0;
  private aquaRingHealTimerMs = 0;

  // Combate e contadores de habilidades exclusivas
  private attackCooldownRemaining = 0;
  private basicAttackCounter = 0;
  private enemiesProvider: () => Enemy[] = () => [];
  private onKill: (enemy: Enemy) => void = () => {};

  // Timers periódicos de habilidades ativas exclusivas
  private voltOrbTimerMs = 0;
  private thunderWaveTimerMs = 0;
  private vineWhipTimerMs = 0;
  private icyWindTimerMs = 0;
  private moonblastTimerMs = 0;

  // Esquiva (Dash)
  public dashCooldownRemaining = 0;
  private dashTimeRemaining = 0;
  private dashVec = new Phaser.Math.Vector2(0, 1);
  private afterimageAccumMs = 0;

  // Especial
  public specialEnergy = 0;

  // Habilidades aprendidas e órbitas (Giro de Fogo / Anel de Água)
  private abilityLevels = new Map<AbilityId, number>();
  private orbitals: Array<Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc> = [];
  private orbitAngle = 0;
  private orbitHitCooldown = new Map<Enemy, number>();

  // Efeitos de campo
  private flamePatches: FlamePatch[] = [];
  private sporeClouds: SporeCloud[] = [];
  private flameTrailDropCooldownMs = 0;

  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
  };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    selectedPokemonId = '0025'
  ) {
    this.scene = scene;
    this.pokemonDef =
      POKEMON_MANIFEST[selectedPokemonId] ?? POKEMON_MANIFEST['0025'];
    this.classDef = POKEMON_CLASSES[this.pokemonDef.classId ?? 'disparador'];

    this.maxHp = this.computeMaxHp();
    this.hp = this.maxHp;

    this.shadow = scene.add
      .ellipse(x, y + 10, 26, 11, 0x000000, 0.35)
      .setDepth(DEPTH.SHADOW);

    this.shieldBubbleGfx = scene.add
      .circle(x, y, 22, 0x38bdf8, 0.16)
      .setStrokeStyle(2, 0x7dd3fc, 0.88)
      .setDepth(DEPTH.EFFECTS)
      .setVisible(false);

    this.wishBubbleGfx = scene.add
      .circle(x, y, 25, 0xf472b6, 0.15)
      .setStrokeStyle(2, 0xfbcfe8, 0.9)
      .setDepth(DEPTH.EFFECTS + 1)
      .setVisible(false);

    this.sprite = scene.physics.add
      .sprite(
        x,
        y,
        PokemonAnimationManager.getTextureKey(this.pokemonDef.id, 'Idle'),
        0
      )
      .setScale(this.pokemonDef.scale)
      .setDepth(depthForY(y));
    this.sprite.setCollideWorldBounds(true);

    this.hpBarBg = scene.add
      .rectangle(x, y - 26, 38, 6, 0x000000, 0.75)
      .setDepth(DEPTH.HP_BAR);
    this.hpBarFill = scene.add
      .rectangle(x - 18, y - 26, 36, 4, 0x4ade80, 1)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.HP_BAR + 1);

    this.syncHitboxToCurrentFrame();
    this.playCurrentAnim(true);

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = scene.input.keyboard!.addKeys({
      W: K.W,
      A: K.A,
      S: K.S,
      D: K.D,
      UP: K.UP,
      DOWN: K.DOWN,
      LEFT: K.LEFT,
      RIGHT: K.RIGHT,
      SPACE: K.SPACE,
      SHIFT: K.SHIFT,
      E: K.E,
      Q: K.Q,
    }) as typeof this.keys;

    this.sprite.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (anim.key.includes('-Attack-')) {
          this.finishAttackAnim();
        }
      }
    );
  }

  // ===================== CONTEXTO / GETTERS =====================

  setCombatContext(
    provider: () => Enemy[],
    onKill: (enemy: Enemy) => void
  ): void {
    this.enemiesProvider = provider;
    this.onKill = onKill;
  }

  teleportTo(x: number, y: number): void {
    this.dashTimeRemaining = 0;
    this.sprite.setPosition(x, y);
    this.sprite.body.reset(x, y);
    this.sprite.setVelocity(0, 0);
    this.sprite.setDepth(depthForY(y));
    this.shadow.setPosition(x, y + 10);
    this.shieldBubbleGfx.setPosition(x, y);
    this.wishBubbleGfx.setPosition(x, y);
    this.updateHpBar();
  }

  getPokemonDefinition(): PokemonDefinition {
    return this.pokemonDef;
  }

  getClassDefinition(): PokemonClassDefinition {
    return this.classDef;
  }

  getSpecialDefinition(): SpecialDefinition {
    return SPECIALS[this.pokemonDef.attackProfile!.style];
  }

  getAbilityLevel(id: AbilityId): number {
    return this.abilityLevels.get(id) ?? 0;
  }

  getAbilityLevels(): Map<AbilityId, number> {
    return this.abilityLevels;
  }

  getXpPickupRadius(): number {
    return BASE_XP_PICKUP_RADIUS * (1 + this.getAbilityLevel('magnet') * 0.4);
  }

  getXpMultiplier(): number {
    return 1 + this.getAbilityLevel('magnet') * 0.08;
  }

  getEffectiveDashCooldownMs(): number {
    return Math.max(
      850,
      DASH_COOLDOWN_MS - this.getAbilityLevel('quick_charge') * 220
    );
  }

  isSpecialReady(): boolean {
    return this.specialEnergy >= SPECIAL_MAX_ENERGY;
  }

  isInPain(): boolean {
    return this.painPortraitTimerMs > 0 || this.isDead;
  }

  private get profile(): PokemonAttackProfile {
    return this.pokemonDef.attackProfile!;
  }

  private get rangeMult(): number {
    return (
      1 +
      this.getAbilityLevel('pierce') * 0.12 +
      this.getAbilityLevel('fire_tough_claws') * 0.08 +
      this.getAbilityLevel('fairy_hyper_voice') * 0.18
    );
  }

  private get moveSpeed(): number {
    const agilityBonus =
      this.getAbilityLevel('agility') * 0.08 +
      this.getAbilityLevel('elec_surge_surfer') * 0.07 +
      this.getAbilityLevel('grass_chlorophyll') * 0.07;
    return (
      this.pokemonDef.speed *
      this.classDef.stats.speedMultiplier *
      (1 + agilityBonus)
    );
  }

  private get attackCooldownMs(): number {
    const cdr = Math.min(
      0.62,
      this.getAbilityLevel('haste') * 0.08 +
        this.getAbilityLevel('elec_surge_surfer') * 0.07
    );
    return this.profile.cooldownMs * (1 - cdr);
  }

  private get healEfficiency(): number {
    return (
      this.classDef.stats.healEfficiencyMultiplier *
      (1 + this.getAbilityLevel('fairy_friend_guard') * 0.18)
    );
  }

  private computeMaxHp(): number {
    return Math.round(
      this.pokemonDef.baseHp *
        this.classDef.stats.hpMultiplier *
        (1 + (this.level - 1) * 0.08) *
        (1 + this.getAbilityLevel('vigor') * 0.15)
    );
  }

  // ===================== APRENDIZADO DE HABILIDADES =====================

  learnAbility(id: AbilityId): void {
    const def = ABILITIES[id];
    const next = Math.min(def.maxLevel, this.getAbilityLevel(id) + 1);
    this.abilityLevels.set(id, next);

    if (id === 'vigor') {
      const oldMax = this.maxHp;
      this.maxHp = this.computeMaxHp();
      this.hp = Math.min(
        this.maxHp,
        this.hp + (this.maxHp - oldMax) + Math.round(this.maxHp * 0.2)
      );
    }
    if (id === 'shield_regen') {
      this.maxShieldHp = next * 28;
      this.shieldHp = this.maxShieldHp;
    }
    if (id === 'fairy_wish_barrier') {
      this.wishBarrierAvailable = true;
    }
    if (id === 'fire_spin' || id === 'water_aqua_ring') {
      this.rebuildOrbitals();
    }
    this.updateHpBar();
  }

  private rebuildOrbitals(): void {
    this.orbitals.forEach((o) => o.destroy());
    this.orbitals = [];

    const fireSpinLvl = this.getAbilityLevel('fire_spin');
    const aquaRingLvl = this.getAbilityLevel('water_aqua_ring');
    const lvl = Math.max(fireSpinLvl, aquaRingLvl);
    if (lvl <= 0) return;

    const count = lvl + 1;
    const isFire = fireSpinLvl > 0;

    for (let i = 0; i < count; i++) {
      if (isFire && this.scene.textures.exists('sheet-attack-fire')) {
        const spr = this.scene.add
          .sprite(this.sprite.x, this.sprite.y, 'sheet-attack-fire', 2)
          .setScale(0.55)
          .setDepth(DEPTH.ORBITALS);
        spr.play('anim-attack-fire');
        this.orbitals.push(spr);
      } else if (!isFire && this.scene.textures.exists('sheet-attack-water')) {
        const spr = this.scene.add
          .sprite(this.sprite.x, this.sprite.y, 'sheet-attack-water', 1)
          .setScale(0.55)
          .setDepth(DEPTH.ORBITALS);
        spr.play('anim-attack-water');
        this.orbitals.push(spr);
      } else {
        const orb = this.scene.add
          .circle(this.sprite.x, this.sprite.y, 8, this.profile.elementColor, 1)
          .setStrokeStyle(2, this.profile.secondaryColor, 1)
          .setDepth(DEPTH.ORBITALS);
        this.orbitals.push(orb);
      }
    }
  }

  // ===================== XP / NÍVEL / EVOLUÇÃO =====================

  gainXp(rawAmount: number): XpGainResult {
    this.xp += Math.round(rawAmount * this.getXpMultiplier());
    let levelsGained = 0;
    let evolvedFrom: string | undefined;
    let evolvedTo: string | undefined;

    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      this.xpToNextLevel = Math.round(this.xpToNextLevel * 1.28);
      levelsGained++;

      const evoId = this.pokemonDef.evolvesToId;
      if (
        evoId &&
        this.pokemonDef.evolveAtLevel &&
        this.level >= this.pokemonDef.evolveAtLevel
      ) {
        evolvedFrom = this.pokemonDef.name;
        this.evolveTo(POKEMON_MANIFEST[evoId]);
        evolvedTo = this.pokemonDef.name;
      } else {
        this.maxHp = this.computeMaxHp();
        this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.3));
      }
    }

    if (levelsGained > 0) {
      this.playLevelUpEffect(Boolean(evolvedTo));
      this.updateHpBar();
    }

    return { levelsGained, newLevel: this.level, evolvedFrom, evolvedTo };
  }

  private evolveTo(nextDef: PokemonDefinition): void {
    this.pokemonDef = nextDef;
    this.isAttacking = false;
    this.maxHp = this.computeMaxHp();
    this.hp = this.maxHp;
    this.sprite.setScale(this.pokemonDef.scale);
    this.currentState = 'Idle';
    this.playCurrentAnim(true);
    this.rebuildOrbitals();
  }

  private playLevelUpEffect(isEvolution: boolean): void {
    const color = isEvolution ? 0x38bdf8 : 0xffcb05;
    const ring = this.scene.add
      .circle(this.sprite.x, this.sprite.y, 14, color, 0.55)
      .setStrokeStyle(3, 0xffffff, 1)
      .setDepth(DEPTH.EFFECTS);

    this.scene.tweens.add({
      targets: ring,
      radius: isEvolution ? 95 : 58,
      alpha: 0,
      duration: isEvolution ? 650 : 380,
      onComplete: () => ring.destroy(),
    });
  }

  // ===================== DANO RECEBIDO, ESCUDOS & PASSIVAS DE CONTATO =====================

  receiveDamage(rawAmount: number, attacker?: Enemy): void {
    if (this.invulnerableMs > 0 || this.isDead) return;

    this.timeSinceLastDamageMs = 0;

    // Passivas Inatas de Contato: Estática (Pikachu/Raichu) & Charme Fofo (Jigglypuff/Wigglytuff)
    if (attacker && !attacker.isDead) {
      const contactChance =
        this.pokemonDef.role === 'evolution' ? 0.35 : 0.3;
      if (
        this.profile.element === 'eletrico' &&
        Math.random() < contactChance
      ) {
        attacker.applyStatusEffect({
          slowFactor: 0.02,
          slowDurationMs: 1100,
          tintColor: 0xfef08a,
          statusIcon: '⚡',
        });
      } else if (
        this.profile.element === 'fada' &&
        Math.random() < contactChance
      ) {
        attacker.applyStatusEffect({
          slowFactor: 0.25,
          slowDurationMs: 1800,
          tintColor: 0xf9a8d4,
          statusIcon: '💖',
        });
      }
    }

    // 1. Barreira Feérica (Desejo Estelar / fairy_wish_barrier)
    if (this.wishBarrierAvailable) {
      this.wishBarrierAvailable = false;
      const wishLvl = this.getAbilityLevel('fairy_wish_barrier');
      this.wishBarrierTimerMs = Math.max(8000, (17 - wishLvl * 3) * 1000);
      this.invulnerableMs = 600;
      this.heal(Math.round((12 + wishLvl * 9) * this.healEfficiency));

      const burst = this.scene.add
        .circle(this.sprite.x, this.sprite.y, 16, 0xffb3c6, 0.6)
        .setStrokeStyle(4, 0xffffff, 1)
        .setDepth(DEPTH.EFFECTS);
      this.scene.tweens.add({
        targets: burst,
        radius: 125,
        alpha: 0,
        duration: 350,
        onComplete: () => burst.destroy(),
      });

      for (const e of this.enemiesProvider()) {
        if (
          !e.isDead &&
          Phaser.Math.Distance.Between(
            this.sprite.x,
            this.sprite.y,
            e.sprite.x,
            e.sprite.y
          ) <= 125
        ) {
          e.applyStatusEffect({
            slowFactor: 0.12,
            slowDurationMs: 1900,
            tintColor: 0xf9a8d4,
            statusIcon: '💖',
          });
        }
      }
      return;
    }

    const extraDr =
      this.getAbilityLevel('water_mega_launcher') * 0.05 +
      this.getAbilityLevel('fairy_friend_guard') * 0.05;
    const totalDr = Math.min(0.65, this.classDef.stats.damageReduction + extraDr);

    let finalDamage = Math.max(1, Math.round(rawAmount * (1 - totalDr)));

    // 2. Faixa de Foco (escudo de absorção)
    if (this.shieldHp > 0) {
      if (this.shieldHp >= finalDamage) {
        this.shieldHp -= finalDamage;
        finalDamage = 0;
      } else {
        finalDamage -= this.shieldHp;
        this.shieldHp = 0;
      }
      this.shieldBubbleGfx.setStrokeStyle(4, 0xffffff, 1);
      this.scene.time.delayedCall(120, () => {
        if (this.shieldBubbleGfx.active) {
          this.shieldBubbleGfx.setStrokeStyle(2, 0x7dd3fc, 0.88);
        }
      });
    }

    if (finalDamage <= 0) {
      this.updateHpBar();
      return;
    }

    this.hp = Math.max(0, this.hp - finalDamage);
    this.invulnerableMs = 650;
    this.painPortraitTimerMs = 620;

    this.sprite.setTint(0xff5555);
    this.scene.time.delayedCall(150, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });

    if (this.hp <= 0) {
      this.isDead = true;
      this.sprite.setVelocity(0, 0);
    }
    this.updateHpBar();
  }

  public heal(amount: number): void {
    if (amount <= 0 || this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateHpBar();
  }

  // ===================== LOOP PRINCIPAL =====================

  update(
    delta: number
  ): { specialUsed: boolean; specialNotReady: boolean; dashed: boolean } {
    const result = {
      specialUsed: false,
      specialNotReady: false,
      dashed: false,
    };
    if (this.isDead) {
      this.sprite.setVelocity(0, 0);
      return result;
    }

    this.tickTimers(delta);

    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (k.LEFT.isDown || k.A.isDown) vx -= 1;
    if (k.RIGHT.isDown || k.D.isDown) vx += 1;
    if (k.UP.isDown || k.W.isDown) vy -= 1;
    if (k.DOWN.isDown || k.S.isDown) vy += 1;
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    const isMoving = vx !== 0 || vy !== 0;
    if (isMoving) {
      this.currentDir = PokemonAnimationManager.vectorToDirection(
        vx,
        vy,
        this.currentDir
      );

      const flameChargeLvl = this.getAbilityLevel('fire_flame_charge');
      if (flameChargeLvl > 0) {
        this.flameTrailDropCooldownMs -= delta;
        if (this.flameTrailDropCooldownMs <= 0) {
          this.flameTrailDropCooldownMs = 175;
          this.dropFlamePatch(
            this.sprite.x,
            this.sprite.y + 4,
            flameChargeLvl
          );
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(k.SHIFT)) {
      result.dashed = this.tryDash(vx, vy);
    }

    if (this.dashTimeRemaining > 0) {
      this.dashTimeRemaining -= delta;
      this.sprite.setVelocity(
        this.dashVec.x * DASH_SPEED,
        this.dashVec.y * DASH_SPEED
      );
      this.afterimageAccumMs += delta;
      if (this.afterimageAccumMs >= 24) {
        this.afterimageAccumMs = 0;
        this.spawnAfterimage();
        const flameChargeLvl = this.getAbilityLevel('fire_flame_charge');
        if (flameChargeLvl > 0) {
          this.dropFlamePatch(this.sprite.x, this.sprite.y + 4, flameChargeLvl);
        }
      }
    } else {
      const speed = this.isAttacking ? this.moveSpeed * 0.6 : this.moveSpeed;
      this.sprite.setVelocity(vx * speed, vy * speed);
    }

    if (
      Phaser.Input.Keyboard.JustDown(k.E) ||
      Phaser.Input.Keyboard.JustDown(k.Q)
    ) {
      if (this.isSpecialReady()) {
        this.executeSpecial();
        result.specialUsed = true;
      } else {
        result.specialNotReady = true;
      }
    }

    const manual = Phaser.Input.Keyboard.JustDown(k.SPACE);
    if (
      this.attackCooldownRemaining <= 0 &&
      (manual ||
        this.hasEnemyWithin(this.profile.range * this.rangeMult * 1.05))
    ) {
      if (this.executeBasicAttack()) {
        this.attackCooldownRemaining = this.attackCooldownMs;
      }
    }

    if (!this.isAttacking) {
      const desired: PokemonAnimType =
        isMoving || this.dashTimeRemaining > 0 ? 'Walk' : 'Idle';
      if (desired !== this.currentState) {
        this.currentState = desired;
        this.playCurrentAnim(true);
      } else {
        this.playCurrentAnim(false);
      }
    }

    this.updateOrbitals(delta);
    this.updateFieldHazards(delta);

    this.shadow.setPosition(this.sprite.x, this.sprite.y + 11);
    this.shieldBubbleGfx.setPosition(this.sprite.x, this.sprite.y);
    this.shieldBubbleGfx.setVisible(this.shieldHp > 0);
    this.wishBubbleGfx.setPosition(this.sprite.x, this.sprite.y);
    this.wishBubbleGfx.setVisible(this.wishBarrierAvailable);
    this.sprite.setDepth(depthForY(this.sprite.y) + 0.0001);
    this.sprite.setAlpha(
      this.invulnerableMs > 0 && this.dashTimeRemaining <= 0 ? 0.75 : 1
    );
    this.updateHpBar();

    return result;
  }

  private tickTimers(delta: number): void {
    if (this.invulnerableMs > 0) this.invulnerableMs -= delta;
    if (this.painPortraitTimerMs > 0) this.painPortraitTimerMs -= delta;
    if (this.supportBuffTimerMs > 0) this.supportBuffTimerMs -= delta;
    if (this.attackCooldownRemaining > 0) this.attackCooldownRemaining -= delta;
    if (this.dashCooldownRemaining > 0) this.dashCooldownRemaining -= delta;

    this.timeSinceLastDamageMs += delta;

    // Recarga do Escudo (Faixa de Foco)
    const shieldLvl = this.getAbilityLevel('shield_regen');
    if (shieldLvl > 0) {
      this.maxShieldHp = shieldLvl * 28;
      if (
        this.timeSinceLastDamageMs >= 3500 &&
        this.shieldHp < this.maxShieldHp
      ) {
        this.shieldHp = this.maxShieldHp;
      }
    }

    // Recarga da Barreira Feérica (Desejo Estelar)
    if (
      this.getAbilityLevel('fairy_wish_barrier') > 0 &&
      !this.wishBarrierAvailable
    ) {
      this.wishBarrierTimerMs -= delta;
      if (this.wishBarrierTimerMs <= 0) {
        this.wishBarrierAvailable = true;
      }
    }

    // Cura periódica do Anel de Água (Aqua Ring)
    const aquaRingLvl = this.getAbilityLevel('water_aqua_ring');
    if (aquaRingLvl > 0) {
      this.aquaRingHealTimerMs += delta;
      if (this.aquaRingHealTimerMs >= 4000) {
        this.aquaRingHealTimerMs -= 4000;
        this.heal(Math.round(aquaRingLvl * 2 * this.healEfficiency));
      }
    }

    // Ativas Periódicas Exclusivas
    const voltOrbLvl = this.getAbilityLevel('elec_volt_orb');
    if (voltOrbLvl > 0) {
      this.voltOrbTimerMs += delta;
      if (this.voltOrbTimerMs >= (4.4 - voltOrbLvl * 0.6) * 1000) {
        if (this.hasEnemyWithin(340)) {
          this.voltOrbTimerMs = 0;
          this.fireElectroBall(voltOrbLvl);
        }
      }
    }

    const thunderWaveLvl = this.getAbilityLevel('elec_thunder_wave');
    if (thunderWaveLvl > 0) {
      this.thunderWaveTimerMs += delta;
      if (this.thunderWaveTimerMs >= (7 - thunderWaveLvl) * 1000) {
        this.thunderWaveTimerMs = 0;
        this.triggerThunderWave(thunderWaveLvl);
      }
    }

    const vineWhipLvl = this.getAbilityLevel('grass_vine_whip');
    if (vineWhipLvl > 0) {
      this.vineWhipTimerMs += delta;
      if (this.vineWhipTimerMs >= (4.2 - vineWhipLvl * 0.6) * 1000) {
        if (this.hasEnemyWithin(260)) {
          this.vineWhipTimerMs = 0;
          this.fireVineWhip(vineWhipLvl);
        }
      }
    }

    const icyWindLvl = this.getAbilityLevel('water_icy_wind');
    if (icyWindLvl > 0) {
      this.icyWindTimerMs += delta;
      if (this.icyWindTimerMs >= (7 - icyWindLvl) * 1000) {
        this.icyWindTimerMs = 0;
        this.triggerIcyWind(icyWindLvl);
      }
    }

    const moonblastLvl = this.getAbilityLevel('fairy_moonblast');
    if (moonblastLvl > 0) {
      this.moonblastTimerMs += delta;
      if (this.moonblastTimerMs >= (3.8 - moonblastLvl * 0.5) * 1000) {
        if (this.hasEnemyWithin(310)) {
          this.moonblastTimerMs = 0;
          this.fireMoonblast(moonblastLvl);
        }
      }
    }

    if (this.isAttacking) {
      this.attackAnimSafetyMs -= delta;
      if (this.attackAnimSafetyMs <= 0) this.finishAttackAnim();
    }

    this.addSpecialEnergy((SPECIAL_PASSIVE_GAIN_PER_SEC * delta) / 1000);

    // Regeneração Passiva (Classe + Cura da Chuva + Clorofila Solar)
    const regenPerSec =
      this.classDef.stats.passiveRegenPercentPerSec +
      this.getAbilityLevel('water_rain_dish') * 0.011 +
      this.getAbilityLevel('grass_chlorophyll') * 0.006;

    if (regenPerSec > 0 && this.hp < this.maxHp) {
      this.regenAccumMs += delta;
      if (this.regenAccumMs >= 1000) {
        this.regenAccumMs -= 1000;
        this.heal(
          Math.max(1, Math.round(this.maxHp * regenPerSec * this.healEfficiency))
        );
      }
    }
  }

  private finishAttackAnim(): void {
    this.isAttacking = false;
    this.currentState = 'Idle';
    this.playCurrentAnim(true);
  }

  // ===================== ESQUIVA (DASH) =====================

  private tryDash(vx: number, vy: number): boolean {
    if (this.dashCooldownRemaining > 0 || this.dashTimeRemaining > 0)
      return false;

    if (vx === 0 && vy === 0) {
      const facingDeg = [90, 45, 0, -45, -90, -135, 180, 135][this.currentDir];
      const rad = Phaser.Math.DegToRad(facingDeg);
      this.dashVec.set(Math.cos(rad), Math.sin(rad));
    } else {
      this.dashVec.set(vx, vy).normalize();
    }

    this.dashTimeRemaining = DASH_DURATION_MS;
    this.dashCooldownRemaining = this.getEffectiveDashCooldownMs();
    this.invulnerableMs = Math.max(this.invulnerableMs, DASH_INVULNERABLE_MS);

    const puff = this.scene.add
      .ellipse(this.sprite.x, this.sprite.y + 10, 20, 9, 0xffffff, 0.6)
      .setDepth(DEPTH.SHADOW + 1);
    this.scene.tweens.add({
      targets: puff,
      scaleX: 2.6,
      scaleY: 2,
      alpha: 0,
      duration: 300,
      onComplete: () => puff.destroy(),
    });
    return true;
  }

  private spawnAfterimage(): void {
    const ghost = this.scene.add
      .sprite(
        this.sprite.x,
        this.sprite.y,
        this.sprite.texture.key,
        this.sprite.frame.name
      )
      .setScale(this.sprite.scaleX)
      .setTintFill(this.classDef.colorNum)
      .setAlpha(0.45)
      .setDepth(this.sprite.depth - 0.001);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 220,
      onComplete: () => ghost.destroy(),
    });
  }

  // ===================== ENERGIA DO ESPECIAL =====================

  private addSpecialEnergy(amount: number): void {
    const classBonus = this.classDef.id === 'controlador' ? 1.3 : 1;
    const passiveBonus =
      1 +
      this.getAbilityLevel('energy') * 0.2 +
      this.getAbilityLevel('grass_chlorophyll') * 0.16;
    this.specialEnergy = Math.min(
      SPECIAL_MAX_ENERGY,
      this.specialEnergy + amount * classBonus * passiveBonus
    );
  }

  // ===================== PIPELINE DE DANO & PASSIVAS CANÔNICAS =====================

  private getInnateLowHpDamageMult(): number {
    const ratio = this.hp / Math.max(1, this.maxHp);
    if (this.profile.element === 'fogo') {
      // Blaze: até +30% de dano de Fogo com HP baixo
      return ratio < 0.2 ? 1.3 : ratio < 0.3 ? 1.185 : ratio < 0.4 ? 1.1 : 1;
    }
    if (
      (this.profile.element === 'planta' || this.profile.element === 'agua') &&
      ratio <= 0.4
    ) {
      // Overgrow / Torrent: +22% de dano abaixo de 40% de HP
      return 1.22;
    }
    return 1;
  }

  private calculateDamage(
    base: number,
    special: boolean,
    targetEnemy?: Enemy
  ): { damage: number; isCrit: boolean } {
    const s = this.classDef.stats;
    const statMult = special ? s.specDamageMultiplier : s.physDamageMultiplier;
    const levelMult = 1 + (this.level - 1) * 0.08;
    const buffMult = this.supportBuffTimerMs > 0 ? s.soloBuffMultiplier : 1;
    const innateLowHp = this.getInnateLowHpDamageMult();

    // Passivas de dano genéricas + exclusivas do Pokémon
    const powerMult =
      1 +
      this.getAbilityLevel('power') * 0.12 +
      this.getAbilityLevel('fire_tough_claws') * 0.15 +
      this.getAbilityLevel('water_mega_launcher') * 0.14 +
      this.getAbilityLevel('fairy_pixilate') * 0.14 +
      (special ? this.getAbilityLevel('fire_solar_power') * 0.18 : 0);

    let targetBonusMult = 1;
    const executeLvl = this.getAbilityLevel('execute');
    if (
      executeLvl > 0 &&
      targetEnemy &&
      targetEnemy.hp / Math.max(1, targetEnemy.maxHp) <= 0.45
    ) {
      targetBonusMult *= 1 + executeLvl * 0.18;
    }

    const lightningRodLvl = this.getAbilityLevel('elec_lightning_rod');
    if (
      lightningRodLvl > 0 &&
      targetEnemy &&
      targetEnemy.hasSlowOrParalysis()
    ) {
      targetBonusMult *= 1 + lightningRodLvl * 0.16;
    }

    const critLvl = this.getAbilityLevel('crit');
    const critChance = 0.08 + s.critChanceBonus + critLvl * 0.06;
    const isCrit = Math.random() < critChance;
    const critMult = isCrit ? 1.5 + s.critDamageBonus + critLvl * 0.12 : 1;

    return {
      damage: Math.max(
        1,
        Math.round(
          base *
            statMult *
            levelMult *
            powerMult *
            buffMult *
            innateLowHp *
            targetBonusMult *
            critMult
        )
      ),
      isCrit,
    };
  }

  /**
   * Retorna a chance de status elemental no ataque básico:
   * Estritamente 5% base (innatePassive.baseStatusChance = 0.05) + bônus da passiva específica daquele Pokémon!
   */
  private getElementalStatusChance(): number {
    const baseChance = this.pokemonDef.innatePassive?.baseStatusChance ?? 0.05;
    switch (this.profile.element) {
      case 'eletrico':
        return baseChance + this.getAbilityLevel('elec_lightning_rod') * 0.08;
      case 'fogo':
        return baseChance + this.getAbilityLevel('fire_solar_power') * 0.08;
      case 'planta':
        return baseChance + this.getAbilityLevel('grass_effect_spore') * 0.08;
      case 'agua':
        return baseChance + this.getAbilityLevel('water_rain_dish') * 0.08;
      case 'fada':
        return baseChance + this.getAbilityLevel('fairy_pixilate') * 0.08;
    }
  }

  private dealDamage(
    enemy: Enemy,
    base: number,
    opts: DamageOptions = {}
  ): void {
    if (enemy.isDead) return;

    const fromX = opts.fromX ?? this.sprite.x;
    const fromY = opts.fromY ?? this.sprite.y;
    const special = Boolean(opts.special);
    const ex = enemy.sprite.x;
    const ey = enemy.sprite.y;

    const { damage, isCrit } = this.calculateDamage(
      base,
      special || this.profile.style !== 'melee_flame',
      enemy
    );
    const killed = enemy.takeDamage(
      damage,
      fromX,
      fromY,
      opts.knockback ?? 160,
      isCrit
    );

    if (!special) {
      this.addSpecialEnergy(opts.secondary ? 1.2 : SPECIAL_GAIN_PER_HIT);
    }

    // Concha Sino (Dreno Vital)
    const lifestealLvl = this.getAbilityLevel('lifesteal');
    if (lifestealLvl > 0) {
      this.lifestealAccum +=
        damage * lifestealLvl * 0.025 * this.healEfficiency;
      if (this.lifestealAccum >= 1) {
        const whole = Math.floor(this.lifestealAccum);
        this.lifestealAccum -= whole;
        this.heal(whole);
      }
    }

    // Chance de Status Elemental no Ataque (5% base + passiva própria do Pokémon)
    if (!killed && !opts.skipBasicProc) {
      if (Math.random() < this.getElementalStatusChance()) {
        this.applyCanonicalElementalStatus(enemy);
      }
    }

    // Exclusiva Planta: Semente Sanguessuga (Leech Seed)
    const leechLvl = this.getAbilityLevel('grass_leech_seed');
    if (leechLvl > 0 && !opts.secondary && Math.random() < 0.22 + leechLvl * 0.12) {
      this.triggerLeechSeedDrain(ex, ey, leechLvl);
    }

    // Exclusiva Planta: Pó Venenoso (Poison Powder)
    const powderLvl = this.getAbilityLevel('grass_poison_powder');
    if (powderLvl > 0 && !opts.secondary && Math.random() < 0.3) {
      this.dropSporeCloud(ex, ey, powderLvl);
    }

    // Exclusiva Elétrico: Descarga em Cadeia (Discharge)
    if (!opts.secondary) {
      this.triggerElectricDischarge(enemy, ex, ey, base, special);
    }

    if (killed) this.onKill(enemy);
  }

  private applyCanonicalElementalStatus(enemy: Enemy): void {
    const strength = 1 + this.classDef.stats.effectStrengthBonus;

    switch (this.profile.element) {
      case 'eletrico': {
        enemy.applyStatusEffect({
          slowFactor: 0.02,
          slowDurationMs: Math.round(750 * strength),
          tintColor: 0xfef08a,
          statusIcon: '⚡',
        });
        break;
      }
      case 'fogo': {
        const burnMult =
          (1 + this.getAbilityLevel('fire_solar_power') * 0.18) * strength;
        enemy.applyStatusEffect({
          dotDamagePerSec: 7 * burnMult,
          dotDurationMs: 2800,
          tintColor: 0xff7b00,
          statusIcon: '🔥',
        });
        break;
      }
      case 'planta': {
        const poisonMult =
          (1 + this.getAbilityLevel('grass_effect_spore') * 0.24) * strength;
        enemy.applyStatusEffect({
          slowFactor: 0.55,
          slowDurationMs: 2400,
          dotDamagePerSec: 6.5 * poisonMult,
          dotDurationMs: 3200,
          tintColor: 0x4ade80,
          statusIcon: '☠️',
        });
        break;
      }
      case 'agua': {
        enemy.applyStatusEffect({
          slowFactor: 0.45,
          slowDurationMs: Math.round(2300 * strength),
          tintColor: 0x7dd3fc,
          statusIcon: '💧',
        });
        break;
      }
      case 'fada': {
        enemy.applyStatusEffect({
          slowFactor: 0.25,
          slowDurationMs: Math.round(2000 * strength),
          tintColor: 0xf9a8d4,
          statusIcon: '💖',
        });
        break;
      }
    }
  }

  // ===================== HABILIDADES ATIVAS EXCLUSIVAS =====================

  private fireElectroBall(lvl: number): void {
    const aim = this.computeAimAngle(360);
    const speedRatio = this.moveSpeed / 180;
    const dmg = (42 + lvl * 18) * Math.max(1, speedRatio);

    this.spawnProjectile({
      x: this.sprite.x + Math.cos(aim) * 18,
      y: this.sprite.y + Math.sin(aim) * 18,
      angle: aim,
      speed: 430,
      range: 340,
      hitRadius: 34,
      pierce: 0,
      scale: 0.92,
      sheetKey: 'sheet-attack-eletric',
      animKey: 'anim-attack-eletric',
      trailColor: 0xfacc15,
      drawFallback: () =>
        this.scene.add
          .circle(0, 0, 13, 0xfacc15, 1)
          .setStrokeStyle(3, 0xffffff, 1),
      onHit: (_e, px, py) => {
        this.spawnElectricImpact(px, py, 64);
        for (const target of this.enemiesProvider()) {
          if (target.isDead) continue;
          if (
            Phaser.Math.Distance.Between(
              px,
              py,
              target.sprite.x,
              target.sprite.y
            ) <= 68
          ) {
            this.dealDamage(target, dmg, {
              knockback: 210,
              fromX: px,
              fromY: py,
              secondary: true,
            });
          }
        }
      },
    });
  }

  private triggerThunderWave(lvl: number): void {
    const radius = 135 + lvl * 18;
    const wave = this.scene.add
      .circle(this.sprite.x, this.sprite.y, 20, 0xfef08a, 0.24)
      .setStrokeStyle(3.5, 0xfacc15, 1)
      .setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({
      targets: wave,
      radius,
      alpha: 0,
      duration: 340,
      onComplete: () => wave.destroy(),
    });

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      if (
        Phaser.Math.Distance.Between(
          this.sprite.x,
          this.sprite.y,
          e.sprite.x,
          e.sprite.y
        ) <= radius
      ) {
        this.dealDamage(e, 14 + lvl * 8, {
          knockback: 140,
          secondary: true,
          skipBasicProc: true,
        });
        e.applyStatusEffect({
          slowFactor: 0.02,
          slowDurationMs: Math.round((0.9 + lvl * 0.35) * 1000),
          tintColor: 0xfef08a,
          statusIcon: '⚡',
        });
      }
    }
  }

  private triggerElectricDischarge(
    origin: Enemy,
    x: number,
    y: number,
    base: number,
    special: boolean
  ): void {
    const lvl = this.getAbilityLevel('elec_discharge');
    if (lvl <= 0) return;

    const targets = this.enemiesProvider()
      .filter((e) => e !== origin && !e.isDead)
      .map((e) => ({
        e,
        d: Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y),
      }))
      .filter((t) => t.d <= 175)
      .sort((a, b) => a.d - b.d)
      .slice(0, lvl + 1);

    for (const { e } of targets) {
      const g = this.scene.add.graphics().setDepth(DEPTH.EFFECTS + 1);
      g.lineStyle(3, 0xfef08a, 0.95);
      const midX = (x + e.sprite.x) / 2 + Phaser.Math.Between(-10, 10);
      const midY = (y + e.sprite.y) / 2 + Phaser.Math.Between(-10, 10);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(midX, midY);
      g.lineTo(e.sprite.x, e.sprite.y);
      g.strokePath();
      this.scene.tweens.add({
        targets: g,
        alpha: 0,
        duration: 170,
        onComplete: () => g.destroy(),
      });
      this.dealDamage(e, base * (0.38 + lvl * 0.1), {
        special,
        knockback: 95,
        fromX: x,
        fromY: y,
        secondary: true,
      });
    }
  }

  private fireFireBlast(aim: number, lvl: number): void {
    const dmg = 45 + lvl * 22;
    this.spawnProjectile({
      x: this.sprite.x + Math.cos(aim) * 20,
      y: this.sprite.y + Math.sin(aim) * 20,
      angle: aim,
      speed: 440,
      range: 270,
      hitRadius: 30,
      pierce: 0,
      scale: 0.85,
      sheetKey: 'sheet-attack-fire',
      animKey: 'anim-attack-fire',
      trailColor: 0xfb923c,
      drawFallback: () =>
        this.scene.add
          .circle(0, 0, 12, 0xff5722, 1)
          .setStrokeStyle(3, 0xfef08a, 1),
      onHit: (_e, px, py) => {
        this.detonateFireBlastStar(px, py, dmg);
      },
      onEnd: (px, py) => {
        this.detonateFireBlastStar(px, py, dmg * 0.75);
      },
    });
  }

  private detonateFireBlastStar(x: number, y: number, dmg: number): void {
    const radius = 68;
    const blast = this.scene.add
      .circle(x, y, 14, 0xff5722, 0.65)
      .setStrokeStyle(3, 0xfef08a, 1)
      .setDepth(DEPTH.EFFECTS + 1);
    this.scene.tweens.add({
      targets: blast,
      radius,
      alpha: 0,
      duration: 240,
      onComplete: () => blast.destroy(),
    });

    // 5 pontas clássicas do Fire Blast (Daimonji)
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      if (this.scene.textures.exists('sheet-attack-fire')) {
        const tongue = this.scene.add
          .sprite(x, y, 'sheet-attack-fire', 3)
          .setScale(0.55)
          .setRotation(a)
          .setDepth(DEPTH.EFFECTS + 2);
        this.scene.tweens.add({
          targets: tongue,
          x: x + Math.cos(a) * 46,
          y: y + Math.sin(a) * 46,
          alpha: 0,
          duration: 240,
          onComplete: () => tongue.destroy(),
        });
      }
    }

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      if (
        Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y) <= radius
      ) {
        this.dealDamage(e, dmg, {
          knockback: 220,
          fromX: x,
          fromY: y,
          secondary: true,
        });
      }
    }
  }

  private fireVineWhip(lvl: number): void {
    const aim = this.computeAimAngle(260);
    const length = (155 + lvl * 22) * this.rangeMult;
    const sx = this.sprite.x;
    const sy = this.sprite.y;
    const ex = sx + Math.cos(aim) * length;
    const ey = sy + Math.sin(aim) * length;

    const g = this.scene.add.graphics().setDepth(DEPTH.EFFECTS + 1);
    const perpX = -Math.sin(aim) * 20;
    const perpY = Math.cos(aim) * 20;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(sx, sy),
      new Phaser.Math.Vector2((sx + ex) / 2 + perpX, (sy + ey) / 2 + perpY),
      new Phaser.Math.Vector2(ex, ey)
    );
    g.lineStyle(7, 0x16a34a, 0.95);
    curve.draw(g, 16);
    g.lineStyle(3, 0x86efac, 1);
    curve.draw(g, 16);

    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 240,
      onComplete: () => g.destroy(),
    });

    const line = new Phaser.Geom.Line(sx, sy, ex, ey);
    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      const pt = Phaser.Geom.Line.GetNearestPoint(
        line,
        new Phaser.Geom.Point(e.sprite.x, e.sprite.y)
      );
      if (
        Phaser.Math.Distance.Between(pt.x, pt.y, e.sprite.x, e.sprite.y) <= 30 &&
        Phaser.Math.Distance.Between(sx, sy, e.sprite.x, e.sprite.y) <=
          length + 18
      ) {
        this.dealDamage(e, 36 + lvl * 18, {
          knockback: 260,
          fromX: sx,
          fromY: sy,
          secondary: true,
        });
        e.applyStatusEffect({
          slowFactor: 0.5,
          slowDurationMs: 1400,
          tintColor: 0x86efac,
        });
      }
    }
  }

  private triggerLeechSeedDrain(ex: number, ey: number, lvl: number): void {
    const seed = this.scene.add
      .circle(ex, ey, 5, 0x4ade80, 0.95)
      .setStrokeStyle(1.5, 0xfef08a, 1)
      .setDepth(DEPTH.EFFECTS + 2);

    this.scene.tweens.add({
      targets: seed,
      x: this.sprite.x,
      y: this.sprite.y,
      duration: 280,
      onComplete: () => {
        seed.destroy();
        this.heal(Math.round((2 + lvl * 2) * this.healEfficiency));
      },
    });
  }

  private fireHydroCannon(aim: number, lvl: number): void {
    const dmg = 46 + lvl * 22;
    this.spawnProjectile({
      x: this.sprite.x + Math.cos(aim) * 22,
      y: this.sprite.y + Math.sin(aim) * 22,
      angle: aim,
      speed: 460,
      range: 260 * this.rangeMult,
      hitRadius: 34,
      pierce: 1 + lvl,
      scale: 0.96,
      sheetKey: 'sheet-attack-water',
      animKey: 'anim-attack-water',
      trailColor: 0x38bdf8,
      drawFallback: () =>
        this.scene.add
          .circle(0, 0, 14, 0x0284c7, 1)
          .setStrokeStyle(3, 0xe0f2fe, 1),
      onHit: (e, px, py) => {
        this.dealDamage(e, dmg, {
          knockback: 340,
          fromX: px,
          fromY: py,
          secondary: true,
        });
        this.spawnWaterSplash(px, py, 0.85);
      },
      onEnd: (px, py) => {
        this.spawnWaterSplash(px, py, 1.0);
      },
    });
  }

  private fireMoonblast(lvl: number): void {
    const aim = this.computeAimAngle(320);
    for (const angle of this.spreadAngles(aim, lvl, 0.24)) {
      this.spawnProjectile({
        x: this.sprite.x + Math.cos(angle) * 18,
        y: this.sprite.y + Math.sin(angle) * 18,
        angle,
        speed: 410,
        range: 280 * this.rangeMult,
        hitRadius: 28,
        pierce: 1,
        scale: 0.78,
        sheetKey: 'sheet-attack-fairy',
        animKey: 'anim-attack-fairy',
        trailColor: 0xf9a8d4,
        drawFallback: () =>
          this.scene.add
            .circle(0, 0, 11, 0xf472b6, 1)
            .setStrokeStyle(2.5, 0xfef08a, 1),
        onHit: (e, px, py) => {
          this.dealDamage(e, 38 + lvl * 16, {
            knockback: 185,
            fromX: px,
            fromY: py,
            secondary: true,
          });
          const pop = this.scene.add
            .circle(px, py, 10, 0xfbcfe8, 0.65)
            .setStrokeStyle(2, 0xfef08a, 1)
            .setDepth(DEPTH.EFFECTS);
          this.scene.tweens.add({
            targets: pop,
            radius: 42,
            alpha: 0,
            duration: 200,
            onComplete: () => pop.destroy(),
          });
        },
      });
    }
  }

  // ===================== EFEITOS DE CAMPO =====================

  private dropFlamePatch(x: number, y: number, lvl: number): void {
    const hasFireSheet = this.scene.textures.exists('sheet-attack-fire');
    let gfx: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;

    if (hasFireSheet) {
      const spr = this.scene.add
        .sprite(x, y, 'sheet-attack-fire', 2)
        .setScale(0.5)
        .setRotation(-Math.PI / 2) // chama da brasa no chão sobe verticalmente (-Y)
        .setDepth(DEPTH.EFFECTS - 2);
      spr.play('anim-attack-fire');
      gfx = spr;
    } else {
      gfx = this.scene.add
        .circle(x, y, 14, 0xff7b00, 0.45)
        .setDepth(DEPTH.EFFECTS - 2);
    }

    this.flamePatches.push({
      x,
      y,
      remainingMs: Math.round((1.6 + lvl * 0.5) * 1000),
      dps: 9 + lvl * 6,
      gfx,
    });
  }

  private dropSporeCloud(x: number, y: number, lvl: number): void {
    const radius = 40 + lvl * 9;
    const gfx = this.scene.add
      .circle(x, y, radius, 0xa855f7, 0.24)
      .setStrokeStyle(2, 0x4ade80, 0.85)
      .setDepth(DEPTH.EFFECTS - 2);

    this.sporeClouds.push({
      x,
      y,
      radius,
      remainingMs: 3200,
      dps: 7 + lvl * 5,
      gfx,
    });
  }

  private triggerIcyWind(lvl: number): void {
    const radius = 132 + lvl * 18;
    const wave = this.scene.add
      .circle(this.sprite.x, this.sprite.y, 20, 0x38bdf8, 0.28)
      .setStrokeStyle(4, 0xe0f2fe, 1)
      .setDepth(DEPTH.EFFECTS);

    this.scene.tweens.add({
      targets: wave,
      radius,
      alpha: 0,
      duration: 340,
      onComplete: () => wave.destroy(),
    });

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      if (
        Phaser.Math.Distance.Between(
          this.sprite.x,
          this.sprite.y,
          e.sprite.x,
          e.sprite.y
        ) <= radius
      ) {
        this.dealDamage(e, 18 + lvl * 9, {
          knockback: 260,
          fromX: this.sprite.x,
          fromY: this.sprite.y,
          secondary: true,
          skipBasicProc: true,
        });
        e.applyStatusEffect({
          slowFactor: 0.08,
          slowDurationMs: Math.round((1.1 + lvl * 0.25) * 1000),
          tintColor: 0xbae6fd,
          statusIcon: '❄️',
        });
      }
    }
  }

  private updateFieldHazards(delta: number): void {
    const dt = delta / 1000;

    this.flamePatches = this.flamePatches.filter((patch) => {
      patch.remainingMs -= delta;
      if (patch.remainingMs <= 0) {
        patch.gfx.destroy();
        return false;
      }

      for (const e of this.enemiesProvider()) {
        if (e.isDead) continue;
        if (
          Phaser.Math.Distance.Between(
            patch.x,
            patch.y,
            e.sprite.x,
            e.sprite.y
          ) <= 22
        ) {
          const killed = e.takeDamage(
            Math.max(1, Math.round(patch.dps * dt)),
            patch.x,
            patch.y,
            0,
            false
          );
          if (killed) this.onKill(e);
        }
      }
      return true;
    });

    this.sporeClouds = this.sporeClouds.filter((cloud) => {
      cloud.remainingMs -= delta;
      if (cloud.remainingMs <= 0) {
        cloud.gfx.destroy();
        return false;
      }

      for (const e of this.enemiesProvider()) {
        if (e.isDead) continue;
        if (
          Phaser.Math.Distance.Between(
            cloud.x,
            cloud.y,
            e.sprite.x,
            e.sprite.y
          ) <= cloud.radius
        ) {
          e.applyStatusEffect({
            slowFactor: 0.48,
            slowDurationMs: 900,
            dotDamagePerSec: cloud.dps,
            dotDurationMs: 1200,
            tintColor: 0x4ade80,
            statusIcon: '☠️',
          });
        }
      }
      return true;
    });
  }

  // ===================== DISPARO E ANIMAÇÕES DE ATAQUE DIRECIONAIS =====================

  private executeBasicAttack(): boolean {
    if (this.isAttacking) return false;

    const aim = this.computeAimAngle(
      this.profile.range * this.rangeMult * 1.25
    );
    this.currentDir = PokemonAnimationManager.vectorToDirection(
      Math.cos(aim),
      Math.sin(aim),
      this.currentDir
    );
    this.isAttacking = true;
    this.attackAnimSafetyMs = 700;
    this.currentState = 'Attack';
    this.playCurrentAnim(true);

    this.basicAttackCounter++;
    this.performAttackPattern(aim, 1);

    // Gatilhos de habilidades exclusivas por contagem de ataques
    const fireBlastLvl = this.getAbilityLevel('fire_blast');
    if (
      fireBlastLvl > 0 &&
      this.basicAttackCounter % Math.max(2, 5 - fireBlastLvl) === 0
    ) {
      this.fireFireBlast(aim, fireBlastLvl);
    }

    const hydroCannonLvl = this.getAbilityLevel('water_hydro_cannon');
    if (
      hydroCannonLvl > 0 &&
      this.basicAttackCounter % Math.max(2, 5 - hydroCannonLvl) === 0
    ) {
      this.fireHydroCannon(aim, hydroCannonLvl);
    }

    // Eco de Combate
    const echoLvl = this.getAbilityLevel('echo');
    if (echoLvl > 0) {
      this.scene.time.delayedCall(220, () => {
        if (this.isDead) return;
        const echoAim = this.computeAimAngle(
          this.profile.range * this.rangeMult * 1.25
        );
        this.performAttackPattern(echoAim, 0.2 + echoLvl * 0.15);
      });
    }
    return true;
  }

  private performAttackPattern(aim: number, dmgScale: number): void {
    switch (this.profile.style) {
      case 'ranged_bolt':
        return this.basicElectricBolt(aim, dmgScale);
      case 'melee_flame':
        return this.basicFlameClaw(aim, dmgScale);
      case 'control_leaf':
        return this.basicRazorLeaves(aim, dmgScale);
      case 'wave_water':
        return this.basicWaterPulse(aim, dmgScale);
      case 'support_song':
        return this.basicSupportMelody(aim, dmgScale);
    }
  }

  /** Projétil direcional alinhado ao vetor de voo (0 rad = +X) */
  private spawnProjectile(cfg: ProjectileConfig): void {
    let shape:
      | Phaser.GameObjects.Sprite
      | Phaser.GameObjects.Shape
      | Phaser.GameObjects.Image;

    if (
      cfg.sheetKey &&
      cfg.animKey &&
      this.scene.textures.exists(cfg.sheetKey) &&
      this.scene.anims.exists(cfg.animKey)
    ) {
      const spr = this.scene.add.sprite(cfg.x, cfg.y, cfg.sheetKey, 0);
      spr.play(cfg.animKey);
      spr.setScale(cfg.scale ?? 0.65);
      shape = spr;
    } else {
      shape = cfg.drawFallback();
      if (cfg.scale) shape.setScale(cfg.scale);
    }

    shape.setPosition(cfg.x, cfg.y).setDepth(DEPTH.EFFECTS);
    shape.rotation = cfg.angle;

    const hit = new Set<Enemy>();
    let traveled = 0;
    let remainingHits = cfg.pierce + 1;
    const stepMs = 16;

    const timer = this.scene.time.addEvent({
      delay: stepMs,
      loop: true,
      callback: () => {
        if (!this.scene || !shape.active) {
          timer.remove();
          return;
        }
        const step = (cfg.speed * stepMs) / 1000;
        shape.x += Math.cos(cfg.angle) * step;
        shape.y += Math.sin(cfg.angle) * step;
        traveled += step;
        if (cfg.rotateSpeed) shape.rotation += cfg.rotateSpeed;

        if (cfg.trailColor !== undefined) {
          const t = this.scene.add
            .circle(
              shape.x - Math.cos(cfg.angle) * 10,
              shape.y - Math.sin(cfg.angle) * 10,
              3.5,
              cfg.trailColor,
              0.55
            )
            .setDepth(DEPTH.EFFECTS - 1);
          this.scene.tweens.add({
            targets: t,
            alpha: 0,
            scale: 0.2,
            duration: 130,
            onComplete: () => t.destroy(),
          });
        }

        for (const e of this.enemiesProvider()) {
          if (e.isDead || hit.has(e)) continue;
          if (
            Phaser.Math.Distance.Between(
              shape.x,
              shape.y,
              e.sprite.x,
              e.sprite.y
            ) <= cfg.hitRadius
          ) {
            hit.add(e);
            cfg.onHit(e, shape.x, shape.y);
            remainingHits--;
            if (remainingHits <= 0) break;
          }
        }

        if (remainingHits <= 0 || traveled >= cfg.range) {
          cfg.onEnd?.(shape.x, shape.y);
          shape.destroy();
          timer.remove();
        }
      },
    });
  }

  private spreadAngles(
    center: number,
    count: number,
    step: number
  ): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(center + (i - (count - 1) / 2) * step);
    }
    return out;
  }

  private spawnElectricImpact(x: number, y: number, maxRadius = 36): void {
    if (
      this.scene.textures.exists('sheet-attack-eletric') &&
      this.scene.anims.exists('anim-attack-eletric-hit')
    ) {
      const fx = this.scene.add
        .sprite(x, y, 'sheet-attack-eletric', 2)
        .setScale(0.55)
        .setRotation(Math.random() * Math.PI * 2)
        .setDepth(DEPTH.EFFECTS + 1);
      fx.play('anim-attack-eletric-hit');
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    }
    const burst = this.scene.add
      .circle(x, y, 10, 0xf7d02c, 0.55)
      .setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({
      targets: burst,
      radius: maxRadius,
      alpha: 0,
      duration: 180,
      onComplete: () => burst.destroy(),
    });
  }

  private spawnWaterSplash(x: number, y: number, scale = 0.72): void {
    if (
      this.scene.textures.exists('sheet-attack-water-hit') &&
      this.scene.anims.exists('anim-attack-water-hit')
    ) {
      const splashSpr = this.scene.add
        .sprite(x, y, 'sheet-attack-water-hit', 0)
        .setScale(scale)
        .setDepth(DEPTH.EFFECTS + 1);
      splashSpr.play('anim-attack-water-hit');
      splashSpr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
        splashSpr.destroy()
      );
      return;
    }

    const splash = this.scene.add
      .circle(x, y, 14, 0x00b4d8, 0.6)
      .setStrokeStyle(3, 0xffffff, 1)
      .setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({
      targets: splash,
      radius: 48 * scale,
      alpha: 0,
      duration: 240,
      onComplete: () => splash.destroy(),
    });
  }

  /** PIKACHU / RAICHU — Lança Elétrica horizontal orientada diretamente ao alvo (+X) */
  private basicElectricBolt(aim: number, dmgScale: number): void {
    const p = this.profile;
    const count = 1 + this.getAbilityLevel('multishot');
    const pierce = this.getAbilityLevel('pierce');

    for (const angle of this.spreadAngles(aim, count, 0.19)) {
      this.spawnProjectile({
        x: this.sprite.x + Math.cos(angle) * 20,
        y: this.sprite.y + Math.sin(angle) * 20,
        angle,
        speed: 495,
        range: p.range * this.rangeMult,
        hitRadius: 28,
        pierce,
        scale: 0.68,
        sheetKey: 'sheet-attack-eletric',
        animKey: 'anim-attack-eletric',
        trailColor: 0xfef08a,
        drawFallback: () =>
          this.scene.add
            .circle(0, 0, 9, p.elementColor, 1)
            .setStrokeStyle(3, p.secondaryColor, 1),
        onHit: (e, px, py) => {
          this.dealDamage(e, p.baseDamage * 1.15 * dmgScale, {
            knockback: 180,
            fromX: px,
            fromY: py,
          });
          this.spawnElectricImpact(px, py, 34);
        },
      });
    }
  }

  /** CHARMANDER / CHARMELEON / CHARIZARD — Chamas orientadas para fora (+X) na direção do golpe! */
  private basicFlameClaw(aim: number, dmgScale: number): void {
    const p = this.profile;
    const multi = this.getAbilityLevel('multishot');
    const range = p.range * this.rangeMult;
    const halfArc =
      0.55 + multi * 0.26 + this.getAbilityLevel('fire_tough_claws') * 0.05;

    const hasAnim =
      this.scene.textures.exists('sheet-attack-fire') &&
      this.scene.anims.exists('anim-attack-fire-slash');
    const flames = 3 + multi * 2;

    for (const a of this.spreadAngles(
      aim,
      flames,
      (halfArc * 2) / Math.max(1, flames - 1)
    )) {
      const fx = this.sprite.x + Math.cos(a) * range * 0.34;
      const fy = this.sprite.y + Math.sin(a) * range * 0.34;

      if (hasAnim) {
        const flameSpr = this.scene.add
          .sprite(fx, fy, 'sheet-attack-fire', 1)
          .setScale(0.68)
          .setRotation(a) // Ponta da chama aponta diretamente no ângulo 'a'!
          .setDepth(DEPTH.EFFECTS);
        flameSpr.play('anim-attack-fire-slash');
        this.scene.tweens.add({
          targets: flameSpr,
          x: this.sprite.x + Math.cos(a) * range * 0.85,
          y: this.sprite.y + Math.sin(a) * range * 0.85,
          scale: 0.92,
          alpha: 0,
          duration: 280,
          onComplete: () => flameSpr.destroy(),
        });
      } else {
        const flame = this.scene.add
          .circle(fx, fy, 15, p.elementColor, 0.75)
          .setStrokeStyle(3, p.secondaryColor, 1)
          .setDepth(DEPTH.EFFECTS);
        this.scene.tweens.add({
          targets: flame,
          x: this.sprite.x + Math.cos(a) * range * 0.8,
          y: this.sprite.y + Math.sin(a) * range * 0.8,
          scale: 1.5,
          alpha: 0,
          duration: 240,
          onComplete: () => flame.destroy(),
        });
      }
    }

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      const d = Phaser.Math.Distance.Between(
        this.sprite.x,
        this.sprite.y,
        e.sprite.x,
        e.sprite.y
      );
      if (d > range) continue;
      const angTo = Math.atan2(
        e.sprite.y - this.sprite.y,
        e.sprite.x - this.sprite.x
      );
      if (
        Math.abs(Phaser.Math.Angle.Wrap(angTo - aim)) <= halfArc + 0.24 ||
        d < 26
      ) {
        // A Queimadura ocorre pelos 5% base (+ Poder Solar) dentro de dealDamage!
        this.dealDamage(e, p.baseDamage * dmgScale, {
          knockback: 230,
        });
      }
    }
  }

  /** BULBASAUR / IVYSAUR / VENUSAUR — Folhas Navalha alinhadas ao vetor de disparo (+X)! */
  private basicRazorLeaves(aim: number, dmgScale: number): void {
    const p = this.profile;
    const count = 2 + this.getAbilityLevel('multishot');
    const pierce = 1 + this.getAbilityLevel('pierce') * 2;

    const ring = this.scene.add
      .circle(this.sprite.x, this.sprite.y, 14, p.secondaryColor, 0.25)
      .setStrokeStyle(2, p.elementColor, 0.85)
      .setDepth(DEPTH.EFFECTS - 2);
    this.scene.tweens.add({
      targets: ring,
      radius: 52,
      alpha: 0,
      duration: 260,
      onComplete: () => ring.destroy(),
    });

    for (const angle of this.spreadAngles(aim, count, 0.17)) {
      this.spawnProjectile({
        x: this.sprite.x + Math.cos(angle) * 18,
        y: this.sprite.y + Math.sin(angle) * 18,
        angle,
        speed: 390,
        range: p.range * this.rangeMult,
        hitRadius: 26,
        pierce,
        scale: 0.64,
        sheetKey: 'sheet-attack-grass',
        animKey: 'anim-attack-grass',
        trailColor: 0x86efac,
        // Sem rotateSpeed caótico: cada folha voa apontando diretamente para o alvo!
        drawFallback: () =>
          this.scene.add
            .ellipse(0, 0, 18, 8, p.elementColor, 1)
            .setStrokeStyle(2, p.secondaryColor, 1),
        onHit: (e, px, py) => {
          // O Envenenamento ocorre pelos 5% base (+ Esporo de Efeito) dentro de dealDamage!
          this.dealDamage(e, p.baseDamage * dmgScale, {
            knockback: 130,
            fromX: px,
            fromY: py,
          });
          e.applyStatusEffect({
            slowFactor: 0.68,
            slowDurationMs: 1400,
          });
        },
      });
    }
  }

  /** SQUIRTLE / WARTORTLE / BLASTOISE — Jato pressurizado orientado para +X com splash no impacto! */
  private basicWaterPulse(aim: number, dmgScale: number): void {
    const p = this.profile;
    const waves = 1 + this.getAbilityLevel('multishot');

    for (const angle of this.spreadAngles(aim, waves, 0.28)) {
      this.spawnProjectile({
        x: this.sprite.x + Math.cos(angle) * 22,
        y: this.sprite.y + Math.sin(angle) * 22,
        angle,
        speed: 415,
        range: p.range * this.rangeMult,
        hitRadius: 31,
        pierce: this.getAbilityLevel('pierce'),
        scale: 0.72,
        sheetKey: 'sheet-attack-water',
        animKey: 'anim-attack-water',
        trailColor: 0x90e0ef,
        drawFallback: () =>
          this.scene.add
            .circle(0, 0, 14, p.elementColor, 0.75)
            .setStrokeStyle(3, p.secondaryColor, 1),
        onHit: (e, px, py) => {
          this.dealDamage(e, p.baseDamage * dmgScale, {
            knockback: 310,
            fromX: px,
            fromY: py,
          });
          this.spawnWaterSplash(px, py, 0.66);
        },
        onEnd: (ex, ey) => {
          this.spawnWaterSplash(ex, ey, 0.75);
        },
      });
    }
  }

  /** JIGGLYPUFF / WIGGLYTUFF — Crescente Harmônico Direcional (+X) + Aura Musical de Cura! */
  private basicSupportMelody(aim: number, dmgScale: number): void {
    const p = this.profile;
    const count = 1 + this.getAbilityLevel('multishot');
    const radius = p.range * 0.72 * this.rangeMult;

    this.supportBuffTimerMs = 4000;
    this.heal(Math.max(1, Math.round(4 * this.healEfficiency)));

    // 1. Dispara ondas crescentes harmônicas na direção do inimigo visado (+X)
    for (const angle of this.spreadAngles(aim, count, 0.25)) {
      this.spawnProjectile({
        x: this.sprite.x + Math.cos(angle) * 18,
        y: this.sprite.y + Math.sin(angle) * 18,
        angle,
        speed: 385,
        range: p.range * 1.15 * this.rangeMult,
        hitRadius: 28,
        pierce: 1 + this.getAbilityLevel('pierce'),
        scale: 0.72,
        sheetKey: 'sheet-attack-fairy',
        animKey: 'anim-attack-fairy',
        trailColor: 0xfbcfe8,
        drawFallback: () =>
          this.scene.add
            .circle(0, 0, 10, p.elementColor, 0.85)
            .setStrokeStyle(2, p.secondaryColor, 1),
        onHit: (e, px, py) => {
          this.dealDamage(e, p.baseDamage * dmgScale, {
            knockback: 185,
            fromX: px,
            fromY: py,
          });
        },
      });
    }

    // 2. Pulso ressonante harmônico ao redor (com eco extra se tiver Hiper Voz)
    const hyperVoiceLvl = this.getAbilityLevel('fairy_hyper_voice');
    const totalRings = hyperVoiceLvl > 0 ? 2 : 1;

    for (let i = 0; i < totalRings; i++) {
      this.scene.time.delayedCall(i * 190, () => {
        if (this.isDead) return;
        const px = this.sprite.x;
        const py = this.sprite.y;
        const ringScale = i === 0 ? 1 : 0.25 + hyperVoiceLvl * 0.12;

        const ring = this.scene.add
          .circle(px, py, 20, 0xffb3c6, 0.22)
          .setStrokeStyle(3, 0xff69b4, 0.95)
          .setDepth(DEPTH.EFFECTS);
        this.scene.tweens.add({
          targets: ring,
          radius,
          alpha: 0,
          duration: 380,
          onComplete: () => ring.destroy(),
        });

        const symbols = ['♪', '♫', '✨'];
        symbols.forEach((sym, idx) => {
          const a = aim + (idx - 1) * 0.85 + i * 0.4;
          const txt = this.scene.add
            .text(
              px + Math.cos(a) * 20,
              py + Math.sin(a) * 20,
              sym,
              {
                fontFamily: 'monospace',
                fontSize: '16px',
                fontStyle: 'bold',
                color: '#ffffff',
                stroke: '#db2777',
                strokeThickness: 3,
              }
            )
            .setOrigin(0.5)
            .setDepth(DEPTH.EFFECTS + 1);

          this.scene.tweens.add({
            targets: txt,
            x: px + Math.cos(a) * (radius * 0.85),
            y: py + Math.sin(a) * (radius * 0.85) - 10,
            alpha: 0,
            duration: 420,
            onComplete: () => txt.destroy(),
          });
        });

        for (const e of this.enemiesProvider()) {
          if (e.isDead) continue;
          if (
            Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <=
            radius
          ) {
            this.dealDamage(e, p.baseDamage * 0.65 * dmgScale * ringScale, {
              knockback: 165,
              fromX: px,
              fromY: py,
              secondary: i > 0,
            });
          }
        }
      });
    }
  }

  // ===================== ESPECIAIS (ULT) COM SPRITES CORRIGIDOS E STATUS GARANTIDO =====================

  private executeSpecial(): void {
    this.specialEnergy = 0;
    const aim = this.computeAimAngle(440);
    this.currentDir = PokemonAnimationManager.vectorToDirection(
      Math.cos(aim),
      Math.sin(aim),
      this.currentDir
    );
    this.isAttacking = true;
    this.attackAnimSafetyMs = 800;
    this.currentState = 'Attack';
    this.playCurrentAnim(true);

    this.scene.cameras.main.flash(150, 255, 255, 255, false);
    this.scene.cameras.main.shake(180, 0.005);

    const mult = 1 + this.getAbilityLevel('energy') * 0.1;
    const base = this.profile.baseDamage * mult;

    switch (this.profile.style) {
      case 'ranged_bolt':
        return this.specialThunder(base);
      case 'melee_flame':
        return this.specialFlameNova(aim, base);
      case 'control_leaf':
        return this.specialSolarBeam(aim, base);
      case 'wave_water':
        return this.specialHydroVortex(aim, base);
      case 'support_song':
        return this.specialLullaby(base);
    }
  }

  /** ULT Elétrico: Escudo Elétrico ('anim-especial-eletrico') + Trovões com Paralisia 100% */
  private specialThunder(base: number): void {
    const px = this.sprite.x;
    const py = this.sprite.y;

    if (
      this.scene.textures.exists('sheet-especial-eletrico') &&
      this.scene.anims.exists('anim-especial-eletrico')
    ) {
      const shield = this.scene.add
        .sprite(px, py, 'sheet-especial-eletrico', 0)
        .setScale(0.92)
        .setDepth(DEPTH.EFFECTS + 2);
      shield.play('anim-especial-eletrico');
      shield.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
        shield.destroy()
      );
    }

    const maxTargets = 6 + this.getAbilityLevel('multishot');
    const targets = this.enemiesProvider()
      .filter((e) => !e.isDead)
      .map((e) => ({
        e,
        d: Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y),
      }))
      .filter((t) => t.d <= 430)
      .sort((a, b) => a.d - b.d)
      .slice(0, maxTargets);

    const strike = (x: number, y: number) => {
      const g = this.scene.add.graphics().setDepth(DEPTH.EFFECTS + 2);
      g.lineStyle(4, 0xfef08a, 1);
      g.beginPath();
      let cx = x + Phaser.Math.Between(-20, 20);
      let cy = y - 280;
      g.moveTo(cx, cy);
      while (cy < y) {
        cy += 35;
        cx = x + Phaser.Math.Between(-18, 18);
        g.lineTo(cx, Math.min(cy, y));
      }
      g.strokePath();
      this.spawnElectricImpact(x, y, 54);
      this.scene.tweens.add({
        targets: g,
        alpha: 0,
        duration: 260,
        onComplete: () => g.destroy(),
      });
    };

    if (targets.length === 0) {
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3;
        strike(px + Math.cos(a) * 90, py + Math.sin(a) * 90);
      }
      return;
    }

    targets.forEach(({ e }, i) => {
      this.scene.time.delayedCall(i * 65, () => {
        if (e.isDead) return;
        strike(e.sprite.x, e.sprite.y);
        this.dealDamage(e, base * 2.25, {
          special: true,
          knockback: 120,
          fromX: e.sprite.x,
          fromY: e.sprite.y - 10,
          skipBasicProc: true,
        });
        e.applyStatusEffect({
          slowFactor: 0.02,
          slowDurationMs: 1450,
          tintColor: 0xfef08a,
          statusIcon: '⚡',
        });
      });
    });
  }

  /** ULT Fogo: Lança-Chamas Devastador ('anim-especial-fogo') ancorado no bico e apontando em 'aim'! */
  private specialFlameNova(aim: number, base: number): void {
    const px = this.sprite.x;
    const py = this.sprite.y;
    const range = 265 * this.rangeMult;

    if (
      this.scene.textures.exists('sheet-especial-fogo') &&
      this.scene.anims.exists('anim-especial-fogo')
    ) {
      const nozzleX = px + Math.cos(aim) * 18;
      const nozzleY = py + Math.sin(aim) * 18;
      const flameStream = this.scene.add
        .sprite(nozzleX, nozzleY, 'sheet-especial-fogo', 0)
        .setOrigin(0.045, 0.5) // Ancora no bico esquerdo para disparar exatamente na direção 'aim'
        .setScale(0.95 * this.rangeMult)
        .setRotation(aim)
        .setDepth(DEPTH.EFFECTS + 2);
      flameStream.play('anim-especial-fogo');
      this.scene.tweens.add({
        targets: flameStream,
        alpha: 0,
        delay: 460,
        duration: 200,
        onComplete: () => flameStream.destroy(),
      });
    }

    const burnMult = 1 + this.getAbilityLevel('fire_solar_power') * 0.18;
    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      const d = Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y);
      if (d > range) continue;
      const angTo = Math.atan2(e.sprite.y - py, e.sprite.x - px);
      if (Math.abs(Phaser.Math.Angle.Wrap(angTo - aim)) <= 0.62 || d < 32) {
        this.dealDamage(e, base * 2.35, {
          special: true,
          knockback: 330,
          fromX: px,
          fromY: py,
          skipBasicProc: true,
        });
        e.applyStatusEffect({
          dotDamagePerSec: 11 * burnMult,
          dotDurationMs: 3800,
          tintColor: 0xff7b00,
          statusIcon: '🔥',
        });
      }
    }
  }

  /** ULT Planta: Raio Solar Tóxico — Envenenamento Tóxico 100% garantido! */
  private specialSolarBeam(aim: number, base: number): void {
    const length = 480 * this.rangeMult;
    const halfWidth = 30;
    const sx = this.sprite.x;
    const sy = this.sprite.y;
    const ex = sx + Math.cos(aim) * length;
    const ey = sy + Math.sin(aim) * length;

    const charge = this.scene.add
      .circle(sx, sy, 12, 0xfef08a, 0.85)
      .setStrokeStyle(3, 0x4ade80, 1)
      .setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({
      targets: charge,
      radius: 36,
      duration: 190,
      yoyo: true,
      onComplete: () => charge.destroy(),
    });

    this.scene.time.delayedCall(190, () => {
      if (this.isDead) return;
      const beam = this.scene.add.graphics().setDepth(DEPTH.EFFECTS + 1);
      beam.lineStyle(halfWidth * 2, 0xa855f7, 0.28);
      beam.lineBetween(sx, sy, ex, ey);
      beam.lineStyle(halfWidth * 1.25, 0x4ade80, 0.88);
      beam.lineBetween(sx, sy, ex, ey);
      beam.lineStyle(10, 0xfef08a, 1);
      beam.lineBetween(sx, sy, ex, ey);

      // Folhas e esporos viajando na direção do feixe (+aim)
      if (this.scene.textures.exists('sheet-attack-grass')) {
        for (let step = 70; step < length; step += 90) {
          const lx = sx + Math.cos(aim) * step;
          const ly = sy + Math.sin(aim) * step;
          const leafFx = this.scene.add
            .sprite(lx, ly, 'sheet-attack-grass', 5)
            .setScale(0.6)
            .setRotation(aim)
            .setDepth(DEPTH.EFFECTS + 2);
          this.scene.tweens.add({
            targets: leafFx,
            x: lx + Math.cos(aim) * 55,
            y: ly + Math.sin(aim) * 55,
            alpha: 0,
            duration: 360,
            onComplete: () => leafFx.destroy(),
          });
        }
      }

      this.scene.tweens.add({
        targets: beam,
        alpha: 0,
        duration: 430,
        onComplete: () => beam.destroy(),
      });

      const poisonMult =
        (1 + this.getAbilityLevel('grass_effect_spore') * 0.24) *
        (1 + this.classDef.stats.effectStrengthBonus);

      const line = new Phaser.Geom.Line(sx, sy, ex, ey);
      for (const e of this.enemiesProvider()) {
        if (e.isDead) continue;
        const pt = Phaser.Geom.Line.GetNearestPoint(
          line,
          new Phaser.Geom.Point(e.sprite.x, e.sprite.y)
        );
        const onSegment =
          Math.min(sx, ex) - halfWidth <= pt.x &&
          pt.x <= Math.max(sx, ex) + halfWidth &&
          Math.min(sy, ey) - halfWidth <= pt.y &&
          pt.y <= Math.max(sy, ey) + halfWidth;
        if (
          onSegment &&
          Phaser.Math.Distance.Between(pt.x, pt.y, e.sprite.x, e.sprite.y) <=
            halfWidth + 14
        ) {
          this.dealDamage(e, base * 2.25, {
            special: true,
            knockback: 180,
            skipBasicProc: true,
          });
          // ULT do Bulbasaur SEMPRE aplica Envenenamento Tóxico!
          e.applyStatusEffect({
            slowFactor: 0.35,
            slowDurationMs: 3400,
            dotDamagePerSec: 10 * poisonMult,
            dotDurationMs: 4500,
            tintColor: 0x4ade80,
            statusIcon: '☠️',
          });
        }
      }
    });
  }

  /** ULT Água: Hidro Vórtice ('anim-especial-agua') centralizado com Encharcar garantido! */
  private specialHydroVortex(aim: number, base: number): void {
    const radius = 195 * this.rangeMult;
    const cx = this.sprite.x + Math.cos(aim) * 80;
    const cy = this.sprite.y + Math.sin(aim) * 80;

    if (
      this.scene.textures.exists('sheet-especial-agua') &&
      this.scene.anims.exists('anim-especial-agua')
    ) {
      const vortexSpr = this.scene.add
        .sprite(cx, cy, 'sheet-especial-agua', 0)
        .setScale(0.95)
        .setDepth(DEPTH.EFFECTS + 1);
      vortexSpr.play('anim-especial-agua');
      this.scene.tweens.add({
        targets: vortexSpr,
        scale: 1.32,
        rotation: Math.PI * 0.65,
        alpha: 0,
        delay: 420,
        duration: 280,
        onComplete: () => vortexSpr.destroy(),
      });
    }

    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 180, () => {
        for (const e of this.enemiesProvider()) {
          if (e.isDead) continue;
          if (
            Phaser.Math.Distance.Between(cx, cy, e.sprite.x, e.sprite.y) <=
            radius
          ) {
            this.dealDamage(e, base * 0.45, {
              special: true,
              knockback: -180,
              fromX: cx,
              fromY: cy,
              secondary: true,
              skipBasicProc: true,
            });
            e.applyStatusEffect({
              slowFactor: 0.35,
              slowDurationMs: 2800,
              tintColor: 0x7dd3fc,
              statusIcon: '💧',
            });
          }
        }
      });
    }

    this.scene.time.delayedCall(580, () => {
      const burst = this.scene.add
        .circle(cx, cy, 24, 0x00b4d8, 0.58)
        .setStrokeStyle(5, 0xffffff, 1)
        .setDepth(DEPTH.EFFECTS + 2);
      this.scene.tweens.add({
        targets: burst,
        radius: radius * 1.05,
        alpha: 0,
        duration: 320,
        onComplete: () => burst.destroy(),
      });
      for (const e of this.enemiesProvider()) {
        if (e.isDead) continue;
        if (
          Phaser.Math.Distance.Between(cx, cy, e.sprite.x, e.sprite.y) <=
          radius * 1.05
        ) {
          this.dealDamage(e, base * 1.15, {
            special: true,
            knockback: 450,
            fromX: cx,
            fromY: cy,
            skipBasicProc: true,
          });
        }
      }
    });
  }

  /** ULT Fada: Sinfonia Celestial — Sono garantido em área + Cura! */
  private specialLullaby(base: number): void {
    const radius = 240 * this.rangeMult;
    const px = this.sprite.x;
    const py = this.sprite.y;

    this.heal(Math.round(this.maxHp * 0.24 * this.healEfficiency));
    this.supportBuffTimerMs = 6500;

    const mandala = this.scene.add
      .circle(px, py, 26, 0xffb3c6, 0.3)
      .setStrokeStyle(4, 0xff69b4, 1)
      .setDepth(DEPTH.EFFECTS + 1);

    this.scene.tweens.add({
      targets: mandala,
      radius,
      alpha: 0,
      duration: 680,
      onComplete: () => mandala.destroy(),
    });

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      if (
        Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= radius
      ) {
        this.dealDamage(e, base * 1.75, {
          special: true,
          knockback: 0,
          fromX: px,
          fromY: py,
          skipBasicProc: true,
        });
        e.applyStatusEffect({
          slowFactor: 0,
          slowDurationMs: 2900,
          tintColor: 0xc8b6ff,
          showSleepIcon: true,
          statusIcon: '💤',
        });
      }
    }
  }

  // ===================== ÓRBITAS EXCLUSIVAS (GIRO DE FOGO / ANEL DE ÁGUA) =====================

  private updateOrbitals(delta: number): void {
    if (this.orbitals.length === 0) return;
    const fireSpinLvl = this.getAbilityLevel('fire_spin');
    const aquaRingLvl = this.getAbilityLevel('water_aqua_ring');
    const lvl = Math.max(fireSpinLvl, aquaRingLvl);

    this.orbitAngle += (2.8 * delta) / 1000;
    const radius = 66;

    for (const [enemy, cd] of this.orbitHitCooldown) {
      const next = cd - delta;
      if (next <= 0 || enemy.isDead) this.orbitHitCooldown.delete(enemy);
      else this.orbitHitCooldown.set(enemy, next);
    }

    this.orbitals.forEach((orb, i) => {
      const a = this.orbitAngle + (i * Math.PI * 2) / this.orbitals.length;
      const ox = this.sprite.x + Math.cos(a) * radius;
      const oy = this.sprite.y + Math.sin(a) * radius;
      orb.setPosition(ox, oy);
      if (orb instanceof Phaser.GameObjects.Sprite) {
        // Orienta o sprite orbital ao longo da tangente do movimento (+90° sobre o raio)
        orb.setRotation(a + Math.PI / 2);
      }

      for (const e of this.enemiesProvider()) {
        if (e.isDead || this.orbitHitCooldown.has(e)) continue;
        if (Phaser.Math.Distance.Between(ox, oy, e.sprite.x, e.sprite.y) <= 22) {
          this.orbitHitCooldown.set(e, 520);
          this.dealDamage(e, this.profile.baseDamage * (0.32 + lvl * 0.12), {
            knockback: 145,
            fromX: ox,
            fromY: oy,
            secondary: true,
          });
        }
      }
    });
  }

  // ===================== UTILITÁRIOS =====================

  private hasEnemyWithin(dist: number): boolean {
    return this.enemiesProvider().some(
      (e) =>
        !e.isDead &&
        Phaser.Math.Distance.Between(
          this.sprite.x,
          this.sprite.y,
          e.sprite.x,
          e.sprite.y
        ) <= dist
    );
  }

  private computeAimAngle(maxSearchDist: number): number {
    let closest: Enemy | null = null;
    let best = maxSearchDist;
    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      const d = Phaser.Math.Distance.Between(
        this.sprite.x,
        this.sprite.y,
        e.sprite.x,
        e.sprite.y
      );
      if (d < best) {
        best = d;
        closest = e;
      }
    }
    if (closest) {
      return Math.atan2(
        closest.sprite.y - this.sprite.y,
        closest.sprite.x - this.sprite.x
      );
    }
    return Phaser.Math.DegToRad(
      [90, 45, 0, -45, -90, -135, 180, 135][this.currentDir]
    );
  }

  private updateHpBar(): void {
    const x = this.sprite.x;
    const y = this.sprite.y - 26;
    this.hpBarBg.setPosition(x, y);
    this.hpBarFill.setPosition(x - 18, y);
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBarFill.width = 36 * ratio;
    this.hpBarFill.setFillStyle(
      ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfacc15 : 0xef4444
    );
  }

  private playCurrentAnim(forceRestart: boolean): void {
    const animKey = PokemonAnimationManager.getAnimKey(
      this.pokemonDef.id,
      this.currentState,
      this.currentDir
    );
    if (forceRestart || this.sprite.anims.currentAnim?.key !== animKey) {
      this.sprite.play(animKey, true);
      this.syncHitboxToCurrentFrame();
    }
  }

  private syncHitboxToCurrentFrame(): void {
    const cfg = this.pokemonDef.anims[this.currentState];
    this.sprite.body.setCircle(
      HITBOX_RADIUS,
      cfg.frameWidth / 2 - HITBOX_RADIUS,
      cfg.frameHeight / 2 - HITBOX_RADIUS + 4
    );
  }
}
