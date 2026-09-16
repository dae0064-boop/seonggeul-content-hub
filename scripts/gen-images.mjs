#!/usr/bin/env node
/**
 * 작업판에 적어둔 이미지 프롬프트로 이미지를 생성한다.
 *
 * 이 저장소의 클라우드 세션에서는 api.openai.com 이 차단되므로 실행되지 않는다.
 * 사용자 PC에서 실행하는 스크립트다.
 *
 *   node scripts/gen-images.mjs --post 2026-09-12-aircon-cover --dry-run
 *   node scripts/gen-images.mjs --post 2026-09-12-aircon-cover
 *
 * 유료 API 다. 돈이 새지 않도록 두 가지를 지킨다.
 *  - 이미 만든 파일은 건너뛴다. 중간에 실패해도 다시 돌리면 남은 것만 만든다.
 *  - 실행 전에 몇 장에 얼마가 드는지 먼저 보여주고, --yes 가 없으면 멈춘다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, requireEnv } from './lib/env.mjs';

const HOST = 'https://api.openai.com';
const BOARD = 'content/board/posts-data.json';

// 1024x1024 한 장 기준 추정 단가(달러). 공식 가격표가 바뀌면 여기만 고친다.
const PRICE = { low: 0.006, medium: 0.053, high: 0.211 };

function parseArgs(argv) {
  const out = { model: 'gpt-image-2', quality: 'low', size: '1024x1024', gap: 1200 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    switch (a) {
      case '--post':    out.post = next(); break;
      case '--only':    out.only = next().split(',').map(Number); break;
      case '--model':   out.model = next(); break;
      case '--quality': out.quality = next(); break;
      case '--size':    out.size = next(); break;
      case '--out':     out.out = next(); break;
      case '--host':    out.host = next(); break;   // 목 서버 테스트용
      case '--gap':     out.gap = Number(next()); break;
      case '--force':   out.force = true; break;
      case '--dry-run': out.dry = true; break;
      case '--yes':     out.yes = true; break;
      case '--help':    out.help = true; break;
      default: if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  return out;
}

const USAGE = `
이미지 생성

  node scripts/gen-images.mjs --post <슬러그> --dry-run     프롬프트만 확인 (무료)
  node scripts/gen-images.mjs --post <슬러그> --yes         실제 생성 (유료)

옵션
  --post <슬러그>    content/board/posts-data.json 의 글 id 또는 제목 일부
  --only 3,7         해당 번호만 생성
  --quality low      low | medium | high   (기본 low)
  --model            기본 gpt-image-2
  --size             기본 1024x1024
  --out <폴더>       기본 content/images/<슬러그>
  --force            이미 있는 파일도 다시 만든다 (돈이 다시 든다)
  --yes              확인 없이 바로 생성
  --gap <ms>         호출 간격 (기본 1200)

이미 만든 파일은 건너뛴다. 중간에 끊겨도 다시 돌리면 남은 것만 만든다.
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const won = (usd) => Math.round(usd * 1400).toLocaleString('ko-KR');

async function generate(prompt, args) {
  const res = await fetch(`${args.host || HOST}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model, prompt, size: args.size, quality: args.quality, n: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}\n${body.slice(0, 500)}`);
  }
  const j = await res.json();
  const d = j?.data?.[0];
  // gpt-image 계열은 base64 로 준다. URL 로 주는 모델도 있어 둘 다 받는다.
  if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
  if (d?.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
  throw new Error(`응답에 이미지가 없습니다:\n${JSON.stringify(j).slice(0, 400)}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); return; }

  if (!fs.existsSync(BOARD)) throw new Error(`${BOARD} 가 없습니다.`);
  const posts = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
  // --post 를 생략해도 글이 하나뿐이면 그걸 쓴다. 매번 슬러그를 치게 할 이유가 없다.
  const post = args.post
    ? (posts.find((p) => p.id === args.post || (p.slug || '').includes(args.post))
       || posts.find((p) => p.title.includes(args.post)))
    : (posts.length === 1 ? posts[0] : null);
  if (!post) {
    throw new Error(args.post
      ? `글을 찾지 못했습니다: ${args.post}\n있는 글: ${posts.map((p) => p.id).join(', ')}`
      : `글이 ${posts.length}개라 --post 로 골라야 합니다.\n있는 글: ${posts.map((p) => p.id).join(', ')}`);
  }
  if (!post.images?.length) throw new Error(`"${post.title}" 에 이미지 프롬프트가 없습니다.`);

  const outDir = args.out || path.join('content/images', post.slug || post.id);
  const unit = PRICE[args.quality] ?? PRICE.low;

  const jobs = post.images
    .map((im, i) => ({ ...im, n: i + 1, note: im.n, file: path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`) }))
    .filter((j) => !args.only || args.only.includes(j.n))
    .filter((j) => args.force || !fs.existsSync(j.file));
  const skipped = post.images.length - jobs.length - (args.only ? post.images.length - args.only.length : 0);

  console.log('='.repeat(58));
  console.log(` ${post.title}`);
  console.log('='.repeat(58));
  console.log(`  모델   : ${args.model} / ${args.quality} / ${args.size}`);
  console.log(`  저장   : ${outDir}`);
  console.log(`  만들 것: ${jobs.length}장${skipped > 0 ? `  (이미 있어 건너뜀 ${skipped}장)` : ''}`);
  console.log(`  예상   : $${(jobs.length * unit).toFixed(3)}  (약 ${won(jobs.length * unit)}원)`);
  console.log('  ※ 단가는 추정치입니다. 실제 청구액은 OpenAI 사용량 페이지에서 확인하세요.');

  if (!jobs.length) { console.log('\n만들 것이 없습니다.'); return; }

  if (args.dry) {
    console.log('\n--- 프롬프트 (생성하지 않음) ---');
    for (const j of jobs) {
      console.log(`\n[${j.n}] ${j.t}`);
      if (j.note) console.log(`    메모: ${j.note}`);
      console.log(`    ${j.p}`);
    }
    console.log(`\n실제로 만들려면 --dry-run 을 빼고 --yes 를 붙이세요.`);
    return;
  }

  loadEnv();
  requireEnv(['OPENAI_API_KEY'], 'https://platform.openai.com/api-keys 에서 발급받습니다.');

  if (!args.yes) {
    console.log('\n위 내용으로 생성하려면 --yes 를 붙여 다시 실행하세요.');
    console.log('프롬프트만 먼저 보시려면 --dry-run 을 붙이세요.');
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  let made = 0, failed = 0;
  for (const [i, j] of jobs.entries()) {
    process.stdout.write(`  [${i + 1}/${jobs.length}] ${j.t} ... `);
    try {
      const buf = await generate(j.p, args);
      fs.writeFileSync(j.file, buf);
      console.log(`${(buf.length / 1024).toFixed(0)}KB → ${j.file}`);
      made++;
    } catch (e) {
      failed++;
      console.log('실패');
      console.error(`      ${e.message.split('\n').join('\n      ')}`);
    }
    if (i < jobs.length - 1) await sleep(args.gap);
  }

  console.log(`\n완료: ${made}장 생성${failed ? `, ${failed}장 실패` : ''}`);
  console.log(`  실제 비용 ≈ $${(made * unit).toFixed(3)} (약 ${won(made * unit)}원)`);
  if (failed) console.log('  실패한 것은 다시 실행하면 남은 것만 만듭니다.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
