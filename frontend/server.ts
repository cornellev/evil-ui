/// <reference types="bun-types" />
/// <reference types="node" />

// Matches RaceEngineerDashboard/frontend/server.ts's pattern exactly: a
// plain Bun static server for the built dist/, with an SPA fallback to
// index.html so client-side routes (e.g. /runs/run-1) work on a hard reload.

import { join } from "path";

const DIST_DIR = new URL("./dist/", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8081);

Bun.serve({
  hostname: "0.0.0.0",
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    const filePath = join(DIST_DIR, pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) return new Response(file);

    return new Response(Bun.file(join(DIST_DIR, "index.html")));
  },
});

console.log(`Server running at http://localhost:${PORT}`);
