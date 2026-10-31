import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  let path;
  try {
    const url = new URL(request.url, "http://localhost");
    path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (path !== root && !path.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Cache-Control": path.endsWith("sw.js") || path.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404).end();
  }
});

let port = Number(process.env.PORT) || 4173;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < 4190) server.listen(++port, "127.0.0.1");
  else { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
});
server.on("listening", () => process.stdout.write(`http://127.0.0.1:${port}/\n`));
server.listen(port, "127.0.0.1");
