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
const DASH_SPEED = 820; // ~148px de deslocamento
const DASH_INVULNERABLE_MS = 320;

/** Especial */
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
  /** Danos secundários (explosão, ricochete, órbita) não disparam novos efeitos em cadeia */
  secondary?: boolean;
}

interface ProjectileConfig {
  x: number;
  y: number;
  angle: number;
  speed: number;
  range: number;
  hitRadius: number;
  pierce: number;
  draw: () => Phaser.GameObjects.Shape | Phaser.GameObjects.Image;
  rotateSpeed?: number;
  trailColor?: number;
  onHit: (enemy: Enemy, px: number, py: number) => void;
  onEnd?: (px: number, py: number) => void;
}

export class Player {
  public readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private shadow: Phaser.GameObjects.Ellipse;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
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

  private invulnerableMs = 0;
  private painPortraitTimerMs = 0;
  private regenAccumMs = 0;
  private supportBuffTimerMs = 0;
  private lifestealAccum = 0;

  // Combate
  private attackCooldownRemaining = 0;
  private enemiesProvider: () => Enemy[] = () => [];
  private onKill: (enemy: Enemy) => void = () => {};

  // Esquiva (Dash)
  public dashCooldownRemaining = 0;
  private dashTimeRemaining = 0;
  private dashVec = new Phaser.Math.Vector2(0, 1);
  private afterimageAccumMs = 0;

  // Especial
  public specialEnergy = 0;

  // Habilidades
  private abilityLevels = new Map<AbilityId, number>();
  private orbitals: Phaser.GameObjects.Arc[] = [];
  private orbitAngle = 0;
  private orbitHitCooldown = new Map<Enemy, number>();

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

  constructor(scene: Phaser.Scene, x: number, y: number, selectedPokemonId = '0025') {
    this.scene = scene;
    this.pokemonDef = POKEMON_MANIFEST[selectedPokemonId] ?? POKEMON_MANIFEST['0025'];
    this.classDef = POKEMON_CLASSES[this.pokemonDef.classId ?? 'disparador'];

    this.maxHp = this.computeMaxHp();
    this.hp = this.maxHp;

    this.shadow = scene.add
      .ellipse(x, y + 10, 26, 11, 0x000000, 0.35)
      .setDepth(DEPTH.SHADOW);

    this.sprite = scene.physics.add
      .sprite(x, y, PokemonAnimationManager.getTextureKey(this.pokemonDef.id, 'Idle'), 0)
      .setScale(this.pokemonDef.scale)
      .setDepth(depthForY(y));
    this.sprite.setCollideWorldBounds(true);

    this.hpBarBg = scene.add.rectangle(x, y - 26, 38, 6, 0x000000, 0.75).setDepth(DEPTH.HP_BAR);
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

  setCombatContext(provider: () => Enemy[], onKill: (enemy: Enemy) => void): void {
    this.enemiesProvider = provider;
    this.onKill = onKill;
  }

  /**
   * Teleporta o jogador com segurança para uma nova coordenada (troca de mapa / portal),
   * resetando imediatamente o corpo físico do Arcade Physics para não voltar à posição antiga.
   */
  teleportTo(x: number, y: number): void {
    this.dashTimeRemaining = 0;
    this.sprite.setPosition(x, y);
    this.sprite.body.reset(x, y);
    this.sprite.setVelocity(0, 0);
    this.sprite.setDepth(depthForY(y));
    this.shadow.setPosition(x, y + 10);
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

  isSpecialReady(): boolean {
    return this.specialEnergy >= SPECIAL_MAX_ENERGY;
  }

  /**
   * Indica se o retrato do Pokémon na HUD deve exibir a expressão de dor (Pain.png).
   */
  isInPain(): boolean {
    return this.painPortraitTimerMs > 0 || this.isDead;
  }

  private get profile(): PokemonAttackProfile {
    return this.pokemonDef.attackProfile!;
  }

  private get rangeMult(): number {
    return 1 + this.getAbilityLevel('pierce') * 0.12;
  }

  private get moveSpeed(): number {
    return (
      this.pokemonDef.speed *
      this.classDef.stats.speedMultiplier *
      (1 + this.getAbilityLevel('agility') * 0.08)
    );
  }

  private get attackCooldownMs(): number {
    return this.profile.cooldownMs * (1 - this.getAbilityLevel('haste') * 0.08);
  }

  private computeMaxHp(): number {
    return Math.round(
      this.pokemonDef.baseHp *
        this.classDef.stats.hpMultiplier *
        (1 + (this.level - 1) * 0.08) *
        (1 + this.getAbilityLevel('vigor') * 0.15)
    );
  }

  // ===================== HABILIDADES =====================

  learnAbility(id: AbilityId): void {
    const def = ABILITIES[id];
    const next = Math.min(def.maxLevel, this.getAbilityLevel(id) + 1);
    this.abilityLevels.set(id, next);

    if (id === 'vigor') {
      const oldMax = this.maxHp;
      this.maxHp = this.computeMaxHp();
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - oldMax) + Math.round(this.maxHp * 0.2));
    }
    if (id === 'orbit') {
      this.rebuildOrbitals();
    }
    this.updateHpBar();
  }

  private rebuildOrbitals(): void {
    this.orbitals.forEach((o) => o.destroy());
    this.orbitals = [];
    const count = this.getAbilityLevel('orbit');
    for (let i = 0; i < count; i++) {
      const orb = this.scene.add
        .circle(this.sprite.x, this.sprite.y, 7, this.profile.elementColor, 1)
        .setStrokeStyle(2, this.profile.secondaryColor, 1)
        .setDepth(DEPTH.ORBITALS);
      this.orbitals.push(orb);
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
      if (evoId && this.pokemonDef.evolveAtLevel && this.level >= this.pokemonDef.evolveAtLevel) {
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
    this.hp = this.maxHp; // Cura total ao evoluir
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

  // ===================== DANO RECEBIDO =====================

  receiveDamage(rawAmount: number): void {
    if (this.invulnerableMs > 0 || this.isDead) return;

    const finalDamage = Math.max(1, Math.round(rawAmount * (1 - this.classDef.stats.damageReduction)));
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

  private heal(amount: number): void {
    if (amount <= 0 || this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  // ===================== LOOP PRINCIPAL =====================

  update(delta: number): { specialUsed: boolean; specialNotReady: boolean; dashed: boolean } {
    const result = { specialUsed: false, specialNotReady: false, dashed: false };
    if (this.isDead) {
      this.sprite.setVelocity(0, 0);
      return result;
    }

    this.tickTimers(delta);

    // ---- Leitura de direção ----
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
      this.currentDir = PokemonAnimationManager.vectorToDirection(vx, vy, this.currentDir);
    }

    // ---- Esquiva (SHIFT) ----
    if (Phaser.Input.Keyboard.JustDown(k.SHIFT)) {
      result.dashed = this.tryDash(vx, vy);
    }

    if (this.dashTimeRemaining > 0) {
      this.dashTimeRemaining -= delta;
      this.sprite.setVelocity(this.dashVec.x * DASH_SPEED, this.dashVec.y * DASH_SPEED);
      this.afterimageAccumMs += delta;
      if (this.afterimageAccumMs >= 24) {
        this.afterimageAccumMs = 0;
        this.spawnAfterimage();
      }
    } else {
      const speed = this.isAttacking ? this.moveSpeed * 0.6 : this.moveSpeed;
      this.sprite.setVelocity(vx * speed, vy * speed);
    }

    // ---- Especial (E ou Q) ----
    if (Phaser.Input.Keyboard.JustDown(k.E) || Phaser.Input.Keyboard.JustDown(k.Q)) {
      if (this.isSpecialReady()) {
        this.executeSpecial();
        result.specialUsed = true;
      } else {
        result.specialNotReady = true;
      }
    }

    // ---- Ataque básico (ESPAÇO ou automático) ----
    const manual = Phaser.Input.Keyboard.JustDown(k.SPACE);
    if (
      this.attackCooldownRemaining <= 0 &&
      (manual || this.hasEnemyWithin(this.profile.range * this.rangeMult * 1.05))
    ) {
      if (this.executeBasicAttack()) {
        this.attackCooldownRemaining = this.attackCooldownMs;
      }
    }

    // ---- Animação ----
    if (!this.isAttacking) {
      const desired: PokemonAnimType = isMoving || this.dashTimeRemaining > 0 ? 'Walk' : 'Idle';
      if (desired !== this.currentState) {
        this.currentState = desired;
        this.playCurrentAnim(true);
      } else {
        this.playCurrentAnim(false);
      }
    }

    this.updateOrbitals(delta);

    // ---- Sombra / profundidade / barra de HP ----
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 11);
    this.sprite.setDepth(depthForY(this.sprite.y) + 0.0001);
    this.sprite.setAlpha(this.invulnerableMs > 0 && this.dashTimeRemaining <= 0 ? 0.75 : 1);
    this.updateHpBar();

    return result;
  }

  private tickTimers(delta: number): void {
    if (this.invulnerableMs > 0) this.invulnerableMs -= delta;
    if (this.painPortraitTimerMs > 0) this.painPortraitTimerMs -= delta;
    if (this.supportBuffTimerMs > 0) this.supportBuffTimerMs -= delta;
    if (this.attackCooldownRemaining > 0) this.attackCooldownRemaining -= delta;
    if (this.dashCooldownRemaining > 0) this.dashCooldownRemaining -= delta;

    if (this.isAttacking) {
      this.attackAnimSafetyMs -= delta;
      if (this.attackAnimSafetyMs <= 0) this.finishAttackAnim();
    }

    this.addSpecialEnergy((SPECIAL_PASSIVE_GAIN_PER_SEC * delta) / 1000);

    if (this.classDef.stats.passiveRegenPercentPerSec > 0 && this.hp < this.maxHp) {
      this.regenAccumMs += delta;
      if (this.regenAccumMs >= 1000) {
        this.regenAccumMs -= 1000;
        this.heal(
          Math.max(
            1,
            Math.round(
              this.maxHp *
                this.classDef.stats.passiveRegenPercentPerSec *
                this.classDef.stats.healEfficiencyMultiplier
            )
          )
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
    if (this.dashCooldownRemaining > 0 || this.dashTimeRemaining > 0) return false;

    if (vx === 0 && vy === 0) {
      const facingDeg = [90, 45, 0, -45, -90, -135, 180, 135][this.currentDir];
      const rad = Phaser.Math.DegToRad(facingDeg);
      this.dashVec.set(Math.cos(rad), Math.sin(rad));
    } else {
      this.dashVec.set(vx, vy).normalize();
    }

    this.dashTimeRemaining = DASH_DURATION_MS;
    this.dashCooldownRemaining = DASH_COOLDOWN_MS;
    this.invulnerableMs = Math.max(this.invulnerableMs, DASH_INVULNERABLE_MS);

    // Nuvem de poeira no ponto de partida
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
      .sprite(this.sprite.x, this.sprite.y, this.sprite.texture.key, this.sprite.frame.name)
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
    const passiveBonus = 1 + this.getAbilityLevel('energy') * 0.2;
    this.specialEnergy = Math.min(
      SPECIAL_MAX_ENERGY,
      this.specialEnergy + amount * classBonus * passiveBonus
    );
  }

  // ===================== PIPELINE DE DANO =====================

  private calculateDamage(base: number, special: boolean): { damage: number; isCrit: boolean } {
    const s = this.classDef.stats;
    const statMult = special ? s.specDamageMultiplier : s.physDamageMultiplier;
    const levelMult = 1 + (this.level - 1) * 0.08;
    const powerMult = 1 + this.getAbilityLevel('power') * 0.12;
    const buffMult = this.supportBuffTimerMs > 0 ? s.soloBuffMultiplier : 1;

    const critLvl = this.getAbilityLevel('crit');
    const critChance = 0.08 + s.critChanceBonus + critLvl * 0.06;
    const isCrit = Math.random() < critChance;
    const critMult = isCrit ? 1.5 + s.critDamageBonus + critLvl * 0.1 : 1;

    return {
      damage: Math.max(1, Math.round(base * statMult * levelMult * powerMult * buffMult * critMult)),
      isCrit,
    };
  }

  /**
   * Ponto único por onde passa TODO dano causado pelo jogador.
   * Aplica crítico, roubo de vida, efeito elemental, explosão e ricochete.
   */
  private dealDamage(enemy: Enemy, base: number, opts: DamageOptions = {}): void {
    if (enemy.isDead) return;

    const fromX = opts.fromX ?? this.sprite.x;
    const fromY = opts.fromY ?? this.sprite.y;
    const special = Boolean(opts.special);
    const ex = enemy.sprite.x;
    const ey = enemy.sprite.y;

    const { damage, isCrit } = this.calculateDamage(base, special || this.profile.style !== 'melee_flame');
    const killed = enemy.takeDamage(damage, fromX, fromY, opts.knockback ?? 160, isCrit);

    if (!special) this.addSpecialEnergy(opts.secondary ? 1.2 : SPECIAL_GAIN_PER_HIT);

    // Dreno Vital
    const lifestealLvl = this.getAbilityLevel('lifesteal');
    if (lifestealLvl > 0) {
      this.lifestealAccum += damage * lifestealLvl * 0.025;
      if (this.lifestealAccum >= 1) {
        const whole = Math.floor(this.lifestealAccum);
        this.lifestealAccum -= whole;
        this.heal(whole);
      }
    }

    // Afinidade Elemental
    if (!killed) {
      const chance =
        0.05 + this.classDef.stats.effectChanceBonus + this.getAbilityLevel('elemental') * 0.12;
      if (Math.random() < chance) this.applyElementalEffect(enemy);
    }

    if (!opts.secondary) {
      this.triggerExplosion(enemy, ex, ey, base, special);
      this.triggerChain(enemy, ex, ey, base, special);
    }

    if (killed) this.onKill(enemy);
  }

  private applyElementalEffect(enemy: Enemy): void {
    const strength = 1 + this.classDef.stats.effectStrengthBonus;
    switch (this.profile.element) {
      case 'eletrico':
        enemy.applyStatusEffect({ slowFactor: 0.02, slowDurationMs: 550 * strength, tintColor: 0xfff176 });
        break;
      case 'fogo':
        enemy.applyStatusEffect({ dotDamagePerSec: 6 * strength, dotDurationMs: 2500, tintColor: 0xff7b00 });
        break;
      case 'planta':
        enemy.applyStatusEffect({
          slowFactor: 0.6,
          slowDurationMs: 2000,
          dotDamagePerSec: 5 * strength,
          dotDurationMs: 3000,
          tintColor: 0x9be7a8,
        });
        break;
      case 'agua':
        enemy.applyStatusEffect({ slowFactor: 0.5, slowDurationMs: 1800 * strength, tintColor: 0x90e0ef });
        break;
      case 'fada':
        enemy.applyStatusEffect({ slowFactor: 0.35, slowDurationMs: 1600 * strength, tintColor: 0xffb3c6 });
        break;
    }
  }

  private triggerExplosion(origin: Enemy, x: number, y: number, base: number, special: boolean): void {
    const lvl = this.getAbilityLevel('explosion');
    if (lvl <= 0) return;
    const radius = 46 + lvl * 10;

    const blast = this.scene.add
      .circle(x, y, 8, 0xff9f1c, 0.55)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({
      targets: blast,
      radius,
      alpha: 0,
      duration: 200,
      onComplete: () => blast.destroy(),
    });

    for (const e of this.enemiesProvider()) {
      if (e === origin || e.isDead) continue;
      if (Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y) <= radius) {
        this.dealDamage(e, base * (0.2 + lvl * 0.1), { special, knockback: 120, fromX: x, fromY: y, secondary: true });
      }
    }
  }

  private triggerChain(origin: Enemy, x: number, y: number, base: number, special: boolean): void {
    const lvl = this.getAbilityLevel('chain');
    if (lvl <= 0) return;

    const targets = this.enemiesProvider()
      .filter((e) => e !== origin && !e.isDead)
      .map((e) => ({ e, d: Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y) }))
      .filter((t) => t.d <= 170)
      .sort((a, b) => a.d - b.d)
      .slice(0, lvl);

    for (const { e } of targets) {
      const line = this.scene.add.graphics().setDepth(DEPTH.EFFECTS);
      line.lineStyle(3, this.profile.secondaryColor, 0.95);
      line.lineBetween(x, y, e.sprite.x, e.sprite.y);
      this.scene.tweens.add({ targets: line, alpha: 0, duration: 180, onComplete: () => line.destroy() });
      this.dealDamage(e, base * 0.45, { special, knockback: 90, fromX: x, fromY: y, secondary: true });
    }
  }

  // ===================== ATAQUE BÁSICO =====================

  private executeBasicAttack(): boolean {
    if (this.isAttacking) return false;

    const aim = this.computeAimAngle(this.profile.range * this.rangeMult * 1.25);
    this.currentDir = PokemonAnimationManager.vectorToDirection(Math.cos(aim), Math.sin(aim), this.currentDir);
    this.isAttacking = true;
    this.attackAnimSafetyMs = 700;
    this.currentState = 'Attack';
    this.playCurrentAnim(true);

    this.performAttackPattern(aim, 1);

    // Eco do Golpe: repete o padrão com dano reduzido
    const echoLvl = this.getAbilityLevel('echo');
    if (echoLvl > 0) {
      this.scene.time.delayedCall(230, () => {
        if (this.isDead) return;
        const echoAim = this.computeAimAngle(this.profile.range * this.rangeMult * 1.25);
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
        return this.basicSupportMelody(dmgScale);
    }
  }

  /** Projétil genérico com perfuração, rastro e suporte a sprite estático de ataque */
  private spawnProjectile(cfg: ProjectileConfig): void {
    const customTexKey = PokemonAnimationManager.getAttackSpriteKey(this.pokemonDef.id);
    const hasCustomSprite =
      Boolean(this.profile.spriteFile) && this.scene.textures.exists(customTexKey);

    const shape = hasCustomSprite
      ? this.scene.add
          .image(cfg.x, cfg.y, customTexKey)
          .setScale(this.profile.spriteScale ?? 1)
      : cfg.draw();
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
        const step = (cfg.speed * stepMs) / 1000;
        shape.x += Math.cos(cfg.angle) * step;
        shape.y += Math.sin(cfg.angle) * step;
        traveled += step;
        if (cfg.rotateSpeed) shape.rotation += cfg.rotateSpeed;

        if (cfg.trailColor !== undefined) {
          const t = this.scene.add.circle(shape.x, shape.y, 4, cfg.trailColor, 0.6).setDepth(DEPTH.EFFECTS - 1);
          this.scene.tweens.add({ targets: t, alpha: 0, scale: 0.2, duration: 140, onComplete: () => t.destroy() });
        }

        for (const e of this.enemiesProvider()) {
          if (e.isDead || hit.has(e)) continue;
          if (Phaser.Math.Distance.Between(shape.x, shape.y, e.sprite.x, e.sprite.y) <= cfg.hitRadius) {
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

  private spreadAngles(center: number, count: number, step: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(center + (i - (count - 1) / 2) * step);
    return out;
  }

  /** PIKACHU / RAICHU — Elétrico (Disparador) */
  private basicElectricBolt(aim: number, dmgScale: number): void {
    const p = this.profile;
    const count = 1 + this.getAbilityLevel('multishot');
    const pierce = this.getAbilityLevel('pierce');

    for (const angle of this.spreadAngles(aim, count, 0.2)) {
      this.spawnProjectile({
        x: this.sprite.x + Math.cos(angle) * 18,
        y: this.sprite.y + Math.sin(angle) * 18,
        angle,
        speed: 460,
        range: p.range * this.rangeMult,
        hitRadius: 26,
        pierce,
        trailColor: p.secondaryColor,
        draw: () => this.scene.add.circle(0, 0, 8, p.elementColor, 1).setStrokeStyle(3, p.secondaryColor, 1),
        onHit: (e, px, py) => {
          // Passiva DISPARADOR: +15% em golpes à distância
          this.dealDamage(e, p.baseDamage * 1.15 * dmgScale, { knockback: 180, fromX: px, fromY: py });
          const burst = this.scene.add.circle(px, py, 10, p.elementColor, 0.6).setDepth(DEPTH.EFFECTS);
          this.scene.tweens.add({ targets: burst, radius: 34, alpha: 0, duration: 180, onComplete: () => burst.destroy() });
        },
      });
    }
  }

  /** CHARMANDER / CHARMELEON / CHARIZARD — Fogo (Lutador) */
  private basicFlameClaw(aim: number, dmgScale: number): void {
    const p = this.profile;
    const multi = this.getAbilityLevel('multishot');
    const range = p.range * this.rangeMult;
    const halfArc = 0.55 + multi * 0.3;

    // Passiva LUTADOR: mais dano com HP baixo
    const ratio = this.hp / this.maxHp;
    const lowHp = ratio < 0.2 ? 1.3 : ratio < 0.3 ? 1.185 : ratio < 0.4 ? 1.1 : 1;

    const customTexKey = PokemonAnimationManager.getAttackSpriteKey(this.pokemonDef.id);
    const hasCustomSprite =
      Boolean(this.profile.spriteFile) && this.scene.textures.exists(customTexKey);

    const flames = 3 + multi * 2;
    for (const a of this.spreadAngles(aim, flames, (halfArc * 2) / Math.max(1, flames - 1))) {
      const fx = this.sprite.x + Math.cos(a) * range * 0.4;
      const fy = this.sprite.y + Math.sin(a) * range * 0.4;
      const flame = hasCustomSprite
        ? this.scene.add
            .image(fx, fy, customTexKey)
            .setScale(this.profile.spriteScale ?? 1)
            .setRotation(a)
            .setDepth(DEPTH.EFFECTS)
        : this.scene.add
            .circle(fx, fy, 15, p.elementColor, 0.75)
            .setStrokeStyle(3, p.secondaryColor, 1)
            .setDepth(DEPTH.EFFECTS);
      this.scene.tweens.add({
        targets: flame,
        x: this.sprite.x + Math.cos(a) * range * 0.75,
        y: this.sprite.y + Math.sin(a) * range * 0.75,
        scale: hasCustomSprite ? (this.profile.spriteScale ?? 1) * 1.4 : 1.6,
        alpha: 0,
        duration: 240,
        onComplete: () => flame.destroy(),
      });
    }

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      const d = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, e.sprite.x, e.sprite.y);
      if (d > range) continue;
      const angTo = Math.atan2(e.sprite.y - this.sprite.y, e.sprite.x - this.sprite.x);
      if (Math.abs(Phaser.Math.Angle.Wrap(angTo - aim)) <= halfArc + 0.25 || d < 26) {
        this.dealDamage(e, p.baseDamage * lowHp * dmgScale, { knockback: 230 });
        e.applyStatusEffect({ dotDamagePerSec: 5, dotDurationMs: 2000, tintColor: 0xff7b00 });
      }
    }
  }

  /** BULBASAUR / IVYSAUR / VENUSAUR — Planta (Controlador) */
  private basicRazorLeaves(aim: number, dmgScale: number): void {
    const p = this.profile;
    const count = 2 + this.getAbilityLevel('multishot');
    const strength = 1 + this.classDef.stats.effectStrengthBonus;

    const ring = this.scene.add
      .circle(this.sprite.x, this.sprite.y, 16, p.secondaryColor, 0.3)
      .setStrokeStyle(2, p.elementColor, 0.9)
      .setDepth(DEPTH.EFFECTS - 2);
    this.scene.tweens.add({ targets: ring, radius: 64, alpha: 0, duration: 300, onComplete: () => ring.destroy() });

    for (const angle of this.spreadAngles(aim, count, 0.18)) {
      this.spawnProjectile({
        x: this.sprite.x + Math.cos(angle) * 16,
        y: this.sprite.y + Math.sin(angle) * 16,
        angle,
        speed: 340,
        range: p.range * this.rangeMult,
        hitRadius: 25,
        pierce: 99, // Folhas sempre atravessam
        rotateSpeed: 0.35,
        draw: () => this.scene.add.ellipse(0, 0, 18, 8, p.elementColor, 1).setStrokeStyle(2, p.secondaryColor, 1),
        onHit: (e, px, py) => {
          this.dealDamage(e, p.baseDamage * dmgScale, { knockback: 130, fromX: px, fromY: py });
          e.applyStatusEffect({
            slowFactor: 0.5,
            slowDurationMs: Math.round(2600 * strength),
            dotDamagePerSec: Math.round(5 * strength),
            dotDurationMs: Math.round(3000 * strength),
            tintColor: 0x9be7a8,
          });
        },
      });
    }
  }

  /** SQUIRTLE / WARTORTLE / BLASTOISE — Água (Tank) */
  private basicWaterPulse(aim: number, dmgScale: number): void {
    const p = this.profile;
    const waves = 1 + this.getAbilityLevel('multishot');
    const radius = 84 * this.rangeMult;

    const customTexKey = PokemonAnimationManager.getAttackSpriteKey(this.pokemonDef.id);
    const hasCustomSprite =
      Boolean(this.profile.spriteFile) && this.scene.textures.exists(customTexKey);

    for (let i = 0; i < waves; i++) {
      const angle = aim + (i * Math.PI * 2) / waves;
      const ox = this.sprite.x + Math.cos(angle) * 30;
      const oy = this.sprite.y + Math.sin(angle) * 30;

      if (hasCustomSprite) {
        const waveImg = this.scene.add
          .image(ox, oy, customTexKey)
          .setScale(this.profile.spriteScale ?? 1)
          .setRotation(angle)
          .setDepth(DEPTH.EFFECTS);
        this.scene.tweens.add({
          targets: waveImg,
          x: ox + Math.cos(angle) * 48,
          y: oy + Math.sin(angle) * 48,
          scale: (this.profile.spriteScale ?? 1) * 1.5,
          alpha: 0,
          duration: 290,
          onComplete: () => waveImg.destroy(),
        });
      } else {
        const wave = this.scene.add
          .circle(ox, oy, 18, p.elementColor, 0.5)
          .setStrokeStyle(4, p.secondaryColor, 0.95)
          .setDepth(DEPTH.EFFECTS);
        this.scene.tweens.add({
          targets: wave,
          x: ox + Math.cos(angle) * 42,
          y: oy + Math.sin(angle) * 42,
          radius: radius * 0.85,
          alpha: 0,
          duration: 290,
          onComplete: () => wave.destroy(),
        });
      }

      const cx = ox + Math.cos(angle) * 26;
      const cy = oy + Math.sin(angle) * 26;
      for (const e of this.enemiesProvider()) {
        if (e.isDead) continue;
        if (Phaser.Math.Distance.Between(cx, cy, e.sprite.x, e.sprite.y) <= radius) {
          this.dealDamage(e, p.baseDamage * dmgScale, { knockback: 340 });
        }
      }
    }
  }

  /** JIGGLYPUFF / WIGGLYTUFF — Fada (Suporte) */
  private basicSupportMelody(dmgScale: number): void {
    const p = this.profile;
    const pulses = 1 + this.getAbilityLevel('multishot');
    const radius = p.range * 0.75 * this.rangeMult;

    this.supportBuffTimerMs = 4000;
    this.heal(Math.max(1, Math.round(4 * this.classDef.stats.healEfficiencyMultiplier)));

    for (let i = 0; i < pulses; i++) {
      this.scene.time.delayedCall(i * 180, () => {
        if (this.isDead) return;
        const px = this.sprite.x;
        const py = this.sprite.y;
        const ring = this.scene.add
          .circle(px, py, 18, p.elementColor, 0.3)
          .setStrokeStyle(3, p.secondaryColor, 1)
          .setDepth(DEPTH.EFFECTS);
        this.scene.tweens.add({ targets: ring, radius, alpha: 0, duration: 360, onComplete: () => ring.destroy() });

        const notes = ['♪', '♫', '♪', '✨'];
        notes.forEach((n, idx) => {
          const a = (Math.PI * 2 * idx) / notes.length + i * 0.4;
          const t = this.scene.add
            .text(px + Math.cos(a) * 20, py + Math.sin(a) * 20, n, {
              fontFamily: 'monospace',
              fontSize: '15px',
              color: '#ff4d8d',
              stroke: '#ffffff',
              strokeThickness: 2,
            })
            .setOrigin(0.5)
            .setDepth(DEPTH.EFFECTS + 1);
          this.scene.tweens.add({
            targets: t,
            x: px + Math.cos(a) * 62,
            y: py + Math.sin(a) * 62 - 12,
            alpha: 0,
            duration: 420,
            onComplete: () => t.destroy(),
          });
        });

        for (const e of this.enemiesProvider()) {
          if (e.isDead) continue;
          if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= radius) {
            this.dealDamage(e, p.baseDamage * dmgScale, { knockback: 200, fromX: px, fromY: py });
            e.applyStatusEffect({ slowFactor: 0.55, slowDurationMs: 2000, tintColor: 0xff85a1 });
          }
        }
      });
    }
  }

  // ===================== ESPECIAL =====================

  private executeSpecial(): void {
    this.specialEnergy = 0;
    const aim = this.computeAimAngle(420);
    this.currentDir = PokemonAnimationManager.vectorToDirection(Math.cos(aim), Math.sin(aim), this.currentDir);
    this.isAttacking = true;
    this.attackAnimSafetyMs = 800;
    this.currentState = 'Attack';
    this.playCurrentAnim(true);

    // Breve flash de câmera para dar peso ao golpe
    this.scene.cameras.main.flash(160, 255, 255, 255, false);
    this.scene.cameras.main.shake(180, 0.004);

    const mult = 1 + this.getAbilityLevel('energy') * 0.08;
    const base = this.profile.baseDamage * mult;

    switch (this.profile.style) {
      case 'ranged_bolt':
        return this.specialThunder(base);
      case 'melee_flame':
        return this.specialFlameNova(base);
      case 'control_leaf':
        return this.specialSolarBeam(aim, base);
      case 'wave_water':
        return this.specialHydroVortex(base);
      case 'support_song':
        return this.specialLullaby(base);
    }
  }

  private specialThunder(base: number): void {
    const p = this.profile;
    const maxTargets = 4 + this.getAbilityLevel('multishot');
    const targets = this.enemiesProvider()
      .filter((e) => !e.isDead)
      .map((e) => ({ e, d: Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, e.sprite.x, e.sprite.y) }))
      .filter((t) => t.d <= 400)
      .sort((a, b) => a.d - b.d)
      .slice(0, maxTargets);

    const strike = (x: number, y: number) => {
      const g = this.scene.add.graphics().setDepth(DEPTH.EFFECTS + 2);
      g.lineStyle(4, p.secondaryColor, 1);
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
      g.lineStyle(2, 0xffffff, 1);
      g.strokePath();
      const flash = this.scene.add.circle(x, y, 12, p.elementColor, 0.8).setDepth(DEPTH.EFFECTS + 1);
      this.scene.tweens.add({ targets: [g], alpha: 0, duration: 260, onComplete: () => g.destroy() });
      this.scene.tweens.add({ targets: flash, radius: 48, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    };

    if (targets.length === 0) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        strike(this.sprite.x + Math.cos(a) * 90, this.sprite.y + Math.sin(a) * 90);
      }
      return;
    }

    targets.forEach(({ e }, i) => {
      this.scene.time.delayedCall(i * 70, () => {
        if (e.isDead) return;
        strike(e.sprite.x, e.sprite.y);
        this.dealDamage(e, base * 2.0, { special: true, knockback: 100, fromX: e.sprite.x, fromY: e.sprite.y - 10 });
        e.applyStatusEffect({ slowFactor: 0.02, slowDurationMs: 900, tintColor: 0xfff176 });
      });
    });
  }

  private specialFlameNova(base: number): void {
    const p = this.profile;
    const radius = 165 * this.rangeMult;
    const px = this.sprite.x;
    const py = this.sprite.y;

    for (let i = 0; i < 2; i++) {
      const ring = this.scene.add
        .circle(px, py, 20, i === 0 ? p.elementColor : p.secondaryColor, 0.45)
        .setStrokeStyle(5, p.secondaryColor, 1)
        .setDepth(DEPTH.EFFECTS);
      this.scene.tweens.add({
        targets: ring,
        radius,
        alpha: 0,
        delay: i * 90,
        duration: 420,
        onComplete: () => ring.destroy(),
      });
    }

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= radius) {
        this.dealDamage(e, base * 2.1, { special: true, knockback: 300, fromX: px, fromY: py });
        e.applyStatusEffect({ dotDamagePerSec: 8, dotDurationMs: 3000, tintColor: 0xff7b00 });
      }
    }
  }

  private specialSolarBeam(aim: number, base: number): void {
    const p = this.profile;
    const length = 460 * this.rangeMult;
    const halfWidth = 26;
    const sx = this.sprite.x;
    const sy = this.sprite.y;
    const ex = sx + Math.cos(aim) * length;
    const ey = sy + Math.sin(aim) * length;

    const charge = this.scene.add.circle(sx, sy, 10, 0xfff59d, 0.8).setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({ targets: charge, radius: 30, duration: 220, yoyo: true, onComplete: () => charge.destroy() });

    this.scene.time.delayedCall(220, () => {
      const beam = this.scene.add.graphics().setDepth(DEPTH.EFFECTS + 1);
      beam.lineStyle(halfWidth * 2, 0xfff59d, 0.55);
      beam.lineBetween(sx, sy, ex, ey);
      beam.lineStyle(halfWidth, p.secondaryColor, 0.9);
      beam.lineBetween(sx, sy, ex, ey);
      beam.lineStyle(6, 0xffffff, 1);
      beam.lineBetween(sx, sy, ex, ey);
      this.scene.tweens.add({ targets: beam, alpha: 0, duration: 380, onComplete: () => beam.destroy() });

      const line = new Phaser.Geom.Line(sx, sy, ex, ey);
      const strength = 1 + this.classDef.stats.effectStrengthBonus;
      for (const e of this.enemiesProvider()) {
        if (e.isDead) continue;
        const pt = Phaser.Geom.Line.GetNearestPoint(line, new Phaser.Geom.Point(e.sprite.x, e.sprite.y));
        const onSegment =
          Math.min(sx, ex) - halfWidth <= pt.x &&
          pt.x <= Math.max(sx, ex) + halfWidth &&
          Math.min(sy, ey) - halfWidth <= pt.y &&
          pt.y <= Math.max(sy, ey) + halfWidth;
        if (onSegment && Phaser.Math.Distance.Between(pt.x, pt.y, e.sprite.x, e.sprite.y) <= halfWidth + 10) {
          this.dealDamage(e, base * 2.0, { special: true, knockback: 160 });
          e.applyStatusEffect({
            slowFactor: 0.35,
            slowDurationMs: 3000 * strength,
            dotDamagePerSec: 7 * strength,
            dotDurationMs: 3500,
            tintColor: 0x9be7a8,
          });
        }
      }
    });
  }

  private specialHydroVortex(base: number): void {
    const p = this.profile;
    const radius = 180 * this.rangeMult;

    const swirl = this.scene.add
      .circle(this.sprite.x, this.sprite.y, radius, p.elementColor, 0.18)
      .setStrokeStyle(4, p.secondaryColor, 0.9)
      .setDepth(DEPTH.EFFECTS - 1);
    this.scene.tweens.add({ targets: swirl, scale: 0.35, duration: 600, onComplete: () => swirl.destroy() });

    // 3 pulsos que PUXAM os inimigos (knockback negativo)
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 200, () => {
        const px = this.sprite.x;
        const py = this.sprite.y;
        for (const e of this.enemiesProvider()) {
          if (e.isDead) continue;
          if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= radius) {
            this.dealDamage(e, base * 0.45, { special: true, knockback: -170, fromX: px, fromY: py, secondary: true });
          }
        }
      });
    }

    // Explosão final
    this.scene.time.delayedCall(640, () => {
      const px = this.sprite.x;
      const py = this.sprite.y;
      const burst = this.scene.add
        .circle(px, py, 20, p.secondaryColor, 0.55)
        .setStrokeStyle(5, 0xffffff, 1)
        .setDepth(DEPTH.EFFECTS);
      this.scene.tweens.add({ targets: burst, radius: radius * 1.05, alpha: 0, duration: 320, onComplete: () => burst.destroy() });
      for (const e of this.enemiesProvider()) {
        if (e.isDead) continue;
        if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= radius * 1.05) {
          this.dealDamage(e, base * 1.0, { special: true, knockback: 440, fromX: px, fromY: py });
        }
      }
    });
  }

  private specialLullaby(base: number): void {
    const p = this.profile;
    const radius = 230 * this.rangeMult;
    const px = this.sprite.x;
    const py = this.sprite.y;

    this.heal(Math.round(this.maxHp * 0.18 * this.classDef.stats.healEfficiencyMultiplier));
    this.supportBuffTimerMs = 6000;

    const ring = this.scene.add
      .circle(px, py, 20, p.elementColor, 0.25)
      .setStrokeStyle(4, p.secondaryColor, 1)
      .setDepth(DEPTH.EFFECTS);
    this.scene.tweens.add({ targets: ring, radius, alpha: 0, duration: 650, onComplete: () => ring.destroy() });

    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= radius) {
        this.dealDamage(e, base * 1.6, { special: true, knockback: 0, fromX: px, fromY: py });
        e.applyStatusEffect({ slowFactor: 0, slowDurationMs: 2600, tintColor: 0xc8b6ff, showSleepIcon: true });
      }
    }
  }

  // ===================== ÓRBITA ELEMENTAL =====================

  private updateOrbitals(delta: number): void {
    if (this.orbitals.length === 0) return;
    const lvl = this.getAbilityLevel('orbit');
    this.orbitAngle += (2.6 * delta) / 1000;
    const radius = 64;

    for (const [enemy, cd] of this.orbitHitCooldown) {
      const next = cd - delta;
      if (next <= 0 || enemy.isDead) this.orbitHitCooldown.delete(enemy);
      else this.orbitHitCooldown.set(enemy, next);
    }

    this.orbitals.forEach((orb, i) => {
      const a = this.orbitAngle + (i * Math.PI * 2) / this.orbitals.length;
      orb.setPosition(this.sprite.x + Math.cos(a) * radius, this.sprite.y + Math.sin(a) * radius);

      for (const e of this.enemiesProvider()) {
        if (e.isDead || this.orbitHitCooldown.has(e)) continue;
        if (Phaser.Math.Distance.Between(orb.x, orb.y, e.sprite.x, e.sprite.y) <= 20) {
          this.orbitHitCooldown.set(e, 550);
          this.dealDamage(e, this.profile.baseDamage * (0.3 + lvl * 0.1), {
            knockback: 140,
            fromX: orb.x,
            fromY: orb.y,
            secondary: true,
          });
        }
      }
    });
  }

  // ===================== UTILITÁRIOS =====================

  private hasEnemyWithin(dist: number): boolean {
    return this.enemiesProvider().some(
      (e) => !e.isDead && Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, e.sprite.x, e.sprite.y) <= dist
    );
  }

  private computeAimAngle(maxSearchDist: number): number {
    let closest: Enemy | null = null;
    let best = maxSearchDist;
    for (const e of this.enemiesProvider()) {
      if (e.isDead) continue;
      const d = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, e.sprite.x, e.sprite.y);
      if (d < best) {
        best = d;
        closest = e;
      }
    }
    if (closest) {
      return Math.atan2(closest.sprite.y - this.sprite.y, closest.sprite.x - this.sprite.x);
    }
    return Phaser.Math.DegToRad([90, 45, 0, -45, -90, -135, 180, 135][this.currentDir]);
  }

  private updateHpBar(): void {
    const x = this.sprite.x;
    const y = this.sprite.y - 26;
    this.hpBarBg.setPosition(x, y);
    this.hpBarFill.setPosition(x - 18, y);
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBarFill.width = 36 * ratio;
    this.hpBarFill.setFillStyle(ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfacc15 : 0xef4444);
  }

  private playCurrentAnim(forceRestart: boolean): void {
    const animKey = PokemonAnimationManager.getAnimKey(this.pokemonDef.id, this.currentState, this.currentDir);
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
