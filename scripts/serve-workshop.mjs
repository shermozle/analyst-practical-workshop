// Serves a built pack locally. This is the presenter's fallback if the venue
// network can't reach GitHub Pages: the app still shows payloads without Amplitude.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workshopId = process.argv[2] || "digital-analytics-practitioners";
const port = Number(process.env.PORT || 4173);
const dist = join(root, "dist", workshopId);

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  const name = path === "/" ? "index.html" : path.slice(1);
  try {
    const body = await readFile(join(dist, name));
    response.writeHead(200, { "content-type": types[name.slice(name.lastIndexOf("."))] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": types[".html"] }).end("<h1>404</h1><p><a href=\"/\">Workshop hub</a></p>");
  }
}).listen(port, () => {
  console.log(`Serving ${workshopId} on http://localhost:${port}`);
});
