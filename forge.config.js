// forge.config.js
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  packagerConfig: {
    name: 'Audit',
    executableName: 'Audit',
    asar: {
      unpack: "**/{python,ffmpeg,*.py,*.pyc,*.exe}/**/*"
    },
    icon: './src/app/favicon.ico',
    // These files will be packed into app.asar
    files: [
      'dist/main/**/*',
      'dist/preload/**/*',
      'dist/renderer/**/*',
      'python/**/*',
      'ffmpeg/**/*',
      'package.json',
    ],
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
    // These files will be available in app.asar.unpacked
    extraResources: [
      {
        from: "./python",
        to: "python",
        filter: ["**/*"],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (/* arch */) => ({
        name: 'Audit',
        authors: 'Maurizio Compagnone',
        description: 'YouTube MP3 Converter',
        setupIcon: './src/app/favicon.ico',
        noMsi: false,
        setupExe: 'Audit-Setup.exe',
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Audit',
      }),
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
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

export default config;
