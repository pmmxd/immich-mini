import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'frontend', 'immich-web-source');
const VENDOR_BUILD_ROOT = path.join(PROJECT_ROOT, 'vendor', 'immich-web');
const SNAPSHOT_PATH = path.join(PROJECT_ROOT, 'docs', 'frontend-baseline.json');
const EXPECTED_COMMIT = '96b5f59553591fe9d48e1d5f5b881126e540ff31';
const SOURCE_EXCLUDES = new Set(['node_modules', 'build', '.svelte-kit', 'tests']);

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function collectFiles(root, excluded = new Set()) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const first = relative.split('/')[0];
      if (excluded.has(first) || relative.split('/').some((part) => excluded.has(part))) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        const content = readFileSync(absolute);
        files.push({ path: relative, bytes: content.length, sha256: sha256(content) });
      }
    }
  };
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function aggregate(files) {
  return sha256(files.map((file) => `${file.sha256}  ${file.path}`).join('\n'));
}

function describe(root, files) {
  return {
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    aggregateSha256: aggregate(files),
    files,
  };
}

function assertSameFiles(label, actual, expected) {
  const actualByPath = new Map(actual.map((file) => [file.path, file]));
  const expectedByPath = new Map(expected.map((file) => [file.path, file]));
  const missing = [...expectedByPath.keys()].filter((file) => !actualByPath.has(file));
  const extra = [...actualByPath.keys()].filter((file) => !expectedByPath.has(file));
  const changed = [...actualByPath.keys()].filter((file) => {
    const expectedFile = expectedByPath.get(file);
    return expectedFile && actualByPath.get(file).sha256 !== expectedFile.sha256;
  });
  if (missing.length || extra.length || changed.length) {
    throw new Error(`${label} mismatch: missing=${missing.length}, extra=${extra.length}, changed=${changed.length}`);
  }
}

function capture() {
  const source = describe(SOURCE_ROOT, collectFiles(SOURCE_ROOT, SOURCE_EXCLUDES));
  const build = describe(VENDOR_BUILD_ROOT, collectFiles(VENDOR_BUILD_ROOT));
  const snapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    source: { commit: EXPECTED_COMMIT, ...source },
    build,
  };
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Captured ${source.fileCount} source files and ${build.files.length} build files`);
  console.log(`Source SHA256: ${source.aggregateSha256}`);
}

function verify() {
  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error('Missing docs/frontend-baseline.json; run with --write');
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  if (snapshot.source.commit !== EXPECTED_COMMIT) {
    throw new Error(`Unexpected snapshot commit: ${snapshot.source.commit}`);
  }
  const source = describe(SOURCE_ROOT, collectFiles(SOURCE_ROOT, SOURCE_EXCLUDES));
  const build = describe(VENDOR_BUILD_ROOT, collectFiles(VENDOR_BUILD_ROOT));
  assertSameFiles('source', source.files, snapshot.source.files);
  assertSameFiles('build', build.files, snapshot.build.files);
  if (source.aggregateSha256 !== snapshot.source.aggregateSha256) {
    throw new Error('Frontend source aggregate changed');
  }
  if (build.aggregateSha256 !== snapshot.build.aggregateSha256) {
    throw new Error('Frontend build aggregate changed');
  }
  console.log(`Verified ${source.fileCount} source files: ${source.aggregateSha256}`);
  console.log(`Verified ${build.files.length} build files: ${build.aggregateSha256}`);
}

for (const root of [SOURCE_ROOT, VENDOR_BUILD_ROOT]) {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Missing frontend baseline directory: ${root}`);
  }
}

if (process.argv.includes('--write')) {
  capture();
} else {
  verify();
}
