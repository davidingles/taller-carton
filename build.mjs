import { copyFile, cp, mkdir } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'model-preview.js', 'app.js']) {
  await copyFile(new URL(file, import.meta.url), new URL(file, output));
}
await mkdir(new URL('assets/', output), { recursive: true });
await copyFile(new URL('./assets/logo.png', import.meta.url), new URL('assets/logo.png', output));
await cp(new URL('./assets/models/', import.meta.url), new URL('assets/models/', output), { recursive: true });
