import { analizarConGeminiOptimizado } from './gemini-optimizer';
import type { AnalisisCompleto } from './audio-analyzer-unified';
import {
  getGeminiApiKeys,
  MAX_CONCURRENT_REQUESTS_PER_KEY,
} from './gemini-keys';

export type GeminiRateLimiterStats = {
  totalApiKeys: number;
  activas: number;
  enCola: number;
  procesadas: number;
};

type GeminiRateLimiter = {
  analizarConGemini: (
    hash: string,
    filePathOrUri: string,
    analisisTecnico: AnalisisCompleto,
    prioridad?: number
  ) => Promise<any>;
  obtenerEstadisticas: () => GeminiRateLimiterStats;
};

type QueueTask = {
  priority: number;
  seq: number;
  payload: {
    hash: string;
    filePathOrUri: string;
    analisisTecnico: AnalisisCompleto;
  };
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

type KeyState = {
  key: string;
  active: number;
};

class GeminiRateLimiterImpl implements GeminiRateLimiter {
  private readonly queue: QueueTask[] = [];
  private readonly keyStates: KeyState[];
  private processed = 0;
  private seq = 0;
  private cursor = 0;

  constructor(private readonly keys: string[]) {
    this.keyStates = keys.map((key) => ({ key, active: 0 }));
  }

  async analizarConGemini(
    hash: string,
    filePathOrUri: string,
    analisisTecnico: AnalisisCompleto,
    prioridad = 0
  ): Promise<any> {
    if (this.keys.length === 0) {
      throw new Error(
        'Gemini rate limiter no configurado. Define GEMINI_API_KEY[0-4] o NEXT_PUBLIC_GEMINI_API_KEY para habilitar la Fase 2.'
      );
    }

    return new Promise((resolve, reject) => {
      const task: QueueTask = {
        priority: prioridad,
        seq: this.seq++,
        payload: { hash, filePathOrUri, analisisTecnico },
        resolve,
        reject,
      };

      this.queue.push(task);
      this.dispatch();
    });
  }

  obtenerEstadisticas(): GeminiRateLimiterStats {
    return {
      totalApiKeys: this.keys.length,
      activas: this.keyStates.reduce((total, state) => total + state.active, 0),
      enCola: this.queue.length,
      procesadas: this.processed,
    };
  }

  private dispatch() {
    if (!this.queue.length) {
      return;
    }

    for (let offset = 0; offset < this.keyStates.length; offset++) {
      const keyIndex = (this.cursor + offset) % this.keyStates.length;
      const state = this.keyStates[keyIndex];

      while (state.active < MAX_CONCURRENT_REQUESTS_PER_KEY && this.queue.length) {
        const task = this.dequeueNextTask();
        if (!task) {
          return;
        }
        this.cursor = (keyIndex + 1) % this.keyStates.length;
        this.runTask(state, task);
      }
    }
  }

  private dequeueNextTask(): QueueTask | null {
    if (!this.queue.length) return null;
    this.queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    return this.queue.shift() ?? null;
  }

  private runTask(state: KeyState, task: QueueTask) {
    const { hash, filePathOrUri, analisisTecnico } = task.payload;
    state.active += 1;

    const segmentosVoz = analisisTecnico.segmentos_voz ?? [];

    analizarConGeminiOptimizado({
      fileMimeType: 'audio/mpeg',
      segmentosVoz,
      perfilEnergiaRMS: [],
      nombreCancion: hash,
      analisisTecnico: {
        bpm: analisisTecnico.bpm,
        compas: analisisTecnico.compas,
        energia: analisisTecnico.energia,
        bailabilidad: analisisTecnico.bailabilidad,
        animo_general: analisisTecnico.animo_general,
        tonalidad_camelot: analisisTecnico.tonalidad_camelot,
        tonalidad_compatible: analisisTecnico.tonalidad_compatible,
        duracion_ms: analisisTecnico.duracion_ms,
        downbeats_ts_ms: analisisTecnico.downbeats_ts_ms,
        beats_ts_ms: analisisTecnico.beats_ts_ms,
        frases_ts_ms: analisisTecnico.frases_ts_ms,
        transientes_ritmicos_ts_ms: analisisTecnico.transientes_ritmicos_ts_ms,
        ritmoAvanzado: {
          beats_loudness: analisisTecnico.ritmo_avanzado?.beats_loudness || [],
          onset_rate: analisisTecnico.ritmo_avanzado?.onset_rate,
        },
      },
      hash_archivo: hash,
      titulo: filePathOrUri || hash,
      artista: 'Desconocido',
      apiKeyOverride: state.key,
    })
      .then((result) => {
        task.resolve(result);
      })
      .catch(task.reject)
      .finally(() => {
        this.processed += 1;
        state.active = Math.max(0, state.active - 1);
        this.dispatch();
      });
  }
}

let instancia: GeminiRateLimiter | null = null;

export function obtenerRateLimiter(): GeminiRateLimiter {
  if (instancia) {
    return instancia;
  }

  const apiKeys = getGeminiApiKeys();
  instancia = new GeminiRateLimiterImpl(apiKeys);
  return instancia;
}
