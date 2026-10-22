import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('vendor', { recursive: true });

await build({
  entryPoints: {
    codemirror: 'vendor-src/codemirror-entry.js',
    fflate: 'vendor-src/fflate-entry.js'
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['safari16'],
  outdir: 'vendor',
  minify: true,
  sourcemap: false,
  legalComments: 'none'
});

console.log('Vendor bundles written to vendor/.');
