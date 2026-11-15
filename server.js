const http = require("http");
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "app");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png"
};

const port = Number(process.env.PORT || 4173);
const server = http.createServer((request, response) => {
  const pathname = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const safePath = path.normalize(pathname).replace(/^\.\.(\/|\\|$)/, "");
  const file = path.join(APP_DIR, safePath);

  fs.readFile(file, (error, buffer) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(buffer);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Cryo tunnel game: http://127.0.0.1:${port}`);
});
