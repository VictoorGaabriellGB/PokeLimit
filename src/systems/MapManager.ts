import Phaser from 'phaser';
import {
  BOSS_MAP_DEFINITION,
  MAP_SEQUENCE,
  MapDefinition,
} from '../config/pokemonManifest';
import { DEPTH } from './depth';
import {
  buildVariantBodyblockGrid,
  TileCollisionType,
} from '../config/variantMapLayouts';
import { MAP_LAYOUTS, NormalizedBox } from '../config/mapLayouts';

export type MapCellType = 'walkable' | 'water' | 'building' | 'boundary';

const RAW_CELL_SIZE = 16;

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

export class MapManager {
  private scene: Phaser.Scene;
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup;
  private infiniteObstacleZones: Phaser.GameObjects.Zone[] = [];

  // Pool de 9 imagens (Grid 3x3) para cobrir a visão da câmera infinitamente
  private mapChunks: Phaser.GameObjects.Image[] = [];
  private chunkWidth = 1280;
  private chunkHeight = 1280;

  private currentMap!: ActiveMapInstance;
  private currentMapIndex = 0;
  private bossArenaActive = false;

  private currentVariantGrid: TileCollisionType[][] = [];
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

    // 6 Novos Mapas Modulares (Sem bordas de árvores fechadas)
    scene.load.image('map1_var', 'assets/maps/map1_var.jpeg');
    scene.load.image('map2_var', 'assets/maps/map2_var.jpeg');
    scene.load.image('map3_var', 'assets/maps/map3_var.jpeg');
    scene.load.image('map4_var', 'assets/maps/map4_var.jpeg');
    scene.load.image('map5_var', 'assets/maps/map5_var.jpeg');
    scene.load.image('map6_var', 'assets/maps/map6_var.jpeg');

    // Sprites de cenário e terreno para suavizar emendas e decorar passagens
    scene.load.image('tex_gramas', 'assets/spritesguias/gramas.jpeg');
    scene.load.image('tex_arvores', 'assets/spritesguias/arvores.jpeg');
    scene.load.image('tex_pedras', 'assets/spritesguias/pedras.jpeg');
    scene.load.image('tex_agua_efeitos', 'assets/spritesguias/spritesaguaeefeitos.jpeg');
    scene.load.image('tex_cenario', 'assets/spritesguias/spritescenario.jpeg');
    scene.load.image('tex_construcoes', 'assets/spritesguias/spritescenarioeconstrucoes.jpeg');
  }

  init(): void {
    this.obstacleGroup = this.scene.physics.add.staticGroup();
    this.debugGraphics = this.scene.add.graphics().setDepth(DEPTH.DEBUG);
    this.bossArenaActive = false;
    this.currentMapIndex = 0;

    // Inicializa o primeiro mapa em modo Infinito (Seamless 3x3)
    this.setupInfiniteMap(0);
  }

  // ===================== SISTEMA DE MAPA INFINITO (SEM FLIP & SEM BORDAS DE ÁRVORES) =====================

  private readonly BORDER_TRIM_RATIO = 0.085;

  /**
   * Gera uma textura limpa em memória recortando as árvores da borda do mapX.jpeg
   * e suavizando as extremidades com cores de grama/pedra do próprio bioma.
   */
  private getOrCreateBorderlessMapTexture(mapIndex: number): string {
    const def = MAP_SEQUENCE[Phaser.Math.Clamp(mapIndex, 0, MAP_SEQUENCE.length - 1)];
    const rawKey = def.key;
    const seamlessKey = `${rawKey}_seamless`;

    if (this.scene.textures.exists(seamlessKey)) {
      const frame = this.scene.textures.getFrame(seamlessKey);
      this.chunkWidth = Math.round(frame.width * def.worldScale);
      this.chunkHeight = Math.round(frame.height * def.worldScale);
      return seamlessKey;
    }

    const sourceImg = this.scene.textures.get(rawKey).getSourceImage() as HTMLImageElement;
    const srcW = sourceImg.width;
    const srcH = sourceImg.height;

    // Mapas subterrâneos (6 e 7) e cidade (4) usam recorte menor; florestas (1, 2, 3) recortam mais árvores
    const trimRatio = (mapIndex === 0 || mapIndex === 1 || mapIndex === 2) ? this.BORDER_TRIM_RATIO : 0.055;
    const trimX = Math.floor(srcW * trimRatio);
    const trimY = Math.floor(srcH * trimRatio);

    const croppedW = srcW - trimX * 2;
    const croppedH = srcH - trimY * 2;

    this.chunkWidth = Math.round(croppedW * def.worldScale);
    this.chunkHeight = Math.round(croppedH * def.worldScale);

    const canvasTex = this.scene.textures.createCanvas(seamlessKey, croppedW, croppedH);
    if (!canvasTex) return rawKey;

    const ctx = canvasTex.getContext();

    // 1. Desenha apenas o miolo útil do mapa (sem o paredão de árvores das bordas!)
    ctx.drawImage(
      sourceImg,
      trimX,
      trimY,
      croppedW,
      croppedH,
      0,
      0,
      croppedW,
      croppedH
    );

    // 2. Suaviza os 24px extremos de cada borda espelhando apenas uma micro-faixa de grama/chão
    // Isso faz com que a borda esquerda case perfeitamente com a direita sem inverter o mapa!
    const blendSize = 24;

    // Faixa de transição Horizontal (Direita suave com Esquerda)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(sourceImg, trimX, trimY, blendSize, croppedH, croppedW - blendSize, 0, blendSize, croppedH);
    ctx.drawImage(sourceImg, srcW - trimX - blendSize, trimY, blendSize, croppedH, 0, 0, blendSize, croppedH);

    // Faixa de transição Vertical (Topo suave com Base)
    ctx.drawImage(sourceImg, trimX, trimY, croppedW, blendSize, 0, croppedH - blendSize, croppedW, blendSize);
    ctx.drawImage(sourceImg, trimX, srcH - trimY - blendSize, croppedW, blendSize, 0, 0, croppedW, blendSize);
    ctx.restore();

    canvasTex.refresh();
    return seamlessKey;
  }

  /**
   * Remove as colisões de árvores da moldura externa para que a passagem entre
   * um chunk e outro seja 100% aberta, preservando os obstáculos internos.
   */
  private stripOuterBorderCollisions(mapIndex: number): void {
    const m = this.currentMap;
    if (!m || !m.cellTypeGrid) return;

    const rows = m.rows;
    const cols = m.cols;

    const trimRatio = (mapIndex <= 2) ? this.BORDER_TRIM_RATIO : 0.055;
    const borderRows = Math.max(2, Math.ceil(rows * trimRatio));
    const borderCols = Math.max(2, Math.ceil(cols * trimRatio));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isOuterMargin =
          r < borderRows ||
          r >= rows - borderRows ||
          c < borderCols ||
          c >= cols - borderCols;

        if (isOuterMargin) {
          const type = m.cellTypeGrid[r][c];
          if (type === 'building' || type === 'boundary') {
            m.cellTypeGrid[r][c] = 'walkable';
            m.blockedGrid[r][c] = false;
          }
        }
      }
    }
  }

  /**
   * Inicializa o mapa infinito (Grid 3x3) SEM espelhar os mapas e SEM limites de borda
   */
  public setupInfiniteMap(mapIndex: number): void {
    this.bossArenaActive = false;
    this.currentMapIndex = Phaser.Math.Clamp(mapIndex, 0, MAP_SEQUENCE.length - 1);
    this.mapsCleared = this.currentMapIndex;
    const def = MAP_SEQUENCE[this.currentMapIndex];

    // Chaves dos 6 novos mapas modulares (Mapa 6 e 7 compartilham o estilo de Caverna/Ruínas)
    const newMapKeys = [
      'map1_var',
      'map2_var',
      'map3_var',
      'map4_var',
      'map5_var',
      'map6_var',
      'map6_var',
    ];

    const idx = Phaser.Math.Clamp(this.currentMapIndex, 0, 6);
    const hasVariant = this.scene.textures.exists(newMapKeys[idx]);
    const chosenKey = hasVariant ? newMapKeys[idx] : this.getOrCreateBorderlessMapTexture(this.currentMapIndex);

    // Carrega a matriz 32x32 de Bodyblock exata para o mapa atual
    this.currentVariantGrid = buildVariantBodyblockGrid(idx);

    // Dimensões do chunk padronizadas para os novos mapas modulares
    this.chunkWidth = 1280;
    this.chunkHeight = 1280;

    // Limpa mapa anterior se houver
    if (this.currentMap && this.currentMap.image) {
      this.currentMap.image.destroy();
    }
    this.clearInfiniteObstacles();

    // Cria a instância base com dados de colisão
    this.currentMap = this.createMapInstance(def, this.currentMapIndex, 0, 0, false, false);
    this.currentMap.image.setVisible(false);

    if (!hasVariant) {
      this.stripOuterBorderCollisions(this.currentMapIndex);
    }

    // Cria os 9 quadrantes (Grid 3x3) SEM NUNCA ESPELHAR!
    if (this.mapChunks.length === 0) {
      for (let i = 0; i < 9; i++) {
        const img = this.scene.add
          .image(0, 0, chosenKey)
          .setOrigin(0, 0)
          .setDisplaySize(this.chunkWidth, this.chunkHeight)
          .setDepth(DEPTH.MAP)
          .setFlip(false, false); // Mantém orientação original 100%!
        this.mapChunks.push(img);
      }
    } else {
      for (const chunk of this.mapChunks) {
        chunk.setTexture(chosenKey);
        chunk.setDisplaySize(this.chunkWidth, this.chunkHeight);
        chunk.setFlip(false, false);
        chunk.setVisible(true);
      }
    }

    // Retira completamente os limites físicos e de câmera para o mapa infinito
    this.scene.physics.world.setBounds(-10000000, -10000000, 20000000, 20000000);
    this.scene.cameras.main.removeBounds();

    const spawn = this.getInitialSpawnPoint();
    this.update(spawn.x, spawn.y);
  }

  /**
   * Atualiza a posição dos 9 quadrantes ao redor do jogador (Sem Flip!)
   */
  public update(playerX: number, playerY: number): void {
    if (this.bossArenaActive || this.mapChunks.length === 0) return;

    const centerChunkX = Math.floor(playerX / this.chunkWidth);
    const centerChunkY = Math.floor(playerY / this.chunkHeight);

    let index = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = centerChunkX + dx;
        const cy = centerChunkY + dy;

        const chunk = this.mapChunks[index++];
        chunk.setPosition(cx * this.chunkWidth, cy * this.chunkHeight);
        chunk.setFlip(false, false); // Mantém todos os lados na direção correta
      }
    }

    if (this.isDebugVisible) {
      this.renderDebugGrid(playerX, playerY);
    }
  }

  private clearInfiniteObstacles(): void {
    for (const zone of this.infiniteObstacleZones) {
      if (zone.body) {
        this.scene.physics.world.remove(zone.body as Phaser.Physics.Arcade.StaticBody);
      }
      this.obstacleGroup.remove(zone, true, true);
    }
    this.infiniteObstacleZones = [];
    this.obstacleGroup.refresh();
  }

  // ===================== CONSULTAS DE TERRENO =====================

  /**
   * Lê o tipo de terreno no mapLayouts.json em qualquer coordenada positiva ou negativa
   * do mapa infinito, compensando o recorte das árvores da borda e sem inversão de eixo.
   */
  public getCellTypeAt(worldX: number, worldY: number): MapCellType {
    if (this.bossArenaActive) {
      const m = this.currentMap;
      if (!m) return 'boundary';
      if (
        worldX < m.x ||
        worldX >= m.x + m.width ||
        worldY < m.y ||
        worldY >= m.y + m.height
      ) {
        return 'boundary';
      }
      const c = Math.floor((worldX - m.x) / m.cellSize);
      const r = Math.floor((worldY - m.y) / m.cellSize);
      if (r >= 0 && r < m.rows && c >= 0 && c < m.cols) {
        return m.cellTypeGrid?.[r]?.[c] ?? 'walkable';
      }
      return 'boundary';
    }

    // Se temos a matriz 32x32 de Bodyblock dos novos mapas modulares
    if (this.currentVariantGrid && this.currentVariantGrid.length > 0) {
      const rows = this.currentVariantGrid.length;
      const cols = this.currentVariantGrid[0].length;

      // Converte coordenada global infinita (positiva ou negativa) para 0.0 .. 1.0 dentro do chunk
      const localU = (((worldX % this.chunkWidth) + this.chunkWidth) % this.chunkWidth) / this.chunkWidth;
      const localV = (((worldY % this.chunkHeight) + this.chunkHeight) % this.chunkHeight) / this.chunkHeight;

      const col = Phaser.Math.Clamp(Math.floor(localU * cols), 0, cols - 1);
      const row = Phaser.Math.Clamp(Math.floor(localV * rows), 0, rows - 1);

      const val = this.currentVariantGrid[row][col];
      if (val === 1) return 'building'; // Sólido / Bodyblock (Casas, cercas, árvores, falésias)
      if (val === 2) return 'water';    // Água (Lagos, mar, poças)
      return 'walkable';                // Livre
    }

    const m = this.currentMap;
    if (!m) return 'walkable';

    const localU = (((worldX % this.chunkWidth) + this.chunkWidth) % this.chunkWidth) / this.chunkWidth;
    const localV = (((worldY % this.chunkHeight) + this.chunkHeight) % this.chunkHeight) / this.chunkHeight;

    const col = Phaser.Math.Clamp(Math.floor(localU * m.cols), 0, m.cols - 1);
    const row = Phaser.Math.Clamp(Math.floor(localV * m.rows), 0, m.rows - 1);

    return m.cellTypeGrid?.[row]?.[col] ?? 'walkable';
  }

  /**
   * Verifica se a coordenada (worldX, worldY) bloqueia o movimento físico do Pokémon atual.
   */
  public isTerrainBlocked(
    worldX: number,
    worldY: number,
    player?: { canSwim(): boolean; canFly(): boolean }
  ): boolean {
    if (this.bossArenaActive) {
      return this.isOutOfArenaBounds(worldX, worldY);
    }

    if (player?.canFly()) {
      return false;
    }

    const tile = this.getCellTypeAt(worldX, worldY);

    if (tile === 'water') {
      return !player?.canSwim();
    }

    if (tile === 'building' || tile === 'boundary') {
      return true;
    }

    return false;
  }

  public isOutOfArenaBounds(worldX: number, worldY: number): boolean {
    if (!this.bossArenaActive || !this.currentMap) return false;
    const m = this.currentMap;
    const margin = 48;
    return (
      worldX < m.x + margin ||
      worldX > m.x + m.width - margin ||
      worldY < m.y + margin ||
      worldY > m.y + m.height - margin
    );
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

  getChunkWidth(): number {
    return this.chunkWidth;
  }

  getChunkHeight(): number {
    return this.chunkHeight;
  }

  isBossMapActive(): boolean {
    return this.bossArenaActive;
  }

  getInitialSpawnPoint(): { x: number; y: number } {
    const rawX = this.chunkWidth * 0.5;
    const rawY = this.chunkHeight * 0.5;
    return this.findNearestWalkablePosition(rawX, rawY);
  }

  public switchToMap(mapIndex: number): MapDefinition {
    this.setupInfiniteMap(mapIndex);
    return this.currentMap.def;
  }

  // ===================== TELEPORTE PARA ARENA BOSS (MAP5-BOSS) =====================

  /**
   * Teleporta o jogador imediatamente para o map5-BOSS (Ginásio de Pedra do Onix),
   * desativando os chunks infinitos e confinando a área caminhável exclusivamente à arena central da Pokébola.
   */
  teleportToBossArena(): {
    playerSpawn: { x: number; y: number };
    bossSpawn: { x: number; y: number };
  } {
    this.bossArenaActive = true;

    // Oculta os chunks infinitos
    for (const chunk of this.mapChunks) {
      chunk.setVisible(false);
    }
    this.clearInfiniteObstacles();

    if (this.currentMap && this.currentMap.image) {
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
    this.currentMap.image.setVisible(true);

    // Constrói os limites fechados da arena do boss
    this.scene.physics.world.setBounds(bossMap.x, bossMap.y, bossMap.width, bossMap.height);
    this.scene.cameras.main.setBounds(bossMap.x, bossMap.y, bossMap.width, bossMap.height);

    this.buildStaticZonesForMap(bossMap);

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

  // ===================== DEBUG / SPAWN SEGURO =====================

  toggleDebug(playerX?: number, playerY?: number): boolean {
    this.isDebugVisible = !this.isDebugVisible;
    this.renderDebugGrid(playerX, playerY);
    return this.isDebugVisible;
  }

  /**
   * Busca por proximidade a posição caminhável mais próxima.
   */
  findNearestWalkablePosition(
    worldX: number,
    worldY: number,
    player?: { canSwim(): boolean; canFly(): boolean }
  ): { x: number; y: number } {
    if (!this.isTerrainBlocked(worldX, worldY, player)) {
      return { x: worldX, y: worldY };
    }

    const step = 28;
    for (let r = 1; r <= 10; r++) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
        const nx = worldX + Math.cos(angle) * (r * step);
        const ny = worldY + Math.sin(angle) * (r * step);
        if (!this.isTerrainBlocked(nx, ny, player)) {
          return { x: nx, y: ny };
        }
      }
    }

    return { x: worldX, y: worldY };
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

    return instance;
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
        const normX = ((c + 0.5) * RAW_CELL_SIZE) / rawW;
        const normY = ((r + 0.5) * RAW_CELL_SIZE) / rawH;

        // 1. Pontes, píeres e escadas registradas são 100% livres para caminhar
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

        // 2. Construções, cercas e árvores grandes
        for (const box of solidBoxes) {
          if (isInsideBox(normX, normY, box)) {
            return 'building';
          }
        }

        // 3. Paredes de caverna e falésias íngremes
        for (const bnd of boundaryBoxes) {
          if (isInsideBox(normX, normY, bnd)) {
            return 'boundary';
          }
        }

        // 4. Lagos, rios e mares
        for (const water of waterZones) {
          if (isInsideBox(normX, normY, water)) {
            return 'water';
          }
        }

        // 5. Se o layout é determinístico, todo o restante é 100% livre
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

  private classifyRawCell(
    data: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    startX: number,
    startY: number,
    theme: string
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

        // Rios, lagos e corpos d'água
        if (b > r + 35 && b > g + 15 && b >= 125) {
          water++;
          continue;
        }

        // Tema de Caverna
        if (theme === 'cave' || theme === 'temple_cave') {
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

        // Flores
        const isFlower =
          (r > 155 && r > g + 18) ||
          (r > 165 && g > 140 && b < 130) ||
          (b > 155 && b > r + 25) ||
          (r > 195 && g > 195 && b > 185);

        if (isFlower) {
          walkable++;
          continue;
        }

        // Gramas
        const isGrass =
          (g >= 135 && (r >= 45 || b >= 85)) ||
          (g >= 110 && g >= r + 15 && g >= b - 10 && (r >= 45 || b >= 75)) ||
          (g >= 140 && g >= r - 10 && g >= b - 10);

        if (isGrass) {
          walkable++;
          continue;
        }

        // Caminhos e estradas
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

        // Escadas e degraus
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

        // Árvores grandes
        const isTreeCanopy =
          r <= 42 && g <= 145 && b <= 80 && g >= r + 25 && g >= b + 10;
        const isTreeTrunk =
          r >= 60 && r <= 145 && g >= 25 && g <= 85 && b <= 55 && r > g + 25;
        const isTreeShadow = r <= 38 && g <= 50 && b <= 38;

        if (isTreeCanopy || isTreeTrunk || isTreeShadow) {
          tree++;
          continue;
        }

        // Telhados
        const isRedRoof = r > 165 && g < 95 && b < 95;
        const isBlueRoof = b > 160 && r < 100 && g < 150;
        if (isRedRoof || isBlueRoof) {
          building++;
          continue;
        }

        // Falésias
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

    if (walkableRatio >= 0.20) return 'walkable';
    if (waterRatio >= 0.35) return 'water';
    if (treeRatio >= 0.45 || buildingRatio >= 0.35) return 'building';
    if (rockRatio >= 0.45) return 'boundary';

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

  public renderDebugGrid(playerX?: number, playerY?: number): void {
    this.debugGraphics.clear();
    if (!this.isDebugVisible || this.bossArenaActive) return;

    if (this.currentVariantGrid && this.currentVariantGrid.length > 0) {
      const rows = 32;
      const cols = 32;
      const cellW = this.chunkWidth / cols;
      const cellH = this.chunkHeight / rows;

      const px =
        playerX ??
        this.scene.cameras.main.scrollX + this.scene.cameras.main.width / 2;
      const py =
        playerY ??
        this.scene.cameras.main.scrollY + this.scene.cameras.main.height / 2;

      const centerChunkX = Math.floor(px / this.chunkWidth);
      const centerChunkY = Math.floor(py / this.chunkHeight);

      // Desenha nos 9 quadrantes visíveis ao redor do jogador
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const startX = (centerChunkX + dx) * this.chunkWidth;
          const startY = (centerChunkY + dy) * this.chunkHeight;

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const val = this.currentVariantGrid[r][c];
              if (val === 1) {
                // Vermelho = Bodyblock Sólido (Casas, Árvores, Falésias, Ruínas)
                this.debugGraphics.fillStyle(0xff0000, 0.35);
                this.debugGraphics.fillRect(
                  startX + c * cellW,
                  startY + r * cellH,
                  cellW,
                  cellH
                );
              } else if (val === 2) {
                // Azul = Zona Aquática (Squirtle/Wartortle/Blastoise nadam; terrestres bloqueiam)
                this.debugGraphics.fillStyle(0x0088ff, 0.35);
                this.debugGraphics.fillRect(
                  startX + c * cellW,
                  startY + r * cellH,
                  cellW,
                  cellH
                );
              }
            }
          }
        }
      }
      return;
    }

    const m = this.currentMap;
    if (!m) return;

    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const type = m.cellTypeGrid[r][c];
        if (type === 'walkable') continue;
        const x = m.x + c * m.cellSize;
        const y = m.y + r * m.cellSize;
        if (type === 'water') {
          this.debugGraphics.fillStyle(0x0284c7, 0.4);
        } else if (type === 'building') {
          this.debugGraphics.fillStyle(0xf97316, 0.4);
        } else {
          this.debugGraphics.fillStyle(0xef4444, 0.4);
        }
        this.debugGraphics.fillRect(x, y, m.cellSize, m.cellSize);
      }
    }
  }
}
