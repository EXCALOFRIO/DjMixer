/**
 * Script de migración 006: Agregar campos VAD, RMS y huecos analizados
 * Ejecutar: npx tsx scripts/run-migration-006.ts
 */

// CRÍTICO: Cargar variables de entorno ANTES de cualquier import
import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
console.log('📂 Cargando variables de entorno desde:', envPath);
const result = config({ path: envPath });

if (result.error) {
  console.error('❌ Error cargando .env:', result.error);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no encontrada en .env');
  console.error('Variables disponibles:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
  process.exit(1);
}

console.log('✅ DATABASE_URL cargada correctamente\n');

async function runMigration() {
  console.log('🔄 Ejecutando migración 006: Agregar campos VAD, RMS y huecos analizados...');
  
  // Importar dinámicamente después de cargar variables
  const { sql } = await import('../src/lib/db.js');
  
  try {
    // Agregar columna segmentos_voz
    await sql`
      ALTER TABLE canciones_analizadas 
      ADD COLUMN IF NOT EXISTS segmentos_voz JSONB NOT NULL DEFAULT '[]'
    `;
    console.log('✅ Columna segmentos_voz agregada');
    
    // Agregar columna perfil_energia_rms
    await sql`
      ALTER TABLE canciones_analizadas 
      ADD COLUMN IF NOT EXISTS perfil_energia_rms JSONB NOT NULL DEFAULT '[]'
    `;
    console.log('✅ Columna perfil_energia_rms agregada');
    
    // Agregar columna huecos_analizados
    await sql`
      ALTER TABLE canciones_analizadas 
      ADD COLUMN IF NOT EXISTS huecos_analizados JSONB NOT NULL DEFAULT '[]'
    `;
    console.log('✅ Columna huecos_analizados agregada');
    
    // Agregar comentarios de documentación
    await sql`
      COMMENT ON COLUMN canciones_analizadas.segmentos_voz IS 
      'Segmentos de voz detectados por VAD (Voice Activity Detection). Array de objetos {start_ms, end_ms}'
    `;
    
    await sql`
      COMMENT ON COLUMN canciones_analizadas.perfil_energia_rms IS 
      'Perfil de energía RMS calculado cada 250ms. Array de valores normalizados (0-1)'
    `;
    
    await sql`
      COMMENT ON COLUMN canciones_analizadas.huecos_analizados IS 
      'Análisis de huecos instrumentales entre segmentos VAD. Array de objetos {inicio_ms, fin_ms, tipo, descripcion, energia_relativa}'
    `;
    
    console.log('✅ Comentarios de documentación agregados');
    
    // Verificar que las columnas existen
    const verificacion = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas' 
      AND column_name IN ('segmentos_voz', 'perfil_energia_rms', 'huecos_analizados')
    `;
    
    if (verificacion.length === 3) {
      console.log('✅ Verificación exitosa: todas las columnas fueron creadas');
      console.log('\n📊 Columnas agregadas:');
      verificacion.forEach((col: any) => {
        console.log(`   - ${col.column_name}`);
      });
    } else {
      throw new Error(`Solo se crearon ${verificacion.length} de 3 columnas`);
    }
    
    console.log('\n✅ Migración 006 completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  }
}

runMigration().catch(console.error);
