import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webm": "video/webm",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || "/").split("?")[0]);
  const target = normalize(join(root, clean === "/" ? "index.html" : clean));
  return target.startsWith(root) ? target : null;
}

const server = createServer(async (request, response) => {
  try {
    let target = safePath(request.url);
    if (!target) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, "index.html");
    const body = await readFile(target);
    const headers = {
      "Content-Type": MIME_TYPES[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes"
    };
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2]
          ? Math.min(Number(match[2]), body.length - 1)
          : body.length - 1;
        if (start <= end && start < body.length) {
          const chunk = body.subarray(start, end + 1);
          response.writeHead(206, {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${body.length}`,
            "Content-Length": chunk.length
          });
          response.end(request.method === "HEAD" ? undefined : chunk);
          return;
        }
      }
    }
    response.writeHead(200, {
      ...headers,
      "Content-Length": body.length
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  const address = server.address();
  console.log(`CUT/LOOP running at http://${host}:${address.port}`);
});
