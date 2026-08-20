#!/usr/bin/env node
/** 로컬 미리보기용 정적 서버. 사용: npm run serve  ->  http://localhost:8099 */
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "content-hub-site");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

http
  .createServer((req, res) => {
    const file = (req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0]);
    const path = join(root, file);
    if (!path.startsWith(root) || !existsSync(path)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("찾을 수 없습니다");
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "text/plain; charset=utf-8" });
    res.end(readFileSync(path));
  })
  .listen(8099, () => console.log("콘텐츠 허브 미리보기: http://localhost:8099"));
