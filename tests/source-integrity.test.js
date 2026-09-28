import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

function listJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolute);
  }
  return files;
}

function resolveRelativeImport(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(file), specifier);
  const candidates = [
    base,
    base + '.js',
    path.join(base, 'index.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

test('all source JavaScript files pass Node syntax validation', () => {
  const files = listJavaScriptFiles(srcRoot);
  assert.ok(files.length > 0);
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      const detail = [error.stdout, error.stderr].filter(Boolean).join('\n');
      assert.fail(`${path.relative(root, file)} failed syntax validation:\n${detail}`);
    }
  }
});

test('all relative source imports resolve to existing files', () => {
  const files = listJavaScriptFiles(srcRoot);
  const fileSet = new Set(files.map((file) => path.normalize(file)));
  const importPattern = /(?:import|export)\\s+(?:[\\s\\S]*?\\sfrom\\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /import\\(\\s*['"]([^'"]+)['"]\\s*\\)/g;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of [importPattern, dynamicImportPattern]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        const resolved = resolveRelativeImport(file, specifier);
        assert.ok(
          resolved && fileSet.has(path.normalize(resolved)),
          `${path.relative(root, file)} imports missing module ${specifier}`
        );
      }
    }
  }
});
