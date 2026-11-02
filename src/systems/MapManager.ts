import Phaser from 'phaser';
import {
  BOSS_MAP_DEFINITION,
  MAP_SEQUENCE,
  MapDefinition,
} from '../config/pokemonManifest';
import { DEPTH } from './depth';
import { MAP_LAYOUTS, NormalizedBox } from '../config/mapLayouts';

export type MapCellType = 'walkable' | 'water' | 'building' | 'boundary';

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

// MAP_LAYOUTS importado de '../config/mapLayouts' com caixas e zonas modulares precisas

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
  cellTypeGrid: MapCellType[][];
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

  
  public getCellTypeAt(worldX: number, worldY: number): MapCellType {
    const checkMap = (m: ActiveMapInstance | null): MapCellType | null => {
      if (!m) return null;
      if (
        worldX < m.x ||
        worldX >= m.x + m.width ||
        worldY < m.y ||
        worldY >= m.y + m.height
      ) {
        return null;
      }
      const c = Math.floor((worldX - m.x) / m.cellSize);
      const r = Math.floor((worldY - m.y) / m.cellSize);
      if (r >= 0 && r < m.rows && c >= 0 && c < m.cols) {
        return m.cellTypeGrid?.[r]?.[c] ?? 'walkable';
      }
      return null;
    };

    const cur = checkMap(this.currentMap);
    if (cur !== null) return cur;
    const nxt = checkMap(this.pendingNextMap);
    if (nxt !== null) return nxt;
    return 'boundary';
  }

  public update(_delta: number): void {
    // MapManager frame update
  }

  public isWaterAt(worldX: number, worldY: number): boolean {
    return this.getCellTypeAt(worldX, worldY) === 'water';
  }

  public isBuildingAt(worldX: number, worldY: number): boolean {
    return this.getCellTypeAt(worldX, worldY) === 'building';
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

  getBossArenaSpawns(): { playerSpawn: { x: number; y: number }; bossSpawn: { x: number; y: number } } {
    const bossMap = this.currentMap;
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
z.setData('obstacleType', 'boundary');
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
   * Verifica se a célula é caminhável e possui folga adequada para o corpo do jogador/inimigo.
   */
  private isCellAndNeighborsWalkable(
    m: ActiveMapInstance,
    row: number,
    col: number
  ): boolean {
    if (row < 1 || row >= m.rows - 1 || col < 1 || col >= m.cols - 1) {
      return false;
    }
    if (m.blockedGrid[row]?.[col]) {
      return false;
    }

    let freeNeighbors = 0;
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of dirs) {
      const r = row + dr;
      const c = col + dc;
      if (!m.blockedGrid[r]?.[c]) {
        freeNeighbors++;
      }
    }
    return freeNeighbors >= 4;
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
      ...(() => {
        const { blockedGrid, cellTypeGrid } = this.computeCleanCollisionGrid(
          pixels,
          rawW,
          rawH,
          fullRawH,
          def,
          cols,
          rows,
          southGateOpen,
          northGateOpen
        );
        return { blockedGrid, cellTypeGrid };
      })(),
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
        if (c >= 1 && c < m.cols - 1) { m.blockedGrid[r][c] = false; m.cellTypeGrid[r][c] = 'walkable'; }
      }
    }
    this.destroyMapObstacles(m);
    this.buildStaticZonesForMap(m);
  }

    private computeCleanCollisionGrid(
    data: Uint8ClampedArray,
    rawW: number,
    rawH: number,
    _fullRawH: number,
    def: MapDefinition,
    cols: number,
    rows: number,
    openSouthEntrance: boolean,
    openNorthExit: boolean
  ): { blockedGrid: boolean[][]; cellTypeGrid: MapCellType[][] } {
    const layout = MAP_LAYOUTS[def.key];
    const isDeterministic = layout?.deterministic === true;
    const solidBoxes = layout?.solidBoxes ?? [];
    const waterZones = layout?.waterZones ?? [];
    const bridgeZones = layout?.bridgeZones ?? [];
    const boundaryBoxes = layout?.boundaryBoxes ?? [];
    const walkableZones = layout?.walkableZones ?? [];

    const isInsideBox = (normX: number, normY: number, box: NormalizedBox) =>
      normX >= box.x0 && normX <= box.x1 && normY >= box.y0 && normY <= box.y1;

    if (def.theme === 'boss') {
      const cellTypeGrid: MapCellType[][] = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (__, c) => {
          if (c <= 1 || c >= cols - 2 || r <= 1 || r >= rows - 2) {
            return 'boundary';
          }
          const normX = ((c + 0.5) * RAW_CELL_SIZE) / rawW;
          const normY = ((r + 0.5) * RAW_CELL_SIZE) / rawH;
          for (const box of solidBoxes) {
            if (isInsideBox(normX, normY, box)) return 'building';
          }
          for (const bnd of boundaryBoxes) {
            if (isInsideBox(normX, normY, bnd)) return 'boundary';
          }
          if (walkableZones.length > 0) {
            for (const walk of walkableZones) {
              if (isInsideBox(normX, normY, walk)) return 'walkable';
            }
            return 'boundary';
          }
          const dx = normX - 0.5;
          const dy = (normY - 0.5) * 1.5;
          const insideArena = dx * dx + dy * dy <= 0.38 * 0.38;
          return insideArena ? 'walkable' : 'boundary';
        })
      );
      const blockedGrid = cellTypeGrid.map((row) => row.map((cell) => cell !== 'walkable'));
      return { blockedGrid, cellTypeGrid };
    }

    const cellTypeGrid: MapCellType[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (__, c) => {
        if (c <= 0 || c >= cols - 1) return 'boundary';
        if (r <= 0 && !openNorthExit) return 'boundary';
        if (r >= rows - 1 && !openSouthEntrance) return 'boundary';

        const normX = ((c + 0.5) * RAW_CELL_SIZE) / rawW;
        const normY = ((r + 0.5) * RAW_CELL_SIZE) / rawH;

        // 1. Pontes, píeres e escadas registradas são 100% livres para caminhar (SEM bodyblock)
        for (const bridge of bridgeZones) {
          if (isInsideBox(normX, normY, bridge)) {
            return 'walkable';
          }
        }
        for (const walk of walkableZones) {
          if (isInsideBox(normX, normY, walk)) {
            return 'walkable';
          }
        }

        // 2. Construções, cercas, estátuas e árvores grandes (bloqueiam terrestres/aquáticos, voadores passam!)
        for (const box of solidBoxes) {
          if (isInsideBox(normX, normY, box)) {
            return 'building';
          }
        }

        // 3. Paredes de caverna e falésias íngremes sem escada (bloqueiam todos)
        for (const bnd of boundaryBoxes) {
          if (isInsideBox(normX, normY, bnd)) {
            return 'boundary';
          }
        }

        // 4. Lagos, rios e mares (pokémons de água nadam, voadores voam, outros bloqueiam)
        for (const water of waterZones) {
          if (isInsideBox(normX, normY, water)) {
            return 'water';
          }
        }

        // 5. Perímetro extremo do mapa (2 tiles de margem externa)
        if (c <= 1 || c >= cols - 2 || r <= 1 || r >= rows - 2) {
          return 'boundary';
        }

        // 6. Se o layout é determinístico (gerado com coordenadas exatas 1:1), todo o restante
        // (gramas, grama alta, flores, caminhos, praias, piso de caverna) é 100% caminhável!
        if (isDeterministic) {
          return 'walkable';
        }

        return this.classifyRawCell(
          data,
          rawW,
          rawH,
          c * RAW_CELL_SIZE,
          r * RAW_CELL_SIZE,
          def.theme
        );
      })
    );

    const southCol = Math.floor(cols * def.southEntranceNormX);
    const northCol = Math.floor(cols * def.northExitNormX);
    const halfSpan = 3;

    const southEnd = openSouthEntrance ? rows - 1 : rows - 2;
    for (let r = Math.max(0, rows - 15); r <= southEnd; r++) {
      for (let c = southCol - halfSpan; c <= southCol + halfSpan; c++) {
        if (c >= 1 && c < cols - 1) cellTypeGrid[r][c] = 'walkable';
      }
    }

    const northStart = openNorthExit ? 0 : 2;
    for (let r = northStart; r < Math.min(rows, 15); r++) {
      for (let c = northCol - halfSpan; c <= northCol + halfSpan; c++) {
        if (c >= 1 && c < cols - 1) cellTypeGrid[r][c] = 'walkable';
      }
    }

    const blockedGrid = cellTypeGrid.map((row) => row.map((cell) => cell !== 'walkable'));
    return { blockedGrid, cellTypeGrid };
  }

  /**
   * Detecção pr  /**
   * Detecção precisa e revisada de células do mapa:
   * - Gramas de todos os tons, flores de qualquer cor, caminhos (terra, areia, cascalho, calçadas)
   *   e escadas (madeira, pedra de falésia) são 100% LIVRES para caminhar (SEM blockguard)!
   * - Árvores grandes (apenas copas/troncos densos) e construções possuem bodyblock para pokémons terrestres,
   *   mas pokémons voadores voam livremente por cima.
   * - Rios e lagos: pokémons do tipo água nadam (com animação), voadores voam, outros bloqueiam.
   * - Penhascos verticais e bordas extremas: boundary (bloqueia todos).
   */
  private classifyRawCell(
    data: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    startX: number,
    startY: number,
    theme: 'forest' | 'cave' | 'boss'
  ): MapCellType {
    let water = 0;
    let tree = 0;
    let building = 0;
    let rock = 0;
    let walkable = 0;
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

        // 1. Rios, lagos e corpos d'água (azul claramente predominante)
        if (b > r + 35 && b > g + 15 && b >= 125) {
          water++;
          continue;
        }

        // 2. Tema de Caverna (map6, map7)
        if (theme === 'cave') {
          const isCaveFloor =
            (r >= 95 && g >= 90 && b >= 65 && Math.abs(r - g) <= 40) ||
            (r >= 155 && g >= 140 && b >= 75) ||
            (g > r + 8 && g > b + 6);
          const isCaveStair =
            r >= 105 && r <= 195 && g >= 95 && g <= 180 && b <= 145;

          if (isCaveFloor || isCaveStair) {
            walkable++;
            continue;
          }
          if (r < 100 && g < 85 && b < 85) {
            rock++;
            continue;
          }
        }

        // 3. FLORES DE TODAS AS CORES (vermelhas, amarelas, azuis, rosas, brancas)
        // Devem ser 100% livres para caminhar (SEM blockguard)
        const isFlower =
          (r > 155 && r > g + 18) || // Vermelha / magenta / rosa
          (r > 165 && g > 140 && b < 130) || // Amarela / alaranjada
          (b > 155 && b > r + 25) || // Azul / ciano / lilás
          (r > 195 && g > 195 && b > 185); // Branca / creme claro

        if (isFlower) {
          walkable++;
          continue;
        }

        // 4. GRAMAS DE TODOS OS TONS (grama baixa, média, grama alta e matinhos)
        // Devem ser 100% livres para caminhar (SEM blockguard)
        const isGrass =
          (g >= 135 && (r >= 45 || b >= 85)) ||
          (g >= 110 && g >= r + 15 && g >= b - 10 && (r >= 45 || b >= 75)) ||
          (g >= 140 && g >= r - 10 && g >= b - 10);

        if (isGrass) {
          walkable++;
          continue;
        }

        // 5. CAMINHOS E ESTRADAS (terra batida, areia, cascalho, calçadas de pedra)
        // Devem ser 100% livres para caminhar (SEM blockguard)
        const isDirtRoad =
          r >= 135 &&
          g >= 115 &&
          b >= 60 &&
          r >= g - 20 &&
          r - g <= 55 &&
          g > b + 10;

        const isCityRoad =
          r >= 140 &&
          g >= 140 &&
          b >= 140 &&
          Math.abs(r - g) <= 35 &&
          Math.abs(g - b) <= 35;

        if (isDirtRoad || isCityRoad) {
          walkable++;
          continue;
        }

        // 6. ESCADAS E DEGRAUS (madeira, pedra esculpida em falésias)
        // Devem ser 100% livres para caminhar (SEM blockguard)
        const isWoodStair =
          r >= 125 &&
          r <= 220 &&
          g >= 80 &&
          g <= 180 &&
          b >= 35 &&
          b <= 135 &&
          r > g + 12;

        const isStoneStair =
          r >= 85 &&
          r <= 180 &&
          g >= 80 &&
          g <= 175 &&
          b >= 70 &&
          b <= 170 &&
          Math.abs(r - g) <= 22 &&
          Math.abs(g - b) <= 25;

        if (isWoodStair || isStoneStair) {
          walkable++;
          continue;
        }

        // 7. ÁRVORES GRANDES (apenas o miolo/tronco de árvores grandes maciças)
        // Bloqueiam pokémons terrestres, mas pokémons voadores passam por cima!
        const isTreeCanopy =
          r <= 42 && g <= 145 && b <= 80 && g >= r + 25 && g >= b + 10;
        const isTreeTrunk =
          r >= 60 && r <= 145 && g >= 25 && g <= 85 && b <= 55 && r > g + 25;
        const isTreeShadow = r <= 38 && g <= 50 && b <= 38;

        if (isTreeCanopy || isTreeTrunk || isTreeShadow) {
          tree++;
          continue;
        }

        // 8. Telhados de casas e construções (voadores passam por cima, terrestres bloqueiam)
        const isRedRoof = r > 165 && g < 95 && b < 95;
        const isBlueRoof = b > 160 && r < 100 && g < 150;
        if (isRedRoof || isBlueRoof) {
          building++;
          continue;
        }

        // 9. Paredes rochosas verticais e penhascos intransponíveis
        const isCliff =
          r > g + 22 && g > b + 12 && r >= 95 && r <= 220 && b < 105;
        if (isCliff) {
          rock++;
          continue;
        }
      }
    }

    if (total === 0) return 'walkable';

    const walkableRatio = walkable / total;
    const waterRatio = water / total;
    const treeRatio = tree / total;
    const buildingRatio = building / total;
    const rockRatio = rock / total;

    // 1. Regra prioritária de fluidez: Se há pelo menos 20% de área caminhável
    // (grama, flor, caminho ou escada), a célula é 100% LIVRE (walkable) e NUNCA gera blockguard!
    if (walkableRatio >= 0.20) {
      return 'walkable';
    }

    // 2. Corpos d'água (pokémons de água nadam, voadores voam, outros bloqueiam)
    if (waterRatio >= 0.35) {
      return 'water';
    }

    // 3. Árvores grandes e construções sólidas (voadores voam por cima, terrestres têm bodyblock)
    if (treeRatio >= 0.45 || buildingRatio >= 0.35) {
      return 'building';
    }

    // 4. Falésias verticais intransponíveis e paredes de caverna (boundary: bloqueia todos)
    if (rockRatio >= 0.45) {
      return 'boundary';
    }

    // 5. Padrão seguro para áreas abertas
    return 'walkable';
  }

  private buildStaticZonesForMap(m: ActiveMapInstance): void {
    for (let r = 0; r < m.rows; r++) {
      let c = 0;
      while (c < m.cols) {
        const type = m.cellTypeGrid[r][c];
        if (type === 'walkable') {
          c++;
          continue;
        }
        const startCol = c;
        while (c < m.cols && m.cellTypeGrid[r][c] === type) {
          c++;
        }
        const w = (c - startCol) * m.cellSize;
        const zone = this.scene.add.zone(
          m.x + startCol * m.cellSize + w / 2,
          m.y + r * m.cellSize + m.cellSize / 2,
          w,
          m.cellSize
        );
        zone.setData('obstacleType', type);
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
