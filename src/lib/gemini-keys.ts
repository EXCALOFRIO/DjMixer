const GEMINI_KEY_REGEX = /^GEMINI_API_KEY(\d+)?$/i;

function normalizeKey(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getGeminiApiKeys(): string[] {
  const keys = new Set<string>();

  // GEMINI_API_KEYS comma-separated legacy format
  const legacyList = process.env.GEMINI_API_KEYS;
  if (legacyList) {
    legacyList.split(',').forEach((entry) => {
      const key = normalizeKey(entry);
      if (key) keys.add(key);
    });
  }

  // GEMINI_API_KEY, GEMINI_API_KEY0..n
  Object.entries(process.env).forEach(([name, value]) => {
    if (GEMINI_KEY_REGEX.test(name)) {
      const key = normalizeKey(value);
      if (key) keys.add(key);
    }
  });

  const publicKey = normalizeKey(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  if (publicKey) keys.add(publicKey);

  return Array.from(keys);
}

export const MAX_CONCURRENT_REQUESTS_PER_KEY = 5;
export const MAX_REQUESTS_PER_MINUTE_PER_KEY = 50;

export function getMaxParallelCapacity(keysCount: number): number {
  return keysCount * MAX_CONCURRENT_REQUESTS_PER_KEY;
}

export function getMaxRateLimitPerMinute(keysCount: number): number {
  return keysCount * MAX_REQUESTS_PER_MINUTE_PER_KEY;
}
