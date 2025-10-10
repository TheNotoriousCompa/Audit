const webpack = require('webpack');
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static export in Electron, enable for web
  output: process.env.ELECTRON === 'true' ? undefined : 'export',
  images: { unoptimized: true },
  reactStrictMode: false,

  webpack: (config, { isServer, dev }) => {
    // Initialize plugins and resolutions
    config.plugins = config.plugins || [];
    config.resolve = config.resolve || {};

    // Define environment variables
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        'process.env.ELECTRON': JSON.stringify(process.env.ELECTRON || 'false'),
        global: 'globalThis',
      })
    );

    // Add Node.js API fallbacks for the renderer
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

    // Source maps for development
    if (dev) {
      config.devtool = 'eval-source-map';
    }

    return config;
  },
};

module.exports = nextConfig;
