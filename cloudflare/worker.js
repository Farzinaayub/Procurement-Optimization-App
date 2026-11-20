// Cloudflare Worker for the Procurement Optimizer.
// /api/* is answered here with a JavaScript port of the PuLP model
// (artifacts/api-server/backend/optimizer.py); everything else is the static
// React build served from Workers static assets (env.ASSETS).
import { DEFAULTS, validate, optimizeProcurement } from "./solver.js";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "*" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

/** Returns a Response for /api routes, or null for anything else. */
export async function handleApi(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/api" && !path.startsWith("/api/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (path === "/api" && request.method === "GET") return json({ status: "ok", service: "procurement-optimization-api" });
  if (path === "/api/healthz" && request.method === "GET") return json({ status: "ok" });
  if (path === "/api/optimization/defaults" && request.method === "GET") return json(DEFAULTS);
  if (path === "/api/optimization/run" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 422); }
    const { value, error } = validate(body);
    if (error) return json({ error }, 422);
    let result;
    try { result = optimizeProcurement(value); } catch (e) { return json({ error: `Optimization runtime unavailable: ${e.message}` }, 503); }
    if (result.status !== "Optimal") return json({ error: result.message ?? "No feasible optimal solution was found." }, 400);
    return json(result);
  }
  return json({ error: "Not Found" }, 404);
}

export default {
  async fetch(request, env) {
    return (await handleApi(request)) ?? env.ASSETS.fetch(request);
  },
};
