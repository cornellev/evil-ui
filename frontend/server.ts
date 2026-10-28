/// <reference types="bun-types" />
/// <reference types="node" />

// Matches RaceEngineerDashboard/frontend/server.ts's pattern: a plain Bun
// static server for the built dist/, with an SPA fallback to index.html so
// client-side routes (e.g. /runs/run-1) work on a hard reload.
//
// It also proxies /api/* to the backend, so the browser only ever talks to
// this one origin. That is what lets the UI be served over HTTPS (Tailscale
// Serve): a page on https:// is not allowed to call the backend on a plain
// http:// address (mixed content), but a same-origin /api call is fine.

import { join } from "path";

const DIST_DIR = new URL("./dist/", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8081);
const API_UPSTREAM = (process.env.API_UPSTREAM ?? "http://backend:8080").replace(/\/$/, "");

async function proxy(req: Request, url: URL): Promise<Response> {
  const target = `${API_UPSTREAM}${url.pathname.slice("/api".length) || "/"}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  try {
    // The body is streamed through, not buffered: recording uploads can be GBs.
    return await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
      // Pass a compressed reply through as-is: decoding it here but keeping its
      // Content-Encoding header would corrupt it in the browser.
      decompress: false,
      // @ts-expect-error -- Bun needs this to stream a request body; not in the DOM typings
      duplex: "half",
    });
  } catch (err) {
    console.error(`proxy ${req.method} ${target} failed:`, err);
    return Response.json({ detail: "backend unreachable" }, { status: 502 });
  }
}

Bun.serve({
  hostname: "0.0.0.0",
  port: PORT,
  // Bun closes a connection idle for 10 s by default. A Tern answer can take
  // up to 150 s, and an upload's reply waits until EVIL has stored the whole
  // file, so allow Bun's maximum.
  idleTimeout: 255,
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxy(req, url);

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(DIST_DIR, pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) return new Response(file);

    return new Response(Bun.file(join(DIST_DIR, "index.html")));
  },
});

console.log(`Server running at http://localhost:${PORT}, /api -> ${API_UPSTREAM}`);
