import { copyFile } from 'node:fs/promises';

await copyFile('dist/index.html', 'dist/404.html');
console.log('Fallback GitHub Pages dibuat: dist/404.html');
