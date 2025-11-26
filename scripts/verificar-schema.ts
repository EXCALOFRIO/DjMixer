/**
 * Script de verificación del schema de la base de datos
 * Ejecutar: npx tsx scripts/verificar-schema.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function verificarSchema() {
  console.log('🔍 Verificando schema de canciones_analizadas...\n');

  const { sql } = await import('../src/lib/db.js');

  try {
    // Obtener todas las columnas de la tabla
    const columnas = await sql`
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas'
      ORDER BY ordinal_position
    `;

    console.log('📊 Columnas en canciones_analizadas:');
    console.log('═'.repeat(80));

    const columnasNuevas = ['segmentos_voz', 'perfil_energia_rms', 'huecos_analizados'];

    columnas.forEach((col: any) => {
      const esNueva = columnasNuevas.includes(col.column_name);
      const icono = esNueva ? '✨' : '  ';
      console.log(`${icono} ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(15)} | ${col.is_nullable}`);
    });

    console.log('═'.repeat(80));

    // Verificar campos específicos
    const camposRequeridos = [
      'segmentos_voz',
      'huecos_analizados'
    ];

    const camposEncontrados = columnas.map((c: any) => c.column_name);
    const camposFaltantes = camposRequeridos.filter(c => !camposEncontrados.includes(c));

    if (camposFaltantes.length === 0) {
      console.log('\n✅ Todos los campos requeridos están presentes');
      console.log('\n🎉 Schema verificado correctamente');
    } else {
      console.error('\n❌ Campos faltantes:', camposFaltantes.join(', '));
      process.exit(1);
    }

    // Mostrar total de registros
    const count = await sql`SELECT COUNT(*) as total FROM canciones_analizadas`;
    console.log(`\n📈 Total de canciones en BD: ${count[0].total}`);

  } catch (error) {
    console.error('❌ Error verificando schema:', error);
    throw error;
  }
}

verificarSchema().catch(console.error);
