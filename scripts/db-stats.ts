/**
 * Script para ver estadísticas de la base de datos
 * 
 * Uso:
 * npm run db-stats
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Cargar variables de entorno
config();

async function showStats() {
    console.log('📊 Estadísticas de Base de Datos\n');

    const databaseUrl = process.env.VITE_DATABASE_URL;
    
    if (!databaseUrl || databaseUrl.trim() === '') {
        console.error('❌ VITE_DATABASE_URL no configurada');
        process.exit(1);
    }

    try {
        const sql = neon(databaseUrl);

        // Estadísticas generales
        const stats = await sql`
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT song_name) as unique_songs,
                pg_size_pretty(pg_total_relation_size('song_analyses')) as table_size,
                MIN(created_at) as oldest_record,
                MAX(created_at) as newest_record
            FROM song_analyses
        `;

        console.log('═'.repeat(70));
        console.log('  ESTADÍSTICAS GENERALES');
        console.log('═'.repeat(70));
        console.log(`  Total de análisis:     ${stats[0].total_records}`);
        console.log(`  Canciones únicas:      ${stats[0].unique_songs}`);
        console.log(`  Tamaño de tabla:       ${stats[0].table_size}`);
        console.log(`  Registro más antiguo:  ${stats[0].oldest_record ? new Date(stats[0].oldest_record).toLocaleString() : 'N/A'}`);
        console.log(`  Registro más reciente: ${stats[0].newest_record ? new Date(stats[0].newest_record).toLocaleString() : 'N/A'}`);
        console.log('═'.repeat(70));

        // Top 10 canciones más analizadas
        const topSongs = await sql`
            SELECT 
                song_name,
                COUNT(*) as analysis_count,
                MAX(updated_at) as last_updated
            FROM song_analyses
            GROUP BY song_name
            ORDER BY analysis_count DESC
            LIMIT 10
        `;

        if (topSongs.length > 0) {
            console.log('\n📈 TOP 10 CANCIONES MÁS ANALIZADAS');
            console.log('─'.repeat(70));
            topSongs.forEach((song: any, index: number) => {
                console.log(`  ${(index + 1).toString().padStart(2)}. ${song.song_name.substring(0, 40).padEnd(40)} (${song.analysis_count}x)`);
            });
            console.log('─'.repeat(70));
        }

        // Análisis por día
        const byDay = await sql`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM song_analyses
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 7
        `;

        if (byDay.length > 0) {
            console.log('\n📅 ANÁLISIS POR DÍA (últimos 7 días)');
            console.log('─'.repeat(70));
            byDay.forEach((day: any) => {
                const bar = '█'.repeat(Math.min(day.count, 50));
                console.log(`  ${day.date}  ${bar} ${day.count}`);
            });
            console.log('─'.repeat(70));
        }

        // Últimos 5 análisis
        const recent = await sql`
            SELECT 
                song_name,
                created_at,
                pg_size_pretty(length(analysis::text)::bigint) as analysis_size
            FROM song_analyses
            ORDER BY created_at DESC
            LIMIT 5
        `;

        if (recent.length > 0) {
            console.log('\n🕐 ÚLTIMOS 5 ANÁLISIS');
            console.log('─'.repeat(70));
            recent.forEach((record: any) => {
                const time = new Date(record.created_at).toLocaleString();
                console.log(`  ${time}`);
                console.log(`     ${record.song_name} (${record.analysis_size})`);
            });
            console.log('─'.repeat(70));
        }

        console.log('\n✅ Estadísticas generadas correctamente\n');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

showStats();
