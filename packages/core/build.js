import { build } from 'esbuild';
import { execSync } from 'child_process';

// First, run TypeScript to generate type definitions
console.log('Generating TypeScript definitions...');
execSync('tsc --emitDeclarationOnly', { stdio: 'inherit' });

// Build Browser ESM version (no Node.js deps)
console.log('Building Browser ESM version...');
await build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  outfile: 'dist/browser.mjs',
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
});

// Build Node ESM version (with Node.js deps)
console.log('Building Node ESM version...');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.mjs',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  external: [
    'child_process', 
    'path', 
    'crypto',
    '@xterm/xterm',
    '@xterm/addon-fit',
    '@xterm/addon-search',
    '@xterm/addon-serialize',
    '@xterm/addon-unicode11',
    '@xterm/addon-web-links',
    '@xterm/addon-webgl',
    'vscode-jsonrpc'
  ],
  sourcemap: true,
});

// Build Node CJS version
console.log('Building Node CommonJS version...');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.cjs',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: [
    'child_process', 
    'path', 
    'crypto',
    '@xterm/xterm',
    '@xterm/addon-fit',
    '@xterm/addon-search',
    '@xterm/addon-serialize',
    '@xterm/addon-unicode11',
    '@xterm/addon-web-links',
    '@xterm/addon-webgl',
    'vscode-jsonrpc'
  ],
  sourcemap: true,
});

console.log('Build complete!');