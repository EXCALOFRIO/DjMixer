import 'dotenv/config';
import { sql } from '../src/lib/db';

async function checkColumns() {
    try {
        const result = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas' 
      ORDER BY ordinal_position
    `;

        console.log('📋 Columnas en canciones_analizadas:');
        result.forEach((row: any) => console.log(`  - ${row.column_name}`));

        const hasLetrasTs = result.some((row: any) => row.column_name === 'letras_ts');
        const hasVocalesClave = result.some((row: any) => row.column_name === 'vocales_clave');
        const hasLoopsTransicion = result.some((row: any) => row.column_name === 'loops_transicion');

        console.log('\n✅ Estado de migración:');
        console.log(`  letras_ts: ${hasLetrasTs ? '❌ EXISTE (debería eliminarse)' : '✅ Eliminada'}`);
        console.log(`  vocales_clave: ${hasVocalesClave ? '✅ Existe' : '❌ NO EXISTE (debería crearse)'}`);
        console.log(`  loops_transicion: ${hasLoopsTransicion ? '✅ Existe' : '❌ NO EXISTE (debería crearse)'}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkColumns();
