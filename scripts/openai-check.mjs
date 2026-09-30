#!/usr/bin/env node
/**
 * OpenAI API 키 확인
 *
 *   node scripts/openai-check.mjs      (= npm run openai:check)
 *
 * .env 의 OPENAI_API_KEY 로 OpenAI 에 한 번 접속해 본다.
 * 키 값은 화면에 찍지 않는다. 앞 3자와 끝 4자만 보여준다.
 * 모델 목록만 조회하므로 요금이 나가지 않는다.
 *
 * 외부 패키지를 쓰지 않는다. Node 18 이상이면 그냥 돌아간다.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const ok = (s) => console.log(`  ✅ ${s}`);
const no = (s) => console.log(`  ❌ ${s}`);

function fail(msg, hint) {
  no(msg);
  if (hint) console.log(`     → ${hint}`);
  process.exit(1);
}

console.log("\nOpenAI API 키 확인\n");

// 윈도우는 launchers/openai-key.cmd 가 사용자 환경 변수에 넣는다. 그땐 .env 가 없어도 된다.
const fromEnvVar = (process.env.OPENAI_API_KEY || "").trim();
const key = fromEnvVar || (loadEnv().OPENAI_API_KEY || "").trim();
if (!key) {
  fail(
    "OPENAI_API_KEY 를 찾지 못했어요",
    "윈도우: launchers/openai-key.cmd 더블클릭 / 그 밖: .env 에 OPENAI_API_KEY=sk-... 한 줄 추가",
  );
}
ok(fromEnvVar ? "환경 변수에서 키 찾음" : ".env 에서 키 찾음");
if (/\s/.test(key)) {
  fail("키 안에 띄어쓰기가 들어 있어요", "= 뒤에 키만 붙여넣고 공백을 지우세요");
}
if (!key.startsWith("sk-")) {
  fail("키 모양이 이상해요 (sk- 로 시작해야 해요)", "platform.openai.com > API keys 에서 다시 복사하세요");
}
ok(`키 읽음 (${key.slice(0, 3)}…${key.slice(-4)})`);

let res;
try {
  res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
} catch (e) {
  fail(`OpenAI 에 접속하지 못했어요 (${e.cause?.code || e.message})`, "인터넷 연결이나 회사 방화벽을 확인하세요");
}

if (res.status === 401) {
  fail("키가 틀렸거나 삭제된 키예요 (401)", "platform.openai.com > API keys 에서 새로 만들어 다시 넣으세요");
}
if (res.status === 429) {
  fail("결제 수단이나 크레딧이 없어요 (429)", "platform.openai.com > Settings > Billing 을 확인하세요");
}
if (!res.ok) {
  fail(`OpenAI 가 오류를 돌려줬어요 (HTTP ${res.status})`, (await res.text()).slice(0, 200));
}

const { data = [] } = await res.json();
const ids = data.map((m) => m.id);
ok(`OpenAI 접속 성공 — 쓸 수 있는 모델 ${ids.length}개`);

const image = ids.filter((id) => /^(gpt-image|dall-e)/.test(id));
if (image.length) ok(`이미지 모델: ${image.join(", ")}`);
else console.log("  ⚠️  이미지 모델이 목록에 없어요. 조직 인증(Verify organization)이 필요할 수 있어요");

console.log("\n설정 완료. 이 컴퓨터에서 OpenAI 를 쓸 수 있어요.\n");
