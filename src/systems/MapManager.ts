import Phaser from 'phaser';
import {
  BOSS_MAP_DEFINITION,
  MAP_SEQUENCE,
  MapDefinition,
} from '../config/pokemonManifest';
import { DEPTH } from './depth';

const RAW_CELL_SIZE = 16;
/** Abertura física da pontezinha entre os mapas (meia-largura em px do mundo) */
const GAP_HALF_WIDTH = 56;
/** Altura da faixa de mescla entre os mapas */
const SEAM_BLEND_HEIGHT = 200;
/** Altura total da pontezinha desenhada que atravessa a emenda */
const SEAM_BRIDGE_HEIGHT = 380;
/**
 * O jogador só "entra" oficialmente no novo mapa quando a câmera já não enxerga
 * mais o mapa antigo.
*/
const ENTRY_DISTANCE_PAST_SEAM = 340;

interface NormalizedBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Caixas de colisão explícitas (em coordenadas normalizadas da imagem original 0..1)
 * para todas as casas, ginásios, laboratórios, cercas e guaritas de cada mapa,
 * garantindo que telhados e paredes brancas/cinzas bloqueiem 100% sem afetar as estradas!
 */
const MAP_SOLID_BOXES: Record<string, NormalizedBox[]> = {
  map1: [
    // Casa superior esquerda (Red's House + placa)
    { x0: 0.365, x1: 0.472, y0: 0.478, y1: 0.533 },
    // Casa superior direita (Blue's House + placa)
    { x0: 0.518, x1: 0.622, y0: 0.478, y1: 0.533 },
    // Laboratório do Prof. Carvalho
    { x0: 0.514, x1: 0.635, y0: 0.539, y1: 0.594 },
    // Cerca de madeira esquerda + canteiro
    { x0: 0.378, x1: 0.472, y0: 0.556, y1: 0.573 },
    // Cerca de madeira inferior (acima do lago)
    { x0: 0.514, x1: 0.622, y0: 0.606, y1: 0.624 },
  ],
  map2: [
    // Guarita norte esquerda
    { x0: 0.362, x1: 0.438, y0: 0.054, y1: 0.098 },
    // Casa de telhado azul norte
    { x0: 0.482, x1: 0.548, y0: 0.128, y1: 0.166 },
    // Guarita central esquerda
    { x0: 0.344, x1: 0.438, y0: 0.345, y1: 0.402 },
    // Guarita central direita
    { x0: 0.510, x1: 0.578, y0: 0.345, y1: 0.395 },
    // Ginásio / Prédio laranja maior na cidade
    { x0: 0.558, x1: 0.654, y0: 0.630, y1: 0.684 },
    // Casa verde superior esquerda na cidade
    { x0: 0.450, x1: 0.520, y0: 0.652, y1: 0.692 },
    // Casa verde central esquerda na cidade
    { x0: 0.450, x1: 0.520, y0: 0.708, y1: 0.748 },
    // PokéMart (telhado azul)
    { x0: 0.570, x1: 0.636, y0: 0.708, y1: 0.748 },
    // Pokémon Center (telhado vermelho)
    { x0: 0.450, x1: 0.520, y0: 0.764, y1: 0.808 },
  ],
  map3: [
    // Guarita superior esquerda
    { x0: 0.088, x1: 0.238, y0: 0.025, y1: 0.125 },
    // Guarita inferior central (caso visível)
    { x0: 0.425, x1: 0.572, y0: 0.730, y1: 0.840 },
  ],
  map4: [
    // Grande Prédio / Ginásio norte + cercas frontais
    { x0: 0.290, x1: 0.606, y0: 0.026, y1: 0.126 },
    { x0: 0.266, x1: 0.422, y0: 0.132, y1: 0.150 },
    { x0: 0.476, x1: 0.632, y0: 0.132, y1: 0.150 },
    // Casa cinza superior direita
    { x0: 0.626, x1: 0.728, y0: 0.254, y1: 0.304 },
    // PokéMart (telhado azul)
    { x0: 0.558, x1: 0.634, y0: 0.338, y1: 0.390 },
    // Pokémon Center (telhado vermelho)
    { x0: 0.368, x1: 0.454, y0: 0.420, y1: 0.474 },
    // Casa cinza inferior esquerda
    { x0: 0.274, x1: 0.352, y0: 0.470, y1: 0.522 },
    // Cerca do jardim florido à direita
    { x0: 0.554, x1: 0.734, y0: 0.454, y1: 0.528 },
    // Monte / Entrada da caverna cercada
    { x0: 0.548, x1: 0.682, y0: 0.678, y1: 0.756 },
    // Entrada de caverna na encosta esquerda
    { x0: 0.028, x1: 0.105, y0: 0.562, y1: 0.606 },
  ],
};

interface ActiveMapInstance {
  def: MapDefinition;
  index: number;
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  width: number;
  height: number;
  cellSize: number;
  cols: number;
  rows: number;
  blockedGrid: boolean[][];
  obstacleZones: Phaser.GameObjects.Zone[];
  pixels: Uint8ClampedArray;
  rawW: number;
  rawH: number;
  fullRawH: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export class MapManager {
  private scene: Phaser.Scene;
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup;
  private transitionWallZones: Phaser.GameObjects.Zone[] = [];
  private transitionVisuals: Phaser.GameObjects.GameObject[] = [];

  private currentMap!: ActiveMapInstance;
  private pendingNextMap: ActiveMapInstance | null = null;
  private seamY = 0;
  private seamOpeningX = 0;
  private transitionCounter = 0;
  private bossArenaActive = false;

  private debugGraphics!: Phaser.GameObjects.Graphics;
  private isDebugVisible = false;
  public mapsCleared = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  static preloadAll(scene: Phaser.Scene): void {
    for (const mapDef of MAP_SEQUENCE) {
      scene.load.image(mapDef.key, mapDef.file);
    }
    scene.load.image(BOSS_MAP_DEFINITION.key, BOSS_MAP_DEFINITION.file);
  }

  init(): void {
    this.obstacleGroup = this.scene.physics.add.staticGroup();
    this.debugGraphics = this.scene.add.graphics().setDepth(DEPTH.DEBUG);
    this.ensureFillerTextures();
    this.bossArenaActive = false;

    this.currentMap = this.createMapInstance(
      MAP_SEQUENCE[0],
      0,
      0,
      0,
      false,
      false
    );
    this.applySingleMapWorldBounds(this.currentMap);
  }

  getObstaclesGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.obstacleGroup;
  }

  getCurrentMapDefinition(): MapDefinition {
    return this.currentMap.def;
  }

  getCurrentMapBounds(): { x: number; y: number; width: number; height: number } {
    const m = this.currentMap;
    return { x: m.x, y: m.y, width: m.width, height: m.height };
  }

  isBossMapActive(): boolean {
    return this.bossArenaActive;
  }

  getInitialSpawnPoint(): { x: number; y: number } {
    const m = this.currentMap;
    return this.findNearestWalkablePosition(
      m.x + m.width * m.def.initialSpawnNorm.x,
      m.y + m.height * m.def.initialSpawnNorm.y
    );
  }

  isNextMapGateOpen(): boolean {
    return this.pendingNextMap !== null;
  }

  /** Ponto que a bússola deve indicar durante a transição pela pontezinha */
  getTransitionTarget(playerY: number): {
    x: number;
    y: number;
    passedSeam: boolean;
  } {
    const passedSeam = playerY < this.seamY;
    return {
      x: this.seamOpeningX,
      y: passedSeam ? this.seamY - ENTRY_DISTANCE_PAST_SEAM : this.seamY + 10,
      passedSeam,
    };
  }

  // ===================== TELEPORTE PARA ARENA BOSS (MAP5-BOSS) =====================

  /**
   * Teleporta o jogador imediatamente para o map5-BOSS (Ginásio de Pedra do Onix),
   * confinando a área caminhável exclusivamente à arena central da Pokébola.
   */
  teleportToBossArena(): {
    playerSpawn: { x: number; y: number };
    bossSpawn: { x: number; y: number };
  } {
    this.bossArenaActive = true;
    this.clearTransitionWalls();

    if (this.pendingNextMap) {
      this.destroyMapObstacles(this.pendingNextMap);
      this.pendingNextMap.image.destroy();
      this.pendingNextMap.pixels = new Uint8ClampedArray(0);
      this.pendingNextMap = null;
    }

    for (const v of this.transitionVisuals) {
      v.destroy();
    }
    this.transitionVisuals = [];

    if (this.currentMap) {
      this.destroyMapObstacles(this.currentMap);
      this.currentMap.image.destroy();
      this.currentMap.pixels = new Uint8ClampedArray(0);
    }

    const bossMap = this.createMapInstance(
      BOSS_MAP_DEFINITION,
      99,
      0,
      0,
      false,
      false
    );
    this.currentMap = bossMap;
    this.applySingleMapWorldBounds(bossMap);
    this.renderDebugGrid();

    const playerSpawn = this.findNearestWalkablePosition(
      bossMap.x + bossMap.width * 0.5,
      bossMap.y + bossMap.height * 0.71
    );
    const bossSpawn = this.findNearestWalkablePosition(
      bossMap.x + bossMap.width * 0.5,
      bossMap.y + bossMap.height * 0.46
    );

    return { playerSpawn, bossSpawn };
  }

  // ===================== TRANSIÇÃO CONECTADA COM PONTEZINHA =====================

  spawnNextConnectedMap(): MapDefinition {
    if (this.pendingNextMap) return this.pendingNextMap.def;

    const curr = this.currentMap;
    const nextIndex = (curr.index + 1) % MAP_SEQUENCE.length;
    const nextDef = MAP_SEQUENCE[nextIndex];
    const tex = this.scene.textures
      .get(nextDef.key)
      .getSourceImage() as HTMLImageElement;

    const cropRatio = nextDef.southCropNormY ?? 1.0;
    const nextRawH = Math.round(tex.height * cropRatio);
    const nextW = Math.round(tex.width * nextDef.worldScale);
    const nextH = Math.round(nextRawH * nextDef.worldScale);

    this.seamOpeningX = Math.round(
      curr.x + curr.width * curr.def.northExitNormX
    );
    this.seamY = curr.y;

    const nextX = Math.round(
      this.seamOpeningX - nextW * nextDef.southEntranceNormX
    );
    const nextY = Math.round(curr.y - nextH);

    this.openNorthExitOnMap(curr);
    const next = this.createMapInstance(
      nextDef,
      nextIndex,
      nextX,
      nextY,
      true,
      false
    );
    this.pendingNextMap = next;

    const union = this.unionBounds(curr, next);
    this.scene.physics.world.setBounds(union.x, union.y, union.w, union.h);
    this.scene.cameras.main.setBounds(union.x, union.y, union.w, union.h);

    this.transitionCounter++;
    this.buildFillerBackground(curr, next, union);
    this.buildSeamBlend(curr, next, union);
    this.buildSeamBridge();
    this.buildTransitionWalls(curr, next, union);

    // Revela o novo mapa e a pontezinha suavemente
    const fadeTargets = [next.image, ...this.transitionVisuals];
    fadeTargets.forEach((obj) =>
      (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0)
    );
    this.scene.tweens.add({
      targets: fadeTargets,
      alpha: 1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });

    this.renderDebugGrid();
    return nextDef;
  }

  /**
   * Finaliza a transição quando o jogador atravessa a pontezinha e avança pelo novo mapa.
   */
  checkPlayerEnteredNextMap(
    _playerX: number,
    playerY: number
  ): MapDefinition | null {
    if (!this.pendingNextMap) return null;
    if (playerY > this.seamY - ENTRY_DISTANCE_PAST_SEAM) return null;

    const oldMap = this.currentMap;
    const newMap = this.pendingNextMap;
    this.pendingNextMap = null;
    this.currentMap = newMap;
    this.mapsCleared++;

    this.clearTransitionWalls();
    this.destroyMapObstacles(oldMap);

    this.scene.physics.world.setBounds(
      newMap.x,
      newMap.y,
      newMap.width,
      newMap.height
    );
    this.tweenCameraBoundsTo(newMap);

    const visuals = this.transitionVisuals;
    this.transitionVisuals = [];
    this.scene.tweens.add({
      targets: [oldMap.image, ...visuals],
      alpha: 0,
      duration: 500,
      onComplete: () => {
        oldMap.image.destroy();
        visuals.forEach((v) => v.destroy());
        oldMap.pixels = new Uint8ClampedArray(0);
      },
    });

    this.renderDebugGrid();
    return newMap.def;
  }

  private unionBounds(a: ActiveMapInstance, b: ActiveMapInstance) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const maxX = Math.max(a.x + a.width, b.x + b.width);
    const maxY = Math.max(a.y + a.height, b.y + b.height);
    return { x, y, w: maxX - x, h: maxY - y };
  }

  private tweenCameraBoundsTo(m: ActiveMapInstance): void {
    const cam = this.scene.cameras.main;
    const from = cam.getBounds();
    const proxy = { x: from.x, y: from.y, w: from.width, h: from.height };
    this.scene.tweens.add({
      targets: proxy,
      x: m.x,
      y: m.y,
      w: m.width,
      h: m.height,
      duration: 900,
      ease: 'Sine.easeInOut',
      onUpdate: () => cam.setBounds(proxy.x, proxy.y, proxy.w, proxy.h),
    });
  }

  private buildFillerBackground(
    curr: ActiveMapInstance,
    next: ActiveMapInstance,
    union: { x: number; y: number; w: number; h: number }
  ): void {
    const margin = 400;
    const lowerKey = curr.def.theme === 'cave' ? 'filler-cave' : 'filler-forest';
    const upperKey = next.def.theme === 'cave' ? 'filler-cave' : 'filler-forest';

    const upper = this.scene.add
      .tileSprite(
        union.x - margin,
        union.y - margin,
        union.w + margin * 2,
        this.seamY - union.y + margin,
        upperKey
      )
      .setOrigin(0, 0)
      .setDepth(DEPTH.FILLER);
    const lower = this.scene.add
      .tileSprite(
        union.x - margin,
        this.seamY,
        union.w + margin * 2,
        union.y + union.h - this.seamY + margin,
        lowerKey
      )
      .setOrigin(0, 0)
      .setDepth(DEPTH.FILLER);

    this.transitionVisuals.push(upper, lower);
  }

  private buildSeamBlend(
    curr: ActiveMapInstance,
    next: ActiveMapInstance,
    union: { x: number; y: number; w: number; h: number }
  ): void {
    const width = Math.ceil(union.w);
    const height = SEAM_BLEND_HEIGHT;
    const step = 6;
    const columns = Math.ceil(width / step);

    const fillerTop =
      next.def.theme === 'cave'
        ? { r: 110, g: 66, b: 60 }
        : { r: 47, g: 107, b: 42 };
    const fillerBottom =
      curr.def.theme === 'cave'
        ? { r: 110, g: 66, b: 60 }
        : { r: 47, g: 107, b: 42 };

    const topColors: Rgb[] = [];
    const bottomColors: Rgb[] = [];
    for (let i = 0; i < columns; i++) {
      const worldX = union.x + i * step + step / 2;
      topColors.push(this.sampleEdgeColor(next, worldX, 'bottom') ?? fillerTop);
      bottomColors.push(this.sampleEdgeColor(curr, worldX, 'top') ?? fillerBottom);
    }
    const smoothTop = this.smoothColors(topColors, 4);
    const smoothBottom = this.smoothColors(bottomColors, 4);

    const key = `seam-blend-${this.transitionCounter}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const canvasTex = this.scene.textures.createCanvas(key, width, height)!;
    const ctx = canvasTex.getContext();

    for (let i = 0; i < columns; i++) {
      const t = smoothTop[i];
      const b = smoothBottom[i];
      const mid = {
        r: Math.round((t.r + b.r) / 2),
        g: Math.round((t.g + b.g) / 2),
        b: Math.round((t.b + b.b) / 2),
      };
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, `rgba(${t.r},${t.g},${t.b},0)`);
      grad.addColorStop(0.32, `rgba(${t.r},${t.g},${t.b},0.92)`);
      grad.addColorStop(0.5, `rgba(${mid.r},${mid.g},${mid.b},1)`);
      grad.addColorStop(0.68, `rgba(${b.r},${b.g},${b.b},0.92)`);
      grad.addColorStop(1, `rgba(${b.r},${b.g},${b.b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(i * step, 0, step + 1, height);
    }

    canvasTex.refresh();

    const blend = this.scene.add
      .image(union.x, this.seamY - height / 2, key)
      .setOrigin(0, 0)
      .setDepth(DEPTH.SEAM_BLEND);
    this.transitionVisuals.push(blend);
  }

  /**
   * Pontezinha de madeira clássica (com tábuas horizontais, corrimãos laterais e pilares)
   * que conecta visualmente a saída norte do mapa atual à entrada sul do próximo mapa.
   */
  private buildSeamBridge(): void {
    const key = `seam-bridge-${this.transitionCounter}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);

    const w = GAP_HALF_WIDTH * 2 + 28;
    const h = SEAM_BRIDGE_HEIGHT;
    const canvasTex = this.scene.textures.createCanvas(key, w, h)!;
    const ctx = canvasTex.getContext();

    const bridgeLeft = 14;
    const bridgeRight = w - 14;
    const bridgeW = bridgeRight - bridgeLeft;

    // Rampa de terra/pedra suave nas extremidades da ponte
    const approachGrad = ctx.createLinearGradient(0, 0, 0, h);
    approachGrad.addColorStop(0, 'rgba(218, 196, 136, 0)');
    approachGrad.addColorStop(0.14, 'rgba(218, 196, 136, 0.92)');
    approachGrad.addColorStop(0.86, 'rgba(218, 196, 136, 0.92)');
    approachGrad.addColorStop(1, 'rgba(218, 196, 136, 0)');
    ctx.fillStyle = approachGrad;
    ctx.fillRect(bridgeLeft + 4, 0, bridgeW - 8, h);

    // Estrutura principal da pontezinha de madeira
    const deckTop = Math.round(h * 0.14);
    const deckBottom = Math.round(h * 0.86);
    const deckH = deckBottom - deckTop;

    // Sombra abaixo da ponte
    ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.fillRect(bridgeLeft - 4, deckTop + 4, bridgeW + 8, deckH);

    // Base escura de madeira (vigas longitudinais)
    ctx.fillStyle = '#4a2c16';
    ctx.fillRect(bridgeLeft, deckTop, bridgeW, deckH);

    // Tábuas horizontais da ponte
    const plankHeight = 14;
    const plankGap = 3;
    let idx = 0;
    for (
      let py = deckTop + 4;
      py <= deckBottom - plankHeight - 2;
      py += plankHeight + plankGap
    ) {
      const isEven = idx % 2 === 0;
      ctx.fillStyle = isEven ? '#9c6634' : '#8b572a';
      ctx.fillRect(bridgeLeft + 8, py, bridgeW - 16, plankHeight);

      // Brilho superior da tábua
      ctx.fillStyle = '#b87d46';
      ctx.fillRect(bridgeLeft + 8, py, bridgeW - 16, 3);

      // Sombra inferior da tábua
      ctx.fillStyle = '#5c381c';
      ctx.fillRect(bridgeLeft + 8, py + plankHeight - 2, bridgeW - 16, 2);

      // Pregos laterais nas tábuas
      ctx.fillStyle = '#2b180a';
      ctx.fillRect(bridgeLeft + 13, py + 5, 3, 3);
      ctx.fillRect(bridgeRight - 16, py + 5, 3, 3);
      idx++;
    }

    // Corrimãos laterais de madeira (esquerdo e direito)
    const railW = 9;
    ctx.fillStyle = '#6d411f';
    ctx.fillRect(bridgeLeft, deckTop, railW, deckH);
    ctx.fillRect(bridgeRight - railW, deckTop, railW, deckH);

    ctx.fillStyle = '#c48a52';
    ctx.fillRect(bridgeLeft + 2, deckTop, 3, deckH);
    ctx.fillRect(bridgeRight - railW + 2, deckTop, 3, deckH);

    // Pilares de madeira ao longo do corrimão
    const postCount = 6;
    for (let i = 0; i < postCount; i++) {
      const postY =
        deckTop + Math.round((i / (postCount - 1)) * (deckH - 14));
      for (const px of [bridgeLeft - 2, bridgeRight - railW - 1]) {
        ctx.fillStyle = '#3b210f';
        ctx.fillRect(px, postY, railW + 3, 14);
        ctx.fillStyle = '#d69e66';
        ctx.fillRect(px + 2, postY + 2, railW - 1, 9);
      }
    }

    canvasTex.refresh();

    const bridge = this.scene.add
      .image(this.seamOpeningX, this.seamY, key)
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.SEAM_PATH);
    this.transitionVisuals.push(bridge);
  }

  /** Paredes invisíveis: laterais da pontezinha e áreas fora dos dois mapas */
  private buildTransitionWalls(
    curr: ActiveMapInstance,
    next: ActiveMapInstance,
    union: { x: number; y: number; w: number; h: number }
  ): void {
    this.clearTransitionWalls();
    const unionMaxX = union.x + union.w;
    const addWall = (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      const z = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
      this.scene.physics.add.existing(z, true);
      this.obstacleGroup.add(z);
      this.transitionWallZones.push(z);
    };

    // Bloqueia toda a faixa da emenda exceto a abertura da pontezinha
    addWall(
      union.x,
      this.seamY - 24,
      this.seamOpeningX - GAP_HALF_WIDTH - union.x,
      48
    );
    addWall(
      this.seamOpeningX + GAP_HALF_WIDTH,
      this.seamY - 24,
      unionMaxX - this.seamOpeningX - GAP_HALF_WIDTH,
      48
    );

    // Corrimãos físicos da pontezinha para ninguém cair pelas laterais da ponte
    const bridgeHalfH = Math.round(SEAM_BRIDGE_HEIGHT * 0.36);
    addWall(
      this.seamOpeningX - GAP_HALF_WIDTH - 24,
      this.seamY - bridgeHalfH,
      24,
      bridgeHalfH * 2
    );
    addWall(
      this.seamOpeningX + GAP_HALF_WIDTH,
      this.seamY - bridgeHalfH,
      24,
      bridgeHalfH * 2
    );

    // Laterais fora de cada mapa
    for (const m of [curr, next]) {
      addWall(union.x, m.y, m.x - union.x, m.height);
      addWall(m.x + m.width, m.y, unionMaxX - (m.x + m.width), m.height);
    }
    this.obstacleGroup.refresh();
  }

  private clearTransitionWalls(): void {
    for (const z of this.transitionWallZones) {
      if (z.body) {
        this.scene.physics.world.remove(
          z.body as Phaser.Physics.Arcade.StaticBody
        );
      }
      this.obstacleGroup.remove(z, true, true);
    }
    this.transitionWallZones = [];
    this.obstacleGroup.refresh();
  }

  private sampleEdgeColor(
    m: ActiveMapInstance,
    worldX: number,
    edge: 'top' | 'bottom'
  ): Rgb | null {
    if (worldX < m.x || worldX >= m.x + m.width || m.pixels.length === 0) {
      return null;
    }
    const rawX = Math.floor((worldX - m.x) / m.def.worldScale);
    const rows = 14;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let dy = 0; dy < rows; dy++) {
      const rawY = edge === 'top' ? dy : m.rawH - 1 - dy;
      for (let dx = -3; dx <= 3; dx++) {
        const x = Phaser.Math.Clamp(rawX + dx, 0, m.rawW - 1);
        const idx = (rawY * m.rawW + x) * 4;
        r += m.pixels[idx];
        g += m.pixels[idx + 1];
        b += m.pixels[idx + 2];
        n++;
      }
    }
    return {
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
    };
  }

  private smoothColors(colors: Rgb[], radius: number): Rgb[] {
    return colors.map((_, i) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const c = colors[Phaser.Math.Clamp(i + k, 0, colors.length - 1)];
        r += c.r;
        g += c.g;
        b += c.b;
        n++;
      }
      return {
        r: Math.round(r / n),
        g: Math.round(g / n),
        b: Math.round(b / n),
      };
    });
  }

  private ensureFillerTextures(): void {
    if (!this.scene.textures.exists('filler-forest')) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x2a5f26, 1);
      g.fillRect(0, 0, 96, 96);
      const crowns = [
        [16, 18, 18],
        [62, 14, 20],
        [40, 50, 22],
        [84, 56, 18],
        [12, 78, 18],
        [62, 88, 17],
      ];
      for (const [x, y, r] of crowns) {
        g.fillStyle(0x1f4a1c, 1);
        g.fillCircle(x + 3, y + 4, r);
        g.fillStyle(0x3f8f36, 1);
        g.fillCircle(x, y, r);
        g.fillStyle(0x5fb14a, 1);
        g.fillCircle(x - r * 0.3, y - r * 0.3, r * 0.45);
      }
      g.generateTexture('filler-forest', 96, 96);
      g.destroy();
    }

    if (!this.scene.textures.exists('filler-cave')) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x6e423c, 1);
      g.fillRect(0, 0, 96, 96);
      const rocks = [
        [20, 20, 18],
        [70, 22, 16],
        [44, 60, 20],
        [86, 74, 14],
        [12, 82, 14],
      ];
      for (const [x, y, r] of rocks) {
        g.fillStyle(0x4f2e2a, 1);
        g.fillCircle(x + 3, y + 4, r);
        g.fillStyle(0x8a5a50, 1);
        g.fillCircle(x, y, r);
        g.fillStyle(0xa87466, 1);
        g.fillCircle(x - r * 0.3, y - r * 0.35, r * 0.4);
      }
      g.generateTexture('filler-cave', 96, 96);
      g.destroy();
    }
  }

  // ===================== DEBUG / SPAWN SEGURO =====================

  toggleDebug(): boolean {
    this.isDebugVisible = !this.isDebugVisible;
    this.renderDebugGrid();
    return this.isDebugVisible;
  }

  /**
   * Busca por BFS a posição caminhável mais próxima que tenha uma vizinhança 3x3
   * inteiramente livre de árvores, casas, paredes, pedras e rios.
   */
  findNearestWalkablePosition(
    worldX: number,
    worldY: number
  ): { x: number; y: number } {
    const m = this.currentMap;
    const startCol = Phaser.Math.Clamp(
      Math.floor((worldX - m.x) / m.cellSize),
      2,
      Math.max(2, m.cols - 3)
    );
    const startRow = Phaser.Math.Clamp(
      Math.floor((worldY - m.y) / m.cellSize),
      2,
      Math.max(2, m.rows - 3)
    );

    const toWorld = (r: number, c: number) => ({
      x: m.x + c * m.cellSize + m.cellSize / 2,
      y: m.y + r * m.cellSize + m.cellSize / 2,
    });

    if (this.isCellAndNeighborsWalkable(m, startRow, startCol)) {
      return toWorld(startRow, startCol);
    }

    const visited = new Set<string>([`${startRow},${startCol}`]);
    const queue: Array<[number, number]> = [[startRow, startCol]];
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      if (this.isCellAndNeighborsWalkable(m, r, c)) return toWorld(r, c);
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 2 && nr < m.rows - 2 && nc >= 2 && nc < m.cols - 2) {
          const key = `${nr},${nc}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push([nr, nc]);
          }
        }
      }
    }

    return {
      x: m.x + m.width * m.def.initialSpawnNorm.x,
      y: m.y + m.height * m.def.initialSpawnNorm.y,
    };
  }

  /**
   * Exige que a célula central e TODAS as 8 células ao redor (bloco 3x3) estejam desbloqueadas,
   * garantindo folga total para o corpo físico do jogador e dos inimigos.
   */
  private isCellAndNeighborsWalkable(
    m: ActiveMapInstance,
    row: number,
    col: number
  ): boolean {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 1 || r >= m.rows - 1 || c < 1 || c >= m.cols - 1) {
          return false;
        }
        if (m.blockedGrid[r]?.[c]) {
          return false;
        }
      }
    }
    return true;
  }

  private applySingleMapWorldBounds(m: ActiveMapInstance): void {
    this.scene.physics.world.setBounds(m.x, m.y, m.width, m.height);
    this.scene.cameras.main.setBounds(m.x, m.y, m.width, m.height);
  }

  // ===================== CRIAÇÃO DO MAPA / COLISÕES =====================

  private createMapInstance(
    def: MapDefinition,
    index: number,
    worldX: number,
    worldY: number,
    southGateOpen: boolean,
    northGateOpen: boolean
  ): ActiveMapInstance {
    const tex = this.scene.textures
      .get(def.key)
      .getSourceImage() as HTMLImageElement;
    const rawW = tex.width;
    const fullRawH = tex.height;
    const cropRatio = def.southCropNormY ?? 1.0;
    const rawH = Math.round(fullRawH * cropRatio);

    const canvas = document.createElement('canvas');
    canvas.width = rawW;
    canvas.height = rawH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(tex, 0, 0);
    const pixels = ctx.getImageData(0, 0, rawW, rawH).data;

    const image = this.scene.add
      .image(worldX, worldY, def.key)
      .setOrigin(0, 0)
      .setScale(def.worldScale)
      .setDepth(DEPTH.MAP);

    if (cropRatio < 1.0) {
      image.setCrop(0, 0, rawW, rawH);
    }

    const cols = Math.ceil(rawW / RAW_CELL_SIZE);
    const rows = Math.ceil(rawH / RAW_CELL_SIZE);

    const instance: ActiveMapInstance = {
      def,
      index,
      image,
      x: worldX,
      y: worldY,
      width: Math.round(rawW * def.worldScale),
      height: Math.round(rawH * def.worldScale),
      cellSize: RAW_CELL_SIZE * def.worldScale,
      cols,
      rows,
      blockedGrid: this.computeCleanCollisionGrid(
        pixels,
        rawW,
        rawH,
        fullRawH,
        def,
        cols,
        rows,
        southGateOpen,
        northGateOpen
      ),
      obstacleZones: [],
      pixels,
      rawW,
      rawH,
      fullRawH,
    };

    this.buildStaticZonesForMap(instance);
    return instance;
  }

  private openNorthExitOnMap(m: ActiveMapInstance): void {
    const exitCol = Math.floor(m.cols * m.def.northExitNormX);
    for (let r = 0; r < Math.min(16, m.rows); r++) {
      for (let c = exitCol - 3; c <= exitCol + 3; c++) {
        if (c >= 1 && c < m.cols - 1) m.blockedGrid[r][c] = false;
      }
    }
    this.destroyMapObstacles(m);
    this.buildStaticZonesForMap(m);
  }

  private computeCleanCollisionGrid(
    data: Uint8ClampedArray,
    rawW: number,
    rawH: number,
    fullRawH: number,
    def: MapDefinition,
    cols: number,
    rows: number,
    openSouthEntrance: boolean,
    openNorthExit: boolean
  ): boolean[][] {
    // Caso especial: Arena Final do Boss Onix (map5-BOSS)
    // Trava o jogador e o Onix estritamente dentro da quadra central da Pokébola!
    if (def.theme === 'boss') {
      return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (__, c) => {
          const normX = ((c + 0.5) * RAW_CELL_SIZE) / rawW;
          const normY = ((r + 0.5) * RAW_CELL_SIZE) / rawH;
          const insideArena =
            normX >= 0.145 &&
            normX <= 0.855 &&
            normY >= 0.345 &&
            normY <= 0.785;
          return !insideArena;
        })
      );
    }

    const solidBoxes = MAP_SOLID_BOXES[def.key] ?? [];

    const grid: boolean[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (__, c) => {
        // Bordas externas do mapa sempre bloqueadas (exceto quando o portão abre)
        if (c <= 0 || c >= cols - 1) return true;
        if (r <= 0 && !openNorthExit) return true;
        if (r >= rows - 1 && !openSouthEntrance) return true;

        const normX = ((c + 0.5) * RAW_CELL_SIZE) / rawW;
        const normYFull = ((r + 0.5) * RAW_CELL_SIZE) / fullRawH;

        // Verifica footprints explícitos de casas, prédios, ginásios e cercas
        for (const box of solidBoxes) {
          if (
            normX >= box.x0 &&
            normX <= box.x1 &&
            normYFull >= box.y0 &&
            normYFull <= box.y1
          ) {
            return true;
          }
        }

        return this.isRawCellObstacle(
          data,
          rawW,
          rawH,
          c * RAW_CELL_SIZE,
          r * RAW_CELL_SIZE,
          def.theme
        );
      })
    );

    // Garante que a passagem sul e norte da pontezinha estejam limpas
    const southCol = Math.floor(cols * def.southEntranceNormX);
    const northCol = Math.floor(cols * def.northExitNormX);
    const halfSpan = 3;

    const southEnd = openSouthEntrance ? rows - 1 : rows - 2;
    for (let r = Math.max(0, rows - 15); r <= southEnd; r++) {
      for (let c = southCol - halfSpan; c <= southCol + halfSpan; c++) {
        if (c >= 1 && c < cols - 1) grid[r][c] = false;
      }
    }

    const northStart = openNorthExit ? 0 : 2;
    for (let r = northStart; r < Math.min(rows, 15); r++) {
      for (let c = northCol - halfSpan; c <= northCol + halfSpan; c++) {
        if (c >= 1 && c < cols - 1) grid[r][c] = false;
      }
    }

    return grid;
  }

  /**
   * Detecção rigorosa de obstáculos por amostragem de pixels:
   * Árvores, casas, paredes, cercas, pedras/falésias e rios/lagos bloqueiam sempre,
   * mesmo nas bordas das células (sem ser sobrescritos pela grama ao redor).
   */
  private isRawCellObstacle(
    data: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    startX: number,
    startY: number,
    theme: 'forest' | 'cave' | 'boss'
  ): boolean {
    let water = 0;
    let tree = 0;
    let building = 0;
    let fence = 0;
    let rock = 0;
    let total = 0;

    const endX = Math.min(startX + RAW_CELL_SIZE, imgW);
    const endY = Math.min(startY + RAW_CELL_SIZE, imgH);

    for (let y = startY + 1; y < endY - 1; y += 2) {
      for (let x = startX + 1; x < endX - 1; x += 2) {
        const idx = (y * imgW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        total++;

        // 1. Rios, lagos e bordas d'água (azul dominante)
        if (b > r + 28 && b > g + 8 && b > 118 && r < 130) {
          water++;
          continue;
        }

        // 2. Tema de Caverna (map6, map7)
        if (theme === 'cave') {
          const isSand =
            r > 180 && g > 165 && b > 95 && Math.abs(r - g) < 30;
          const isCaveFloor =
            r >= 115 &&
            r <= 185 &&
            g >= 122 &&
            g <= 192 &&
            b >= 92 &&
            b <= 162 &&
            g >= r - 14;
          const isMoss = g > r + 12 && g > b + 10;
          if (isSand || isCaveFloor || isMoss) {
            continue;
          }
          if (
            (r > g + 14 && r > b + 16 && r > 95) ||
            (r < 110 && g < 92 && b < 92)
          ) {
            rock++;
          }
          continue;
        }

        // 3. Terrenos caminháveis explícitos em mapas de floresta/cidade:
        // - Grama baixa (verde-azulado claro típico de FireRed/LeafGreen: R~95, G~200, B~135)
        const isLightGrass =
          g >= 150 &&
          g > r + 42 &&
          b >= 95 &&
          b <= 168 &&
          g >= b + 28 &&
          r >= 65 &&
          r <= 135;

        // - Grama alta (folhas escuras/médias no chão sem tronco nem copa amarelada)
        const isTallGrass =
          g >= 105 &&
          g <= 175 &&
          r >= 35 &&
          r <= 95 &&
          b >= 55 &&
          b <= 120 &&
          g > r + 45 &&
          g > b + 22;

        // - Estrada de areia / terra amarelada
        const isDirtRoad =
          r >= 188 &&
          g >= 165 &&
          b >= 95 &&
          b <= 178 &&
          r >= g - 10 &&
          r - g <= 38 &&
          g > b + 24;

        // - Caminho branco/pedra clara (calçadas de map1, map2 e map4)
        const isWhiteRoad =
          r >= 182 &&
          g >= 190 &&
          b >= 195 &&
          Math.abs(r - g) <= 22 &&
          b >= r - 10 &&
          b - r <= 34;

        // - Flores vermelhas/laranjas pequenas no chão
        const isFlower =
          r > 195 && g >= 70 && g <= 155 && b >= 45 && b <= 120;

        if (
          isLightGrass ||
          isTallGrass ||
          isDirtRoad ||
          isWhiteRoad ||
          isFlower
        ) {
          continue;
        }

        // 4. Copas de árvores (verde-amarelado brilhante no topo ou sombra verde muito escura/tronco)
        const isTreeHighlight =
          g >= 128 && b < 96 && g - b >= 48 && r >= b + 8;
        const isTreeShadowOrTrunk =
          (g < 118 && b < 68 && r < 98) ||
          (r >= 70 && r <= 128 && g >= 52 && g <= 98 && b >= 28 && b <= 68 && r > b + 22);
        if (isTreeHighlight || isTreeShadowOrTrunk) {
          tree++;
          continue;
        }

        // 5. Cercas e placas de madeira
        if (
          r >= 115 &&
          r <= 195 &&
          g >= 65 &&
          g <= 138 &&
          b >= 45 &&
          b <= 112 &&
          r > g + 20 &&
          g >= b
        ) {
          fence++;
          continue;
        }

        // 6. Paredes rochosas, falésias marrons e pedras cinzas
        const isBrownCliff =
          r > g + 16 && g > b + 8 && r >= 95 && r <= 212 && b < 130;
        const isGreyRock =
          r >= 85 &&
          r <= 155 &&
          g >= 85 &&
          g <= 155 &&
          b >= 85 &&
          b <= 160 &&
          Math.abs(r - g) <= 16 &&
          Math.abs(g - b) <= 18;
        if (isBrownCliff || isGreyRock) {
          rock++;
          continue;
        }

        // 7. Telhados e fachadas de construções (vermelho, azul, amarelo-telha, cinza-azulado)
        const isRoofOrWall =
          (r > 160 && g < 105 && b < 105) ||
          (b > 142 && r < 120 && g < 170) ||
          (r > 155 && g > 120 && g < 172 && b < 98) ||
          (r >= 65 && r <= 145 && g >= 70 && g <= 148 && b >= 88 && b <= 165);
        if (isRoofOrWall) {
          building++;
        }
      }
    }

    if (total === 0) return false;

    const waterRatio = water / total;
    const treeRatio = tree / total;
    const rockRatio = rock / total;
    const buildingRatio = building / total;
    const fenceRatio = fence / total;
    const totalObstacleRatio =
      (water + tree + rock + building + fence) / total;

    if (theme === 'cave') {
      return waterRatio >= 0.18 || rockRatio >= 0.24;
    }

    // Limiares rigorosos: qualquer árvore, casa, parede, pedra, cerca ou rio bloqueia a célula!
    return (
      waterRatio >= 0.16 ||
      treeRatio >= 0.18 ||
      rockRatio >= 0.20 ||
      buildingRatio >= 0.18 ||
      fenceRatio >= 0.15 ||
      totalObstacleRatio >= 0.22
    );
  }

  private buildStaticZonesForMap(m: ActiveMapInstance): void {
    for (let r = 0; r < m.rows; r++) {
      let c = 0;
      while (c < m.cols) {
        if (!m.blockedGrid[r][c]) {
          c++;
          continue;
        }
        const startCol = c;
        while (c < m.cols && m.blockedGrid[r][c]) c++;
        const w = (c - startCol) * m.cellSize;
        const zone = this.scene.add.zone(
          m.x + startCol * m.cellSize + w / 2,
          m.y + r * m.cellSize + m.cellSize / 2,
          w,
          m.cellSize
        );
        this.scene.physics.add.existing(zone, true);
        this.obstacleGroup.add(zone);
        m.obstacleZones.push(zone);
      }
    }
    this.obstacleGroup.refresh();
  }

  private destroyMapObstacles(m: ActiveMapInstance): void {
    for (const zone of m.obstacleZones) {
      if (zone.body) {
        this.scene.physics.world.remove(
          zone.body as Phaser.Physics.Arcade.StaticBody
        );
      }
      this.obstacleGroup.remove(zone, true, true);
    }
    m.obstacleZones = [];
    this.obstacleGroup.refresh();
  }

  private renderDebugGrid(): void {
    this.debugGraphics.clear();
    if (!this.isDebugVisible) return;

    const maps = this.pendingNextMap
      ? [this.currentMap, this.pendingNextMap]
      : [this.currentMap];
    for (const m of maps) {
      for (let r = 0; r < m.rows; r++) {
        for (let c = 0; c < m.cols; c++) {
          if (!m.blockedGrid[r][c]) continue;
          const x = m.x + c * m.cellSize;
          const y = m.y + r * m.cellSize;
          this.debugGraphics.fillStyle(0xff2244, 0.36);
          this.debugGraphics.fillRect(x, y, m.cellSize, m.cellSize);
        }
      }
    }
    this.debugGraphics.lineStyle(2, 0x38bdf8, 0.9);
    for (const z of this.transitionWallZones) {
      this.debugGraphics.strokeRect(
        z.x - z.width / 2,
        z.y - z.height / 2,
        z.width,
        z.height
      );
    }
  }
}
