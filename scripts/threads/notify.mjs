/**
 * 알림 — 보류한 댓글과 실패를 GitHub 이슈로 남긴다.
 *
 * 상태 파일을 따로 두지 않는다. "이미 알렸는가"는 이슈 본문에 박아둔 표식
 * (<!-- threads-key: ... -->) 을 찾아서 판단한다. GitHub 자체가 상태 저장소다.
 *
 * GITHUB_TOKEN 이 없으면(로컬 실행) 화면에만 출력하고 조용히 넘어간다.
 */
import { log, warn } from './config.mjs';

const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
export const HOLD_LABEL = 'threads-hold';

export const enabled = () => Boolean(REPO && TOKEN);

async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${TOKEN}`,
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const marker = (key) => `<!-- threads-key: ${key} -->`;

/** 이 표식으로 이미 이슈를 만든 적이 있는가 (닫힌 것도 본 것으로 친다) */
export async function alreadyReported(key) {
  if (!enabled()) return false;
  try {
    const issues = await gh('GET', `/repos/${REPO}/issues?state=all&labels=${HOLD_LABEL}&per_page=100`);
    return issues.some((i) => String(i.body || '').includes(marker(key)));
  } catch (e) {
    warn(`이슈 조회 실패 — 중복 확인을 건너뜁니다: ${e.message}`);
    return false;
  }
}

/**
 * 이슈를 연다. key 를 주면 같은 key 로는 한 번만 열린다.
 * @returns {Promise<string|null>} 이슈 URL
 */
export async function report({ title, body, key, labels = [HOLD_LABEL] }) {
  const full = key ? `${body}\n\n${marker(key)}` : body;

  if (!enabled()) {
    log(`[알림] ${title}`);
    console.log(full.replace(/^/gm, '     '));
    return null;
  }
  if (key && (await alreadyReported(key))) {
    log(`이미 알린 건입니다 — 건너뜀 (${key})`);
    return null;
  }

  try {
    const issue = await gh('POST', `/repos/${REPO}/issues`, { title, body: full, labels });
    log(`이슈 생성: ${issue.html_url}`);
    return issue.html_url;
  } catch (e) {
    // 라벨이 없어 막힌 경우를 대비해 라벨 없이 한 번 더
    warn(`이슈 생성 실패, 라벨 없이 재시도: ${e.message}`);
    const issue = await gh('POST', `/repos/${REPO}/issues`, { title, body: full });
    log(`이슈 생성: ${issue.html_url}`);
    return issue.html_url;
  }
}
