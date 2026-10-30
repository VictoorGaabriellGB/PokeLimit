import Phaser from 'phaser';
import {
  BOSS_MAP_DEFINITION,
  MAP_SEQUENCE,
  MapDefinition,
} from '../config/pokemonManifest';
import { DEPTH } from './depth';

const RAW_CELL_SIZE = 16;
const PORTAL_TRIGGER_RADIUS = 44;

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
}

export class MapManager {
  private scene: Phaser.Scene;
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup;

  private currentMap!: ActiveMapInstance;
  private portalContainer: Phaser.GameObjects.Container | null = null;
  private portalPosition: { x: number; y: number } | null = null;
  private isTransitioning = false;
  private isInBossArena = false;

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
    this.isInBossArena = false;
    this.isTransitioning = false;
    this.mapsCleared = 0;

    this.currentMap = this.createMapInstance(MAP_SEQUENCE[0], 0);
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

  getInitialSpawnPoint(): { x: number; y: number } {
    const m = this.currentMap;
    return this.findNearestWalkablePosition(
      m.x + m.width * m.def.initialSpawnNorm.x,
      m.y + m.height * m.def.initialSpawnNorm.y
    );
  }

  isNextMapGateOpen(): boolean {
    return this.portalPosition !== null;
  }

  isBossMapActive(): boolean {
    return this.isInBossArena;
  }

  getIsTransitioning(): boolean {
    return this.isTransitioning;
  }

  getTransitionTarget(_playerY: number): {
    x: number;
    y: number;
    passedSeam: boolean;
  } {
    if (this.portalPosition) {
      return {
        x: this.portalPosition.x,
        y: this.portalPosition.y,
        passedSeam: false,
      };
    }
    const m = this.currentMap;
    return {
      x: m.x + m.width * m.def.exitPortalNorm.x,
      y: m.y + m.height * m.def.exitPortalNorm.y,
      passedSeam: false,
    };
  }

  /**
   * Quando o tempo do mapa termina, abre o Portal de Passagem na saída do mapa atual!
   */
  spawnNextConnectedMap(): MapDefinition {
    const nextIndex = (this.currentMap.index + 1) % MAP_SEQUENCE.length;
    const nextDef =
      this.currentMap.index === MAP_SEQUENCE.length - 1
        ? BOSS_MAP_DEFINITION
        : MAP_SEQUENCE[nextIndex];

    if (this.portalPosition) return nextDef;

    const m = this.currentMap;
    const rawTargetX = m.x + m.width * m.def.exitPortalNorm.x;
    const rawTargetY = m.y + m.height * m.def.exitPortalNorm.y;
    const safePortalPos = this.findNearestWalkablePosition(
      rawTargetX,
      rawTargetY
    );

    this.portalPosition = safePortalPos;
    this.createPortalVisual(safePortalPos.x, safePortalPos.y, nextDef.name);

    return nextDef;
  }

  /**
   * Verifica se o jogador entrou no Portal de Passagem para iniciar a transição suave.
   */
  checkPlayerEnteredPortal(
    playerX: number,
    playerY: number,
    onTransitionComplete: (
      newMapDef: MapDefinition,
      newSpawnPos: { x: number; y: number },
      enteredBossArena: boolean
    ) => void
  ): boolean {
    if (!this.portalPosition || this.isTransitioning) return false;

    const dist = Phaser.Math.Distance.Between(
      playerX,
      playerY,
      this.portalPosition.x,
      this.portalPosition.y
    );

    if (dist <= PORTAL_TRIGGER_RADIUS) {
      const isLastMap = this.currentMap.index >= MAP_SEQUENCE.length - 1;
      if (isLastMap) {
        this.transitionToBossArena((bossMap, spawnPos) => {
          onTransitionComplete(bossMap, spawnPos, true);
        });
      } else {
        const nextIndex = this.currentMap.index + 1;
        this.performSmoothMapSwap(
          MAP_SEQUENCE[nextIndex],
          nextIndex,
          false,
          (newDef, spawnPos) => {
            onTransitionComplete(newDef, spawnPos, false);
          }
        );
      }
      return true;
    }

    return false;
  }

  /**
   * Transição direta para a Arena Final do Boss Onix (map5-BOSS.jpeg).
   */
  transitionToBossArena(
    onComplete: (
      bossMapDef: MapDefinition,
      playerSpawn: { x: number; y: number }
    ) => void
  ): void {
    if (this.isInBossArena || this.isTransitioning) return;
    this.performSmoothMapSwap(
      BOSS_MAP_DEFINITION,
      MAP_SEQUENCE.length,
      true,
      onComplete
    );
  }

  private performSmoothMapSwap(
    targetDef: MapDefinition,
    targetIndex: number,
    isBoss: boolean,
    onComplete: (
      newDef: MapDefinition,
      spawnPos: { x: number; y: number }
    ) => void
  ): void {
    this.isTransitioning = true;
    this.clearPortalVisual();

    const cam = this.scene.cameras.main;
    cam.fadeOut(320, 8, 14, 26);

    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const oldMap = this.currentMap;
      this.destroyMapObstacles(oldMap);
      oldMap.image.destroy();

      this.isInBossArena = isBoss;
      this.mapsCleared++;

      this.currentMap = this.createMapInstance(targetDef, targetIndex);
      this.applySingleMapWorldBounds(this.currentMap);

      const spawnPos = this.getInitialSpawnPoint();
      this.renderDebugGrid();

      cam.fadeIn(380, 8, 14, 26);
      this.scene.time.delayedCall(380, () => {
        this.isTransitioning = false;
      });

      onComplete(targetDef, spawnPos);
    });
  }

  private createPortalVisual(x: number, y: number, nextMapName: string): void {
    this.clearPortalVisual();

    const outerRing = this.scene.add
      .circle(0, 0, 34, 0x38bdf8, 0.25)
      .setStrokeStyle(3, 0x7dd3fc, 0.95);

    const innerRing = this.scene.add
      .circle(0, 0, 22, 0xfef08a, 0.35)
      .setStrokeStyle(2.5, 0xffcb05, 1);

    const core = this.scene.add.circle(0, 0, 10, 0xffffff, 0.9);

    const label = this.scene.add
      .text(0, -44, `🌀 PORTAL: ${nextMapName.split('-')[0].trim()}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffcb05',
        backgroundColor: '#091326ee',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5);

    this.portalContainer = this.scene.add
      .container(x, y, [outerRing, innerRing, core, label])
      .setDepth(DEPTH.EFFECTS - 5);

    this.scene.tweens.add({
      targets: outerRing,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 0.1,
      yoyo: true,
      repeat: -1,
      duration: 650,
    });

    this.scene.tweens.add({
      targets: innerRing,
      scaleX: 0.8,
      scaleY: 0.8,
      yoyo: true,
      repeat: -1,
      duration: 480,
    });
  }

  private clearPortalVisual(): void {
    this.portalPosition = null;
    if (this.portalContainer) {
      this.portalContainer.destroy();
      this.portalContainer = null;
    }
  }

  toggleDebug(): boolean {
    this.isDebugVisible = !this.isDebugVisible;
    this.renderDebugGrid();
    return this.isDebugVisible;
  }

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
      x: Phaser.Math.Clamp(worldX, m.x + 64, m.x + m.width - 64),
      y: Phaser.Math.Clamp(worldY, m.y + 64, m.y + m.height - 64),
    };
  }

  private isCellAndNeighborsWalkable(
    m: ActiveMapInstance,
    row: number,
    col: number
  ): boolean {
    if (m.blockedGrid[row]?.[col]) return false;
    let free = 0;
    if (!m.blockedGrid[row + 1]?.[col]) free++;
    if (!m.blockedGrid[row - 1]?.[col]) free++;
    if (!m.blockedGrid[row]?.[col + 1]) free++;
    if (!m.blockedGrid[row]?.[col - 1]) free++;
    return free >= 3;
  }

  private applySingleMapWorldBounds(m: ActiveMapInstance): void {
    this.scene.physics.world.setBounds(m.x, m.y, m.width, m.height);
    this.scene.cameras.main.setBounds(m.x, m.y, m.width, m.height);
  }

  private createMapInstance(
    def: MapDefinition,
    index: number
  ): ActiveMapInstance {
    const tex = this.scene.textures
      .get(def.key)
      .getSourceImage() as HTMLImageElement;
    const rawW = tex.width;
    const rawH = tex.height;

    const canvas = document.createElement('canvas');
    canvas.width = rawW;
    canvas.height = rawH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(tex, 0, 0);
    const pixels = ctx.getImageData(0, 0, rawW, rawH).data;

    const image = this.scene.add
      .image(0, 0, def.key)
      .setOrigin(0, 0)
      .setScale(def.worldScale)
      .setDepth(DEPTH.MAP);

    const cols = Math.ceil(rawW / RAW_CELL_SIZE);
    const rows = Math.ceil(rawH / RAW_CELL_SIZE);

    const instance: ActiveMapInstance = {
      def,
      index,
      image,
      x: 0,
      y: 0,
      width: Math.round(rawW * def.worldScale),
      height: Math.round(rawH * def.worldScale),
      cellSize: RAW_CELL_SIZE * def.worldScale,
      cols,
      rows,
      blockedGrid: this.computeCleanCollisionGrid(
        pixels,
        rawW,
        rawH,
        def,
        cols,
        rows
      ),
      obstacleZones: [],
    };

    this.buildStaticZonesForMap(instance);
    return instance;
  }

  private computeCleanCollisionGrid(
    data: Uint8ClampedArray,
    rawW: number,
    rawH: number,
    def: MapDefinition,
    cols: number,
    rows: number
  ): boolean[][] {
    // Caso especial: Arena do Boss (map5-BOSS.jpeg)
    if (def.theme === 'boss') {
      return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (__, c) => {
          const normX = c / cols;
          const normY = r / rows;
          // Bloqueia o altar superior do Brock, as colunas de pedra laterais e a escada inferior
          return normY < 0.33 || normY > 0.83 || normX < 0.12 || normX > 0.88;
        })
      );
    }

    const rawGrid: boolean[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (__, c) =>
        this.isRawCellObstacle(
          data,
          rawW,
          rawH,
          c * RAW_CELL_SIZE,
          r * RAW_CELL_SIZE,
          def.theme
        )
      )
    );

    const cleaned = rawGrid.map((row) => [...row]);

    // No Mapa 3, garante que a fileira de árvores e a guarita na parte inferior (y >= 0.71)
    // fiquem 100% bloqueadas para o jogador ficar na área superior (conforme foto 1 anexada)
    if (def.key === 'map3') {
      const barrierRow = Math.floor(rows * 0.71);
      for (let r = barrierRow; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cleaned[r][c] = true;
        }
      }
    }

    // No Mapa 4, garante que a guarita inferior (y >= 0.76) também fique 100% bloqueada
    // logo abaixo de onde o Raichu nasce (y = 0.715, conforme foto 2 anexada)
    if (def.key === 'map4') {
      const southHouseRow = Math.floor(rows * 0.76);
      for (let r = southHouseRow; r < rows; r++) {
        for (let c = Math.floor(cols * 0.34); c <= Math.floor(cols * 0.52); c++) {
          cleaned[r][c] = true;
        }
      }
    }

    // Garante que uma área de 3x3 células no ponto exato de spawn do jogador esteja sempre livre
    const spawnCol = Math.floor(cols * def.initialSpawnNorm.x);
    const spawnRow = Math.floor(rows * def.initialSpawnNorm.y);
    for (let r = spawnRow - 1; r <= spawnRow + 1; r++) {
      for (let c = spawnCol - 1; c <= spawnCol + 1; c++) {
        if (r >= 1 && r < rows - 1 && c >= 1 && c < cols - 1) {
          cleaned[r][c] = false;
        }
      }
    }

    return cleaned;
  }

  /**
   * Detector preciso em blocos de 16x16 que bloqueia Árvores, Cercas, Casas, Telhados,
   * Guaritas, Falésias e Água, mantendo Grama, Grama Alta, Areia e Calçadas livres.
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
    let treeCrown = 0;
    let treeDark = 0;
    let buildingOrRoof = 0;
    let fenceOrOutline = 0;
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

        // 1. ÁGUA (Azul de lagos, rios e poças)
        if (b > r + 26 && b > g + 8 && b > 120 && r < 125) {
          water++;
          continue;
        }

        if (theme === 'cave') {
          const isSand =
            r > 185 && g > 170 && b > 100 && Math.abs(r - g) < 28;
          const isFloor =
            r >= 118 &&
            r <= 182 &&
            g >= 125 &&
            g <= 190 &&
            b >= 95 &&
            b <= 158 &&
            g >= r - 12;
          const isMoss = g > r + 12 && g > b + 10;
          if (!isSand && !isFloor && !isMoss) {
            if (
              (r > g + 13 && r > b + 15 && r > 100) ||
              (r < 108 && g < 92 && b < 92)
            ) {
              rock++;
            }
          }
          continue;
        }

        // === TEMA FLORESTA E VILA (map1, map2, map3, map4) ===

        // Grama baixa e Grama alta (verde-esmeralda frio: B >= 68 e G bem maior que R)
        const isEmeraldGrass =
          g >= 92 && g > r + 32 && b >= 68 && g >= b + 15 && r < 138;
        if (isEmeraldGrass) {
          continue;
        }

        // Caminho de areia/terra amarelada
        const isDirtRoad =
          r >= 196 && g >= 180 && b >= 110 && b <= 190 && Math.abs(r - g) <= 40;
        if (isDirtRoad) {
          continue;
        }

        // Flores pequenas vermelhas/laranjas no meio da grama (caminháveis)
        const isFlowerPetal =
          r > 190 && g >= 70 && g <= 150 && b >= 45 && b <= 115;
        if (isFlowerPetal) {
          continue;
        }

        // Copa de árvore verde-amarelada vibrante
        if (g >= 138 && b < 96 && g - b >= 60 && r > b + 10) {
          treeCrown++;
          continue;
        }

        // Sombra profunda de árvore / tronco
        if (g < 118 && b < 66 && r < 88) {
          treeDark++;
          continue;
        }

        // Cercas de madeira marrons e contornos estruturais escuros (casas, cercas, placas, pedras)
        const isWoodFence =
          r >= 115 &&
          r <= 195 &&
          g >= 68 &&
          g <= 145 &&
          b >= 45 &&
          b <= 112 &&
          r > g + 16 &&
          g >= b;
        const isDarkStructureOutline = r < 92 && g < 96 && b < 102;
        if (isWoodFence || isDarkStructureOutline) {
          fenceOrOutline++;
          continue;
        }

        // Falésias / rochas marrons (map2 e monte do map4)
        if (r > g + 18 && g > b + 8 && r >= 98 && r <= 212 && b < 128) {
          rock++;
          continue;
        }

        // Telhados de casas, laboratório e guaritas (vermelho, azul, dourado, ardósia/metal)
        const isRedRoof = r > 160 && g < 105 && b < 105;
        const isBlueRoof = b > 148 && r < 115 && g < 168;
        const isGoldRoof = r > 155 && g > 120 && g < 172 && b < 100;
        const isSlateMetalRoof =
          r >= 95 &&
          r <= 168 &&
          g >= 105 &&
          g <= 178 &&
          b >= 122 &&
          b <= 198 &&
          b >= r + 10;

        if (isRedRoof || isBlueRoof || isGoldRoof || isSlateMetalRoof) {
          buildingOrRoof++;
        }
      }
    }

    if (total === 0) return false;

    const waterRatio = water / total;
    if (theme === 'cave') {
      return waterRatio >= 0.25 || rock / total >= 0.34;
    }

    const treeRatio = (treeCrown + treeDark) / total;
    const rockRatio = rock / total;
    const buildingRatio = buildingOrRoof / total;
    const fenceRatio = fenceOrOutline / total;

    return (
      waterRatio >= 0.20 ||
      treeRatio >= 0.22 ||
      rockRatio >= 0.26 ||
      buildingRatio >= 0.25 ||
      fenceRatio >= 0.14 ||
      treeRatio + fenceRatio + buildingRatio >= 0.26
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

    const m = this.currentMap;
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
}
