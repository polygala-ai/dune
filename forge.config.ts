import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { createMacDmgMakerConfig, createMacPackagerConfig } from './build/macos-forge';
import { externalModules } from './build/external-modules';

// Collect a module and all its production dependencies recursively.
function collectProductionDeps(
  roots: string[],
  nodeModulesDir: string,
  collected = new Set<string>(),
): Set<string> {
  for (const name of roots) {
    if (collected.has(name)) continue;
    collected.add(name);
    const pkgPath = path.join(nodeModulesDir, name, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];
    if (deps.length) collectProductionDeps(deps, nodeModulesDir, collected);
  }
  return collected;
}

// Modules externalized in vite.main.config.ts, plus their full transitive deps.
// The Vite plugin's default ignore excludes all node_modules; our custom ignore
// keeps these so they're available at runtime. The plugin defers to a user-set ignore.
const allowedModules = collectProductionDeps(
  externalModules,
  path.resolve(__dirname, 'node_modules'),
);
const allowedScopes = new Set(
  [...allowedModules].filter((m) => m.startsWith('@')).map((m) => m.split('/')[0]),
);

const macReleaseConfig = {
  appBundleId: 'com.dorianzheng.dune',
  appCategoryType: 'public.app-category.developer-tools',
  iconBasePath: path.resolve(__dirname, 'assets/icons/dune'),
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Electron Packager's ignore function: return true to exclude, false to keep.
    // Packager walks the project directory and calls this for every path, including
    // parent directories — if a parent is ignored, its children are never visited.
    ignore: (file: string) => {
      // Packager passes empty string for the app root directory
      if (!file) return false;
      if (file === '/package.json' || file.startsWith('/.vite')) return false;
      // Keep the top-level agent/ tree. AgentLiteHost copies these dirs out
      // of the asar into ~/.dune/agent-ipc/ at boot and hands the extracted
      // paths to AgentLite's addSkill/addMcpServer. The .md files inside are
      // also seeded as user-customizable artifacts.
      if (file === '/agent') return false;
      if (file.startsWith('/agent/')) return false;
      // Must keep /node_modules itself so packager enters it to check children
      if (file === '/node_modules') return false;
      if (file.startsWith('/node_modules/')) {
        const parts = file.slice('/node_modules/'.length).split('/');
        // Scoped packages: packager visits "/node_modules/@scope" before
        // "/node_modules/@scope/pkg". Must keep the scope dir if any child is allowed.
        if (parts[0]!.startsWith('@')) {
          return parts.length === 1
            ? !allowedScopes.has(parts[0]!)
            : !allowedModules.has(`${parts[0]}/${parts[1]}`);
        }
        return !allowedModules.has(parts[0]!);
      }
      return true;
    },
    ...createMacPackagerConfig(macReleaseConfig),
  },
  rebuildConfig: {
    onlyModules: ['better-sqlite3'],
  },
  hooks: {
    postPackage: async (_config, result) => {
      // When no Developer ID certificate is available, @electron/osx-sign fails
      // silently and the app launches with EXC_BAD_ACCESS (Code Signature Invalid).
      // Fall back to ad-hoc signing so the app is always runnable on the build machine.
      if (process.platform !== 'darwin') return;
      for (const dir of result.outputPaths) {
        const apps = fs.readdirSync(dir).filter((f) => f.endsWith('.app'));
        for (const app of apps) {
          const appPath = path.join(dir, app);
          try {
            execFileSync('codesign', ['--verify', '--deep', appPath], { stdio: 'ignore' });
          } catch {
            execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath]);
          }
        }
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerDMG(createMacDmgMakerConfig(macReleaseConfig), ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/electron/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/electron/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new AutoUnpackNativesPlugin({}),
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
};

export default config;
