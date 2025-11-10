/**
 * Script para limpiar la base de datos
 * 
 * Uso:
 * npm run db-clear
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import * as readline from 'readline';

// Cargar variables de entorno
config();

async function clearDatabase() {
    console.log('🗑️  Limpiar Base de Datos\n');

    const databaseUrl = process.env.VITE_DATABASE_URL;
    
    if (!databaseUrl || databaseUrl.trim() === '') {
        console.error('❌ VITE_DATABASE_URL no configurada');
        process.exit(1);
    }

    try {
        const sql = neon(databaseUrl);

        // Mostrar estadísticas antes de limpiar
        const stats = await sql`
            SELECT 
                COUNT(*) as total_records,
                pg_size_pretty(pg_total_relation_size('song_analyses')) as table_size
            FROM song_analyses
        `;

        console.log('⚠️  ADVERTENCIA: Esta acción eliminará todos los análisis guardados');
        console.log('─'.repeat(70));
        console.log(`   Registros a eliminar: ${stats[0].total_records}`);
        console.log(`   Espacio a liberar:    ${stats[0].table_size}`);
        console.log('─'.repeat(70));

        if (parseInt(stats[0].total_records) === 0) {
            console.log('\n✅ La base de datos ya está vacía\n');
            process.exit(0);
        }

        // Pedir confirmación
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('\n¿Estás seguro? Escribe "SI" para confirmar: ', async (answer) => {
            if (answer.toUpperCase() === 'SI') {
                console.log('\n🗑️  Limpiando base de datos...');
                
                await sql`TRUNCATE TABLE song_analyses`;
                
                console.log('✅ Base de datos limpiada correctamente\n');
            } else {
                console.log('\n❌ Operación cancelada\n');
            }
            
            rl.close();
            process.exit(0);
        });

    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

clearDatabase();
