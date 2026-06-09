import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from '../build/lib/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const out = {};
    for (const k of keys) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    return args;
  }
  if (Array.isArray(args)) {
    return args.slice();
  }
  throw new Error('args must be a string or array');
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
  };
}

function runCase(c) {
  if (!c || typeof c !== 'object') {
    throw new Error('each case must be an object');
  }
  if (!('name' in c)) {
    throw new Error('each case must have a "name" field');
  }
  if (!('args' in c)) {
    throw new Error('each case must have an "args" field');
  }
  const name = String(c.name);
  const args = normalizeArgs(c.args);
  const opts = c.opts || undefined;
  const detailed = !!c.detailed;
  let result;
  let error = null;
  try {
    if (detailed) {
      const raw = parser.detailed(args, opts);
      result = sortKeys(raw.argv || {});
      error = serializeError(raw.error);
    } else {
      result = sortKeys(parser(args, opts));
    }
  } catch (e) {
    result = null;
    error = serializeError(e);
  }
  const entry = {
    name,
    args,
    opts: opts === undefined ? undefined : sortKeys(opts),
    detailed,
  };
  if (detailed) {
    entry.result = result;
    entry.error = error;
  } else {
    entry.result = result;
    if (error) entry.error = error;
  }
  return entry;
}

function stringifyPrettyJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0]
    ? resolve(process.cwd(), args[0])
    : resolve(rootDir, 'fixtures', 'parser-snapshot-cases.json');
  const outputPath = args[1]
    ? resolve(process.cwd(), args[1])
    : null;

  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const buildEntry = resolve(rootDir, 'build', 'lib', 'index.js');
  if (!existsSync(buildEntry)) {
    console.error(
      `Build output not found at ${buildEntry}. Run \`npm run compile\` first.`
    );
    process.exit(1);
  }

  const raw = readFileSync(inputPath, 'utf8');
  let cases;
  try {
    cases = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to parse input JSON: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(cases)) {
    console.error('Input JSON must be an array of cases.');
    process.exit(1);
  }

  const output = {
    inputFile: inputPath,
    cases: cases.map(runCase),
  };

  const text = stringifyPrettyJson(sortKeys(output));

  if (outputPath) {
    writeFileSync(outputPath, text, 'utf8');
    console.error(`Wrote snapshot to ${outputPath}`);
  } else {
    process.stdout.write(text);
  }
}

main();
