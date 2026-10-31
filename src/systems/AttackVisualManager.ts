import Phaser from 'phaser';
import { ABILITIES, AbilityId } from '../config/abilities';
import { ElementType } from '../config/pokemonManifest';

interface RawSheetPreload {
  key: string;
  file: string;
}

const RAW_ATTACK_FILES: RawSheetPreload[] = [
  { key: 'attack-eletric', file: 'assets/attacks/attack-eletric.jpeg' },
  { key: 'attack-fire', file: 'assets/attacks/attack-fire.jpeg' },
  { key: 'attack-grass', file: 'assets/attacks/attack-grass.jpeg' },
  { key: 'attack-water', file: 'assets/attacks/attack-water.jpeg' },
  { key: 'especial-eletrico', file: 'assets/attacks/Especial-Eletrico.jpeg' },
  { key: 'especial-fogo', file: 'assets/attacks/Especial-Fogo.jpeg' },
  { key: 'especial-agua', file: 'assets/attacks/Especial-Agua.jpeg' },
];

export class AttackVisualManager {
  static preloadAll(scene: Phaser.Scene): void {
    for (const item of RAW_ATTACK_FILES) {
      scene.load.image(`raw-${item.key}`, item.file);
    }
  }

  static registerAll(scene: Phaser.Scene): void {
    this.registerElectricBasic(scene);
    this.registerFireBasic(scene);
    this.registerGrassBasic(scene);
    this.registerWaterBasic(scene);

    this.registerElectricSpecial(scene);
    this.registerFireSpecial(scene);
    this.registerWaterSpecial(scene);

    this.registerProceduralFairyAndVineAttacks(scene);
    this.registerAllMoveAndAbilityIcons(scene);
  }

  static getAnimKey(attackKey: string): string {
    return `anim-${attackKey}`;
  }

  static getSheetKey(attackKey: string): string {
    return `sheet-${attackKey}`;
  }

  static getAbilityIconKey(id: AbilityId): string {
    return `icon-ability-${id}`;
  }

  static getMoveIconKey(
    element: ElementType,
    slot: 'basic' | 'ult' | 'innate'
  ): string {
    return `icon-move-${slot}-${element}`;
  }

  private static registerCanvasSheet(
    scene: Phaser.Scene,
    sheetKey: string,
    canvas: HTMLCanvasElement,
    frameWidth: number,
    frameHeight: number,
    frameCount: number
  ): void {
    if (scene.textures.exists(sheetKey)) {
      scene.textures.remove(sheetKey);
    }
    const tex = scene.textures.addCanvas(sheetKey, canvas);
    if (tex) {
      for (let f = 0; f < frameCount; f++) {
        tex.add(f, 0, f * frameWidth, 0, frameWidth, frameHeight);
      }
    }
  }

  // ===================== 1. ELÉTRICO BÁSICO (ORIENTADO PARA +X) =====================

  private static registerElectricBasic(scene: Phaser.Scene): void {
    const fW = 38;
    const fH = 20;
    const frameCount = 6;
    const canvas = document.createElement('canvas');
    canvas.width = fW * frameCount;
    canvas.height = fH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const ox = f * fW;
      const cy = fH / 2;

      ctx.save();
      ctx.translate(ox, 0);

      if (f < 4) {
        // Projétil direcional em voo apontando para +X (ponta na direita)
        // Aura externa luminosa
        ctx.shadowColor = 'rgba(250, 204, 21, 0.85)';
        ctx.shadowBlur = 6;

        // Raio ziguezagueante externo (amarelo dourado vibrante)
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        const yOff = f % 2 === 0 ? 1 : -1;
        ctx.moveTo(4, cy);
        ctx.lineTo(12, cy - 4 * yOff);
        ctx.lineTo(20, cy + 4 * yOff);
        ctx.lineTo(28, cy - 3 * yOff);
        ctx.lineTo(35, cy);
        ctx.stroke();

        // Núcleo branco incandescente de alta voltagem
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(6, cy);
        ctx.lineTo(13, cy - 2.5 * yOff);
        ctx.lineTo(21, cy + 2.5 * yOff);
        ctx.lineTo(29, cy - 2 * yOff);
        ctx.lineTo(36, cy);
        ctx.stroke();

        // Ponta de lança elétrica diamante em +X
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(37, cy);
        ctx.lineTo(30, cy - 3.5);
        ctx.lineTo(32, cy);
        ctx.lineTo(30, cy + 3.5);
        ctx.closePath();
        ctx.fill();

        // Faíscas secundárias e corona ciano
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(10, cy + 5 * yOff, 1.8, 1.8);
        ctx.fillRect(24, cy - 6 * yOff, 1.8, 1.8);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(4, cy + 3, 2, 2);
      } else {
        // Quadros 4 e 5: Impacto elétrico para compatibilidade de hit
        const hitStep = f - 4;
        const r = 5 + hitStep * 4.5;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          const sx = fW / 2 + Math.cos(ang) * (r * 0.4);
          const sy = cy + Math.sin(ang) * (r * 0.4);
          const ex = fW / 2 + Math.cos(ang) * r;
          const ey = cy + Math.sin(ang) * r;
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(fW / 2, cy, 3 - hitStep, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    const sheetKey = 'sheet-attack-eletric';
    this.registerCanvasSheet(scene, sheetKey, canvas, fW, fH, frameCount);

    if (!scene.anims.exists('anim-attack-eletric')) {
      scene.anims.create({
        key: 'anim-attack-eletric',
        frames: scene.anims.generateFrameNumbers(sheetKey, { frames: [0, 1, 2, 3] }),
        frameRate: 16,
        repeat: -1,
      });
    }

    // Folha dedicada de impacto elétrico 32x32 para máxima nitidez
    const hitW = 32;
    const hitH = 32;
    const hitCount = 4;
    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = hitW * hitCount;
    hitCanvas.height = hitH;
    const hitCtx = hitCanvas.getContext('2d')!;
    hitCtx.imageSmoothingEnabled = false;

    for (let f = 0; f < hitCount; f++) {
      const hx = f * hitW + hitW / 2;
      const hy = hitH / 2;
      const progress = f / (hitCount - 1);
      const rad = 4 + progress * 11;
      const alpha = Math.max(0.1, 1 - progress * 0.85);

      hitCtx.save();
      hitCtx.shadowColor = 'rgba(250, 204, 21, 0.9)';
      hitCtx.shadowBlur = 8;
      hitCtx.strokeStyle = `rgba(250, 204, 21, ${alpha})`;
      hitCtx.lineWidth = 2.2;
      hitCtx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + progress * 0.3;
        hitCtx.moveTo(hx + Math.cos(a) * (rad * 0.3), hy + Math.sin(a) * (rad * 0.3));
        hitCtx.lineTo(hx + Math.cos(a) * rad, hy + Math.sin(a) * rad);
      }
      hitCtx.stroke();

      hitCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      hitCtx.beginPath();
      hitCtx.arc(hx, hy, Math.max(1, 4.5 * (1 - progress)), 0, Math.PI * 2);
      hitCtx.fill();
      hitCtx.restore();
    }

    const hitSheetKey = 'sheet-attack-eletric-hit';
    this.registerCanvasSheet(scene, hitSheetKey, hitCanvas, hitW, hitH, hitCount);

    if (!scene.anims.exists('anim-attack-eletric-hit')) {
      scene.anims.create({
        key: 'anim-attack-eletric-hit',
        frames: scene.anims.generateFrameNumbers(hitSheetKey, { start: 0, end: hitCount - 1 }),
        frameRate: 20,
        repeat: 0,
      });
    }
  }

  // ===================== 2. FOGO BÁSICO (ORIENTADO PARA +X) =====================

  private static registerFireBasic(scene: Phaser.Scene): void {
    const fW = 38;
    const fH = 22;
    const frameCount = 6;
    const canvas = document.createElement('canvas');
    canvas.width = fW * frameCount;
    canvas.height = fH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const ox = f * fW;
      const cy = fH / 2;

      ctx.save();
      ctx.translate(ox, 0);

      if (f < 4) {
        // Cometa ígneo aerodinâmico apontando diretamente para +X
        const flicker = (f % 2 === 0 ? 1 : -1) * 1.5;

        // Brilho térmico ao redor
        ctx.shadowColor = 'rgba(239, 68, 68, 0.85)';
        ctx.shadowBlur = 6;

        // Camada externa: língua de fogo rubro/carmesim
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(35, cy);
        ctx.quadraticCurveTo(22, cy - 8 + flicker, 6, cy - 4);
        ctx.lineTo(2, cy);
        ctx.lineTo(6, cy + 4);
        ctx.quadraticCurveTo(22, cy + 8 - flicker, 35, cy);
        ctx.closePath();
        ctx.fill();

        // Camada média: chama laranja vibrante
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(34, cy);
        ctx.quadraticCurveTo(22, cy - 5 + flicker * 0.6, 10, cy - 2);
        ctx.lineTo(6, cy);
        ctx.lineTo(10, cy + 2);
        ctx.quadraticCurveTo(22, cy + 5 - flicker * 0.6, 34, cy);
        ctx.closePath();
        ctx.fill();

        // Núcleo interno: âmbar dourado e ponta incandescente branca
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(33, cy);
        ctx.quadraticCurveTo(24, cy - 3, 16, cy);
        ctx.quadraticCurveTo(24, cy + 3, 33, cy);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(31, cy, 4, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Faíscas e brasas voando para trás (-X)
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(4, cy - 3 * flicker, 1.8, 1.8);
        ctx.fillRect(8, cy + 4 * flicker, 1.6, 1.6);
      } else {
        // Quadros 4 e 5: Golpe de Garra Ígnea em arco (anim-attack-fire-slash)
        const slashStep = f - 4;
        ctx.shadowColor = 'rgba(249, 115, 22, 0.9)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(14, cy, 14 + slashStep * 2, -0.9, 0.9, false);
        ctx.stroke();

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(15, cy, 14 + slashStep * 2, -0.75, 0.75, false);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(16, cy, 14 + slashStep * 2, -0.5, 0.5, false);
        ctx.stroke();
      }

      ctx.restore();
    }

    const sheetKey = 'sheet-attack-fire';
    this.registerCanvasSheet(scene, sheetKey, canvas, fW, fH, frameCount);

    if (!scene.anims.exists('anim-attack-fire')) {
      scene.anims.create({
        key: 'anim-attack-fire',
        frames: scene.anims.generateFrameNumbers(sheetKey, { frames: [0, 1, 2, 3] }),
        frameRate: 16,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('anim-attack-fire-slash')) {
      scene.anims.create({
        key: 'anim-attack-fire-slash',
        frames: scene.anims.generateFrameNumbers(sheetKey, { frames: [0, 1, 4, 5] }),
        frameRate: 18,
        repeat: 0,
      });
    }
  }

  // ===================== 3. PLANTA BÁSICO (ORIENTADO PARA +X) =====================

  private static registerGrassBasic(scene: Phaser.Scene): void {
    const fW = 36;
    const fH = 18;
    const frameCount = 4;
    const canvas = document.createElement('canvas');
    canvas.width = fW * frameCount;
    canvas.height = fH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const ox = f * fW;
      const cy = fH / 2;

      ctx.save();
      ctx.translate(ox, 0);

      // Leve ondulação aerodinâmica da lâmina
      const wobble = Math.sin((f / frameCount) * Math.PI * 2) * 1.2;

      // Aura esmeralda
      ctx.shadowColor = 'rgba(74, 222, 128, 0.8)';
      ctx.shadowBlur = 5;

      // Contorno exterior verde floresta escuro
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.moveTo(33, cy);
      ctx.quadraticCurveTo(18, cy - 7 + wobble, 4, cy);
      ctx.quadraticCurveTo(18, cy + 7 + wobble, 33, cy);
      ctx.closePath();
      ctx.fill();

      // Corpo da Folha Navalha em verde esmeralda / lima vibrante
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(32, cy);
      ctx.quadraticCurveTo(18, cy - 5 + wobble, 6, cy);
      ctx.quadraticCurveTo(18, cy + 5 + wobble, 32, cy);
      ctx.closePath();
      ctx.fill();

      // Espinha central de corte afiada (marfim/lima brilhante)
      ctx.strokeStyle = '#f7fee7';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(6, cy);
      ctx.lineTo(33, cy);
      ctx.stroke();

      // Nervuras aerodinâmicas inclinadas
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(14, cy);
      ctx.lineTo(19, cy - 3.5);
      ctx.moveTo(22, cy);
      ctx.lineTo(27, cy - 3.5);
      ctx.moveTo(14, cy);
      ctx.lineTo(19, cy + 3.5);
      ctx.moveTo(22, cy);
      ctx.lineTo(27, cy + 3.5);
      ctx.stroke();

      // Arco de corte de ar translúcido na frente
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(247, 254, 231, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(28, cy, 7, -0.6, 0.6);
      ctx.stroke();

      ctx.restore();
    }

    const sheetKey = 'sheet-attack-grass';
    this.registerCanvasSheet(scene, sheetKey, canvas, fW, fH, frameCount);

    if (!scene.anims.exists('anim-attack-grass')) {
      scene.anims.create({
        key: 'anim-attack-grass',
        frames: scene.anims.generateFrameNumbers(sheetKey, { start: 0, end: frameCount - 1 }),
        frameRate: 15,
        repeat: -1,
      });
    }
  }

  // ===================== 4. ÁGUA BÁSICO (ORIENTADO PARA +X) =====================

  private static registerWaterBasic(scene: Phaser.Scene): void {
    const fW = 36;
    const fH = 20;
    const frameCount = 4;
    const canvas = document.createElement('canvas');
    canvas.width = fW * frameCount;
    canvas.height = fH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const ox = f * fW;
      const cy = fH / 2;
      const ripple = (f % 2 === 0 ? 1 : -1) * 1.2;

      ctx.save();
      ctx.translate(ox, 0);

      // Brilho azul aquático
      ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
      ctx.shadowBlur = 6;

      // Contorno oceânico profundo
      ctx.fillStyle = '#0369a1';
      ctx.beginPath();
      ctx.moveTo(33, cy);
      ctx.quadraticCurveTo(20, cy - 8 + ripple, 5, cy);
      ctx.quadraticCurveTo(20, cy + 8 - ripple, 33, cy);
      ctx.closePath();
      ctx.fill();

      // Corpo da cápsula hidráulica azul celeste / ciano
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(32, cy);
      ctx.quadraticCurveTo(20, cy - 5.5 + ripple, 8, cy);
      ctx.quadraticCurveTo(20, cy + 5.5 - ripple, 32, cy);
      ctx.closePath();
      ctx.fill();

      // Crista superior de espuma branca / gota cristalina
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(14, cy - 3.5 + ripple);
      ctx.quadraticCurveTo(24, cy - 4.5, 31, cy);
      ctx.stroke();

      // Gotas de spray trailing em -X
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(4, cy - 2 * ripple, 1.8, 0, Math.PI * 2);
      ctx.arc(7, cy + 3 * ripple, 1.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    const sheetKey = 'sheet-attack-water';
    this.registerCanvasSheet(scene, sheetKey, canvas, fW, fH, frameCount);

    if (!scene.anims.exists('anim-attack-water')) {
      scene.anims.create({
        key: 'anim-attack-water',
        frames: scene.anims.generateFrameNumbers(sheetKey, { start: 0, end: frameCount - 1 }),
        frameRate: 16,
        repeat: -1,
      });
    }

    // Splash de impacto d'água nítido 34x34
    const hitW = 34;
    const hitH = 34;
    const hitCount = 4;
    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = hitW * hitCount;
    hitCanvas.height = hitH;
    const hitCtx = hitCanvas.getContext('2d')!;
    hitCtx.imageSmoothingEnabled = false;

    for (let f = 0; f < hitCount; f++) {
      const hx = f * hitW + hitW / 2;
      const hy = hitH / 2;
      const progress = f / (hitCount - 1);
      const rad = 4 + progress * 11;
      const alpha = Math.max(0.1, 1 - progress * 0.85);

      hitCtx.save();
      hitCtx.shadowColor = 'rgba(56, 189, 248, 0.9)';
      hitCtx.shadowBlur = 7;

      // Anel de ondulação expansiva
      hitCtx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      hitCtx.lineWidth = 2.4;
      hitCtx.beginPath();
      hitCtx.arc(hx, hy, rad, 0, Math.PI * 2);
      hitCtx.stroke();

      // Gotículas de splash radiais
      hitCtx.fillStyle = `rgba(224, 242, 254, ${alpha})`;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + progress * 0.4;
        const dist = rad * 1.15;
        hitCtx.beginPath();
        hitCtx.arc(hx + Math.cos(a) * dist, hy + Math.sin(a) * dist, 1.8 * (1 - progress * 0.5), 0, Math.PI * 2);
        hitCtx.fill();
      }

      hitCtx.restore();
    }

    const hitSheetKey = 'sheet-attack-water-hit';
    this.registerCanvasSheet(scene, hitSheetKey, hitCanvas, hitW, hitH, hitCount);

    if (!scene.anims.exists('anim-attack-water-hit')) {
      scene.anims.create({
        key: 'anim-attack-water-hit',
        frames: scene.anims.generateFrameNumbers(hitSheetKey, { start: 0, end: hitCount - 1 }),
        frameRate: 20,
        repeat: 0,
      });
    }
  }

  // ===================== 5. ESPECIAIS (ULTIMATES VISUALMENTE ESPETACULARES) =====================

  /**
   * ULT Elétrica (Pikachu): Escudo Voltaico Esférico Proporcional (64x64)
   * 8 quadros com esferas de plasma, anel eletrostático e 4 arcos de raio em rotação 360°.
   */
  private static registerElectricSpecial(scene: Phaser.Scene): void {
    const fW = 64;
    const fH = 64;
    const frameCount = 8;
    const canvas = document.createElement('canvas');
    canvas.width = fW * frameCount;
    canvas.height = fH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const cx = f * fW + fW / 2;
      const cy = fH / 2;
      const rot = (f * Math.PI) / 4;

      ctx.save();
      ctx.translate(cx, cy);

      // Brilho intenso elétrico
      ctx.shadowColor = 'rgba(250, 204, 21, 0.95)';
      ctx.shadowBlur = 10;

      // Bolha de plasma interna translúcida
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 24);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      grad.addColorStop(0.5, 'rgba(254, 240, 138, 0.35)');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0.15)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();

      // Anel eletrostático externo
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();

      // 4 Arcos de raio ziguezagueantes girando ao redor da esfera
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2;
        const p1x = Math.cos(a) * 23;
        const p1y = Math.sin(a) * 23;
        const midA = a + 0.38;
        const pMidX = Math.cos(midA) * 27;
        const pMidY = Math.sin(midA) * 27;
        const p2x = Math.cos(a + 0.75) * 23;
        const p2y = Math.sin(a + 0.75) * 23;

        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(pMidX, pMidY);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();
      }

      // Nódulos de energia brilhantes nos 4 polos
      ctx.fillStyle = '#67e8f9';
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 24, Math.sin(a) * 24, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    const sheetKey = 'sheet-especial-eletrico';
    this.registerCanvasSheet(scene, sheetKey, canvas, fW, fH, frameCount);

    if (!scene.anims.exists('anim-especial-eletrico')) {
      scene.anims.create({
        key: 'anim-especial-eletrico',
        frames: scene.anims.generateFrameNumbers(sheetKey, { start: 0, end: frameCount - 1 }),
        frameRate: 16,
        repeat: -1,
      });
    }
  }

  /**
   * ULT Fogo (Charmander/Charizard): Cone Lança-Chamas Devastador Proporcional (76x44)
   * Ancorado na boca do Pokémon (origem 0.08, 0.5) com cone expansivo de chamas em camadas.
   */
  private static registerFireSpecial(scene: Phaser.Scene): void {
    const fW = 76;
    const fH = 44;
    const frameCount = 7;
    const canvas = document.createElement('canvas');
    canvas.width = fW * frameCount;
    canvas.height = fH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const ox = f * fW;
      const cy = fH / 2;

      ctx.save();
      ctx.translate(ox, 0);

      const fPhase = (f / frameCount) * Math.PI * 2;
      const wave1 = Math.sin(fPhase) * 3;
      const wave2 = Math.cos(fPhase) * 3;

      ctx.shadowColor = 'rgba(239, 68, 68, 0.9)';
      ctx.shadowBlur = 10;

      // 1. Camada externa: cone expansivo carmesim / rubro
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(6, cy - 4);
      ctx.quadraticCurveTo(35, cy - 18 + wave1, 72, cy - 20 + wave2);
      ctx.lineTo(70, cy + 20 - wave2);
      ctx.quadraticCurveTo(35, cy + 18 - wave1, 6, cy + 4);
      ctx.closePath();
      ctx.fill();

      // 2. Camada média: chamas alaranjadas vibrantes
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(7, cy - 3);
      ctx.quadraticCurveTo(34, cy - 13 + wave1 * 0.7, 68, cy - 14 + wave2 * 0.7);
      ctx.lineTo(67, cy + 14 - wave2 * 0.7);
      ctx.quadraticCurveTo(34, cy + 13 - wave1 * 0.7, 7, cy + 3);
      ctx.closePath();
      ctx.fill();

      // 3. Camada do núcleo: jato dourado/âmbar incandescente
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(8, cy - 2);
      ctx.quadraticCurveTo(32, cy - 7 + wave1 * 0.4, 60, cy - 7);
      ctx.lineTo(60, cy + 7);
      ctx.quadraticCurveTo(32, cy + 7 - wave1 * 0.4, 8, cy + 2);
      ctx.closePath();
      ctx.fill();

      // 4. Bocal pontiagudo de saída branca incandescente na boca (+X)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(6, cy - 2);
      ctx.lineTo(24, cy - 2);
      ctx.lineTo(28, cy);
      ctx.lineTo(24, cy + 2);
      ctx.lineTo(6, cy + 2);
      ctx.closePath();
      ctx.fill();

      // 5. Brasas e fagulhas ejetadas para a frente
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fef08a';
      const sparkOffsets = [
        { x: 45, y: cy - 12 + wave2 },
        { x: 58, y: cy + 11 - wave1 },
        { x: 68, y: cy + wave1 * 0.5 },
      ];
      for (const sp of sparkOffsets) {
        ctx.fillRect(sp.x, sp.y, 2.2, 2.2);
      }

      ctx.restore();
    }

    const sheetKey = 'sheet-especial-fogo';
    this.registerCanvasSheet(scene, sheetKey, canvas, fW, fH, frameCount);

    if (!scene.anims.exists('anim-especial-fogo')) {
      scene.anims.create({
        key: 'anim-especial-fogo',
        frames: scene.anims.generateFrameNumbers(sheetKey, { start: 0, end: frameCount - 1 }),
        frameRate: 15,
        repeat: -1,
      });
    }
  }

  /**
   * ULT Água (Squirtle/Blastoise): Hidro Vórtice Turbilhão Proporcional (64x64)
   * 7 quadros com 3 braços espirais de corrente oceânica, olho do turbilhão e cristas brancas de espuma.
   */
  private static registerWaterSpecial(scene: Phaser.Scene): void {
    const fW = 64;
    const fH = 64;
    const frameCount = 7;
    const canvas = document.createElement('canvas');
    canvas.width = fW * frameCount;
    canvas.height = fH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const cx = f * fW + fW / 2;
      const cy = fH / 2;
      const rot = (f * Math.PI * 2) / frameCount;

      ctx.save();
      ctx.translate(cx, cy);

      ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
      ctx.shadowBlur = 9;

      // Olho central do vórtice (azul marinho profundo translúcido)
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      grad.addColorStop(0, 'rgba(8, 47, 73, 0.6)');
      grad.addColorStop(0.6, 'rgba(2, 132, 199, 0.35)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();

      // 3 Braços espirais de correnteza girando em torno do centro
      for (let i = 0; i < 3; i++) {
        const armA = rot + (i * Math.PI * 2) / 3;

        // Braço azul celeste
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        for (let step = 0; step < 18; step++) {
          const t = step / 17;
          const r = 5 + t * 20;
          const a = armA + t * 2.2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (step === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Linha de crista de espuma branca/ciano na borda externa do braço
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (let step = 6; step < 18; step++) {
          const t = step / 17;
          const r = 6 + t * 20;
          const a = armA + t * 2.2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (step === 6) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Gotículas de spray em rotação periférica
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const a = rot * 1.5 + (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 25, Math.sin(a) * 25, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    const sheetKey = 'sheet-especial-agua';
    this.registerCanvasSheet(scene, sheetKey, canvas, fW, fH, frameCount);

    if (!scene.anims.exists('anim-especial-agua')) {
      scene.anims.create({
        key: 'anim-especial-agua',
        frames: scene.anims.generateFrameNumbers(sheetKey, { start: 0, end: frameCount - 1 }),
        frameRate: 14,
        repeat: -1,
      });
    }
  }

  // ===================== 6. ATAQUES PROCEDURAIS FEÉRICOS (+X) =====================

  private static registerProceduralFairyAndVineAttacks(scene: Phaser.Scene): void {
    const fCount = 4;
    const fW = 36;
    const fH = 20;
    const fairyCanvas = document.createElement('canvas');
    fairyCanvas.width = fW * fCount;
    fairyCanvas.height = fH;
    const fCtx = fairyCanvas.getContext('2d')!;
    fCtx.imageSmoothingEnabled = false;

    for (let f = 0; f < fCount; f++) {
      const ox = f * fW;
      const cy = fH / 2;
      const wobble = (f % 2 === 0 ? 1 : -1) * 1.2;

      fCtx.save();
      fCtx.translate(ox, 0);

      fCtx.shadowColor = 'rgba(244, 114, 182, 0.85)';
      fCtx.shadowBlur = 6;

      // Fita musical rosada / lilás apontando para +X
      fCtx.fillStyle = '#f472b6';
      fCtx.beginPath();
      fCtx.moveTo(32, cy);
      fCtx.quadraticCurveTo(20, cy - 6 + wobble, 6, cy);
      fCtx.quadraticCurveTo(20, cy + 6 - wobble, 32, cy);
      fCtx.closePath();
      fCtx.fill();

      // Núcleo branco / marfim suave
      fCtx.fillStyle = '#fff1f2';
      fCtx.beginPath();
      fCtx.moveTo(31, cy);
      fCtx.quadraticCurveTo(21, cy - 3.5, 12, cy);
      fCtx.quadraticCurveTo(21, cy + 3.5, 31, cy);
      fCtx.closePath();
      fCtx.fill();

      // Estrela reluzente de 4 pontas na ponta frontal (+X)
      this.drawStar(fCtx, 31, cy, 5.5, 2.2, '#fef08a');

      // Gotas de poeira estelar
      fCtx.shadowBlur = 0;
      fCtx.fillStyle = '#fbcfe8';
      fCtx.fillRect(4, cy - 2 * wobble, 1.8, 1.8);
      fCtx.fillRect(8, cy + 3 * wobble, 1.6, 1.6);

      fCtx.restore();
    }

    const fairySheet = 'sheet-attack-fairy';
    this.registerCanvasSheet(scene, fairySheet, fairyCanvas, fW, fH, fCount);

    if (!scene.anims.exists('anim-attack-fairy')) {
      scene.anims.create({
        key: 'anim-attack-fairy',
        frames: scene.anims.generateFrameNumbers(fairySheet, { start: 0, end: fCount - 1 }),
        frameRate: 15,
        repeat: -1,
      });
    }
  }


  // ===================== 7. ÍCONES PROFISSIONAIS DE ATAQUES E HABILIDADES =====================

  private static registerAllMoveAndAbilityIcons(scene: Phaser.Scene): void {
    const elements: ElementType[] = [
      'eletrico',
      'fogo',
      'planta',
      'agua',
      'fada',
    ];

    for (const el of elements) {
      this.createMoveBadgeTexture(
        scene,
        this.getMoveIconKey(el, 'basic'),
        el,
        'basic'
      );
      this.createMoveBadgeTexture(
        scene,
        this.getMoveIconKey(el, 'ult'),
        el,
        'ult'
      );
      this.createMoveBadgeTexture(
        scene,
        this.getMoveIconKey(el, 'innate'),
        el,
        'innate'
      );
    }

    for (const id of Object.keys(ABILITIES) as AbilityId[]) {
      this.createAbilityBadgeTexture(scene, id);
    }
  }

  private static getElementPalette(el: ElementType): {
    bgTop: string;
    bgBot: string;
    rim: string;
    glow: string;
  } {
    switch (el) {
      case 'eletrico':
        return {
          bgTop: '#422006',
          bgBot: '#1c1917',
          rim: '#facc15',
          glow: '#fef08a',
        };
      case 'fogo':
        return {
          bgTop: '#450a0a',
          bgBot: '#1c100d',
          rim: '#fb923c',
          glow: '#fde047',
        };
      case 'planta':
        return {
          bgTop: '#052e16',
          bgBot: '#091912',
          rim: '#4ade80',
          glow: '#bbf7d0',
        };
      case 'agua':
        return {
          bgTop: '#082f49',
          bgBot: '#061526',
          rim: '#38bdf8',
          glow: '#bae6fd',
        };
      case 'fada':
        return {
          bgTop: '#500724',
          bgBot: '#1f0818',
          rim: '#f472b6',
          glow: '#fbcfe8',
        };
    }
  }

  private static drawBadgeFrame(
    ctx: CanvasRenderingContext2D,
    size: number,
    bgTop: string,
    bgBot: string,
    rimColor: string
  ): void {
    const r = 10;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, bgTop);
    grad.addColorStop(1, bgBot);

    ctx.beginPath();
    ctx.roundRect(2, 2, size - 4, size - 4, r);
    ctx.fillStyle = grad;
    ctx.fill();

    // Brilho vítreo superior
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(0, 0, size, size * 0.44);
    ctx.restore();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rimColor;
    ctx.beginPath();
    ctx.roundRect(2, 2, size - 4, size - 4, r);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(5, 5, size - 10, size - 10, r - 2);
    ctx.stroke();
  }

  private static createMoveBadgeTexture(
    scene: Phaser.Scene,
    texKey: string,
    element: ElementType,
    slot: 'basic' | 'ult' | 'innate'
  ): void {
    if (scene.textures.exists(texKey)) return;
    const size = 56;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const pal = this.getElementPalette(element);
    this.drawBadgeFrame(
      ctx,
      size,
      pal.bgTop,
      pal.bgBot,
      slot === 'ult' ? '#ffcb05' : pal.rim
    );

    // Aura radial central
    const rad = ctx.createRadialGradient(28, 28, 3, 28, 28, 22);
    rad.addColorStop(0, pal.glow + '66');
    rad.addColorStop(1, pal.glow + '00');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(28, 28, 22, 0, Math.PI * 2);
    ctx.fill();

    // Tenta compor com o próprio sprite corrigido quando disponível para Basic/ULT!
    let drewSprite = false;
    if (slot === 'basic') {
      const mapSheet: Partial<Record<ElementType, { key: string; frame: number }>> = {
        eletrico: { key: 'sheet-attack-eletric', frame: 2 },
        fogo: { key: 'sheet-attack-fire', frame: 3 },
        planta: { key: 'sheet-attack-grass', frame: 5 },
        agua: { key: 'sheet-attack-water', frame: 1 },
        fada: { key: 'sheet-attack-fairy', frame: 1 },
      };
      const entry = mapSheet[element];
      if (entry && scene.textures.exists(entry.key)) {
        const sheetCanvas = scene.textures
          .get(entry.key)
          .getSourceImage() as HTMLCanvasElement;
        const frameObj = scene.textures.get(entry.key).get(entry.frame);
        if (sheetCanvas && frameObj) {
          ctx.save();
          ctx.translate(28, 28);
          ctx.rotate(-0.32); // inclinado levemente para cima-direita (+X) com dinamismo!
          ctx.drawImage(
            sheetCanvas,
            frameObj.cutX,
            frameObj.cutY,
            frameObj.cutWidth,
            frameObj.cutHeight,
            -21,
            -21,
            42,
            42
          );
          ctx.restore();
          drewSprite = true;
        }
      }
    } else if (slot === 'ult') {
      const ultSheet: Partial<Record<ElementType, { key: string; frame: number }>> = {
        eletrico: { key: 'sheet-especial-eletrico', frame: 5 },
        fogo: { key: 'sheet-especial-fogo', frame: 5 },
        agua: { key: 'sheet-especial-agua', frame: 4 },
      };
      const entry = ultSheet[element];
      if (entry && scene.textures.exists(entry.key)) {
        const sheetCanvas = scene.textures
          .get(entry.key)
          .getSourceImage() as HTMLCanvasElement;
        const frameObj = scene.textures.get(entry.key).get(entry.frame);
        if (sheetCanvas && frameObj) {
          ctx.save();
          ctx.translate(28, 28);
          if (element === 'fogo') ctx.rotate(-0.35);
          ctx.drawImage(
            sheetCanvas,
            frameObj.cutX,
            frameObj.cutY,
            frameObj.cutWidth,
            frameObj.cutHeight,
            -22,
            -22,
            44,
            44
          );
          ctx.restore();
          drewSprite = true;
        }
      }
    }

    if (!drewSprite) {
      this.drawElementEmblem(ctx, element, slot);
    }

    scene.textures.addCanvas(texKey, canvas);
  }

  private static createAbilityBadgeTexture(
    scene: Phaser.Scene,
    id: AbilityId
  ): void {
    const texKey = this.getAbilityIconKey(id);
    if (scene.textures.exists(texKey)) return;

    const def = ABILITIES[id];
    const size = 56;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    if (def.allowedElements && def.allowedElements.length > 0) {
      const pal = this.getElementPalette(def.allowedElements[0]);
      this.drawBadgeFrame(ctx, size, pal.bgTop, pal.bgBot, pal.rim);
    } else if (def.kind === 'active') {
      this.drawBadgeFrame(ctx, size, '#3b1d06', '#160d06', '#fbbf24');
    } else {
      this.drawBadgeFrame(ctx, size, '#0c243c', '#071220', '#38bdf8');
    }

    this.drawCustomAbilityArtwork(ctx, id);
    scene.textures.addCanvas(texKey, canvas);
  }

  private static drawElementEmblem(
    ctx: CanvasRenderingContext2D,
    el: ElementType,
    slot: 'basic' | 'ult' | 'innate'
  ): void {
    ctx.save();
    ctx.translate(28, 28);
    if (el === 'planta' && slot === 'ult') {
      // Feixe Solar Dourado/Esmeralda direcionado para cima-direita
      ctx.rotate(-0.45);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(-20, -6, 38, 12);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-20, -3, 40, 6);
      this.drawStar(ctx, 14, 0, 10, 4, '#ffffff');
    } else if (el === 'fada' && slot === 'ult') {
      // Mandala Estelar Harmônica
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
      this.drawStar(ctx, 0, 0, 13, 6, '#fbcfe8');
    } else if (el === 'eletrico') {
      this.drawLightningVector(ctx, '#facc15', '#ffffff');
    } else if (el === 'fogo') {
      this.drawFlameVector(ctx, '#fb923c', '#fef08a');
    } else if (el === 'planta') {
      this.drawLeafVector(ctx, '#4ade80', '#dcfce7');
    } else if (el === 'agua') {
      this.drawDropletVector(ctx, '#38bdf8', '#e0f2fe');
    } else {
      this.drawStar(ctx, 0, 0, 15, 7, '#f9a8d4');
    }
    ctx.restore();
  }

  private static drawCustomAbilityArtwork(
    ctx: CanvasRenderingContext2D,
    id: AbilityId
  ): void {
    ctx.save();
    ctx.translate(28, 28);

    switch (id) {
      case 'multishot': {
        // 3 setas energéticas em leque apontando para +X / cima-direita
        [-0.42, 0, 0.42].forEach((ang) => {
          ctx.save();
          ctx.rotate(ang - 0.35);
          this.drawArrowBolt(ctx, '#fbbf24', '#ffffff');
          ctx.restore();
        });
        break;
      }
      case 'pierce': {
        ctx.rotate(-0.45);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(4, 0, 10, -1.1, 1.1);
        ctx.stroke();
        this.drawArrowBolt(ctx, '#fde047', '#ffffff');
        break;
      }
      case 'echo': {
        ctx.rotate(-0.35);
        ctx.globalAlpha = 0.45;
        ctx.translate(-6, 4);
        this.drawArrowBolt(ctx, '#60a5fa', '#bae6fd');
        ctx.globalAlpha = 1;
        ctx.translate(9, -6);
        this.drawArrowBolt(ctx, '#fbbf24', '#ffffff');
        break;
      }
      case 'elec_volt_orb': {
        const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, 15);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.5, '#fde047');
        g.addColorStop(1, '#ca8a04');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-18, -4);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-17, 6);
        ctx.stroke();
        break;
      }
      case 'elec_discharge': {
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 3;
        [-0.8, 0, 0.8].forEach((a) => {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10 - 3);
          ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
          ctx.stroke();
        });
        this.drawStar(ctx, 0, 0, 7, 3, '#ffffff');
        break;
      }
      case 'elec_thunder_wave': {
        [8, 14, 19].forEach((r, i) => {
          ctx.strokeStyle = i === 0 ? '#ffffff' : '#facc15';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        });
        break;
      }
      case 'elec_lightning_rod':
      case 'elec_surge_surfer': {
        this.drawLightningVector(ctx, '#facc15', '#ffffff');
        if (id === 'elec_surge_surfer') {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 12, 13, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        break;
      }
      case 'fire_flame_charge':
      case 'fire_solar_power': {
        this.drawFlameVector(ctx, '#f97316', '#fef08a');
        if (id === 'fire_solar_power') {
          this.drawStar(ctx, 0, -2, 11, 5, '#ffffff');
        }
        break;
      }
      case 'fire_spin': {
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0.2, Math.PI * 1.75);
        ctx.stroke();
        this.drawStar(ctx, 13, -4, 6, 3, '#fef08a');
        break;
      }
      case 'fire_blast': {
        // Kanji Daimonji / Estrela de 5 pontas de Fire Blast!
        this.drawStar(ctx, 0, 0, 17, 7, '#f97316');
        this.drawStar(ctx, 0, 0, 10, 4, '#fef08a');
        break;
      }
      case 'fire_tough_claws': {
        ctx.rotate(-0.45);
        [-7, 0, 7].forEach((offY) => {
          ctx.fillStyle = '#fb923c';
          ctx.beginPath();
          ctx.moveTo(-14, offY - 2);
          ctx.quadraticCurveTo(2, offY - 4, 16, offY);
          ctx.quadraticCurveTo(2, offY + 2, -14, offY + 2);
          ctx.fill();
        });
        break;
      }
      case 'grass_vine_whip': {
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-15, 12);
        ctx.bezierCurveTo(-8, -14, 6, 12, 16, -12);
        ctx.stroke();
        this.drawLeafVector(ctx, '#86efac', '#ffffff', 0.55, 13, -12);
        break;
      }
      case 'grass_leech_seed': {
        this.drawLeafVector(ctx, '#4ade80', '#dcfce7', 0.85, 0, 2);
        this.drawStar(ctx, 10, -10, 6, 2.5, '#f472b6');
        break;
      }
      case 'grass_poison_powder':
      case 'grass_effect_spore': {
        [
          { x: -7, y: 4, r: 8, c: '#a855f7' },
          { x: 7, y: 5, r: 7, c: '#4ade80' },
          { x: 0, y: -6, r: 9, c: '#c084fc' },
        ].forEach((b) => {
          ctx.fillStyle = b.c;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      }
      case 'grass_chlorophyll': {
        this.drawStar(ctx, 0, -5, 11, 5, '#facc15');
        this.drawLeafVector(ctx, '#4ade80', '#dcfce7', 0.7, 0, 8);
        break;
      }
      case 'water_aqua_ring': {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(14, 0, 4.5, 0, Math.PI * 2);
        ctx.arc(-14, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'water_icy_wind': {
        this.drawStar(ctx, 0, 0, 16, 5, '#bae6fd');
        this.drawStar(ctx, 0, 0, 9, 4, '#ffffff');
        break;
      }
      case 'water_hydro_cannon':
      case 'water_mega_launcher': {
        ctx.rotate(-0.4);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(-16, -7, 26, 14);
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath();
        ctx.arc(12, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'water_rain_dish': {
        this.drawDropletVector(ctx, '#38bdf8', '#ffffff');
        break;
      }
      case 'fairy_moonblast': {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(2, 0, 14, -1.3, 1.3, false);
        ctx.arc(-6, 0, 12, 1.1, -1.1, true);
        ctx.closePath();
        ctx.fill();
        this.drawStar(ctx, 11, -8, 6, 2.5, '#f9a8d4');
        break;
      }
      case 'fairy_hyper_voice': {
        [-4, 4, 11].forEach((x, idx) => {
          ctx.strokeStyle = idx === 2 ? '#fbcfe8' : '#f472b6';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x - 8, 0, 7 + idx * 5, -0.8, 0.8);
          ctx.stroke();
        });
        break;
      }
      case 'fairy_wish_barrier':
      case 'fairy_pixilate':
      case 'fairy_friend_guard': {
        this.drawStar(ctx, 0, 0, 15, 6.5, '#f472b6');
        this.drawStar(ctx, 0, 0, 8, 3.5, '#ffffff');
        break;
      }
      case 'power':
      case 'execute': {
        ctx.rotate(-0.55);
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(-14, -3);
        ctx.lineTo(12, -3);
        ctx.lineTo(18, 0);
        ctx.lineTo(12, 3);
        ctx.lineTo(-14, 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = id === 'execute' ? '#ef4444' : '#f59e0b';
        ctx.fillRect(-10, -8, 4, 16);
        break;
      }
      case 'agility':
      case 'quick_charge': {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        [-6, 0, 6].forEach((y, i) => {
          ctx.beginPath();
          ctx.moveTo(-15 + i * 3, y);
          ctx.lineTo(13, y);
          ctx.stroke();
        });
        this.drawArrowBolt(ctx, '#bae6fd', '#ffffff');
        break;
      }
      case 'vigor':
      case 'lifesteal': {
        ctx.fillStyle = id === 'vigor' ? '#ef4444' : '#ec4899';
        ctx.beginPath();
        ctx.moveTo(0, 13);
        ctx.bezierCurveTo(-18, 2, -16, -13, -6, -13);
        ctx.bezierCurveTo(0, -13, 0, -6, 0, -6);
        ctx.bezierCurveTo(0, -6, 0, -13, 6, -13);
        ctx.bezierCurveTo(16, -13, 18, 2, 0, 13);
        ctx.fill();
        ctx.strokeStyle = '#fecdd3';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'haste': {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 1, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 1);
        ctx.lineTo(0, -7);
        ctx.moveTo(0, 1);
        ctx.lineTo(7, 3);
        ctx.stroke();
        break;
      }
      case 'crit': {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-17, 0);
        ctx.lineTo(17, 0);
        ctx.moveTo(0, -17);
        ctx.lineTo(0, 17);
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'energy': {
        this.drawStar(ctx, 0, 0, 15, 6, '#c084fc');
        this.drawStar(ctx, 0, 0, 8, 3, '#ffffff');
        break;
      }
      case 'magnet': {
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -2, 11, Math.PI, 0, true);
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-13.5, -9, 5, 7);
        ctx.fillRect(8.5, -9, 5, 7);
        break;
      }
      case 'shield_regen': {
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(13, -9);
        ctx.lineTo(11, 5);
        ctx.quadraticCurveTo(0, 15, 0, 16);
        ctx.quadraticCurveTo(0, 15, -11, 5);
        ctx.lineTo(-13, -9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'bounty': {
        const g = ctx.createRadialGradient(-3, -4, 2, 0, 0, 14);
        g.addColorStop(0, '#fffbeb');
        g.addColorStop(0.5, '#facc15');
        g.addColorStop(1, '#b45309');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        this.drawStar(ctx, 0, 0, 7, 3, '#ffffff');
        break;
      }
    }

    ctx.restore();
  }

  private static drawArrowBolt(
    ctx: CanvasRenderingContext2D,
    color: string,
    coreColor: string
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(2, -7);
    ctx.lineTo(5, -2.5);
    ctx.lineTo(-15, -2.5);
    ctx.lineTo(-15, 2.5);
    ctx.lineTo(5, 2.5);
    ctx.lineTo(2, 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(4, -3);
    ctx.lineTo(-10, 0);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();
  }

  private static drawLightningVector(
    ctx: CanvasRenderingContext2D,
    fill: string,
    stroke: string
  ): void {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, -17);
    ctx.lineTo(-10, 2);
    ctx.lineTo(-1, 2);
    ctx.lineTo(-5, 17);
    ctx.lineTo(11, -3);
    ctx.lineTo(2, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private static drawFlameVector(
    ctx: CanvasRenderingContext2D,
    outer: string,
    inner: string
  ): void {
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.quadraticCurveTo(15, -3, 11, 10);
    ctx.quadraticCurveTo(6, 17, 0, 17);
    ctx.quadraticCurveTo(-12, 16, -12, 6);
    ctx.quadraticCurveTo(-13, -4, 0, -17);
    ctx.fill();

    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(7, 2, 5, 11);
    ctx.quadraticCurveTo(0, 15, -5, 11);
    ctx.quadraticCurveTo(-6, 3, 0, -7);
    ctx.fill();
  }

  private static drawLeafVector(
    ctx: CanvasRenderingContext2D,
    fill: string,
    vein: string,
    scale = 1,
    ox = 0,
    oy = 0
  ): void {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.rotate(-0.5);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.quadraticCurveTo(0, -14, 17, 0);
    ctx.quadraticCurveTo(0, 14, -16, 0);
    ctx.fill();
    ctx.strokeStyle = vein;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
    ctx.restore();
  }

  private static drawDropletVector(
    ctx: CanvasRenderingContext2D,
    fill: string,
    shine: string
  ): void {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.bezierCurveTo(13, -1, 13, 15, 0, 16);
    ctx.bezierCurveTo(-13, 15, -13, -1, 0, -16);
    ctx.fill();
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.ellipse(-4, 4, 2.5, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}
