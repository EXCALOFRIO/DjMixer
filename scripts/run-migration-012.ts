import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

/**
 * MIGRACIÓN 012: LIMPIEZA DE COLUMNAS INNECESARIAS
 * 
 * Elimina:
 * - artista (no se usa en el mix, solo en UI)
 * - transientes_ritmicos_ts_ms (no se usa)
 * - onset_rate (no se usa)
 * - key_strength (no se usa)
 * - integrated_loudness (no se usa)
 * - momentary_loudness (no se usa)
 * - short_term_loudness (no se usa)
 * - dynamic_range (no se usa)
 * - loudness_range (no se usa)
 * - replay_gain_db (no se usa)
 * - intro_duration_ms (no se usa)
 * - outro_duration_ms (no se usa)
 * - fade_in_duration_ms (no se usa)
 * - fade_out_duration_ms (no se usa)
 * 
 * Los datos existentes se preservan automáticamente.
 */

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('❌ DATABASE_URL no está configurado en .env');
  }

  console.log('🔄 Iniciando migración 012: Limpieza de columnas innecesarias...\n');

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    // Verificar que la tabla existe
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'canciones_analizadas'
      );
    `);

    if (!tableExists.rows[0]?.exists) {
      console.log('⚠️  Tabla canciones_analizadas no existe. Creando desde schema...');
      // Aquí podrías ejecutar el schema completo si fuera necesario
      throw new Error('Ejecuta primero el schema base');
    }

    console.log('✅ Tabla canciones_analizadas encontrada\n');

    // Contar registros antes
    const countBefore = await db.execute(sql`SELECT COUNT(*) FROM canciones_analizadas;`);
    console.log(`📊 Registros actuales: ${countBefore.rows[0]?.count || 0}\n`);

    console.log('🗑️  Eliminando columnas innecesarias...\n');

    // Eliminar columnas (si existen, sin error si no existen)
    const columnsToRemove = [
      'artista',
      'transientes_ritmicos_ts_ms',
      'onset_rate',
      'key_strength',
      'integrated_loudness',
      'momentary_loudness', 
      'short_term_loudness',
      'dynamic_range',
      'loudness_range',
      'replay_gain_db',
      'intro_duration_ms',
      'outro_duration_ms',
      'fade_in_duration_ms',
      'fade_out_duration_ms'
    ];

    for (const column of columnsToRemove) {
      try {
        await db.execute(sql.raw(`
          ALTER TABLE canciones_analizadas 
          DROP COLUMN IF EXISTS ${column};
        `));
        console.log(`   ✅ Columna '${column}' eliminada`);
      } catch (error: any) {
        if (error.message?.includes('does not exist')) {
          console.log(`   ⏭️  Columna '${column}' no existía`);
        } else {
          throw error;
        }
      }
    }

    console.log('\n🗑️  Eliminando índices innecesarios...\n');

    // Eliminar índice de artista (si existe)
    try {
      await db.execute(sql`DROP INDEX IF EXISTS idx_artista;`);
      console.log(`   ✅ Índice 'idx_artista' eliminado`);
    } catch (error) {
      console.log(`   ⏭️  Índice 'idx_artista' no existía`);
    }

    // Verificar estructura final
    const finalStructure = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas'
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 Estructura final de la tabla:\n');
    finalStructure.rows.forEach((row: any) => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });

    // Contar registros después
    const countAfter = await db.execute(sql`SELECT COUNT(*) FROM canciones_analizadas;`);
    console.log(`\n📊 Registros después de migración: ${countAfter.rows[0]?.count || 0}`);

    console.log('\n✅ Migración 012 completada exitosamente!');
    console.log('🎯 Base de datos limpia y optimizada\n');

  } catch (error) {
    console.error('\n❌ Error en migración:', error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Migración falló:', error);
  process.exit(1);
});
