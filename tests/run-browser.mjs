import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  return port;
}

const port = await freePort();
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});

await once(server.stdout, 'data');

const test = spawn(process.execPath, ['tests/browser.e2e.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, APP_URL: `http://127.0.0.1:${port}/` },
  stdio: 'inherit',
});

const [code] = await once(test, 'exit');
server.kill('SIGTERM');
process.exitCode = code ?? 1;
