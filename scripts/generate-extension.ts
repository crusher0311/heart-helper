import archiver from 'archiver';
import { createWriteStream, readdirSync, statSync } from 'fs';
import { join } from 'path';

const version = '3.14.2';
const outputPath = `heart-helper-extension-v${version}.zip`;
const sourceDir = 'chrome-extension';

console.log(`Generating ${outputPath}...`);

const output = createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created ${outputPath} (${archive.pointer()} bytes)`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(sourceDir, false);
archive.finalize();
