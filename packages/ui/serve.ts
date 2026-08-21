import { join } from "node:path";

const PORT = Number(process.env.PORT) || 3500;
const PUBLIC_DIR = join(import.meta.dir, "public");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") {
      pathname = "/index.html";
    }

    const filePath = join(PUBLIC_DIR, pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🌐 Grafcet UI rodando em http://localhost:${server.port}`);
