-- ===================================================================
-- MIGRACIÓN 004: OPTIMIZAR SCHEMA - ELIMINAR COLUMNAS NO USADAS
-- ===================================================================
-- Elimina todas las columnas de Essentia que siempre están NULL
-- Mantiene solo lo esencial para el funcionamiento de DJ Mixer
-- ===================================================================

-- Paso 1: Crear tabla temporal con estructura optimizada
CREATE TABLE IF NOT EXISTS canciones_analizadas_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash_archivo VARCHAR(256) UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    artista TEXT NOT NULL,
    duracion_ms INTEGER NOT NULL,
    
    -- MÉTRICAS BÁSICAS (LAS QUE SÍ SE USAN)
    bpm FLOAT NOT NULL CHECK (bpm > 0 AND bpm < 300),
    tonalidad_camelot VARCHAR(3) NOT NULL,
    tonalidad_compatible JSONB NOT NULL DEFAULT '[]',
    energia FLOAT NOT NULL CHECK (energia >= 0 AND energia <= 1),
    bailabilidad FLOAT NOT NULL CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
    animo_general VARCHAR(50) NOT NULL,
    compas JSONB NOT NULL DEFAULT '{"numerador": 4, "denominador": 4}',
    
    -- TIMING Y ESTRUCTURA (LO ESENCIAL PARA MIX)
    beats_ts_ms JSONB NOT NULL DEFAULT '[]',
    downbeats_ts_ms JSONB NOT NULL DEFAULT '[]',
    frases_ts_ms JSONB NOT NULL DEFAULT '[]',
    
    -- DATOS DE GEMINI (LETRAS Y ESTRUCTURA)
    letras_ts JSONB NOT NULL DEFAULT '[]',
    estructura_ts JSONB NOT NULL DEFAULT '[]',
    analisis_contenido JSONB NOT NULL DEFAULT '{"tema": {"resumen": "", "palabras_clave": [], "emocion": "neutral"}, "eventos_dj": []}',
    
    -- METADATOS
    fecha_procesado TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_duration CHECK (duracion_ms > 0)
);

-- Paso 2: Copiar datos existentes (solo las columnas que se mantienen)
INSERT INTO canciones_analizadas_new (
    id,
    hash_archivo,
    titulo,
    artista,
    duracion_ms,
    bpm,
    tonalidad_camelot,
    tonalidad_compatible,
    energia,
    bailabilidad,
    animo_general,
    compas,
    beats_ts_ms,
    downbeats_ts_ms,
    frases_ts_ms,
    letras_ts,
    estructura_ts,
    analisis_contenido,
    fecha_procesado
)
SELECT 
    id,
    hash_archivo,
    titulo,
    artista,
    duracion_ms,
    COALESCE(bpm, 120),
    COALESCE(tonalidad_camelot, '8A'),
    COALESCE(tonalidad_compatible, '[]'::jsonb),
    COALESCE(energia, 0.5),
    COALESCE(bailabilidad, 0.5),
    COALESCE(animo_general, 'neutral'),
    COALESCE(compas, '{"numerador": 4, "denominador": 4}'::jsonb),
    COALESCE(beats_ts_ms, '[]'::jsonb),
    COALESCE(downbeats_ts_ms, '[]'::jsonb),
    COALESCE(frases_ts_ms, '[]'::jsonb),
    COALESCE(letras_ts, '[]'::jsonb),
    COALESCE(estructura_ts, '[]'::jsonb),
    COALESCE(analisis_contenido, '{"tema": {"resumen": "", "palabras_clave": [], "emocion": "neutral"}, "eventos_dj": []}'::jsonb),
    fecha_procesado
FROM canciones_analizadas;

-- Paso 3: Eliminar tabla antigua
DROP TABLE IF EXISTS canciones_analizadas CASCADE;

-- Paso 4: Renombrar tabla nueva
ALTER TABLE canciones_analizadas_new RENAME TO canciones_analizadas;

-- Paso 5: Recrear índices
CREATE INDEX IF NOT EXISTS idx_hash_archivo ON canciones_analizadas(hash_archivo);
CREATE INDEX IF NOT EXISTS idx_artista ON canciones_analizadas(artista);
CREATE INDEX IF NOT EXISTS idx_bpm ON canciones_analizadas(bpm);
CREATE INDEX IF NOT EXISTS idx_tonalidad ON canciones_analizadas(tonalidad_camelot);
CREATE INDEX IF NOT EXISTS idx_energia ON canciones_analizadas(energia);
CREATE INDEX IF NOT EXISTS idx_bailabilidad ON canciones_analizadas(bailabilidad);
CREATE INDEX IF NOT EXISTS idx_fecha_procesado ON canciones_analizadas(fecha_procesado);

-- ===================================================================
-- RESUMEN DE CAMBIOS:
-- ===================================================================
-- ELIMINADAS (41 columnas → 18 columnas):
-- ❌ ritmo_onset_rate, ritmo_beats_loudness, ritmo_danceability, ritmo_dynamic_complexity, ritmo_bpm_histogram
-- ❌ tonal_key, tonal_scale, tonal_key_strength, tonal_chords, tonal_tuning_frequency, tonal_harmonic_complexity, tonal_dissonance
-- ❌ espectral_centroid, espectral_rolloff, espectral_flux, espectral_complexity, espectral_contrast, espectral_zero_crossing_rate
-- ❌ timbre_mfcc, timbre_brightness, timbre_roughness, timbre_warmth, timbre_sharpness
-- ❌ loudness_integrated, loudness_momentary, loudness_short_term, loudness_dynamic_range, loudness_range
-- ❌ mood_acoustic, mood_electronic, mood_aggressive, mood_relaxed, mood_happy, mood_sad, mood_party, mood_voice_instrumental
-- ❌ estructura_segmentos, estructura_intro_ms, estructura_outro_ms, estructura_fade_in_ms, estructura_fade_out_ms
--
-- MANTENIDAS (18 columnas):
-- ✅ id, hash_archivo, titulo, artista, duracion_ms
-- ✅ bpm, tonalidad_camelot, tonalidad_compatible, energia, bailabilidad, animo_general, compas
-- ✅ beats_ts_ms, downbeats_ts_ms, frases_ts_ms
-- ✅ letras_ts, estructura_ts, analisis_contenido
-- ✅ fecha_procesado
-- ===================================================================
