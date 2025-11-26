import { NextRequest, NextResponse } from 'next/server';
import { obtenerCancionPorHash, actualizarDatosGemini } from '@/lib/db-persistence';
import { analizarConGeminiDJ } from '@/lib/gemini-optimizer';
import type { CancionAnalizada, EstructuraMusical, AnalisisContenido, BloqueVocal, LoopTransicion } from '@/lib/db';
import { GoogleGenAI } from '@google/genai';
import { createHash } from 'crypto';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { marcarJobCompletado, actualizarProgresoJob } from '@/lib/analysis-jobs';

// --- DEFINICIONES Y CONSTANTES ---

const AUDIO_CACHE_DIR = join(process.cwd(), '.cache', 'gemini-audio');
const MAX_INLINE_AUDIO_BYTES = 20 * 1024 * 1024; // 20MB

const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/aac': '.aac',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/flac': '.flac',
  'audio/ogg': '.ogg',
  'audio/aiff': '.aiff',
  'audio/x-aiff': '.aiff',
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.m4a': 'audio/m4a',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.aiff': 'audio/aiff',
};

type AudioSource = 'form-data' | 'json-base64' | 'json-url' | 'json-cache';

class ClientFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ClientFacingError';
    this.status = status;
  }
}

interface CachedAudio {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

// Nueva respuesta DJ-Centric
interface GeminiEnriquecidoResponse {
  vocales_clave: BloqueVocal[];
  loops_transicion: LoopTransicion[];
  estructura: EstructuraMusical[];
  analisis_contenido: AnalisisContenido;
  huecos: any[]; // AnalisisHuecoInstrumental
}

// --- FUNCIONES AUXILIARES ---

async function ensureCacheDir(): Promise<void> {
  await mkdir(AUDIO_CACHE_DIR, { recursive: true });
}

function normalizeMime(mime?: string | null): string | undefined {
  if (!mime) return undefined;
  const normalized = mime.split(';')[0].trim().toLowerCase();
  return normalized || undefined;
}

function resolveMimeType(fileName: string, explicitMime?: string | null): string {
  const normalizedExplicit = normalizeMime(explicitMime);
  if (normalizedExplicit && normalizedExplicit.startsWith('audio/')) {
    return normalizedExplicit === 'audio/mp3' ? 'audio/mpeg' : normalizedExplicit;
  }

  const ext = extname(fileName || '').toLowerCase();
  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }

  return normalizedExplicit || 'audio/mpeg';
}

function inferExtension(mimeType?: string | null): string {
  if (!mimeType) return '.mp3';
  const normalized = normalizeMime(mimeType);
  if (normalized && MIME_EXTENSION_MAP[normalized]) {
    return MIME_EXTENSION_MAP[normalized];
  }
  return '.mp3';
}

async function cacheAudioBuffer(params: { hash: string; buffer: Buffer; fileName: string; mimeType: string }): Promise<void> {
  try {
    await ensureCacheDir();
    const ext = extname(params.fileName) || inferExtension(params.mimeType);
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
    const audioPath = join(AUDIO_CACHE_DIR, `${params.hash}${normalizedExt}`);
    await writeFile(audioPath, params.buffer);
    const metaPath = join(AUDIO_CACHE_DIR, `${params.hash}.meta.json`);
    const metadata = {
      fileName: params.fileName,
      mimeType: params.mimeType,
      ext: normalizedExt,
      bytes: params.buffer.length,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  } catch (error) {
    console.warn('⚠️  No se pudo guardar el audio en caché:', error);
  }
}

async function loadCachedAudio(hash: string): Promise<CachedAudio | null> {
  try {
    const metaPath = join(AUDIO_CACHE_DIR, `${hash}.meta.json`);
    const rawMeta = await readFile(metaPath, 'utf8');
    const metadata = JSON.parse(rawMeta) as { fileName?: string; mimeType?: string; ext?: string };
    const ext = metadata.ext && metadata.ext.startsWith('.') ? metadata.ext : inferExtension(metadata.mimeType);
    const audioPath = join(AUDIO_CACHE_DIR, `${hash}${ext}`);
    const buffer = await readFile(audioPath);
    return {
      buffer,
      fileName: metadata.fileName || `${hash}${ext}`,
      mimeType: resolveMimeType(metadata.fileName || `${hash}${ext}`, metadata.mimeType),
    };
  } catch (error) {
    return null;
  }
}

function extractString(obj: any, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeBase64(input: string): string {
  return input.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
}

function computeHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function resolveAudioPayload(request: NextRequest): Promise<{ buffer: Buffer; hash: string; fileName: string; mimeType: string; source: AudioSource }> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      throw new ClientFacingError('Se requiere un archivo de audio en el campo "file"');
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name || `audio-${Date.now()}.mp3`;
    const mimeType = resolveMimeType(fileName, file.type);
    const hash = computeHash(buffer);
    return { buffer, hash, fileName, mimeType, source: 'form-data' };
  }

  if (contentType.includes('application/json')) {
    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      throw new ClientFacingError('JSON inválido en la petición');
    }

    const hashFromBody = extractString(body, ['hash', 'hash_archivo', 'hashArchivo']);
    const base64Payload = extractString(body, ['audio_base64', 'audioBase64', 'audio_data', 'audioData']);
    const audioUrl = extractString(body, ['audio_url', 'audioUrl']);
    const providedFileName = extractString(body, ['file_name', 'fileName']);
    const providedMimeType = extractString(body, ['mime_type', 'mimeType']);

    if (base64Payload) {
      const normalized = normalizeBase64(base64Payload);
      let buffer: Buffer;
      try {
        buffer = Buffer.from(normalized, 'base64');
      } catch (error) {
        throw new ClientFacingError('audio_base64 inválido. Asegúrate de enviar el audio codificado en base64.');
      }

      if (buffer.length === 0) {
        throw new ClientFacingError('El audio inline está vacío');
      }

      if (buffer.length > MAX_INLINE_AUDIO_BYTES) {
        throw new ClientFacingError('El audio inline supera el límite de 20MB. Envía el archivo por FormData o usa audio_url.', 413);
      }

      const fileName = providedFileName || (hashFromBody ? `${hashFromBody}.mp3` : `audio-${Date.now()}.mp3`);
      const mimeType = resolveMimeType(fileName, providedMimeType);
      const computedHash = computeHash(buffer);

      if (hashFromBody && hashFromBody !== computedHash) {
        throw new ClientFacingError('El hash no coincide con el archivo enviado en audio_base64.');
      }

      return { buffer, hash: hashFromBody || computedHash, fileName, mimeType, source: 'json-base64' };
    }

    if (audioUrl) {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new ClientFacingError(`No se pudo descargar el audio desde ${audioUrl} (${response.status})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) {
        throw new ClientFacingError('El archivo descargado está vacío');
      }

      let fileName = providedFileName;
      if (!fileName) {
        try {
          const urlObj = new URL(audioUrl);
          const lastSegment = urlObj.pathname.split('/').filter(Boolean).pop();
          fileName = lastSegment || `audio-${Date.now()}.mp3`;
        } catch (error) {
          fileName = `audio-${Date.now()}.mp3`;
        }
      }

      const responseMime = response.headers.get('content-type');
      const mimeType = resolveMimeType(fileName!, providedMimeType || responseMime);
      const computedHash = computeHash(buffer);

      if (hashFromBody && hashFromBody !== computedHash) {
        throw new ClientFacingError('El hash no coincide con el archivo descargado desde audio_url.');
      }

      return { buffer, hash: hashFromBody || computedHash, fileName: fileName!, mimeType, source: 'json-url' };
    }

    if (hashFromBody) {
      const cachedAudio = await loadCachedAudio(hashFromBody);
      if (!cachedAudio) {
        throw new ClientFacingError('No se encontró audio en caché para este hash. Envía audio_base64, audio_url o usa FormData.');
      }
      return {
        buffer: cachedAudio.buffer,
        hash: hashFromBody,
        fileName: cachedAudio.fileName,
        mimeType: cachedAudio.mimeType,
        source: 'json-cache',
      };
    }

    throw new ClientFacingError('Debes enviar audio_base64, audio_url o hash para usar el modo JSON.');
  }

  throw new ClientFacingError('Content-Type no soportado. Usa multipart/form-data o application/json.');
}

// --- FUNCIÓN PRINCIPAL ---

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    const { buffer, hash, fileName, mimeType, source } = await resolveAudioPayload(request);

    console.log(`🎵 Enriqueciendo canción con Gemini (DJ-Centric): ${hash}`);
    console.log(`📂 Archivo: ${fileName} (${mimeType}) | origen: ${source}`);

    const cancion = await obtenerCancionPorHash(hash);
    if (!cancion) {
      throw new ClientFacingError('Canción no encontrada en la base de datos. Analízala primero con /api/analyze.', 404);
    }

    if (source !== 'json-cache') {
      await cacheAudioBuffer({ hash, buffer, fileName, mimeType });
    }

    type CancionExtendida = CancionAnalizada & {
      segmentos_voz?: Array<{ start_ms: number; end_ms: number }>;
    };

    const cancionExtendida = cancion as CancionExtendida;
    const segmentosVoz = Array.isArray(cancionExtendida.segmentos_voz)
      ? cancionExtendida.segmentos_voz
      : [];

    console.log('🎯 Llamando a analizarConGeminiDJ con buffer inline:');
    console.log(`   - fileBuffer size: ${buffer.length} bytes`);
    console.log(`   - segmentosVoz: ${segmentosVoz.length}`);

    const analisisCompleto = await analizarConGeminiDJ({
      hash_archivo: hash,
      titulo: cancion.titulo || 'Desconocido',
      fileBuffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      fileMimeType: mimeType,
      jobId: hash,
      analisisTecnico: {
        bpm: cancion.bpm || 120,
        tonalidad_camelot: cancion.tonalidad_camelot || '1A',
        tonalidad_compatible: cancion.tonalidad_compatible || [],
        energia: cancion.energia || 0.5,
        bailabilidad: cancion.bailabilidad || 0.5,
        animo_general: cancion.animo_general || 'neutral',
        compas: cancion.compas || { numerador: 4, denominador: 4 },
        duracion_ms: cancion.duracion_ms || 180000,
        beats_ts_ms: cancion.beats_ts_ms || [],
        downbeats_ts_ms: cancion.downbeats_ts_ms || [],
        frases_ts_ms: cancion.frases_ts_ms || [],
      },
      segmentosVoz,
      nombreCancion: cancion.titulo || 'Desconocido',
    });

    // 💾 PERSISTIR RESULTADOS EN BASE DE DATOS
    try {
      console.log('💾 Guardando enriquecimiento Gemini en base de datos...');

      await actualizarProgresoJob(hash, 90, 'Guardando enriquecimiento Gemini en BD...');

      await actualizarDatosGemini({
        hash,
        vocales_clave: analisisCompleto.vocales_clave || undefined,
        loops_transicion: analisisCompleto.loops_transicion || undefined,
        estructura_ts: analisisCompleto.estructura_ts || undefined,
        analisis_contenido: analisisCompleto.analisis_contenido || undefined,
        huecos_analizados: analisisCompleto.huecos_analizados || undefined,
      });

      console.log('✅ Enriquecimiento guardado en BD exitosamente');

      // Marcar job como 100% completado
      await marcarJobCompletado(hash, {
        gemini_completed: true,
        vocales: (analisisCompleto.vocales_clave || []).length,
        secciones: (analisisCompleto.estructura_ts || []).length,
        loops: (analisisCompleto.loops_transicion || []).length,
      });

      console.log('✅ Job marcado como 100% completado');
    } catch (dbError) {
      console.error('❌ Error guardando en BD:', dbError);
    }

    const respuesta: GeminiEnriquecidoResponse = {
      vocales_clave: analisisCompleto.vocales_clave || [],
      loops_transicion: analisisCompleto.loops_transicion || [],
      estructura: analisisCompleto.estructura_ts || [],
      analisis_contenido: analisisCompleto.analisis_contenido || {
        analisis_lirico_tematico: { tema_principal: '', palabras_clave_semanticas: [], evolucion_emocional: 'neutral' },
        eventos_clave_dj: []
      },
      huecos: analisisCompleto.huecos_analizados || [],
    };

    return NextResponse.json({ success: true, hash, gemini: respuesta });
  } catch (error: any) {
    const status = error instanceof ClientFacingError ? error.status : 500;
    const message = error instanceof ClientFacingError
      ? error.message
      : error?.message || 'No se pudo enriquecer la canción con Gemini';

    if (status >= 500) {
      console.error('❌ Error en /api/enrich-gemini:', error);
    } else {
      console.warn('⚠️  Error controlado en /api/enrich-gemini:', message);
    }

    try {
      if (tempFilePath) {
        await unlink(tempFilePath);
      }
    } catch (cleanupError) {
      // Ignore
    }

    return NextResponse.json({ success: false, error: message }, { status });
  }
}