import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function runMigration004() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    console.log('🔄 INICIANDO MIGRACIÓN 004: OPTIMIZAR SCHEMA\n');
    console.log('📋 Eliminando 35 columnas no utilizadas...\n');
    
    // Paso 1: Crear tabla temporal con estructura optimizada
    console.log('1️⃣  Creando tabla temporal optimizada...');
    await sql`
      CREATE TABLE IF NOT EXISTS canciones_analizadas_new (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hash_archivo VARCHAR(256) UNIQUE NOT NULL,
        titulo TEXT NOT NULL,
        artista TEXT NOT NULL,
        duracion_ms INTEGER NOT NULL,
        bpm FLOAT NOT NULL CHECK (bpm > 0 AND bpm < 300),
        tonalidad_camelot VARCHAR(3) NOT NULL,
        tonalidad_compatible JSONB NOT NULL DEFAULT '[]',
        energia FLOAT NOT NULL CHECK (energia >= 0 AND energia <= 1),
        bailabilidad FLOAT NOT NULL CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
        animo_general VARCHAR(50) NOT NULL,
        compas JSONB NOT NULL DEFAULT '{"numerador": 4, "denominador": 4}',
        beats_ts_ms JSONB NOT NULL DEFAULT '[]',
        downbeats_ts_ms JSONB NOT NULL DEFAULT '[]',
        frases_ts_ms JSONB NOT NULL DEFAULT '[]',
        letras_ts JSONB NOT NULL DEFAULT '[]',
        estructura_ts JSONB NOT NULL DEFAULT '[]',
        analisis_contenido JSONB NOT NULL DEFAULT '{"tema": {"resumen": "", "palabras_clave": [], "emocion": "neutral"}, "eventos_dj": []}',
        fecha_procesado TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT valid_duration CHECK (duracion_ms > 0)
      )
    `;
    console.log('   ✅ Tabla temporal creada\n');
    
    // Paso 2: Copiar datos existentes
    console.log('2️⃣  Copiando datos existentes...');
    await sql`
      INSERT INTO canciones_analizadas_new (
        id, hash_archivo, titulo, artista, duracion_ms,
        bpm, tonalidad_camelot, tonalidad_compatible,
        energia, bailabilidad, animo_general, compas,
        beats_ts_ms, downbeats_ts_ms, frases_ts_ms,
        letras_ts, estructura_ts, analisis_contenido, fecha_procesado
      )
      SELECT 
        id, hash_archivo, titulo, artista, duracion_ms,
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
      FROM canciones_analizadas
    `;
    console.log('   ✅ Datos copiados\n');
    
    // Paso 3: Eliminar tabla antigua
    console.log('3️⃣  Eliminando tabla antigua...');
    await sql`DROP TABLE IF EXISTS canciones_analizadas CASCADE`;
    console.log('   ✅ Tabla antigua eliminada\n');
    
    // Paso 4: Renombrar tabla nueva
    console.log('4️⃣  Renombrando tabla nueva...');
    await sql`ALTER TABLE canciones_analizadas_new RENAME TO canciones_analizadas`;
    console.log('   ✅ Tabla renombrada\n');
    
    // Paso 5: Recrear índices
    console.log('5️⃣  Recreando índices...');
    await sql`CREATE INDEX IF NOT EXISTS idx_hash_archivo ON canciones_analizadas(hash_archivo)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_artista ON canciones_analizadas(artista)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bpm ON canciones_analizadas(bpm)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tonalidad ON canciones_analizadas(tonalidad_camelot)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_energia ON canciones_analizadas(energia)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bailabilidad ON canciones_analizadas(bailabilidad)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fecha_procesado ON canciones_analizadas(fecha_procesado)`;
    console.log('   ✅ Índices recreados\n');
    
    console.log('\n✅ MIGRACIÓN COMPLETADA EXITOSAMENTE\n');
    
    // Verificar estructura final
    console.log('🔍 Verificando estructura final...');
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas' 
      ORDER BY ordinal_position
    `;
    
    console.log(`\n📊 Total de columnas: ${columns.length}\n`);
    console.log('Columnas actuales:');
    columns.forEach((col: any, i: number) => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      console.log(`  ${i + 1}. ${col.column_name} - ${col.data_type} ${nullable}`);
    });
    
    console.log('\n✨ ¡Schema optimizado con éxito!');
    console.log('   - De 41 columnas a 18 columnas');
    console.log('   - Eliminadas todas las métricas de Essentia no utilizadas');
    console.log('   - Solo se mantienen las métricas esenciales para DJ\n');
    
  } catch (error: any) {
    console.error('❌ Error en migración:', error.message);
    process.exit(1);
  }
}

runMigration004();
