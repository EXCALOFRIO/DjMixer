-- ===================================================================
-- SCHEMA ULTRA-OPTIMIZADO - TIMELINE UNIFICADO
-- ===================================================================
-- UNA SOLA FUENTE DE VERDAD: timeline
-- Máxima velocidad y eficiencia - Sin redundancias
-- ===================================================================

CREATE TABLE IF NOT EXISTS canciones_analizadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash_archivo VARCHAR(256) UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    duracion_ms INTEGER NOT NULL,
    
    -- ===================================================================
    -- MÉTRICAS BÁSICAS (ESENCIALES PARA MIX)
    -- ===================================================================
    bpm FLOAT NOT NULL CHECK (bpm > 0 AND bpm < 300),
    tonalidad_camelot VARCHAR(3) NOT NULL,
    tonalidad_compatible JSONB NOT NULL DEFAULT '[]',
    bailabilidad FLOAT NOT NULL CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
    compas JSONB NOT NULL DEFAULT '{"numerador": 4, "denominador": 4}',
    
    -- ===================================================================
    -- TIMING Y ESTRUCTURA (LO ESENCIAL PARA MIX)
    -- ===================================================================
    beats_ts_ms JSONB NOT NULL DEFAULT '[]',
    downbeats_ts_ms JSONB NOT NULL DEFAULT '[]',
    frases_ts_ms JSONB NOT NULL DEFAULT '[]',
    
    -- ===================================================================
    -- DATOS DE GEMINI (TIMELINE UNIFICADO)
    -- ===================================================================
    -- timeline: Línea de tiempo única con segmentos contiguos
    -- Cada segmento: {inicio, fin, tipo_seccion, has_vocals, descripcion}
    -- Reemplaza: estructura_ts, vocales_clave, huecos_analizados
    timeline JSONB NOT NULL DEFAULT '[]',
    
    -- loops_transicion: Frases cortas para loops DJ (2-8s)
    -- Se mantiene separado porque es independiente de la estructura
    loops_transicion JSONB NOT NULL DEFAULT '[]',
    
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
CREATE INDEX IF NOT EXISTS idx_bpm ON canciones_analizadas(bpm);
CREATE INDEX IF NOT EXISTS idx_tonalidad ON canciones_analizadas(tonalidad_camelot);
CREATE INDEX IF NOT EXISTS idx_bailabilidad ON canciones_analizadas(bailabilidad);
CREATE INDEX IF NOT EXISTS idx_fecha_procesado ON canciones_analizadas(fecha_procesado);

-- Índice GIN para búsquedas en JSONB (sintaxis PostgreSQL válida)
-- El linter puede mostrar error porque espera sintaxis Oracle, pero es correcto
CREATE INDEX IF NOT EXISTS idx_timeline ON canciones_analizadas USING GIN (timeline);
