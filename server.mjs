import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT) || 8123;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const pathname = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    return res.end('forbidden');
  }
  try {
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 被占用，请用 PORT=其他端口 node server.mjs 重试`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  console.log(`字幕工作台运行中: http://localhost:${port}`);
});
