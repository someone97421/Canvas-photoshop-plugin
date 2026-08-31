#!/usr/bin/env node

import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const outputPath = join(rootDir, 'sd-ppp_all.zip');
const packageRoot = 'sd-ppp';
const entries = [
  'javascript',
  'static',
  'sdppp_python',
  '__init__.py',
  'NOTICE',
  'readme.md',
  'LICENSE',
];

async function packageAll() {
  await rm(outputPath, { force: true });
  await mkdir(dirname(outputPath), { recursive: true });

  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(output);

  for (const entry of entries) {
    const sourcePath = join(rootDir, entry);
    const entryStat = await stat(sourcePath);
    if (entryStat.isDirectory()) {
      archive.directory(sourcePath, `${packageRoot}/${entry}`);
    } else {
      archive.file(sourcePath, { name: `${packageRoot}/${entry}` });
    }
  }

  await archive.finalize();
  await completed;
  console.log(`一般分发包已生成: ${outputPath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
}

await packageAll();
