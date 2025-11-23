/**
 * Sistema de Jobs Asíncronos para análisis de audio
 * Permite procesar canciones en segundo plano sin bloquear al usuario
 */

import { sql } from './db';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  hash: string;
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

  const resultado = await sql`
    INSERT INTO analysis_jobs (
      id, hash, status, progress, created_at, updated_at
    ) VALUES (
      ${hash},
      ${hash},
      'pending',
      0,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) 
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
    WHERE hash = ${hash}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return resultado.length > 0 ? resultado[0] as AnalysisJob : null;
}

/**
 * Actualiza el progreso de un job
 */
export async function actualizarProgresoJob(
  jobId: string,
  progress: number,
  currentStep?: string
): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  await sql`
    UPDATE analysis_jobs 
    SET 
      progress = ${Math.min(100, Math.max(0, progress))},
      current_step = ${currentStep || null},
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

/**
 * Marca un job como en proceso
 */
export async function marcarJobEnProceso(jobId: string): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  await sql`
    UPDATE analysis_jobs 
    SET 
      status = 'processing',
      progress = 5,
      current_step = 'Iniciando análisis...',
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

/**
 * Marca un job como completado
 */
export async function marcarJobCompletado(
  jobId: string,
  result?: any
): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  await sql`
    UPDATE analysis_jobs 
    SET 
      status = 'completed',
      progress = 100,
      current_step = 'Completado',
      result = ${result ? JSON.stringify(result) : null},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

/**
 * Marca un job como fallido
 */
export async function marcarJobFallido(
  jobId: string,
  errorMessage: string
): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  await sql`
    UPDATE analysis_jobs 
    SET 
      status = 'failed',
      error_message = ${errorMessage},
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
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
