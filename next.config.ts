import webpack from 'webpack';
import type { Configuration as WebpackConfig } from 'webpack';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

interface WebpackOptions {
  isServer: boolean;
  dev: boolean;
  defaultLoaders: Record<string, unknown>;
}

const nextConfig = {
  // Disable static export in Electron, enable for web
  output: process.env.ELECTRON === 'true' ? undefined : 'export',
  images: { unoptimized: true },
  reactStrictMode: false,

  webpack: (config: WebpackConfig, { isServer, dev }: WebpackOptions): WebpackConfig => {
    // Inizializza plugin e risoluzioni
    config.plugins = config.plugins || [];
    config.resolve = config.resolve || {};

    // Definizione variabili d'ambiente
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        'process.env.ELECTRON': JSON.stringify(process.env.ELECTRON || 'false'),
        global: 'globalThis',
      })
    );

    // Aggiunge i fallback per le API Node nel renderer
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: require.resolve('path-browserify'),
        os: require.resolve('os-browserify/browser'),
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        zlib: require.resolve('browserify-zlib'),
        assert: require.resolve('assert/'),
        url: require.resolve('url/'),
      };
    }

    // Source map leggibili in dev
    if (dev) {
      config.devtool = 'eval-source-map';
    }

    return config;
  },
};

export default nextConfig;
