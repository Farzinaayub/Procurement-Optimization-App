// Serves the built frontend, embedded into the Worker as data modules.
import { FILES } from "virtual-files";
export function serveStatic(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
  const url = new URL(request.url);
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith("/")) path += "index.html";
  let file = FILES[path];
  let isFallback = false;
  if (!file) {
    if (path.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(path)) return new Response("Not Found", { status: 404 });
    file = FILES["/index.html"]; isFallback = true; path = "/index.html";
  }
  const [body, type, etag] = file;
  const headers = {
    "Content-Type": type,
    "ETag": `"${etag}"`,
    "Cache-Control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.headers.get("If-None-Match") === `"${etag}"`) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}
