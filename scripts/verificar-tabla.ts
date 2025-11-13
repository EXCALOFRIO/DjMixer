import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function verifyMigration() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    console.log('🔍 Verificando estructura de la tabla canciones_analizadas...\n');
    
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas' 
      ORDER BY ordinal_position
    `;
    
    console.log(`📋 Total de columnas: ${columns.length}\n`);
    
    // Agrupar por categoría
    const categorias = {
      basicas: columns.filter((c: any) => 
        ['id', 'hash_archivo', 'titulo', 'artista', 'duracion_ms', 'fecha_procesado'].includes(c.column_name)
      ),
      metricas: columns.filter((c: any) => 
        ['bpm', 'tonalidad_camelot', 'tonalidad_compatible', 'energia', 'bailabilidad', 'animo_general', 'compas'].includes(c.column_name)
      ),
      timing: columns.filter((c: any) => 
        c.column_name.endsWith('_ts_ms') || c.column_name.includes('beats') || c.column_name.includes('frases')
      ),
      ritmo: columns.filter((c: any) => c.column_name.startsWith('ritmo_')),
      tonal: columns.filter((c: any) => c.column_name.startsWith('tonal_')),
      espectral: columns.filter((c: any) => c.column_name.startsWith('espectral_')),
      timbre: columns.filter((c: any) => c.column_name.startsWith('timbre_')),
      loudness: columns.filter((c: any) => c.column_name.startsWith('loudness_')),
      mood: columns.filter((c: any) => c.column_name.startsWith('mood_')),
      estructura: columns.filter((c: any) => c.column_name.startsWith('estructura_')),
      gemini: columns.filter((c: any) => 
        ['letras_ts', 'estructura_ts', 'analisis_contenido'].includes(c.column_name)
      )
    };
    
    console.log('📊 Columnas por categoría:\n');
    console.log(`🔹 Básicas: ${categorias.basicas.length}`);
    console.log(`🔹 Métricas: ${categorias.metricas.length}`);
    console.log(`🔹 Timing: ${categorias.timing.length}`);
    console.log(`🔹 Ritmo avanzado: ${categorias.ritmo.length} (esperado: 5)`);
    console.log(`🔹 Tonal avanzado: ${categorias.tonal.length} (esperado: 7)`);
    console.log(`🔹 Espectral: ${categorias.espectral.length} (esperado: 6)`);
    console.log(`🔹 Timbre: ${categorias.timbre.length} (esperado: 5)`);
    console.log(`🔹 Loudness: ${categorias.loudness.length} (esperado: 5)`);
    console.log(`🔹 Mood: ${categorias.mood.length} (esperado: 8)`);
    console.log(`🔹 Estructura: ${categorias.estructura.length} (esperado: 5)`);
    console.log(`🔹 Gemini: ${categorias.gemini.length}\n`);
    
    // Mostrar todas las columnas
    console.log('📝 Todas las columnas:\n');
    columns.forEach((c: any, i: number) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${c.column_name.padEnd(35)} ${c.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyMigration();
