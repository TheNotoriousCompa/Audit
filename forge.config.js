// forge.config.js
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const fs = require('fs-extra');
const path = require('path');

const config = {
  packagerConfig: {
    name: 'Audit',
    executableName: 'Audit',
    asar: {
      unpack: "**/{python,ffmpeg,*.py,*.pyc,*.exe}/**/*"
    },
    icon: path.join(__dirname, 'src', 'app', 'favicon.ico'),
    ignore: (filePath) => {
      const p = filePath.replace(/\\/g, '/');

      if (p.includes('/node_modules/')) {
        const allowedDeps = new Set([
          'electron-is-dev',
          'electron-serve',
          'electron-squirrel-startup',
          'update-electron-app',
          'github-url-to-object',
          'ms',
          'debug',
          'is-url'
        ]);

        const match = p.match(/\/node_modules\/((?:@[^/]+\/[^/]+)|(?:[^/]+))/);
        if (match && !allowedDeps.has(match[1])) return true;
        return false;
      }

      const ignored = [
        /\/\.git(?:\/|$)/,
        /\/\.github(?:\/|$)/,
        /\/\.next(?:\/|$)/,
        /\/out(?:\/|$)/,
        /\/src(?:\/|$)/,
        /\/scratch(?:\/|$)/,
        /\/tmp(?:\/|$)/,
        /\/python-runtime(?:\/|$)/,
        /\/python(?:\/|$)/,
        /\/ffmpeg(?:\/|$)/,
        /\/tsconfig\./,
        /\/eslint\./,
        /\/postcss\.config\./,
        /\/components\.json$/,
        /\/requirements\.txt$/,
        /\/CONTEXT\.md$/,
        /\/README\.md$/,
        /\/setup-python\.js$/,
        /\/setup-ffmpeg\.js$/,
        /\.log$/,
      ];

      return ignored.some(r => r.test(p));
    },
    // Hook to copy python-runtime to resources
    afterCopy: [(buildPath, electronVersion, platform, arch, callback) => {
      const source = path.join(__dirname, 'python-runtime');
      const dest = path.join(buildPath, '..', '..', 'resources', 'python-runtime');

      console.log('Copying python-runtime from:', source);
      console.log('Copying python-runtime to:', dest);
      fs.copy(source, dest, (err) => {
        if (err) {
          console.error('Failed to copy python-runtime:', err);
          callback(err);
        } else {
          console.log('✓ python-runtime copied successfully');
          callback();
        }
      });
    }],
    // Copy python and ffmpeg to extraResource directory directly outside app.asar
    extraResource: [
      "./python",
      "./ffmpeg",
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin'],
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'TheNotoriousCompa',
          name: 'Audit'
        },
        prerelease: false,
        draft: true
      }
    }
  ]
};

module.exports = config;
