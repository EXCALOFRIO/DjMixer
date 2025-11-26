
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function checkJobsSchema() {
    console.log('🔍 Verificando schema de analysis_jobs...\n');

    const { sql } = await import('../src/lib/db.js');

    try {
        const columnas = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'analysis_jobs'
    `;

        console.log('Columnas:', columnas.map((c: any) => c.column_name));
    } catch (error) {
        console.error('Error:', error);
    }
}

checkJobsSchema();
