import Phaser from 'phaser';
import { SPECIALS } from '../config/abilities';
import { GAME_SETTINGS } from '../config/gameConfig';
import {
  MAX_PLAYER_LEVEL,
  POKEMON_CLASSES,
  POKEMON_MANIFEST,
  PokemonClassId,
  STARTER_IDS,
} from '../config/pokemonManifest';
import { AttackVisualManager } from '../systems/AttackVisualManager';
import { PokemonAnimationManager } from '../systems/PokemonAnimationManager';
import { RunHistory } from '../systems/RunHistory';

interface CardSlot {
  classId: PokemonClassId;
  pokemonId: string;
  container: Phaser.GameObjects.Container;
  outerBg: Phaser.GameObjects.Rectangle;
  innerBorder: Phaser.GameObjects.Rectangle;
  glowRect: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Sprite;
  baseY: number;
}

export class MenuScene extends Phaser.Scene {
  private selectedPokemonId: string = '0025';
  private cards: CardSlot[] = [];

  private detailTitleText!: Phaser.GameObjects.Text;
  private detailClassDescText!: Phaser.GameObjects.Text;
  private detailBasicIcon!: Phaser.GameObjects.Image;
  private detailBasicText!: Phaser.GameObjects.Text;
  private detailUltIcon!: Phaser.GameObjects.Image;
  private detailUltText!: Phaser.GameObjects.Text;
  private detailInnateIcon!: Phaser.GameObjects.Image;
  private detailInnateText!: Phaser.GameObjects.Text;
  private detailEvoText!: Phaser.GameObjects.Text;
  private detailPanelBorder!: Phaser.GameObjects.Rectangle;
  private evoPreviewContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    this.cards = [];
    this.drawThematicPokemonBackdrop();
    this.drawHeaderBanner();
    this.createClassCards();
    this.createRunHistorySidebar();
    this.createDetailBottomPanel();
    this.updateSelectionVisuals();

    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-LEFT', () => this.moveSelection(-1));
      kb.on('keydown-A', () => this.moveSelection(-1));
      kb.on('keydown-RIGHT', () => this.moveSelection(1));
      kb.on('keydown-D', () => this.moveSelection(1));
      kb.on('keydown-ENTER', () => this.startGame());
      kb.on('keydown-SPACE', () => this.startGame());
    }
  }

  /**
   * Cenário vivo temático de Pokémon:
   * Exibe o mapa da Vila Pokémon em movimento panorâmico suave ao fundo,
   * feixes de luz solar dourada, Pokémons caminhando no cenário e vaga-lumes.
   */
  private drawThematicPokemonBackdrop(): void {
    const w = GAME_SETTINGS.WIDTH;
    const h = GAME_SETTINGS.HEIGHT;

    // 1. Imagem panorâmica viva do mapa Pokémon ao fundo com pan suave
    const bgMap = this.add
      .image(w / 2, h / 2 + 120, 'map1')
      .setScale(1.42)
      .setAlpha(0.88);

    this.tweens.add({
      targets: bgMap,
      y: h / 2 - 140,
      duration: 18000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 2. Pokémons evoluídos caminhando no diorama de fundo
    const bgWalkers = [
      { id: '0006', x: 240, y: 210, dir: 2 as const },
      { id: '0003', x: 740, y: 420, dir: 6 as const },
      { id: '0009', x: 420, y: 470, dir: 2 as const },
    ];
    for (const walker of bgWalkers) {
      const sp = this.add
        .sprite(
          walker.x,
          walker.y,
          PokemonAnimationManager.getTextureKey(walker.id, 'Walk'),
          0
        )
        .setScale(2.1)
        .setAlpha(0.55);
      sp.play(PokemonAnimationManager.getAnimKey(walker.id, 'Walk', walker.dir));
    }

    // 3. Gradiente atmosférico (azul-esmeralda escuro nas bordas e dourado suave no topo)
    const overlay = this.add.graphics();
    overlay.fillGradientStyle(0x06121e, 0x091a2a, 0x071520, 0x040b14, 0.76);
    overlay.fillRect(0, 0, w, h);

    // Feixes diagonais de luz solar (estilo floresta de Pokémon Mystery Dungeon)
    overlay.fillStyle(0xfef08a, 0.055);
    overlay.fillTriangle(80, 0, 320, 0, 620, h);
    overlay.fillTriangle(480, 0, 680, 0, 980, h);

    // Moldura ornamental externa da tela
    overlay.lineStyle(4, 0xffcb05, 0.55);
    overlay.strokeRoundedRect(8, 8, w - 16, h - 16, 12);
    overlay.lineStyle(1.5, 0x38bdf8, 0.35);
    overlay.strokeRoundedRect(13, 13, w - 26, h - 26, 10);

    // 4. Vaga-lumes e partículas elementais brilhando pela floresta
    const sparkColors = [0xffcb05, 0x4ade80, 0x38bdf8, 0xff85a1, 0xfbbf24];
    for (let i = 0; i < 28; i++) {
      const px = Phaser.Math.Between(30, w - 30);
      const py = Phaser.Math.Between(30, h - 30);
      const col = sparkColors[i % sparkColors.length];
      const glow = this.add.circle(px, py, Phaser.Math.Between(2, 4), col, 0.45);
      this.tweens.add({
        targets: glow,
        y: py - Phaser.Math.Between(22, 48),
        x: px + Phaser.Math.Between(-18, 18),
        alpha: 0.1,
        yoyo: true,
        repeat: -1,
        duration: Phaser.Math.Between(1800, 3400),
      });
    }
  }

  private drawPokeballEmblem(x: number, y: number, radius: number): void {
    const g = this.add.graphics();

    // Brilho dourado externo
    g.fillStyle(0xffcb05, 0.25);
    g.fillCircle(x, y, radius + 6);

    // Metade superior vermelha
    g.fillStyle(0xe63946, 1);
    g.slice(x, y, radius, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
    g.fillPath();

    // Metade inferior branca
    g.fillStyle(0xf8fafc, 1);
    g.slice(x, y, radius, Phaser.Math.DegToRad(0), Phaser.Math.DegToRad(180), false);
    g.fillPath();

    // Faixa central e contorno
    g.lineStyle(3.5, 0x0f172a, 1);
    g.strokeCircle(x, y, radius);
    g.lineBetween(x - radius, y, x + radius, y);

    // Botão central da Pokébola
    g.fillStyle(0x0f172a, 1);
    g.fillCircle(x, y, radius * 0.36);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x, y, radius * 0.22);
  }

  private drawHeaderBanner(): void {
    const w = GAME_SETTINGS.WIDTH;

    // Placa de cabeçalho temática com borda dupla dourada
    this.add
      .rectangle(w / 2, 46, w - 40, 68, 0x071120, 0.92)
      .setStrokeStyle(3, 0xffcb05, 0.95);
    this.add
      .rectangle(w / 2, 46, w - 48, 60, 0x0b192e, 0.6)
      .setStrokeStyle(1, 0x38bdf8, 0.5);

    this.drawPokeballEmblem(54, 46, 20);

    this.add
      .text(86, 24, 'POKÉLIMIT', {
        fontFamily: 'monospace',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ffcb05',
        stroke: '#1d2c5e',
        strokeThickness: 7,
      })
      .setOrigin(0, 0);

    this.add
      .text(
        88,
        55,
        `Alcance o Nível ${MAX_PLAYER_LEVEL} e derrote o BOSS ONIX para vencer!  •  [SHIFT] Dash   [E/Q] Especial`,
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#cbd5e1',
        }
      )
      .setOrigin(0, 0);

    const best = RunHistory.bestScore();
    this.add
      .text(w - 38, 46, `🏆 RECORDE: ${best} PTS`, {
        fontFamily: 'monospace',
        fontSize: '15.5px',
        fontStyle: 'bold',
        color: '#091326',
        backgroundColor: '#ffcb05',
        padding: { x: 14, y: 7 },
      })
      .setOrigin(1, 0.5);
  }

  private createClassCards(): void {
    const slots: Array<{ classId: PokemonClassId; pokemonId: string }> = [
      { classId: 'disparador', pokemonId: '0025' },
      { classId: 'lutador', pokemonId: '0004' },
      { classId: 'controlador', pokemonId: '0001' },
      { classId: 'tank', pokemonId: '0007' },
      { classId: 'suporte', pokemonId: '0039' },
    ];

    const cardW = 180;
    const cardH = 382;
    const gap = 12;
    const startX = 22 + cardW / 2;
    const baseY = 286;

    slots.forEach((slot, idx) => {
      const x = startX + idx * (cardW + gap);
      const cls = POKEMON_CLASSES[slot.classId];
      const poke = POKEMON_MANIFEST[slot.pokemonId];

      const container = this.add.container(x, baseY);

      const glowRect = this.add
        .rectangle(0, 0, cardW + 8, cardH + 8, 0xffcb05, 0)
        .setStrokeStyle(3, 0xffcb05, 0);

      const outerBg = this.add
        .rectangle(0, 0, cardW, cardH, 0x091426, 0.94)
        .setStrokeStyle(3.5, cls.colorNum, 1)
        .setInteractive({ useHandCursor: true });

      const innerBorder = this.add
        .rectangle(0, 0, cardW - 6, cardH - 6, 0x000000, 0)
        .setStrokeStyle(1, 0xffffff, 0.22);

      const headerBg = this.add
        .rectangle(0, -cardH / 2 + 25, cardW - 12, 38, cls.colorNum, 0.38)
        .setStrokeStyle(2, cls.colorNum, 1);

      const headerTitle = this.add
        .text(0, -cardH / 2 + 25, `${cls.iconSymbol} ${cls.title}`, {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5);

      // Pedestal de grama/arena sob o Pokémon dentro do card
      const showcaseBg = this.add
        .rectangle(0, -cardH / 2 + 112, cardW - 16, 118, 0x10223f, 0.95)
        .setStrokeStyle(1.5, cls.colorNum, 0.7);

      const turfPedestal = this.add
        .ellipse(0, -cardH / 2 + 114, 72, 22, 0x2d6a4f, 0.85)
        .setStrokeStyle(2, 0x52b788, 0.9);

      const showcaseCircle = this.add.circle(
        0,
        -cardH / 2 + 95,
        32,
        cls.colorNum,
        0.18
      );

      const idleTex = PokemonAnimationManager.getTextureKey(poke.id, 'Idle');
      const pokeSprite = this.add
        .sprite(0, -cardH / 2 + 94, idleTex, 0)
        .setScale(1.95);
      pokeSprite.play(PokemonAnimationManager.getAnimKey(poke.id, 'Idle', 0));

      const pokeName = this.add
        .text(0, -cardH / 2 + 142, poke.name.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ffcb05',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      const elementBadge = this.add
        .text(
          0,
          -cardH / 2 + 160,
          `Tipo: ${poke.attackProfile?.elementLabel}`,
          {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#cbd5e1',
          }
        )
        .setOrigin(0.5);

      const summaryBoxH = 182;
      const summaryBoxY = cardH / 2 - summaryBoxH / 2 - 10;
      const summaryBg = this.add
        .rectangle(0, summaryBoxY, cardW - 16, summaryBoxH, 0x050b16, 0.96)
        .setStrokeStyle(1.5, cls.colorNum, 0.85);

      const summaryHeader = this.add
        .text(-cardW / 2 + 16, summaryBoxY - summaryBoxH / 2 + 10, 'SUMÁRIO:', {
          fontFamily: 'monospace',
          fontSize: '12.5px',
          fontStyle: 'bold',
          color: cls.colorHex,
        })
        .setOrigin(0, 0);

      container.add([
        glowRect,
        outerBg,
        innerBorder,
        headerBg,
        headerTitle,
        showcaseBg,
        showcaseCircle,
        turfPedestal,
        pokeSprite,
        pokeName,
        elementBadge,
        summaryBg,
        summaryHeader,
      ]);

      cls.summary.forEach((item, lineIdx) => {
        const lineY = summaryBoxY - summaryBoxH / 2 + 36 + lineIdx * 28;
        const lineText = this.add
          .text(-cardW / 2 + 16, lineY, item.text, {
            fontFamily: 'monospace',
            fontSize: '12.5px',
            fontStyle: 'bold',
            color: item.positive ? '#4ade80' : '#f87171',
          })
          .setOrigin(0, 0);
        container.add(lineText);
      });

      outerBg.on('pointerdown', () => {
        if (this.selectedPokemonId === slot.pokemonId) {
          this.startGame();
        } else {
          this.selectedPokemonId = slot.pokemonId;
          this.updateSelectionVisuals();
        }
      });

      this.cards.push({
        classId: slot.classId,
        pokemonId: slot.pokemonId,
        container,
        outerBg,
        innerBorder,
        glowRect,
        sprite: pokeSprite,
        baseY,
      });
    });
  }

  private createRunHistorySidebar(): void {
    const panelW = 266;
    const panelH = 382;
    const panelX = GAME_SETTINGS.WIDTH - 22 - panelW / 2;
    const panelY = 286;

    const container = this.add.container(panelX, panelY);

    const bg = this.add
      .rectangle(0, 0, panelW, panelH, 0x071120, 0.94)
      .setStrokeStyle(3, 0xffcb05, 0.9);

    const headerBg = this.add
      .rectangle(0, -panelH / 2 + 24, panelW - 12, 36, 0x102544, 1)
      .setStrokeStyle(1.5, 0x38bdf8, 0.85);

    const headerTitle = this.add
      .text(0, -panelH / 2 + 24, '📜 ÚLTIMAS PARTIDAS', {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffcb05',
      })
      .setOrigin(0.5);

    container.add([bg, headerBg, headerTitle]);

    const records = RunHistory.load().slice(0, 6);

    if (records.length === 0) {
      const emptyTxt = this.add
        .text(
          0,
          10,
          'Nenhuma partida\nregistrada ainda.\n\nSuba até o Nível 10\ne derrote o Boss Onix\npara conquistar sua\nprimeira Vitória!',
          {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#94a3b8',
            align: 'center',
            lineSpacing: 4,
          }
        )
        .setOrigin(0.5);
      container.add(emptyTxt);
      return;
    }

    records.forEach((rec, idx) => {
      const rowY = -panelH / 2 + 68 + idx * 52;
      const isWin = rec.endReason === 'vitoria';

      const rowBg = this.add
        .rectangle(
          0,
          rowY,
          panelW - 18,
          44,
          isWin ? 0x14332b : 0x0d182e,
          0.95
        )
        .setStrokeStyle(1.5, isWin ? 0x4ade80 : 0x1e293b, 0.9);

      const timeStr = RunHistory.formatTime(rec.timeSeconds);
      const statusIcon = isWin ? '👑' : rec.endReason === 'derrota' ? '💀' : '🏳️';

      const topLine = this.add
        .text(
          -panelW / 2 + 15,
          rowY - 13,
          `${statusIcon} ${rec.finalPokemonName} (Nv.${rec.level})`,
          {
            fontFamily: 'monospace',
            fontSize: '11.5px',
            fontStyle: 'bold',
            color: isWin ? '#4ade80' : '#e2e8f0',
          }
        )
        .setOrigin(0, 0);

      const scoreBadge = this.add
        .text(panelW / 2 - 15, rowY - 13, `${rec.score} pts`, {
          fontFamily: 'monospace',
          fontSize: '11.5px',
          fontStyle: 'bold',
          color: '#ffcb05',
        })
        .setOrigin(1, 0);

      const bottomLine = this.add
        .text(
          -panelW / 2 + 15,
          rowY + 4,
          `⏱️ ${timeStr}  •  ⚔️ ${rec.defeated}  •  ${isWin ? 'VITÓRIA!' : `Mapa ${rec.mapsCleared + 1}`}`,
          {
            fontFamily: 'monospace',
            fontSize: '10.5px',
            color: '#94a3b8',
          }
        )
        .setOrigin(0, 0);

      container.add([rowBg, topLine, scoreBadge, bottomLine]);
    });
  }

  private createDetailBottomPanel(): void {
    const w = GAME_SETTINGS.WIDTH;
    const panelW = w - 40;
    const panelH = 194;
    const panelX = w / 2;
    const panelY = 594;

    this.detailPanelBorder = this.add
      .rectangle(panelX, panelY, panelW, panelH, 0x071120, 0.96)
      .setStrokeStyle(3, 0xffcb05, 1);

    // Reflexo vítreo superior discreto no painel inferior
    this.add.rectangle(
      panelX,
      panelY - panelH / 2 + 18,
      panelW - 8,
      32,
      0xffffff,
      0.035
    );

    const leftX = panelX - panelW / 2 + 18;
    const topY = panelY - panelH / 2 + 10;

    this.detailTitleText = this.add.text(leftX, topY, '', {
      fontFamily: 'monospace',
      fontSize: '17.5px',
      fontStyle: 'bold',
      color: '#ffcb05',
    });

    this.detailClassDescText = this.add.text(leftX, topY + 23, '', {
      fontFamily: 'monospace',
      fontSize: '11.5px',
      color: '#cbd5e1',
      lineSpacing: 2,
    });

    const row1Y = topY + 68;
    const row2Y = topY + 101;
    const row3Y = topY + 134;

    this.detailBasicIcon = this.add
      .image(leftX + 13, row1Y + 8, AttackVisualManager.getMoveIconKey('eletrico', 'basic'))
      .setDisplaySize(25, 25);
    this.detailBasicText = this.add.text(leftX + 32, row1Y, '', {
      fontFamily: 'monospace',
      fontSize: '11.5px',
      fontStyle: 'bold',
      color: '#38bdf8',
      wordWrap: { width: 648 },
    });

    this.detailUltIcon = this.add
      .image(leftX + 13, row2Y + 8, AttackVisualManager.getMoveIconKey('eletrico', 'ult'))
      .setDisplaySize(25, 25);
    this.detailUltText = this.add.text(leftX + 32, row2Y, '', {
      fontFamily: 'monospace',
      fontSize: '11.5px',
      fontStyle: 'bold',
      color: '#c084fc',
      wordWrap: { width: 648 },
    });

    this.detailInnateIcon = this.add
      .image(leftX + 13, row3Y + 8, AttackVisualManager.getMoveIconKey('eletrico', 'innate'))
      .setDisplaySize(25, 25);
    this.detailInnateText = this.add.text(leftX + 32, row3Y, '', {
      fontFamily: 'monospace',
      fontSize: '11.5px',
      fontStyle: 'bold',
      color: '#fde047',
      wordWrap: { width: 648 },
    });

    this.detailEvoText = this.add.text(leftX, topY + 168, '', {
      fontFamily: 'monospace',
      fontSize: '11.5px',
      fontStyle: 'bold',
      color: '#4ade80',
    });

    this.evoPreviewContainer = this.add.container(panelX + 215, panelY + 6);

    const startBtnX = panelX + panelW / 2 - 142;
    const startBtnBg = this.add
      .rectangle(startBtnX, panelY, 240, 74, 0xffcb05, 1)
      .setStrokeStyle(3, 0xffffff, 1)
      .setInteractive({ useHandCursor: true });

    const startBtnShine = this.add.rectangle(
      startBtnX,
      panelY - 22,
      232,
      18,
      0xffffff,
      0.24
    );

    const startBtnLabel = this.add
      .text(startBtnX, panelY, '⚔️ INICIAR JORNADA\n[ENTER / ESPAÇO]', {
        fontFamily: 'monospace',
        fontSize: '15.5px',
        fontStyle: 'bold',
        color: '#091326',
        align: 'center',
      })
      .setOrigin(0.5);

    startBtnBg.on('pointerover', () => startBtnBg.setFillStyle(0xffe066, 1));
    startBtnBg.on('pointerout', () => startBtnBg.setFillStyle(0xffcb05, 1));
    startBtnBg.on('pointerdown', () => this.startGame());
    startBtnShine.on('pointerdown', () => this.startGame());
    startBtnLabel.on('pointerdown', () => this.startGame());
  }

  private moveSelection(delta: number): void {
    const currentIndex = STARTER_IDS.indexOf(
      this.selectedPokemonId as (typeof STARTER_IDS)[number]
    );
    const nextIndex =
      (currentIndex + delta + STARTER_IDS.length) % STARTER_IDS.length;
    this.selectedPokemonId = STARTER_IDS[nextIndex];
    this.updateSelectionVisuals();
  }

  private updateSelectionVisuals(): void {
    for (const card of this.cards) {
      const cls = POKEMON_CLASSES[card.classId];
      const isSelected = card.pokemonId === this.selectedPokemonId;

      this.tweens.killTweensOf(card.container);

      if (isSelected) {
        card.outerBg.setStrokeStyle(4, 0xffcb05, 1);
        card.glowRect.setStrokeStyle(3, 0xffcb05, 0.85);
        this.tweens.add({
          targets: card.container,
          y: card.baseY - 10,
          scaleX: 1.03,
          scaleY: 1.03,
          duration: 170,
          ease: 'Back.easeOut',
        });
        card.sprite.play(
          PokemonAnimationManager.getAnimKey(card.pokemonId, 'Walk', 0),
          true
        );
      } else {
        card.outerBg.setStrokeStyle(2.5, cls.colorNum, 0.75);
        card.glowRect.setStrokeStyle(3, 0xffcb05, 0);
        this.tweens.add({
          targets: card.container,
          y: card.baseY,
          scaleX: 0.97,
          scaleY: 0.97,
          duration: 170,
          ease: 'Sine.easeOut',
        });
        card.sprite.play(
          PokemonAnimationManager.getAnimKey(card.pokemonId, 'Idle', 0),
          true
        );
      }
    }

    const poke = POKEMON_MANIFEST[this.selectedPokemonId];
    const cls = POKEMON_CLASSES[poke.classId!];
    const atk = poke.attackProfile!;
    const spec = SPECIALS[atk.style];

    this.detailPanelBorder.setStrokeStyle(3, cls.colorNum, 1);
    this.detailTitleText.setText(
      `${cls.iconSymbol} ${poke.name.toUpperCase()} — Classe: ${cls.title} (Habilidades Exclusivas: ${atk.elementLabel})`
    );
    this.detailClassDescText.setText(cls.description.join('  •  '));

    const basicTex = AttackVisualManager.getMoveIconKey(atk.element, 'basic');
    const ultTex = AttackVisualManager.getMoveIconKey(atk.element, 'ult');
    const innateTex = AttackVisualManager.getMoveIconKey(atk.element, 'innate');

    if (this.textures.exists(basicTex)) {
      this.detailBasicIcon.setTexture(basicTex).setDisplaySize(25, 25);
    }
    if (this.textures.exists(ultTex)) {
      this.detailUltIcon.setTexture(ultTex).setDisplaySize(25, 25);
    }
    if (this.textures.exists(innateTex)) {
      this.detailInnateIcon.setTexture(innateTex).setDisplaySize(25, 25);
    }

    this.detailBasicText.setText(
      `Básico [ESPAÇO/Auto]: ${atk.name} — ${atk.description}`
    );
    this.detailUltText.setText(
      `ULT [E / Q]: ${spec.name} — ${spec.description}`
    );
    this.detailInnateText.setText(
      poke.innatePassive
        ? `Passiva Inata: ${poke.innatePassive.name} — ${poke.innatePassive.description}`
        : ''
    );
    this.detailEvoText.setText(
      `✨ Evoluções: ${poke.evolutionLineText ?? 'Forma Única'}   |   👑 Boss Final no Nível ${MAX_PLAYER_LEVEL}: ONIX`
    );

    this.renderEvolutionChainPreview(poke.id);
  }

  private renderEvolutionChainPreview(startId: string): void {
    this.evoPreviewContainer.removeAll(true);

    const chainIds: string[] = [];
    let curr: string | undefined = startId;
    while (curr && POKEMON_MANIFEST[curr]) {
      chainIds.push(curr);
      curr = POKEMON_MANIFEST[curr].evolvesToId;
    }

    const boxBg = this.add
      .rectangle(0, 0, 255, 134, 0x0f1c36, 0.95)
      .setStrokeStyle(1.5, 0x334155, 1);
    const title = this.add
      .text(0, -52, 'LINHA EVOLUTIVA', {
        fontFamily: 'monospace',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#ffcb05',
      })
      .setOrigin(0.5);

    this.evoPreviewContainer.add([boxBg, title]);

    const spacing = chainIds.length === 3 ? 78 : 98;
    const startX = -((chainIds.length - 1) * spacing) / 2;

    chainIds.forEach((id, idx) => {
      const def = POKEMON_MANIFEST[id];
      const x = startX + idx * spacing;

      const sp = this.add
        .sprite(x, -4, PokemonAnimationManager.getTextureKey(id, 'Idle'), 0)
        .setScale(1.4);
      sp.play(PokemonAnimationManager.getAnimKey(id, 'Idle', 0));

      const lbl = this.add
        .text(x, 38, def.name, {
          fontFamily: 'monospace',
          fontSize: '10.5px',
          color: '#e2e8f0',
        })
        .setOrigin(0.5);

      this.evoPreviewContainer.add([sp, lbl]);

      if (idx < chainIds.length - 1) {
        const arrow = this.add
          .text(x + spacing / 2, -2, '➔', {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#4ade80',
          })
          .setOrigin(0.5);
        this.evoPreviewContainer.add(arrow);
      }
    });
  }

  private startGame(): void {
    this.scene.start('GameScene', {
      pokemonId: this.selectedPokemonId,
    });
  }
}
