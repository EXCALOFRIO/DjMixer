-- ===================================================================
-- MIGRACIÓN 016: TIMELINE UNIFICADO
-- ===================================================================
-- Añade columna 'timeline' para modelo de línea de tiempo única
-- que reemplaza la separación entre estructura_ts y vocales_clave
-- ===================================================================

-- Añadir columna timeline a canciones_analizadas
ALTER TABLE canciones_analizadas 
ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]';

-- Crear índice GIN para búsquedas eficientes en el JSON
CREATE INDEX IF NOT EXISTS idx_timeline ON canciones_analizadas USING GIN (timeline);

-- Comentario explicativo
COMMENT ON COLUMN canciones_analizadas.timeline IS 'Línea de tiempo unificada con segmentos que incluyen tipo, vocales y descripción';

-- Nota: Mantenemos estructura_ts y vocales_clave por retrocompatibilidad
-- Se eliminarán en una migración futura una vez verificado que todo funciona
