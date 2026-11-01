import { build } from 'esbuild';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Keep the bundle next to node_modules so external ESM test dependencies resolve.
const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.traffic-crossing-tests-'));
const output = join(directory, 'tests.mjs');
try {
  await build({ entryPoints: ['game/engine.test.ts'], bundle: true, platform: 'node', format: 'esm', external: ['happy-dom', 'react', 'react-dom', 'react-dom/*', 'lucide-react'], outfile: output });
  const result = spawnSync(process.execPath, ['--test', output], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(output, { force: true });
  await rmdir(directory);
}
