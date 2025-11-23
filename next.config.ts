import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // ====================================================================
  // CONFIGURACIÓN PARA WEBASSEMBLY (essentia.js)
  // ====================================================================
  // Configuración para Webpack (usado en build de producción)
  webpack: (config, { isServer }) => {
    // Habilita el soporte para WebAssembly asíncrono.
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true, // Necesario para asyncWebAssembly
    };
    
    // Evita que el empaquetador intente procesar los archivos .wasm
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    return config;
  },
  // Configuración para Turbopack (usado en desarrollo con --turbopack)
  turbopack: {
    rules: {
      '*.wasm': {
        loaders: ['file-loader'],
        as: '*.wasm',
      },
    },
    resolveExtensions: [
      '.mdx',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.mjs',
      '.json',
      '.wasm',
    ],
  },
  // ====================================================================
  // FIN DE LA CONFIGURACIÓN WEBASSEMBLY
  // ====================================================================
};

export default nextConfig;
