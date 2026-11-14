// 零依赖静态服务器：npm run serve 后访问 http://localhost:8123
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = process.env.PORT || 8123;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);
  const relative = normalize(urlPath === '/' ? 'index.html' : urlPath.slice(1));
  if (relative === `..${sep}` || relative.startsWith(`..${sep}`)) {
    res.writeHead(403);
    return res.end('403 Forbidden');
  }
  const file = join(ROOT, relative);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}).listen(PORT, () => {
  console.log(`潜水舱仿真已启动: http://localhost:${PORT}`);
});
