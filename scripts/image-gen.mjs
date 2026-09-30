#!/usr/bin/env node
/**
 * 블로그 이미지 생성 (OpenAI)
 *
 *   node scripts/image-gen.mjs "가을 거실에서 선풍기 날개를 닦는 모습"
 *   node scripts/image-gen.mjs "..." --size 1536x1024 --out content/images/2026-10-01-fan
 *
 * 기본값: 모델 gpt-image-2, 품질 low (1장 약 $0.006), 1024x1024.
 *   --model   IMAGE_MODEL 로도 바꿀 수 있다
 *   --quality low | medium | high
 *   --size    1024x1024 | 1536x1024(가로) | 1024x1536(세로)
 *   --n       장수 (기본 1)
 *   --out     저장 폴더 (기본 content/images/<오늘>)
 *
 * 그림에 글자를 넣지 말라는 문장을 항상 덧붙인다. 싼 모델은 한글이 깨진다.
 * 제목 글씨가 필요하면 그림을 만든 뒤 따로 얹는다.
 *
 * 키는 OPENAI_API_KEY 환경 변수, 없으면 저장소 루트 .env 에서 읽는다.
 * 외부 패키지를 쓰지 않는다. Node 18 이상이면 그냥 돌아간다.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
const NO_TEXT = "Do not include any text, letters, numbers, logos or watermarks in the image.";

function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    quality: { type: "string", default: "low" },
    size: { type: "string", default: "1024x1024" },
    n: { type: "string", default: "1" },
    out: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (opt.help || !positionals.length) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ""));
  process.exit(opt.help ? 0 : 1);
}

const env = { ...loadEnv(), ...process.env };
const key = (env.OPENAI_API_KEY || "").trim();
if (!key) die("OPENAI_API_KEY 가 없어요. 윈도우는 launchers/openai-key.cmd, 그 밖은 .env 에 넣으세요");

const model = opt.model || env.IMAGE_MODEL || "gpt-image-2";
const n = Number(opt.n);
if (!["low", "medium", "high"].includes(opt.quality)) die("--quality 는 low / medium / high 중 하나예요");
if (!/^\d+x\d+$/.test(opt.size)) die("--size 는 1024x1024 같은 모양이어야 해요");
if (!Number.isInteger(n) || n < 1 || n > 4) die("--n 은 1~4 사이로 주세요");

const today = new Date().toISOString().slice(0, 10);
const outDir = resolve(opt.out || join(ROOT, "content", "images", today));

console.log(`🎨 ${model} / ${opt.quality} / ${opt.size} × ${n}`);
const res = await fetch(`${API_BASE}/images/generations`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    prompt: `${positionals.join(" ")}\n\n${NO_TEXT}`,
    size: opt.size,
    quality: opt.quality,
    n,
  }),
}).catch((e) => die(`OpenAI 에 접속하지 못했어요 (${e.cause?.code || e.message})`));

const text = await res.text();
if (!res.ok) {
  let msg = text.slice(0, 300);
  try { msg = JSON.parse(text).error.message; } catch {}
  if (res.status === 401) die("키가 맞지 않아요 (401)");
  if (/verif/i.test(msg)) die(`${model} 은 OpenAI 조직 인증이 필요해요 — ${msg}`);
  die(`HTTP ${res.status} — ${msg}`);
}

const { data = [], usage } = JSON.parse(text);
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(9, 15);
data.forEach((d, i) => {
  if (!d.b64_json) die("응답에 이미지가 없어요");
  const file = join(outDir, `${stamp}${data.length > 1 ? `-${i + 1}` : ""}.png`);
  writeFileSync(file, Buffer.from(d.b64_json, "base64"));
  console.log(`✅ ${file}`);
});
if (usage) console.log(`   토큰: 입력 ${usage.input_tokens ?? "?"} / 출력 ${usage.output_tokens ?? "?"}`);
