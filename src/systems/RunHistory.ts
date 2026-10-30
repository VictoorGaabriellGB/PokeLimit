/**
 * Histórico de partidas salvo no localStorage do navegador.
 */
export interface RunRecord {
  starterId: string;
  finalPokemonId: string;
  finalPokemonName: string;
  classId: string;
  score: number;
  timeSeconds: number;
  level: number;
  defeated: number;
  mapsCleared: number;
  endReason: 'vitoria' | 'derrota' | 'abandono';
  dateIso: string;
}

const STORAGE_KEY = 'poke_survivor_run_history_v1';
const MAX_RECORDS = 12;

export class RunHistory {
  static load(): RunRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** Salva a partida e retorna `true` se for um novo recorde de pontuação */
  static save(record: RunRecord): boolean {
    const all = this.load();
    const previousBest = all.reduce((m, r) => Math.max(m, r.score), 0);
    all.unshift(record);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_RECORDS)));
    } catch {
      // localStorage indisponível (modo privado, etc.)
    }
    return record.score > previousBest;
  }

  static bestScore(): number {
    return this.load().reduce((m, r) => Math.max(m, r.score), 0);
  }

  static computeScore(params: {
    defeated: number;
    level: number;
    mapsCleared: number;
    timeSeconds: number;
  }): number {
    return Math.round(
      params.defeated * 10 +
        params.level * 25 +
        params.mapsCleared * 150 +
        params.timeSeconds
    );
  }

  static formatTime(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
}

