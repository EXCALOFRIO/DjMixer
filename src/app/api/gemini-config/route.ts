import { NextResponse } from 'next/server';
import {
  getGeminiApiKeys,
  getMaxParallelCapacity,
  getMaxRateLimitPerMinute,
  MAX_CONCURRENT_REQUESTS_PER_KEY,
  MAX_REQUESTS_PER_MINUTE_PER_KEY,
} from '@/lib/gemini-keys';

export async function GET() {
  try {
    const keys = getGeminiApiKeys();
    const totalKeys = keys.length;
    const parallelCapacity = getMaxParallelCapacity(totalKeys);

    return NextResponse.json({
      success: true,
      numApiKeys: totalKeys,
      enabled: totalKeys > 0,
      rateLimitPerMinute: getMaxRateLimitPerMinute(totalKeys),
      perKey: {
        maxParallel: MAX_CONCURRENT_REQUESTS_PER_KEY,
        rateLimitPerMinute: MAX_REQUESTS_PER_MINUTE_PER_KEY,
      },
      maxParallelRequests: parallelCapacity,
      sources: keys.map((key, index) => ({
        slot: index,
        maskedKey: `${key.slice(0, 6)}…${key.slice(-4)}`,
      })),
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo configuración de Gemini:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo obtener la configuración de Gemini',
      },
      { status: 500 }
    );
  }
}
