
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function addUniqueConstraint() {
    console.log('🔧 Agregando constraint unique a hash_archivo...\n');

    const { sql } = await import('../src/lib/db.js');

    try {
        // Intentar crear índice único si no existe
        await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_jobs_hash 
      ON analysis_jobs (hash_archivo);
    `;

        console.log('✅ Índice único idx_analysis_jobs_hash asegurado.');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

addUniqueConstraint();
