-- ===================================================================
-- MIGRACIÓN LIMPIA: RECREAR TABLAS DESDE CERO
-- ===================================================================
-- Este script elimina y recrea todas las tablas con solo los campos
-- que realmente se usan en el código actual
-- ===================================================================

-- Eliminar tablas existentes
DROP TABLE IF EXISTS analysis_jobs CASCADE;
DROP TABLE IF EXISTS canciones_analizadas CASCADE;

-- ===================================================================
-- TABLA: canciones_analizadas (SCHEMA LIMPIO)
-- ===================================================================
CREATE TABLE canciones_analizadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash_archivo VARCHAR(256) UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    duracion_ms INTEGER NOT NULL CHECK (duracion_ms > 0),
    
    -- ===================================================================
    -- MÉTRICAS BÁSICAS
    -- ===================================================================
    bpm FLOAT NOT NULL CHECK (bpm > 0 AND bpm < 300),
    tonalidad_camelot VARCHAR(3) NOT NULL,
    tonalidad_compatible JSONB NOT NULL DEFAULT '[]',
    bailabilidad FLOAT NOT NULL CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
    compas JSONB NOT NULL DEFAULT '{"numerador": 4, "denominador": 4}',
    
    -- ===================================================================
    -- TIMING Y ESTRUCTURA
    -- ===================================================================
    beats_ts_ms JSONB NOT NULL DEFAULT '[]',
    downbeats_ts_ms JSONB NOT NULL DEFAULT '[]',
    frases_ts_ms JSONB NOT NULL DEFAULT '[]',
    
    -- ===================================================================
    -- DATOS DE GEMINI (DJ-CENTRIC)
    -- ===================================================================
    vocales_clave JSONB NOT NULL DEFAULT '[]',
    loops_transicion JSONB NOT NULL DEFAULT '[]',
    estructura_ts JSONB NOT NULL DEFAULT '[]',
    
    -- ===================================================================
    -- DATOS TÉCNICOS (VAD)
    -- ===================================================================
    segmentos_voz JSONB NOT NULL DEFAULT '[]',
    huecos_analizados JSONB NOT NULL DEFAULT '[]',
    
    -- ===================================================================
    -- METADATOS
    -- ===================================================================
    fecha_procesado TIMESTAMPTZ DEFAULT NOW()
);

-- ===================================================================
-- TABLA: analysis_jobs
-- ===================================================================
CREATE TABLE analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash_archivo VARCHAR(256) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    current_step TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================================================================
-- ÍNDICES PARA OPTIMIZAR CONSULTAS
-- ===================================================================
CREATE INDEX idx_hash_archivo ON canciones_analizadas(hash_archivo);
CREATE INDEX idx_bpm ON canciones_analizadas(bpm);
CREATE INDEX idx_tonalidad ON canciones_analizadas(tonalidad_camelot);
CREATE INDEX idx_bailabilidad ON canciones_analizadas(bailabilidad);
CREATE INDEX idx_fecha_procesado ON canciones_analizadas(fecha_procesado);

CREATE INDEX idx_job_hash ON analysis_jobs(hash_archivo);
CREATE INDEX idx_job_status ON analysis_jobs(status);
CREATE INDEX idx_job_created ON analysis_jobs(created_at);
