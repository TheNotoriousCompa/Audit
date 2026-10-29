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
          'better-sqlite3',
          'bindings',
          'file-uri-to-path',
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
        /\/\.next-dev(?:\/|$)/,
        /\/\.env(?:\.[^/]*)?$/,
        /\/out(?:\/|$)/,
        /\/src(?:\/|$)/,
        /\/scratch(?:\/|$)/,
        /\/tmp(?:\/|$)/,
        /\/docs(?:\/|$)/,
        /\/tests(?:\/|$)/,
        /\/scripts(?:\/|$)/,
        /\/python-runtime(?:\/|$)/,
        /\/python(?:\/|$)/,
        /\/ffmpeg(?:\/|$)/,
        /\/package-lock\.json$/,
        /\/REPORT\.md$/,
        /\/DESIGN\.md$/,
        /\/context\.md$/i,
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
    },
    // Chromium ships ~50 locale packs (~36 MB). Keep only the languages we use.
    (buildPath, electronVersion, platform, arch, callback) => {
      if (platform !== 'win32') {
        callback();
        return;
      }
      const appRoot = path.join(buildPath, '..', '..');
      const localesDir = path.join(appRoot, 'locales');
      const keep = new Set(['en-US.pak', 'it.pak']);
      try {
        let removed = 0;
        if (fs.existsSync(localesDir)) {
          for (const entry of fs.readdirSync(localesDir)) {
            if (!keep.has(entry)) {
              fs.removeSync(path.join(localesDir, entry));
              removed++;
            }
          }
        }
        console.log(`✓ locales pruned (${removed} removed, kept en-US/it)`);
        callback();
      } catch (err) {
        console.error('Failed to prune locales:', err);
        callback(err);
      }
    }],
    // Copy python and ffmpeg to extraResource directory directly outside app.asar
    extraResource: [
      "./python",
      "./ffmpeg",
    ],
  },
  // better-sqlite3 is rebuilt for Electron by postinstall. Forge's bundled
  // rebuild step fails on VS2022-only runners, so reuse the installed binary.
  rebuildConfig: { onlyModules: [] },
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
