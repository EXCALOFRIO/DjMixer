import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno desde .env
dotenv.config();

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL no está definida en .env o .env.local');
    console.error('💡 Asegúrate de tener un archivo .env.local con:');
    console.error('   DATABASE_URL=postgresql://...');
    process.exit(1);
  }

  console.log('🔄 Conectando a la base de datos Neon...');
  const sql = neon(databaseUrl);

  try {
    // 1. Listar todas las tablas existentes
    console.log('\n📋 Verificando tablas existentes...');
    const existingTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    if (existingTables.length > 0) {
      console.log('📦 Tablas encontradas:');
      existingTables.forEach((table: any) => {
        console.log(`   - ${table.table_name}`);
      });

      // 2. Eliminar todas las tablas existentes
      console.log('\n🗑️  Eliminando tablas antiguas...');
      for (const table of existingTables) {
        const tableName = table.table_name;
        await sql.unsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        console.log(`   ✓ Eliminada: ${tableName}`);
      }
    } else {
      console.log('   ℹ️  No hay tablas existentes');
    }

    // 3. Crear la tabla directamente
    console.log('\n🔄 Creando tabla canciones_analizadas...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS canciones_analizadas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hash_archivo VARCHAR(256) UNIQUE NOT NULL,
        titulo TEXT NOT NULL,
        artista TEXT NOT NULL,
        duracion_ms INTEGER NOT NULL,
        bpm FLOAT,
        tonalidad_camelot VARCHAR(3),
        energia FLOAT CHECK (energia >= 0 AND energia <= 1),
        bailabilidad FLOAT CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
        animo_general VARCHAR(50),
        downbeats_ts_ms JSONB,
        beats_ts_ms JSONB,
        frases_ts_ms JSONB,
        transientes_ritmicos_ts_ms JSONB,
        compas JSONB,
        cue_points JSONB,
        mix_in_point INTEGER,
        mix_out_point INTEGER,
        tonalidad_compatible JSONB,
        letras_ts JSONB,
        estructura_ts JSONB,
        analisis_contenido JSONB,
        analisis_espectral JSONB,
        fecha_procesado TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT valid_bpm CHECK (bpm IS NULL OR (bpm > 0 AND bpm < 300)),
        CONSTRAINT valid_duration CHECK (duracion_ms > 0)
      )
    `;
    
    console.log('✅ Tabla creada');
    
    // Crear índices
    console.log('🔄 Creando índices...');
    
    await sql`CREATE INDEX IF NOT EXISTS idx_hash_archivo ON canciones_analizadas(hash_archivo)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_artista ON canciones_analizadas(artista)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bpm ON canciones_analizadas(bpm)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tonalidad ON canciones_analizadas(tonalidad_camelot)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_energia ON canciones_analizadas(energia)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bailabilidad ON canciones_analizadas(bailabilidad)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fecha_procesado ON canciones_analizadas(fecha_procesado)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_letras_ts ON canciones_analizadas USING GIN (letras_ts)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_estructura_ts ON canciones_analizadas USING GIN (estructura_ts)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_analisis_contenido ON canciones_analizadas USING GIN (analisis_contenido)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_analisis_espectral ON canciones_analizadas USING GIN (analisis_espectral)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_cue_points ON canciones_analizadas USING GIN (cue_points)`;
    
    console.log('✅ Índices creados');

    // 4. Verificar la nueva tabla
    console.log('\n🔍 Verificando tabla creada...');
    
    // Listar todas las tablas después de crear
    const allTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('📦 Tablas actuales en la base de datos:');
    allTables.forEach((table: any) => {
      console.log(`   - ${table.table_name}`);
    });
    
    const result = await sql`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name = 'canciones_analizadas'
    `;

    if (result.length > 0) {
      console.log('✅ Tabla "canciones_analizadas" creada exitosamente');
      console.log(`   📊 Columnas: ${result[0].column_count}`);
      
      // Listar columnas
      const columns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'canciones_analizadas' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `;
      
      console.log('\n📋 Estructura de la tabla:');
      columns.forEach((col: any) => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });

      // Verificar índices
      const indexes = await sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'canciones_analizadas'
        AND schemaname = 'public'
      `;
      
      console.log(`\n🔑 Índices creados: ${indexes.length}`);
      indexes.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
      });

      console.log('\n✨ ¡Base de datos lista para usar!');
      console.log('💡 Ahora puedes ejecutar: npm run dev');
    } else {
      console.error('❌ Error: La tabla no se creó correctamente');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error al inicializar la base de datos:');
    console.error(error);
    console.error('\n💡 Verifica que:');
    console.error('   1. La DATABASE_URL sea correcta');
    console.error('   2. Tengas permisos en la base de datos');
    console.error('   3. La conexión a Neon esté activa');
    process.exit(1);
  }
}

console.log('🎵 Inicializador de Base de Datos - Sistema de Análisis Musical\n');
initDatabase();
