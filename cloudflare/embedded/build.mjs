// Alternative to `wrangler deploy`: packs the built site INTO the Worker as data
// modules (no separate static-assets upload). This is how the live site was first
// deployed through the Cloudflare API. Output goes to cloudflare/.out (gitignored):
//   worker.js + f*.bin  -> the Worker's modules
//   deploy-api.js       -> an async function for the Cloudflare MCP "execute" tool
//                          (PUTs the script and enables its workers.dev URL)
// Usage: node cloudflare/embedded/build.mjs   (after building the frontend)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const here = path.dirname(new URL(import.meta.url).pathname);
const cfg = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8"));
const root = path.resolve(here, "../..");
const distDir = path.resolve(root, cfg.distDir);
const outDir = path.resolve(here, "../.out");
if (!fs.existsSync(path.join(distDir, "index.html"))) throw new Error(`Build the frontend first: ${distDir} has no index.html`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const mime = { html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8", css: "text/css; charset=utf-8", svg: "image/svg+xml", wasm: "application/wasm", txt: "text/plain; charset=utf-8", png: "image/png", json: "application/json", ico: "image/x-icon", webp: "image/webp", jpg: "image/jpeg", woff2: "font/woff2" };
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(p); } };
walk(distDir);

const parts = {};
let imports = "", map = "";
files.forEach((p, i) => {
  const buf = fs.readFileSync(p);
  const mod = `f${i}.bin`;
  fs.copyFileSync(p, path.join(outDir, mod));
  parts[mod] = zlib.gzipSync(buf, { level: 9 }).toString("base64");
  const ext = path.extname(p).slice(1).toLowerCase();
  const etag = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  imports += `import f${i} from "./${mod}";\n`;
  map += `  ${JSON.stringify("/" + path.relative(distDir, p).split(path.sep).join("/"))}: [f${i}, ${JSON.stringify(mime[ext] || "application/octet-stream")}, ${JSON.stringify(etag)}],\n`;
});
const filesModule = path.join(outDir, "files.js");
fs.writeFileSync(filesModule, `${imports}export const FILES = {\n${map}};\n`);

execFileSync("npx", ["-y", "esbuild@0.25.12", path.join(here, "entry.js"), "--bundle", "--format=esm", "--external:*.bin",
  `--alias:virtual-files=${filesModule}`, `--outfile=${path.join(outDir, "worker.js")}`, "--log-level=warning"], { stdio: "inherit" });

const worker = fs.readFileSync(path.join(outDir, "worker.js"), "utf8");
const code = `async () => {
  const NAME = ${JSON.stringify(cfg.name)};
  const PARTS = ${JSON.stringify(parts)};
  const WORKER = ${JSON.stringify(worker)};
  const metadata = { main_module: "worker.js", compatibility_date: ${JSON.stringify(cfg.compatibilityDate)}, bindings: [] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("worker.js", new Blob([WORKER], { type: "application/javascript+module" }), "worker.js");
  for (const [mod, b64] of Object.entries(PARTS)) {
    const bin = atob(b64); const gz = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) gz[i] = bin.charCodeAt(i);
    const bytes = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    form.append(mod, new Blob([bytes], { type: "application/octet-stream" }), mod);
  }
  const put = await cloudflare.request({ method: "PUT", path: \`/accounts/\${accountId}/workers/scripts/\${NAME}\`, body: form });
  const sd = await cloudflare.request({ method: "POST", path: \`/accounts/\${accountId}/workers/scripts/\${NAME}/subdomain\`, body: { enabled: true, previews_enabled: false } });
  return { id: put.result.id, etag: put.result.etag, subdomain: sd.result };
}`;
fs.writeFileSync(path.join(outDir, "deploy-api.js"), code);
console.log(`Wrote ${outDir} (${files.length} files; deploy-api.js ${(code.length / 1e6).toFixed(2)} MB)`);
