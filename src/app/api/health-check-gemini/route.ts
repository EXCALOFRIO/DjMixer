/**
 * API Route para health check de Gemini API keys
/**
 * API Route para health check de Gemini API keys
 * Endpoint: GET /api/health-check-gemini
 */

import { NextResponse } from 'next/server';
import { testAllApiKeys } from '@/lib/api-health-check';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const forceRefresh = url.searchParams.get('refresh') === 'true';

        console.log(`🔍 Health check solicitado${forceRefresh ? ' (forzando refresh)' : ''}...`);

        const results = await testAllApiKeys(forceRefresh);

        const operational = results.filter(r => r.isOperational);
        const failed = results.filter(r => !r.isOperational);

        return NextResponse.json({
            success: true,
            timestamp: Date.now(),
            summary: {
                total: results.length,
                operational: operational.length,
                failed: failed.length,
            },
            keys: results.map(r => ({
                keyIndex: r.keyIndex,
                isOperational: r.isOperational,
                error: r.error,
                responseTime: r.responseTime,
            })),
        });
    } catch (error: any) {
        console.error('❌ Error en health check:', error);

        return NextResponse.json({
            success: false,
            error: error?.message || 'Error desconocido',
        }, { status: 500 });
    }
}
