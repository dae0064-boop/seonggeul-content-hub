/**
 * 스레드 자동화 공통 설정
 *
 * .env / 환경변수 로드, 킬스위치, 한국시간 helper, 경로.
 * 다른 threads/*.mjs 는 전부 여기를 거쳐 설정을 읽는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const DIR = path.join(ROOT, 'content', 'threads');
export const PAUSE_FILE = path.join(DIR, 'PAUSE');
export const VOICE_FILE = path.join(DIR, 'voice.md');
export const TOPICS_FILE = path.join(DIR, 'topics.txt');

// ---------------------------------------------------------------- .env
/** .env 를 읽어 process.env 에 채운다. 이미 있는 값은 덮지 않는다. */
export function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (let line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`\n[없음] 값이 비어 있습니다: ${missing.join(', ')}`);
    console.error('   로컬이면 .env, GitHub Actions 면 저장소 Secrets 에 넣으세요.');
    console.error('   자세한 절차는 docs/THREADS.md 를 보세요.\n');
    process.exit(2);
  }
}

// ---------------------------------------------------------------- 킬스위치
/**
 * 멈춤 여부. 둘 중 하나면 아무것도 하지 않는다.
 *   1. content/threads/PAUSE 파일이 있다
 *   2. THREADS_PAUSED 가 1/true/yes/on
 */
export function pausedReason() {
  if (fs.existsSync(PAUSE_FILE)) {
    const note = fs.readFileSync(PAUSE_FILE, 'utf8').trim();
    return `PAUSE 파일이 있습니다${note ? ` — ${note}` : ''}`;
  }
  const v = String(process.env.THREADS_PAUSED || '').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return 'THREADS_PAUSED 가 켜져 있습니다';
  return null;
}

// ---------------------------------------------------------------- 설정값
const num = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

export const cfg = {
  /** 하루 최대 발행 수 (한국시간 기준). 스레드 자체 한도는 24시간 250개다 */
  maxPostsPerDay: num('THREADS_MAX_POSTS_PER_DAY', 4),
  /** 한 번 실행에 다는 최대 답글 수 */
  maxRepliesPerRun: num('THREADS_MAX_REPLIES_PER_RUN', 10),
  /** 답글을 찾을 때 거슬러 올라갈 내 최근 글 수 */
  scanPosts: num('THREADS_SCAN_POSTS', 15),
  /** 글자수 한도 — 스레드는 500자 */
  maxChars: num('THREADS_MAX_CHARS', 500),
  minChars: num('THREADS_MIN_CHARS', 80),
  /** 컨테이너 생성 후 발행까지 기다리는 시간 */
  publishDelayMs: num('THREADS_PUBLISH_DELAY_MS', 5000),
  /** 글 생성 모델. 짧은 글이라 sonnet 으로 충분하다 */
  model: process.env.THREADS_MODEL || 'claude-sonnet-5',
  /** 최근 글과 얼마나 겹치면 중복으로 볼지 (0~1) */
  dupThreshold: Number(process.env.THREADS_DUP_THRESHOLD || 0.42),
};

// ---------------------------------------------------------------- 한국시간
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국시간 기준 오늘 00:00 의 유닉스 초 */
export function kstDayStartUnix(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  kst.setUTCHours(0, 0, 0, 0);
  return Math.floor((kst.getTime() - KST_OFFSET_MS) / 1000);
}

/** "2026-09-17 21:30 (KST)" */
export function kstStamp(d = new Date()) {
  const k = new Date(d.getTime() + KST_OFFSET_MS).toISOString();
  return `${k.slice(0, 10)} ${k.slice(11, 16)} (KST)`;
}

/** 지금이 한국시간 몇 시인지 (0~23) */
export function kstHour(d = new Date()) {
  return new Date(d.getTime() + KST_OFFSET_MS).getUTCHours();
}

/** 이 파일이 직접 실행됐는가 (import 된 게 아니라) */
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;
}

// ---------------------------------------------------------------- 로그
export const log = (...m) => console.log('  ', ...m);
export const step = (...m) => console.log('\n▶', ...m);
export const warn = (...m) => console.log('  [주의]', ...m);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
