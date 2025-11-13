-- Migración 005: Sistema de Jobs Asíncronos
-- Permite procesar análisis en segundo plano sin bloquear al usuario

-- Crear tabla de jobs de análisis
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step TEXT,
  error_message TEXT,
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_hash ON analysis_jobs(hash);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created_at ON analysis_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_updated_at ON analysis_jobs(updated_at);

-- Índice compuesto para limpieza de jobs antiguos
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_cleanup 
  ON analysis_jobs(status, updated_at);

COMMENT ON TABLE analysis_jobs IS 'Jobs de análisis de audio procesados en segundo plano';
COMMENT ON COLUMN analysis_jobs.id IS 'ID del job (usualmente el hash del archivo)';
COMMENT ON COLUMN analysis_jobs.hash IS 'Hash SHA-256 del archivo de audio';
COMMENT ON COLUMN analysis_jobs.status IS 'Estado: pending, processing, completed, failed';
COMMENT ON COLUMN analysis_jobs.progress IS 'Progreso del análisis (0-100)';
COMMENT ON COLUMN analysis_jobs.current_step IS 'Descripción del paso actual';
COMMENT ON COLUMN analysis_jobs.error_message IS 'Mensaje de error si el job falló';
COMMENT ON COLUMN analysis_jobs.result IS 'Resultado del análisis (opcional)';
