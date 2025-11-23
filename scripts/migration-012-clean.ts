import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

/**
 * MIGRACIÓN 012: LIMPIEZA DE COLUMNAS INNECESARIAS
 * 
 * Elimina:
 * - artista (no se usa en el mix, solo en UI)
 * - transientes_ritmicos_ts_ms, onset_rate, key_strength
 * - integrated_loudness, momentary_loudness, short_term_loudness
 * - dynamic_range, loudness_range, replay_gain_db
 * - intro_duration_ms, outro_duration_ms
 * - fade_in_duration_ms, fade_out_duration_ms
 * 
 * Los datos existentes se preservan automáticamente.
 */

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('❌ DATABASE_URL no está configurado en .env');
  }

  console.log('🔄 Iniciando migración 012: Limpieza de columnas innecesarias...\n');

  const sql = neon(connectionString);

  try {
    // Verificar que la tabla existe
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'canciones_analizadas'
      );
    `;

    if (!tableExists[0]?.exists) {
      console.log('⚠️  Tabla canciones_analizadas no existe.');
      throw new Error('Ejecuta primero el schema base');
    }

    console.log('✅ Tabla canciones_analizadas encontrada\n');

    // Contar registros antes
    const countBefore = await sql`SELECT COUNT(*) FROM canciones_analizadas;`;
    console.log(`📊 Registros actuales: ${countBefore[0]?.count || 0}\n`);

    console.log('🗑️  Eliminando columnas innecesarias...\n');

    // Eliminar artista
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS artista;`;
      console.log(`   ✅ Columna 'artista' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  artista:`, e.message);
    }

    // Eliminar transientes_ritmicos_ts_ms  
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS transientes_ritmicos_ts_ms;`;
      console.log(`   ✅ Columna 'transientes_ritmicos_ts_ms' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  transientes_ritmicos_ts_ms:`, e.message);
    }

    // Eliminar onset_rate
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS onset_rate;`;
      console.log(`   ✅ Columna 'onset_rate' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  onset_rate:`, e.message);
    }

    // Eliminar key_strength
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS key_strength;`;
      console.log(`   ✅ Columna 'key_strength' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  key_strength:`, e.message);
    }

    // Eliminar integrated_loudness
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS integrated_loudness;`;
      console.log(`   ✅ Columna 'integrated_loudness' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  integrated_loudness:`, e.message);
    }

    // Eliminar momentary_loudness
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS momentary_loudness;`;
      console.log(`   ✅ Columna 'momentary_loudness' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  momentary_loudness:`, e.message);
    }

    // Eliminar short_term_loudness
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS short_term_loudness;`;
      console.log(`   ✅ Columna 'short_term_loudness' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  short_term_loudness:`, e.message);
    }

    // Eliminar dynamic_range
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS dynamic_range;`;
      console.log(`   ✅ Columna 'dynamic_range' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  dynamic_range:`, e.message);
    }

    // Eliminar loudness_range
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS loudness_range;`;
      console.log(`   ✅ Columna 'loudness_range' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  loudness_range:`, e.message);
    }

    // Eliminar replay_gain_db
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS replay_gain_db;`;
      console.log(`   ✅ Columna 'replay_gain_db' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  replay_gain_db:`, e.message);
    }

    // Eliminar intro_duration_ms
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS intro_duration_ms;`;
      console.log(`   ✅ Columna 'intro_duration_ms' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  intro_duration_ms:`, e.message);
    }

    // Eliminar outro_duration_ms
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS outro_duration_ms;`;
      console.log(`   ✅ Columna 'outro_duration_ms' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  outro_duration_ms:`, e.message);
    }

    // Eliminar fade_in_duration_ms
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS fade_in_duration_ms;`;
      console.log(`   ✅ Columna 'fade_in_duration_ms' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  fade_in_duration_ms:`, e.message);
    }

    // Eliminar fade_out_duration_ms
    try {
      await sql`ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS fade_out_duration_ms;`;
      console.log(`   ✅ Columna 'fade_out_duration_ms' eliminada`);
    } catch (e: any) {
      console.log(`   ⚠️  fade_out_duration_ms:`, e.message);
    }

    console.log('\n🗑️  Eliminando índices innecesarios...\n');

    // Eliminar índice de artista
    try {
      await sql`DROP INDEX IF EXISTS idx_artista;`;
      console.log(`   ✅ Índice 'idx_artista' eliminado`);
    } catch (error) {
      console.log(`   ⏭️  Índice no existía`);
    }

    // Verificar estructura final
    const finalStructure = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas'
      ORDER BY ordinal_position;
    `;

    console.log('\n📋 Estructura final de la tabla:\n');
    finalStructure.forEach((row: any) => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });

    // Contar registros después
    const countAfter = await sql`SELECT COUNT(*) FROM canciones_analizadas;`;
    console.log(`\n📊 Registros después de migración: ${countAfter[0]?.count || 0}`);

    console.log('\n✅ Migración 012 completada exitosamente!');
    console.log('🎯 Base de datos limpia y optimizada\n');

  } catch (error) {
    console.error('\n❌ Error en migración:', error);
    throw error;
  }
}

main().catch((error) => {
  console.error('❌ Migración falló:', error);
  process.exit(1);
});
