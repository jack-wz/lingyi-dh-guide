import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

export function resolveWorkerPython(): string {
  const workerDir = join(PROJECT_ROOT, 'worker');
  const venvPython =
    process.platform === 'win32'
      ? join(workerDir, '.venv', 'Scripts', 'python.exe')
      : join(workerDir, '.venv', 'bin', 'python3');
  if (existsSync(venvPython)) return venvPython;
  return process.platform === 'win32' ? 'python' : 'python3';
}

export function spawnDetachedPython(script: string, args: string[], label: string): ChildProcess {
  const workerDir = join(PROJECT_ROOT, 'worker');
  const pythonCmd = resolveWorkerPython();
  console.log(`[${label}] spawn ${pythonCmd} ${script} ${args.join(' ')}`);
  const child = spawn(pythonCmd, ['-B', script, ...args], {
    cwd: workerDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: {
      ...process.env,
      SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000',
    },
  });
  child.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[${label}] ${msg}`);
  });
  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[${label}:err] ${msg}`);
  });
  child.unref();
  return child;
}