import type { Plugin } from 'vite';

export function securityHeaders(): Plugin {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Security headers
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        
        // CSP desactivado en desarrollo para evitar problemas con hot reload
        // En producción se usa el archivo public/_headers
        // res.setHeader(
        //   'Content-Security-Policy',
        //   "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://aistudiocdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: https://generativelanguage.googleapis.com ws://localhost:* ws://127.0.0.1:*; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'self';"
        // );
        
        next();
      });
    }
  };
}
