-- Migración 010: Eliminar beats_loudness
-- Fecha: 2025-11-19
-- Descripción: Eliminar columna beats_loudness que será calculada dinámicamente en frontend

DO $$ BEGIN
  ALTER TABLE canciones_analizadas DROP COLUMN beats_loudness;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;
