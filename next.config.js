// next.config.js
import webpack from "webpack";

const nextConfig = {
  reactStrictMode: false,
  output: "export",
  distDir: "dist/renderer",
  images: { unoptimized: true },
  // trailingSlash: true, // Disabilitato per evitare problemi con i percorsi relativi in Electron
  assetPrefix: "./",

  webpack: (config, { isServer }) => {
    config.plugins = config.plugins || [];
    const hasDefine = config.plugins.some((p) => p.constructor.name === "DefinePlugin");
    if (!hasDefine) {
      config.plugins.push(
        new webpack.DefinePlugin({
          "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
          "process.env.ELECTRON": JSON.stringify("true"),
          global: "globalThis",
        })
      );
    }
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        fs: false,
        path: "path-browserify",
        os: "os-browserify/browser",
        crypto: "crypto-browserify",
        stream: "stream-browserify",
        http: "stream-http",
        https: "https-browserify",
        zlib: "browserify-zlib",
        assert: "assert",
        url: "url",
      };
    }
    return config;
  },
};

export default nextConfig;
