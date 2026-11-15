import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const preferredPort = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webm": "video/webm",
};

function start(port) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relative = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const file = path.resolve(root, `.${relative}`);
    if (!file.startsWith(root)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const content = readFileSync(file);
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < preferredPort + 20) {
      start(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`CUT/20 available at http://127.0.0.1:${port}`);
  });
}

start(preferredPort);
