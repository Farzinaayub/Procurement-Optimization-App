// Embedded-mode Worker: API from ../worker.js, site from data modules (see build.mjs).
import { handleApi } from "../worker.js";
import { serveStatic } from "./static.js";
export default { async fetch(request) { return (await handleApi(request)) ?? serveStatic(request); } };
