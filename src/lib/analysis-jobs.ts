/**
 * Sistema de Jobs Asíncronos para análisis de audio
 * Permite procesar canciones en segundo plano sin bloquear al usuario
 */

import { sql } from './db';
import { randomUUID } from 'crypto';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  hash_archivo: string;
  status: JobStatus;
  progress: number; // 0-100
  current_step?: string;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
  result?: any;
}

/**
 * Crea un nuevo job de análisis
 */
export async function crearJobAnalisis(hash: string): Promise<string> {
  if (!sql) throw new Error('SQL client no disponible');

  const newId = randomUUID();

  const resultado = await sql`
    INSERT INTO analysis_jobs (
      id, hash_archivo, status, progress, created_at, updated_at
    ) VALUES (
      ${newId},
      ${hash},
      'pending',
      0,
      NOW(),
      NOW()
    )
    ON CONFLICT (hash_archivo) 
    DO UPDATE SET
      status = 'pending',
      progress = 0,
      updated_at = NOW(),
      error_message = NULL
    RETURNING id
  `;

  return resultado[0].id;
}

export async function obtenerEstadoJob(jobId: string): Promise<AnalysisJob | null> {
  if (!sql) throw new Error('SQL client no disponible');

  const resultado = await sql`
    SELECT * FROM analysis_jobs 
    WHERE id = ${jobId}
    LIMIT 1
  `;

  return resultado.length > 0 ? resultado[0] as AnalysisJob : null;
}

/**
 * Obtiene el último job registrado para un hash
 */
export async function obtenerUltimoJobPorHash(hash: string): Promise<AnalysisJob | null> {
  if (!sql) throw new Error('SQL client no disponible');

  const resultado = await sql`
    SELECT * FROM analysis_jobs 
    WHERE hash_archivo = ${hash}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return resultado.length > 0 ? resultado[0] as AnalysisJob : null;
}

/**
 * Actualiza el progreso de un job (por ID o hash)
 */
export async function actualizarProgresoJob(
  jobIdOrHash: string,
  progress: number,
  currentStep?: string
): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  // Detectar si es UUID (con guiones) o hash (64 caracteres hex)
  const isUUID = jobIdOrHash.includes('-');

  if (isUUID) {
    await sql`
      UPDATE analysis_jobs 
      SET 
        progress = ${Math.min(100, Math.max(0, progress))},
        current_step = ${currentStep || null},
        updated_at = NOW()
      WHERE id = ${jobIdOrHash}
    `;
  } else {
    await sql`
      UPDATE analysis_jobs 
      SET 
        progress = ${Math.min(100, Math.max(0, progress))},
        current_step = ${currentStep || null},
        updated_at = NOW()
      WHERE hash_archivo = ${jobIdOrHash}
    `;
  }
}

/**
 * Marca un job como en proceso (por ID o hash)
 */
export async function marcarJobEnProceso(jobIdOrHash: string): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  const isUUID = jobIdOrHash.includes('-');

  if (isUUID) {
    await sql`
      UPDATE analysis_jobs 
      SET 
        status = 'processing',
        progress = 5,
        current_step = 'Iniciando análisis...',
        updated_at = NOW()
      WHERE id = ${jobIdOrHash}
    `;
  } else {
    await sql`
      UPDATE analysis_jobs 
      SET 
        status = 'processing',
        progress = 5,
        current_step = 'Iniciando análisis...',
        updated_at = NOW()
      WHERE hash_archivo = ${jobIdOrHash}
    `;
  }
}

/**
 * Marca un job como completado (por ID o hash)
 */
export async function marcarJobCompletado(
  jobIdOrHash: string,
  result?: any
): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  const isUUID = jobIdOrHash.includes('-');

  if (isUUID) {
    await sql`
      UPDATE analysis_jobs 
      SET 
        status = 'completed',
        progress = 100,
        current_step = 'Completado',
        result = ${result ? JSON.stringify(result) : null},
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${jobIdOrHash}
    `;
  } else {
    await sql`
      UPDATE analysis_jobs 
      SET 
        status = 'completed',
        progress = 100,
        current_step = 'Completado',
        result = ${result ? JSON.stringify(result) : null},
        completed_at = NOW(),
        updated_at = NOW()
      WHERE hash_archivo = ${jobIdOrHash}
    `;
  }
}

/**
 * Marca un job como fallido (por ID o hash)
 */
export async function marcarJobFallido(
  jobIdOrHash: string,
  errorMessage: string
): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  const isUUID = jobIdOrHash.includes('-');

  if (isUUID) {
    await sql`
      UPDATE analysis_jobs 
      SET 
        status = 'failed',
        error_message = ${errorMessage},
        updated_at = NOW()
      WHERE id = ${jobIdOrHash}
    `;
  } else {
    await sql`
      UPDATE analysis_jobs 
      SET 
        status = 'failed',
        error_message = ${errorMessage},
        updated_at = NOW()
      WHERE hash_archivo = ${jobIdOrHash}
    `;
  }
}

/**
 * Limpia jobs antiguos completados o fallidos (más de 24 horas)
 */
export async function limpiarJobsAntiguos(): Promise<number> {
  if (!sql) throw new Error('SQL client no disponible');

  const resultado = await sql`
    DELETE FROM analysis_jobs 
    WHERE 
      status IN ('completed', 'failed')
      AND updated_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  `;

  return resultado.length;
}
