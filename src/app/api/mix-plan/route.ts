import { NextResponse } from 'next/server';
import { sql, type CancionAnalizada } from '@/lib/db';
import { buildMixPlan } from '@/lib/mix-planner';
import { normalizeCancionFromDB } from '@/lib/db-normalize';

interface MixPlanRequestBody {
    hashes?: string[];
}

export async function POST(request: Request) {
    try {
        if (!sql) {
            return NextResponse.json({ error: 'Base de datos no disponible' }, { status: 500 });
        }

        const body = (await request.json()) as MixPlanRequestBody | null;

        const hashes = Array.isArray(body?.hashes)
            ? body!.hashes.filter((hash): hash is string => typeof hash === 'string' && hash.length > 0)
            : [];

        if (hashes.length === 0) {
            return NextResponse.json({ error: 'Debes proporcionar al menos un hash' }, { status: 400 });
        }

        const rows = await sql`
      SELECT * FROM canciones_analizadas
      WHERE hash_archivo = ANY(${hashes})
    `;

        if (!Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ error: 'No se encontraron canciones para los hashes proporcionados' }, { status: 404 });
        }

        const byHash = new Map<string, CancionAnalizada>();

        for (const row of rows) {
            const tracked = normalizeCancionFromDB(row as Record<string, unknown>);
            byHash.set(tracked.hash_archivo, tracked);
        }

        const missing = hashes.filter((hash) => !byHash.has(hash));
        if (missing.length > 0) {
            return NextResponse.json({ error: 'Algunos hashes no se encontraron', missing }, { status: 404 });
        }

        const tracks = hashes
            .map((hash) => byHash.get(hash))
            .filter((track): track is CancionAnalizada => Boolean(track));

        const plan = buildMixPlan(tracks);

        return NextResponse.json({ plan });
    } catch (error) {
        console.error('Error generando mix plan', error);
        return NextResponse.json({ error: 'No se pudo generar el mix plan' }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';