import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { build as buildWithEsbuild } from 'esbuild';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));

const CONTENT_SCRIPT_ENTRIES = [
  {
    entry: resolve(ROOT_DIR, 'src/content/source/tiktok.ts'),
    outputFile: 'content-tiktok.js',
  },
  {
    entry: resolve(ROOT_DIR, 'src/content/source/facebook.ts'),
    outputFile: 'content-facebook.js',
  },
  {
    entry: resolve(ROOT_DIR, 'src/content/x/composer.ts'),
    outputFile: 'content-x.js',
  },
];

/** Copy manifest.json and assets into dist after build */
function copyExtensionFiles(): Plugin {
  return {
    name: 'copy-extension-files',
    closeBundle() {
      const outDir = resolve(ROOT_DIR, 'dist');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      // Copy manifest
      copyFileSync(
        resolve(ROOT_DIR, 'manifest.json'),
        resolve(outDir, 'manifest.json'),
      );

      // Copy icon assets
      const assetsDir = resolve(ROOT_DIR, 'src/assets/icons');
      const outAssets = resolve(outDir, 'assets');
      if (!existsSync(outAssets)) mkdirSync(outAssets, { recursive: true });
      if (existsSync(assetsDir)) {
        for (const file of readdirSync(assetsDir)) {
          copyFileSync(resolve(assetsDir, file), resolve(outAssets, file));
        }
      }
    },
  };
}

/** Build content scripts as standalone files that Chrome can inject directly. */
function bundleContentScripts(): Plugin {
  return {
    name: 'bundle-content-scripts',
    async closeBundle() {
      const outDir = resolve(ROOT_DIR, 'dist');

      await Promise.all(
        CONTENT_SCRIPT_ENTRIES.map(({ entry, outputFile }) =>
          buildWithEsbuild({
            entryPoints: [entry],
            outfile: resolve(outDir, outputFile),
            bundle: true,
            format: 'iife',
            platform: 'browser',
            target: 'chrome120',
            tsconfig: resolve(ROOT_DIR, 'tsconfig.json'),
            legalComments: 'none',
          }),
        ),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionFiles(), bundleContentScripts()],
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(ROOT_DIR, 'src/shared'),
      '@background': resolve(ROOT_DIR, 'src/background'),
      '@content': resolve(ROOT_DIR, 'src/content'),
      '@popup': resolve(ROOT_DIR, 'src/popup'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Chrome extensions need relative paths, not absolute
    // assetsDir is relative to outDir
    rollupOptions: {
      input: {
        popup: resolve(ROOT_DIR, 'src/popup/index.html'),
        background: resolve(ROOT_DIR, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
