-- Migración: Eliminar columna segmentos_voz
-- Fecha: 2025-11-26
-- Descripción: Elimina la columna segmentos_voz de la tabla canciones_analizadas

ALTER TABLE canciones_analizadas 
DROP COLUMN IF EXISTS segmentos_voz;
