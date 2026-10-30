import Phaser from 'phaser';
import { ABILITIES, AbilityId } from '../config/abilities';
import { ElementType } from '../config/pokemonManifest';

interface BoundingCluster {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

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

  // ===================== UTILITÁRIOS DE EXTRAÇÃO & CHROMA-KEY =====================

  private static loadChromaKeyedCanvas(
    scene: Phaser.Scene,
    rawKey: string,
    bgDarkMax: number,
    clearRects: Array<{ x: number; y: number; w: number; h: number }> = []
  ): HTMLCanvasElement | null {
    if (!scene.textures.exists(rawKey)) return null;
    const img = scene.textures.get(rawKey).getSourceImage() as HTMLImageElement;
    const w = img.width;
    const h = img.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);

    if (clearRects.length > 0) {
      ctx.fillStyle = '#000000';
      for (const r of clearRects) {
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const brightness = Math.max(r, g, b);
      if (brightness <= bgDarkMax) {
        d[i + 3] = 0;
      } else if (brightness <= bgDarkMax + 24) {
        const alpha = (brightness - bgDarkMax) / 24;
        d[i + 3] = Math.round(d[i + 3] * alpha);
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  private static getBoundsInRegion(
    canvas: HTMLCanvasElement,
    x0: number,
    x1: number
  ): BoundingCluster {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const startX = Math.max(0, Math.floor(x0));
    const endX = Math.min(canvas.width - 1, Math.ceil(x1));
    const w = Math.max(1, endX - startX + 1);
    const h = canvas.height;
    const data = ctx.getImageData(startX, 0, w, h).data;

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    let found = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 30) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!found) {
      return { minX: startX, maxX: endX, minY: 0, maxY: h - 1 };
    }

    return {
      minX: startX + minX,
      maxX: startX + maxX,
      minY,
      maxY,
    };
  }

  /**
   * Detecta automaticamente os grupos horizontais de pixels visíveis (ideal para
   * spritesheets onde os quadros crescem de largura da esquerda para a direita).
   */
  private static extractSpriteClusters(
    canvas: HTMLCanvasElement,
    expectedCount: number
  ): BoundingCluster[] {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;

    const colOccupied = new Uint16Array(w);
    for (let x = 0; x < w; x++) {
      let count = 0;
      for (let y = 0; y < h; y++) {
        if (data[(y * w + x) * 4 + 3] > 28) count++;
      }
      colOccupied[x] = count;
    }

    const segments: Array<{ start: number; end: number }> = [];
    let inSeg = false;
    let segStart = 0;
    for (let x = 0; x < w; x++) {
      if (colOccupied[x] >= 2) {
        if (!inSeg) {
          inSeg = true;
          segStart = x;
        }
      } else if (inSeg) {
        inSeg = false;
        if (x - 1 - segStart >= 4) {
          segments.push({ start: segStart, end: x - 1 });
        }
      }
    }
    if (inSeg && w - 1 - segStart >= 4) {
      segments.push({ start: segStart, end: w - 1 });
    }

    // Se houver faíscas soltas que criaram segmentos extras, funde os mais próximos
    while (segments.length > expectedCount) {
      let bestIdx = 0;
      let smallestGap = Infinity;
      for (let i = 0; i < segments.length - 1; i++) {
        const gap = segments[i + 1].start - segments[i].end;
        if (gap < smallestGap) {
          smallestGap = gap;
          bestIdx = i;
        }
      }
      segments.splice(bestIdx, 2, {
        start: segments[bestIdx].start,
        end: segments[bestIdx + 1].end,
      });
    }

    // Fallback seguro caso dois quadros tenham encostado
    while (segments.length > 0 && segments.length < expectedCount) {
      let widestIdx = 0;
      let maxWidth = 0;
      for (let i = 0; i < segments.length; i++) {
        const sw = segments[i].end - segments[i].start;
        if (sw > maxWidth) {
          maxWidth = sw;
          widestIdx = i;
        }
      }
      const seg = segments[widestIdx];
      const mid = Math.floor((seg.start + seg.end) / 2);
      segments.splice(
        widestIdx,
        1,
        { start: seg.start, end: mid },
        { start: mid + 1, end: seg.end }
      );
    }

    if (segments.length === 0) {
      const out: BoundingCluster[] = [];
      for (let i = 0; i < expectedCount; i++) {
        const x0 = Math.round((i * w) / expectedCount);
        const x1 = Math.round(((i + 1) * w) / expectedCount) - 1;
        out.push(this.getBoundsInRegion(canvas, x0, x1));
      }
      return out;
    }

    return segments.map((s) => this.getBoundsInRegion(canvas, s.start, s.end));
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

  /**
   * attack-eletric.jpeg possui 6 raios verticais (topo -> base brilhante).
   * Rotacionamos -90° para que a ponta branca/dourada do raio aponte EXATAMENTE para +X (0 rad)!
   */
  private static registerElectricBasic(scene: Phaser.Scene): void {
    const src = this.loadChromaKeyedCanvas(scene, 'raw-attack-eletric', 56);
    if (!src) return;

    const frameCount = 6;
    const fW = 132;
    const fH = 124;
    const out = document.createElement('canvas');
    out.width = fW * frameCount;
    out.height = fH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const cellX0 = (f * src.width) / frameCount;
      const cellX1 = ((f + 1) * src.width) / frameCount - 1;
      const b = this.getBoundsInRegion(src, cellX0, cellX1);
      const bw = Math.max(1, b.maxX - b.minX + 1);
      const bh = Math.max(1, b.maxY - b.minY + 1);

      const cx = f * fW + fW / 2;
      const cy = fH / 2;

      ctx.save();
      ctx.translate(cx, cy);
      // -90° coloca a base brilhante (+Y original) apontando para a DIREITA (+X)
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(src, b.minX, b.minY, bw, bh, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();

      // Ponta de lança elétrica sutil em +X para reforçar leitura direcional em voo
      if (f >= 1 && f <= 4) {
        const tipX = cx + bh / 2 - 2;
        const grad = ctx.createRadialGradient(tipX, cy, 1, tipX, cy, 15);
        grad.addColorStop(0, 'rgba(255,255,255,0.92)');
        grad.addColorStop(0.5, 'rgba(254,240,138,0.55)');
        grad.addColorStop(1, 'rgba(247,208,44,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tipX, cy, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const sheetKey = 'sheet-attack-eletric';
    this.registerCanvasSheet(scene, sheetKey, out, fW, fH, frameCount);

    if (!scene.anims.exists('anim-attack-eletric')) {
      scene.anims.create({
        key: 'anim-attack-eletric',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          frames: [1, 2, 3, 4],
        }),
        frameRate: 16,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('anim-attack-eletric-hit')) {
      scene.anims.create({
        key: 'anim-attack-eletric-hit',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          frames: [0, 2, 3, 5],
        }),
        frameRate: 20,
        repeat: 0,
      });
    }
  }

  // ===================== 2. FOGO BÁSICO (ORIENTADO PARA +X) =====================

  /**
   * attack-fire.jpeg possui 6 chamas apontando para CIMA (-Y).
   * Rotacionamos +90° sentido horário para que a língua de fogo aponte para a DIREITA (+X)!
   */
  private static registerFireBasic(scene: Phaser.Scene): void {
    const src = this.loadChromaKeyedCanvas(scene, 'raw-attack-fire', 56);
    if (!src) return;

    const frameCount = 6;
    const fW = 126;
    const fH = 124;
    const out = document.createElement('canvas');
    out.width = fW * frameCount;
    out.height = fH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const cellX0 = Math.round((f * src.width) / frameCount);
      const cellW = Math.round(src.width / frameCount);
      const cellH = src.height;

      const cx = f * fW + fW / 2;
      const cy = fH / 2;

      ctx.save();
      ctx.translate(cx, cy);
      // +90° mapeia o topo da chama (-Y) para a DIREITA (+X) e a base (+Y) para a ESQUERDA (-X)
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(
        src,
        cellX0,
        0,
        cellW,
        cellH,
        -cellW / 2,
        -cellH / 2,
        cellW,
        cellH
      );
      ctx.restore();
    }

    const sheetKey = 'sheet-attack-fire';
    this.registerCanvasSheet(scene, sheetKey, out, fW, fH, frameCount);

    if (!scene.anims.exists('anim-attack-fire')) {
      scene.anims.create({
        key: 'anim-attack-fire',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          frames: [1, 2, 3, 4],
        }),
        frameRate: 16,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('anim-attack-fire-slash')) {
      scene.anims.create({
        key: 'anim-attack-fire-slash',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          start: 0,
          end: 5,
        }),
        frameRate: 18,
        repeat: 0,
      });
    }
  }

  // ===================== 3. PLANTA BÁSICO (ALINHADO PARA +X SEM GIRO CAÓTICO) =====================

  /**
   * attack-grass.jpeg possui 6 folhas com inclinações diferentes em cada quadro.
   * Alinhamos cada folha para que sua ponta cortante aponte para a DIREITA (+X)
   * com rastro de vento esmeralda atrás (-X).
   */
  private static registerGrassBasic(scene: Phaser.Scene): void {
    const src = this.loadChromaKeyedCanvas(scene, 'raw-attack-grass', 56);
    if (!src) return;

    const frameCount = 6;
    const fW = 128;
    const fH = 120;
    const out = document.createElement('canvas');
    out.width = fW * frameCount;
    out.height = fH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Ângulos de correção para alinhar a ponta de cada folha ao eixo +X
    const alignDeg = [-22, -52, -85, 68, 32, -4];

    for (let f = 0; f < frameCount; f++) {
      const cellX0 = (f * src.width) / frameCount;
      const cellX1 = ((f + 1) * src.width) / frameCount - 1;
      const b = this.getBoundsInRegion(src, cellX0, cellX1);
      const bw = Math.max(1, b.maxX - b.minX + 1);
      const bh = Math.max(1, b.maxY - b.minY + 1);

      const cx = f * fW + fW / 2 + 4;
      const cy = fH / 2;

      // Rastro cortante de vento na traseira (-X)
      const wakeGrad = ctx.createLinearGradient(cx - 52, cy, cx + 14, cy);
      wakeGrad.addColorStop(0, 'rgba(74, 222, 128, 0)');
      wakeGrad.addColorStop(0.7, 'rgba(134, 239, 172, 0.36)');
      wakeGrad.addColorStop(1, 'rgba(220, 252, 231, 0.72)');
      ctx.fillStyle = wakeGrad;
      ctx.beginPath();
      ctx.moveTo(cx - 50, cy);
      ctx.quadraticCurveTo(cx - 14, cy - 12, cx + 18, cy);
      ctx.quadraticCurveTo(cx - 14, cy + 12, cx - 50, cy);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Phaser.Math.DegToRad(alignDeg[f]));
      ctx.drawImage(src, b.minX, b.minY, bw, bh, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    }

    const sheetKey = 'sheet-attack-grass';
    this.registerCanvasSheet(scene, sheetKey, out, fW, fH, frameCount);

    if (!scene.anims.exists('anim-attack-grass')) {
      scene.anims.create({
        key: 'anim-attack-grass',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          start: 0,
          end: 5,
        }),
        frameRate: 16,
        repeat: -1,
      });
    }
  }

  // ===================== 4. ÁGUA BÁSICO (VOO DIRECIONAL +X & SPLASH NO IMPACTO) =====================

  /**
   * attack-water.jpeg tem esferas nos quadros 0..3 e anéis de splash estourando nos quadros 4..5.
   * Separamos o projétil pressurizado direcional (+X) do splash de impacto!
   */
  private static registerWaterBasic(scene: Phaser.Scene): void {
    const src = this.loadChromaKeyedCanvas(scene, 'raw-attack-water', 56);
    if (!src) return;

    const rawCells = 6;
    const fW = 132;
    const fH = 116;

    // 4a. Projétil pressurizado em voo (4 quadros usando as esferas cheias 2 e 3 + cauda hidráulica em -X)
    const flightFrames = 4;
    const flightCanvas = document.createElement('canvas');
    flightCanvas.width = fW * flightFrames;
    flightCanvas.height = fH;
    const fCtx = flightCanvas.getContext('2d')!;
    fCtx.imageSmoothingEnabled = false;

    const orbIndices = [2, 3, 2, 3];
    for (let i = 0; i < flightFrames; i++) {
      const rawIdx = orbIndices[i];
      const cellX0 = (rawIdx * src.width) / rawCells;
      const cellX1 = ((rawIdx + 1) * src.width) / rawCells - 1;
      const b = this.getBoundsInRegion(src, cellX0, cellX1);
      const bw = Math.max(1, b.maxX - b.minX + 1);
      const bh = Math.max(1, b.maxY - b.minY + 1);

      const cx = i * fW + fW / 2 + 12;
      const cy = fH / 2;

      // Cauda de jato pressurizado apontando de -X para +X
      const jetGrad = fCtx.createLinearGradient(cx - 64, cy, cx + 10, cy);
      jetGrad.addColorStop(0, 'rgba(0, 180, 216, 0)');
      jetGrad.addColorStop(0.55, 'rgba(56, 189, 248, 0.48)');
      jetGrad.addColorStop(1, 'rgba(224, 242, 254, 0.88)');
      fCtx.fillStyle = jetGrad;
      const waveOffset = i % 2 === 0 ? 3 : -3;
      fCtx.beginPath();
      fCtx.moveTo(cx - 62, cy + waveOffset);
      fCtx.quadraticCurveTo(cx - 22, cy - 20, cx + 6, cy - 16);
      fCtx.lineTo(cx + 6, cy + 16);
      fCtx.quadraticCurveTo(cx - 22, cy + 20, cx - 62, cy + waveOffset);
      fCtx.fill();

      // Desenha a esfera original de pixel-art na frente (+X)
      fCtx.drawImage(
        src,
        b.minX,
        b.minY,
        bw,
        bh,
        cx - bw / 2,
        cy - bh / 2,
        bw,
        bh
      );

      // Crista frontal de espuma em +X
      fCtx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      fCtx.lineWidth = 3;
      fCtx.beginPath();
      fCtx.arc(cx + 4, cy, bh * 0.46, -0.85, 0.85);
      fCtx.stroke();
    }

    const flightSheetKey = 'sheet-attack-water';
    this.registerCanvasSheet(
      scene,
      flightSheetKey,
      flightCanvas,
      fW,
      fH,
      flightFrames
    );

    if (!scene.anims.exists('anim-attack-water')) {
      scene.anims.create({
        key: 'anim-attack-water',
        frames: scene.anims.generateFrameNumbers(flightSheetKey, {
          start: 0,
          end: flightFrames - 1,
        }),
        frameRate: 15,
        repeat: -1,
      });
    }

    // 4b. Splash de impacto usando os quadros 3, 4 e 5 originais
    const hitFrames = 3;
    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = fW * hitFrames;
    hitCanvas.height = fH;
    const hCtx = hitCanvas.getContext('2d')!;
    hCtx.imageSmoothingEnabled = false;

    [3, 4, 5].forEach((rawIdx, idx) => {
      const cellX0 = (rawIdx * src.width) / rawCells;
      const cellX1 = ((rawIdx + 1) * src.width) / rawCells - 1;
      const b = this.getBoundsInRegion(src, cellX0, cellX1);
      const bw = Math.max(1, b.maxX - b.minX + 1);
      const bh = Math.max(1, b.maxY - b.minY + 1);
      const cx = idx * fW + fW / 2;
      const cy = fH / 2;
      hCtx.drawImage(
        src,
        b.minX,
        b.minY,
        bw,
        bh,
        cx - bw / 2,
        cy - bh / 2,
        bw,
        bh
      );
    });

    const hitSheetKey = 'sheet-attack-water-hit';
    this.registerCanvasSheet(scene, hitSheetKey, hitCanvas, fW, fH, hitFrames);

    if (!scene.anims.exists('anim-attack-water-hit')) {
      scene.anims.create({
        key: 'anim-attack-water-hit',
        frames: scene.anims.generateFrameNumbers(hitSheetKey, {
          start: 0,
          end: hitFrames - 1,
        }),
        frameRate: 18,
        repeat: 0,
      });
    }
  }

  // ===================== 5. ESPECIAIS (EXTRAÇÃO POR CLUSTER SEM CORTAR BORDAS) =====================

  private static registerElectricSpecial(scene: Phaser.Scene): void {
    const src = this.loadChromaKeyedCanvas(scene, 'raw-especial-eletrico', 48, [
      { x: 0, y: 0, w: 660, h: 108 },
    ]);
    if (!src) return;

    const frameCount = 8;
    const clusters = this.extractSpriteClusters(src, frameCount);
    const fW = 280;
    const fH = 280;
    const out = document.createElement('canvas');
    out.width = fW * frameCount;
    out.height = fH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    clusters.forEach((b, f) => {
      const bw = Math.max(1, b.maxX - b.minX + 1);
      const bh = Math.max(1, b.maxY - b.minY + 1);
      const scale = Math.min(1, (fW - 16) / bw, (fH - 16) / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = f * fW + (fW - dw) / 2;
      const dy = (fH - dh) / 2;
      ctx.drawImage(src, b.minX, b.minY, bw, bh, dx, dy, dw, dh);
    });

    const sheetKey = 'sheet-especial-eletrico';
    this.registerCanvasSheet(scene, sheetKey, out, fW, fH, frameCount);

    if (!scene.anims.exists('anim-especial-eletrico')) {
      scene.anims.create({
        key: 'anim-especial-eletrico',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          start: 0,
          end: frameCount - 1,
        }),
        frameRate: 14,
        repeat: 0,
      });
    }
  }

  /**
   * Especial-Fogo.jpeg: 7 jatos de lança-chamas crescendo da esquerda para a direita (+X).
   * Ancoramos o bico (nozzle) à esquerda de cada quadro para sair exatamente da boca/garra do Pokémon!
   */
  private static registerFireSpecial(scene: Phaser.Scene): void {
    const src = this.loadChromaKeyedCanvas(scene, 'raw-especial-fogo', 48, [
      { x: 0, y: 0, w: 580, h: 108 },
    ]);
    if (!src) return;

    const frameCount = 7;
    const clusters = this.extractSpriteClusters(src, frameCount);
    const fW = 310;
    const fH = 220;
    const out = document.createElement('canvas');
    out.width = fW * frameCount;
    out.height = fH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    clusters.forEach((b, f) => {
      const bw = Math.max(1, b.maxX - b.minX + 1);
      const bh = Math.max(1, b.maxY - b.minY + 1);
      const scale = Math.min(1, (fW - 22) / bw, (fH - 16) / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = f * fW + 14; // bico ancorado em x = 14 (~4.5% da largura)
      const dy = (fH - dh) / 2;
      ctx.drawImage(src, b.minX, b.minY, bw, bh, dx, dy, dw, dh);
    });

    const sheetKey = 'sheet-especial-fogo';
    this.registerCanvasSheet(scene, sheetKey, out, fW, fH, frameCount);

    if (!scene.anims.exists('anim-especial-fogo')) {
      scene.anims.create({
        key: 'anim-especial-fogo',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          start: 0,
          end: frameCount - 1,
        }),
        frameRate: 14,
        repeat: 0,
      });
    }
  }

  private static registerWaterSpecial(scene: Phaser.Scene): void {
    const src = this.loadChromaKeyedCanvas(scene, 'raw-especial-agua', 48, [
      { x: 0, y: 0, w: 480, h: 108 },
      { x: 0, y: 334, w: 120, h: 20 },
    ]);
    if (!src) return;

    const frameCount = 7;
    const clusters = this.extractSpriteClusters(src, frameCount);
    const fW = 280;
    const fH = 280;
    const out = document.createElement('canvas');
    out.width = fW * frameCount;
    out.height = fH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    clusters.forEach((b, f) => {
      const bw = Math.max(1, b.maxX - b.minX + 1);
      const bh = Math.max(1, b.maxY - b.minY + 1);
      const scale = Math.min(1, (fW - 16) / bw, (fH - 16) / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = f * fW + (fW - dw) / 2;
      const dy = (fH - dh) / 2;
      ctx.drawImage(src, b.minX, b.minY, bw, bh, dx, dy, dw, dh);
    });

    const sheetKey = 'sheet-especial-agua';
    this.registerCanvasSheet(scene, sheetKey, out, fW, fH, frameCount);

    if (!scene.anims.exists('anim-especial-agua')) {
      scene.anims.create({
        key: 'anim-especial-agua',
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          start: 0,
          end: frameCount - 1,
        }),
        frameRate: 13,
        repeat: 0,
      });
    }
  }

  // ===================== 6. ATAQUES PROCEDURAIS ELABORADOS (+X) =====================

  /**
   * Spritesheets animados procedurais para Fada/Som (Crescente Estelar + Notas)
   * e Chicote de Vinha, ambos estritamente orientados para a DIREITA (+X).
   */
  private static registerProceduralFairyAndVineAttacks(
    scene: Phaser.Scene
  ): void {
    // 6a. Onda Crescente Feérica / Som (4 quadros apontando para +X)
    const fCount = 4;
    const fW = 112;
    const fH = 92;
    const fairyCanvas = document.createElement('canvas');
    fairyCanvas.width = fW * fCount;
    fairyCanvas.height = fH;
    const fCtx = fairyCanvas.getContext('2d')!;

    for (let f = 0; f < fCount; f++) {
      const cx = f * fW + fW / 2 + 6;
      const cy = fH / 2;
      const pulse = 1 + Math.sin((f / fCount) * Math.PI * 2) * 0.08;

      // Rastro estelar rosado em -X
      const wake = fCtx.createLinearGradient(cx - 52, cy, cx + 18, cy);
      wake.addColorStop(0, 'rgba(244, 114, 182, 0)');
      wake.addColorStop(0.6, 'rgba(251, 113, 133, 0.38)');
      wake.addColorStop(1, 'rgba(255, 228, 230, 0.85)');
      fCtx.fillStyle = wake;
      fCtx.beginPath();
      fCtx.ellipse(cx - 14, cy, 38, 16 * pulse, 0, 0, Math.PI * 2);
      fCtx.fill();

      // Lâmina crescente feérica apontando para +X
      fCtx.save();
      fCtx.translate(cx + 8, cy);
      fCtx.fillStyle = '#ff4d8d';
      fCtx.beginPath();
      fCtx.arc(0, 0, 26 * pulse, -1.15, 1.15, false);
      fCtx.arc(-10, 0, 23 * pulse, 1.05, -1.05, true);
      fCtx.closePath();
      fCtx.fill();

      fCtx.strokeStyle = '#fff1f2';
      fCtx.lineWidth = 2.5;
      fCtx.stroke();

      // Estrela brilhante na ponta frontal (+X)
      this.drawStar(fCtx, 18, (f % 2 === 0 ? -1 : 1) * 3, 7, 3, '#fef08a');
      fCtx.restore();
    }

    const fairySheet = 'sheet-attack-fairy';
    this.registerCanvasSheet(scene, fairySheet, fairyCanvas, fW, fH, fCount);
    if (!scene.anims.exists('anim-attack-fairy')) {
      scene.anims.create({
        key: 'anim-attack-fairy',
        frames: scene.anims.generateFrameNumbers(fairySheet, {
          start: 0,
          end: fCount - 1,
        }),
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
