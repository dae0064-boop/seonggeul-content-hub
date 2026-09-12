#!/usr/bin/env node
/**
 * 네이버 검색광고 API로 키워드 월간검색수를 조회한다.
 *
 * 이 저장소의 클라우드 세션에서는 naver.com 이 차단되므로 실행되지 않는다.
 * 사용자 PC에서 실행하는 스크립트다.
 *
 *   node scripts/naver-keywords.mjs --keywords content/calendar/keywords.txt
 *
 * 필요한 자격증명 (.env 또는 환경변수):
 *   NAVER_AD_API_KEY       검색광고 액세스 라이선스
 *   NAVER_AD_SECRET_KEY    검색광고 비밀키
 *   NAVER_AD_CUSTOMER_ID   검색광고 CUSTOMER_ID (6~8자리)
 *   NAVER_CLIENT_ID        개발자센터 앱 Client ID      (--with-competition 사용 시)
 *   NAVER_CLIENT_SECRET    개발자센터 앱 Client Secret  (--with-competition 사용 시)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv, requireEnv } from './lib/env.mjs';

const AD_HOST = 'https://api.searchad.naver.com';
const OPEN_HOST = 'https://openapi.naver.com';
const BATCH = 5;          // keywordstool 은 hintKeywords 를 최대 5개까지 받는다
const GAP_MS = 350;       // 호출 간 간격 (쿼터 보호)

// ---------------------------------------------------------------- env


// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { out: 'content/calendar/keyword-report', gap: GAP_MS };
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    switch (a) {
      case '--keywords': out.file = next(); break;
      case '--out':      out.out = next(); break;
      case '--host':     out.host = next(); break;   // 목 서버 테스트용
      case '--gap':      out.gap = Number(next()); break;
      case '--limit':    out.limit = Number(next()); break;
      case '--with-competition': out.comp = true; break;
      case '--check':    out.check = true; break;
      case '--help':     out.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
        rest.push(a);
    }
  }
  out.inline = rest;
  return out;
}

const USAGE = `
네이버 키워드 월간검색수 조회

  node scripts/naver-keywords.mjs --keywords content/calendar/keywords.txt
  node scripts/naver-keywords.mjs 환절기감기 여름이불 독감예방접종

옵션
  --keywords <파일>     한 줄에 키워드 하나. # 로 시작하면 주석
  --out <접두사>        결과 저장 경로 (기본 content/calendar/keyword-report)
  --with-competition    블로그 문서수까지 조회해 경쟁도/기회점수 계산
  --check               자격증명만 점검하고 끝낸다 (키워드 1개만 호출)
  --limit <N>           앞에서 N개만 조회
  --gap <ms>            호출 간격 (기본 350)
  --host <url>          API 호스트 재정의 (로컬 목업 테스트용)

결과는 .csv 와 .json 두 벌로 저장된다.
`;

// ---------------------------------------------------------------- 검색광고 API
/** 검색광고 API 서명: base64( HMAC-SHA256( secret, "{timestamp}.{method}.{path}" ) ) */
function sign(timestamp, method, urlPath, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${method}.${urlPath}`)
    .digest('base64');
}

async function keywordTool(hints, host) {
  const urlPath = '/keywordstool';
  const ts = Date.now().toString();
  const qs = new URLSearchParams({
    hintKeywords: hints.map((k) => k.replace(/\s+/g, '')).join(','),
    showDetail: '1',
  });
  const res = await fetch(`${host}${urlPath}?${qs}`, {
    headers: {
      'X-Timestamp': ts,
      'X-API-KEY': process.env.NAVER_AD_API_KEY,
      'X-Customer': process.env.NAVER_AD_CUSTOMER_ID,
      'X-Signature': sign(ts, 'GET', urlPath, process.env.NAVER_AD_SECRET_KEY),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`keywordstool ${res.status} ${res.statusText}\n${body.slice(0, 400)}`);
  }
  return res.json();
}

/** 블로그 문서수 — 경쟁강도 근사치 */
async function blogTotal(query, host) {
  const res = await fetch(`${host}/v1/search/blog.json?query=${encodeURIComponent(query)}&display=1`, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) throw new Error(`search/blog ${res.status}`);
  const j = await res.json();
  return j.total ?? null;
}

// ---------------------------------------------------------------- 파싱
/**
 * 검색광고 API 는 10 미만을 숫자가 아니라 "< 10" 문자열로 준다.
 * 그대로 두면 정렬과 합산이 깨지므로 숫자로 바꾸되, 추정값임을 따로 표시한다.
 */
function toCount(v) {
  if (typeof v === 'number') return { n: v, approx: false };
  if (v == null) return { n: 0, approx: true };
  const s = String(v).trim();
  if (/^<\s*10$/.test(s)) return { n: 5, approx: true };
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? { n, approx: false } : { n: 0, approx: true };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};


// ---------------------------------------------------------------- 점검
async function runCheck(args) {
  const adHost = args.host || AD_HOST;
  const openHost = args.host || OPEN_HOST;
  console.log('═'.repeat(58));
  console.log(' 자격증명 점검');
  console.log('═'.repeat(58));

  const show = (name) => {
    const v = process.env[name];
    // 값 자체는 절대 찍지 않는다. 존재 여부와 길이만.
    console.log(`  ${v ? '✅' : '❌'} ${name.padEnd(22)} ${v ? `설정됨 (${v.length}자)` : '없음'}`);
    return !!v;
  };

  console.log('\n검색광고 API — 월간검색수 (필수)');
  const ad = ['NAVER_AD_API_KEY', 'NAVER_AD_SECRET_KEY', 'NAVER_AD_CUSTOMER_ID'].map(show).every(Boolean);

  console.log('\n검색 API — 문서수 (선택)');
  const open = ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'].map(show).every(Boolean);

  if (!ad) {
    console.log('\n❌ 검색광고 키가 없어 호출을 건너뜁니다. .env 를 확인하세요.');
    process.exitCode = 1;
    return;
  }

  const cid = process.env.NAVER_AD_CUSTOMER_ID;
  if (!/^\d{5,10}$/.test(cid)) {
    console.log(`\n  ⚠ CUSTOMER_ID 가 숫자가 아닙니다: "${cid}". 6~8자리 숫자여야 합니다.`);
  }

  console.log('\n검색광고 API 호출 중... (키워드 1개)');
  try {
    const j = await keywordTool(['환절기'], adHost);
    const n = (j.keywordList || []).length;
    console.log(`  ✅ 인증 성공 — 연관키워드 ${n}개 수신`);
    const first = (j.keywordList || [])[0];
    if (first) {
      const pc = toCount(first.monthlyPcQcCnt), mo = toCount(first.monthlyMobileQcCnt);
      console.log(`     예: ${first.relKeyword} — PC ${pc.n} / 모바일 ${mo.n}`);
    }
  } catch (e) {
    console.log(`  ❌ 실패`);
    console.log('     ' + e.message.split('\n').join('\n     '));
    const m = /keywordstool (\d+)/.exec(e.message);
    if (m) {
      const hint = {
        '401': '라이선스 또는 비밀키가 틀렸습니다. 공백이나 줄바꿈이 섞이지 않았는지 확인하세요.',
        '403': 'CUSTOMER_ID 가 라이선스와 짝이 맞지 않습니다.',
        '404': '경로가 잘못됐습니다. --host 를 건드리지 않았는지 확인하세요.',
      }[m[1]];
      if (hint) console.log(`     → ${hint}`);
    }
    process.exitCode = 1;
    return;
  }

  if (open) {
    console.log('\n검색 API 호출 중...');
    try {
      const t = await blogTotal('환절기', openHost);
      console.log(`  ✅ 인증 성공 — 문서수 ${t?.toLocaleString?.() ?? t}`);
    } catch (e) {
      console.log(`  ❌ 실패: ${e.message}`);
      console.log('     → --with-competition 없이 돌리면 검색량은 정상적으로 나옵니다.');
    }
  } else {
    console.log('\n검색 API 키가 없어 건너뜁니다 (--with-competition 사용 불가).');
  }

  console.log('\n다음 단계:');
  console.log('  node scripts/naver-keywords.mjs --keywords content/calendar/keywords.txt' + (open ? ' --with-competition' : ''));
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); return; }

  loadEnv();

  if (args.check) return runCheck(args);

  let keywords = args.inline;
  if (args.file) {
    keywords = fs.readFileSync(args.file, 'utf8')
      .split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }
  if (!keywords.length) throw new Error('조회할 키워드가 없습니다. --keywords 또는 인자로 넘기세요.');
  keywords = [...new Set(keywords)];
  if (args.limit) keywords = keywords.slice(0, args.limit);

  const adHost = args.host || AD_HOST;
  const openHost = args.host || OPEN_HOST;

  requireEnv(['NAVER_AD_API_KEY', 'NAVER_AD_SECRET_KEY', 'NAVER_AD_CUSTOMER_ID']);
  if (args.comp) requireEnv(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']);

  const batches = [];
  for (let i = 0; i < keywords.length; i += BATCH) batches.push(keywords.slice(i, i + BATCH));

  console.log('═'.repeat(58));
  console.log(' 네이버 키워드 월간검색수 조회');
  console.log('═'.repeat(58));
  console.log(`  키워드 : ${keywords.length}개 (${batches.length}회 호출)`);
  console.log(`  경쟁도 : ${args.comp ? '조회함' : '건너뜀 (--with-competition)'}`);
  console.log(`  호스트 : ${adHost}${args.host ? '  ← 재정의됨' : ''}`);

  const wanted = new Set(keywords.map((k) => k.replace(/\s+/g, '')));
  const rows = new Map();
  let failed = 0;

  for (const [i, batch] of batches.entries()) {
    process.stdout.write(`  [${i + 1}/${batches.length}] ${batch.join(', ')} ... `);
    try {
      const json = await keywordTool(batch, adHost);
      const list = json.keywordList || [];
      let hit = 0;
      for (const k of list) {
        // 연관키워드까지 잔뜩 오므로, 요청한 키워드만 추린다
        if (!wanted.has(k.relKeyword)) continue;
        const pc = toCount(k.monthlyPcQcCnt);
        const mo = toCount(k.monthlyMobileQcCnt);
        rows.set(k.relKeyword, {
          키워드: k.relKeyword,
          PC: pc.n,
          모바일: mo.n,
          합계: pc.n + mo.n,
          추정: pc.approx || mo.approx ? 'Y' : '',
          경쟁정도: k.compIdx ?? '',
          문서수: '',
          기회점수: '',
        });
        hit++;
      }
      console.log(`${hit}개 매칭 (응답 ${list.length}개)`);
    } catch (e) {
      failed++;
      console.log('실패');
      console.error(`      ${e.message.split('\n')[0]}`);
    }
    if (i < batches.length - 1) await sleep(args.gap);
  }

  const missing = keywords.filter((k) => !rows.has(k.replace(/\s+/g, '')));

  if (args.comp && rows.size) {
    console.log('\n  블로그 문서수 조회 중...');
    for (const r of rows.values()) {
      try {
        const total = await blogTotal(r.키워드, openHost);
        r.문서수 = total ?? '';
        // 기회점수: 검색량 대비 문서수가 적을수록 높다. 소수 둘째자리.
        if (total && total > 0) r.기회점수 = Math.round((r.합계 / total) * 10000) / 10000;
      } catch { /* 개별 실패는 비워둔다 */ }
      await sleep(args.gap);
    }
  }

  const result = [...rows.values()].sort((a, b) => b.합계 - a.합계);

  if (!result.length) {
    console.error('\n❌ 결과가 비었습니다. 자격증명과 호출 결과를 확인하세요.');
    process.exitCode = 1;
    return;
  }

  const outBase = args.out;
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const cols = Object.keys(result[0]);
  fs.writeFileSync(`${outBase}.csv`,
    '﻿' + [cols.join(','), ...result.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
  fs.writeFileSync(`${outBase}.json`,
    JSON.stringify({ 조회일: new Date().toISOString().slice(0, 10), 건수: result.length, 결과: result }, null, 2) + '\n');

  console.log(`\n  상위 10개`);
  console.log('  ' + '─'.repeat(54));
  for (const r of result.slice(0, 10)) {
    const bar = '█'.repeat(Math.min(20, Math.round(r.합계 / (result[0].합계 || 1) * 20)));
    console.log(`  ${String(r.합계).padStart(7)}${r.추정 ? '~' : ' '} ${bar.padEnd(20)} ${r.키워드}`);
  }

  console.log(`\n✅ 저장: ${outBase}.csv / ${outBase}.json`);
  if (missing.length) console.log(`  ⚠ 응답에 없던 키워드 ${missing.length}개: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
  if (failed) console.log(`  ⚠ 실패한 호출 ${failed}건 — 위 오류 메시지를 확인하세요.`);
  console.log('  ※ 월간검색수는 최근 30일 합계이며 달력상 지난달이 아닙니다.');
  console.log('  ※ "추정=Y" 는 10 미만이라 네이버가 정확한 수치를 주지 않은 키워드입니다.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
