// 사실상 간단한 웹 서버

import { existsSync, statSync } from "fs";
import { join, extname } from "path";
import { serve } from "bun";

const PUBLIC_DIR = join(import.meta.dir, "public");
const PORT = Number(process.env.PORT) || 8275;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".xdelta": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

const HTML_404 = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 Not Found</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      background-color: #000;
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="/assets/404.gif" alt="404 Not Found">
</body>
</html>`;

const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") {
      pathname = "/index.html";
    }

    // 정적 파일 제공
    let filePath = join(PUBLIC_DIR, pathname);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return serveFile(filePath);
    }

    // 패치 목록 api
    if (pathname === "/api/patch-manifest") {
      const manifest = getPatchManifest();
      return new Response(JSON.stringify(manifest), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 언어 파일 목록 api
    if (pathname.startsWith("/api/lang-files")) {
      const isMac = url.searchParams.get("mac") === "true";
      const langFolderName = isMac ? "lang_mac" : "lang";
      const langDir = join(PUBLIC_DIR, "patch", langFolderName);
      const files = getRecursiveFiles(langDir);
      return new Response(JSON.stringify(files), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(HTML_404, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

function serveFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const file = Bun.file(filePath);

  const isStaticAsset = [".css", ".js", ".ttf", ".png", ".gif", ".ico", ".wasm"].includes(ext);
  const cacheControl = isStaticAsset ? "public, max-age=3600" : "no-cache";

  return new Response(file, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function getPatchManifest() {
  const patchDir = join(PUBLIC_DIR, "patch");
  const xdeltaDir = join(patchDir, "xdelta");
  const langDir = join(patchDir, "lang");

  const xdeltaFiles = [];
  if (existsSync(xdeltaDir)) {
    const files = Bun.spawnSync(["ls", xdeltaDir]).stdout.toString().split("\n").filter(Boolean);
    xdeltaFiles.push(...files);
  }

  return {
    xdeltaFiles,
    hasLang: existsSync(langDir),
  };
}

function getRecursiveFiles(dir, baseDir = dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const entries = Bun.spawnSync(["find", dir, "-type", "f"]).stdout.toString().split("\n").filter(Boolean);
  for (const file of entries) {
    const rel = file.slice(baseDir.length).replace(/^[/\\]+/, "");
    if (rel) results.push(rel);
  }
  return results;
}

console.log(`🚀 패처가 포트 ${PORT}에서 실행되었습니다!`);
