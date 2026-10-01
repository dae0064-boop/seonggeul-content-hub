#!/usr/bin/env node
/**
 * 원고 한 편의 이미지를 계획서대로 전부 만든다. 실제 생성은 image-gen.mjs 가 한다.
 *
 *   node scripts/post-images.mjs content/image-plans/2026-10-01-dokgam-75.json
 *   node scripts/post-images.mjs <계획서> --only 3      3번만 다시
 *   node scripts/post-images.mjs <계획서> --force      이미 있는 것도 다시
 *
 * 계획서: content/image-plans/<슬러그>.json
 *   { slug, images: [{ n, file: "01.png", title, note, prompt }] }
 * 프롬프트는 계획서에 적힌 문장을 그대로 보낸다(클레이 3D 스타일 문장 포함).
 *
 * 결과: content/images/<슬러그>/01.png, 02.png ...
 * 이 폴더를 publish-naver.mjs --images 에 그대로 넘기면 [이미지 N] 자리에 들어간다.
 * 이미 만든 파일은 건너뛴다. 돈이 두 번 나가지 않게 하기 위해서다.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
    force: { type: "boolean" },
    quality: { type: "string", default: "low" },
    size: { type: "string", default: "1024x1024" },
    help: { type: "boolean", short: "h" },
  },
});

if (opt.help || !positionals.length) {
  console.log("사용법: node scripts/post-images.mjs content/image-plans/<슬러그>.json [--only 3] [--force]");
  process.exit(opt.help ? 0 : 1);
}

const plan = JSON.parse(readFileSync(positionals[0], "utf8"));
if (!plan.slug || !Array.isArray(plan.images)) {
  console.error("❌ 계획서에 slug 와 images 가 필요해요");
  process.exit(1);
}

const outDir = join(ROOT, "content", "images", plan.slug);
const only = opt.only ? new Set(opt.only.split(",").map(Number)) : null;
const todo = plan.images.filter((im) => !only || only.has(im.n));

console.log(`🖼  ${plan.slug} — ${todo.length}장`);
console.log(`   저장 위치: ${outDir}\n`);

let made = 0, skipped = 0, failed = [];
for (const im of todo) {
  const name = im.file ? im.file.replace(/\.png$/i, "") : String(im.n).padStart(2, "0");
  const target = join(outDir, `${name}.png`);
  if (existsSync(target) && !opt.force) {
    console.log(`⏭  ${name}.png 이미 있음 — ${im.title}`);
    skipped++;
    continue;
  }
  console.log(`\n[${im.n}/${plan.images.length}] ${im.title}`);
  const r = spawnSync(process.execPath, [
    join(ROOT, "scripts", "image-gen.mjs"),
    im.prompt,
    "--raw",
    "--out", outDir,
    "--name", name,
    "--quality", opt.quality,
    "--size", opt.size,
  ], { stdio: "inherit" });
  if (r.status === 0 && existsSync(target)) made++;
  else failed.push(im.n);
}

console.log("\n" + "─".repeat(50));
console.log(`새로 만듦 ${made}장 / 건너뜀 ${skipped}장 / 실패 ${failed.length}장`);
if (failed.length) {
  console.log(`실패한 번호: ${failed.join(", ")}`);
  console.log(`다시: node scripts/post-images.mjs ${positionals[0]} --only ${failed.join(",")}`);
  process.exit(1);
}
console.log(`✅ 완료 — ${outDir}`);
