-- ===================================================================
-- SCHEMA OPTIMIZADO - SOLO LO QUE SE USA REALMENTE
-- ===================================================================
-- Elimina todas las columnas de Essentia que siempre están NULL
-- Mantiene solo las métricas básicas necesarias para DJs
-- ===================================================================

CREATE TABLE IF NOT EXISTS canciones_analizadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash_archivo VARCHAR(256) UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    artista TEXT NOT NULL,
    duracion_ms INTEGER NOT NULL,
    
    -- ===================================================================
    -- MÉTRICAS BÁSICAS (LAS QUE SÍ SE USAN)
    -- ===================================================================
    bpm FLOAT NOT NULL CHECK (bpm > 0 AND bpm < 300),
    tonalidad_camelot VARCHAR(3) NOT NULL,
    tonalidad_compatible JSONB NOT NULL DEFAULT '[]',
    energia FLOAT NOT NULL CHECK (energia >= 0 AND energia <= 1),
    bailabilidad FLOAT NOT NULL CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
    animo_general VARCHAR(50) NOT NULL,
    compas JSONB NOT NULL DEFAULT '{"numerador": 4, "denominador": 4}',
    
    -- ===================================================================
    -- TIMING Y ESTRUCTURA (LO ESENCIAL PARA MIX)
    -- ===================================================================
    beats_ts_ms JSONB NOT NULL DEFAULT '[]',
    downbeats_ts_ms JSONB NOT NULL DEFAULT '[]',
    frases_ts_ms JSONB NOT NULL DEFAULT '[]',
    
    -- ===================================================================
    -- DATOS DE GEMINI (LETRAS Y ESTRUCTURA)
    -- ===================================================================
    letras_ts JSONB NOT NULL DEFAULT '[]',
    estructura_ts JSONB NOT NULL DEFAULT '[]',
    analisis_contenido JSONB NOT NULL DEFAULT '{"tema": {"resumen": "", "palabras_clave": [], "emocion": "neutral"}, "eventos_dj": []}',
    
    -- ===================================================================
    -- DATOS TÉCNICOS (VAD + RMS)
    -- ===================================================================
    segmentos_voz JSONB NOT NULL DEFAULT '[]',
    huecos_analizados JSONB NOT NULL DEFAULT '[]',
    
    -- ===================================================================
    -- METADATOS
    -- ===================================================================
    fecha_procesado TIMESTAMPTZ DEFAULT NOW(),
    
    -- ===================================================================
    -- CONSTRAINTS DE VALIDACIÓN
    -- ===================================================================
    CONSTRAINT valid_duration CHECK (duracion_ms > 0)
);

-- ===================================================================
-- ÍNDICES PARA OPTIMIZAR CONSULTAS
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_hash_archivo ON canciones_analizadas(hash_archivo);
CREATE INDEX IF NOT EXISTS idx_artista ON canciones_analizadas(artista);
CREATE INDEX IF NOT EXISTS idx_bpm ON canciones_analizadas(bpm);
CREATE INDEX IF NOT EXISTS idx_tonalidad ON canciones_analizadas(tonalidad_camelot);
CREATE INDEX IF NOT EXISTS idx_energia ON canciones_analizadas(energia);
CREATE INDEX IF NOT EXISTS idx_bailabilidad ON canciones_analizadas(bailabilidad);
CREATE INDEX IF NOT EXISTS idx_fecha_procesado ON canciones_analizadas(fecha_procesado);
