/**
 * Anthropic Messages API 호출 — 글 생성과 댓글 분류에 쓴다.
 *
 * 모델에게는 항상 JSON 하나만 내놓게 하고, 여기서 엄격하게 파싱한다.
 * 파싱에 실패하면 발행하지 않는다 (조용히 넘어가지 않는다).
 */
import { cfg, sleep, warn } from './config.mjs';

const API = process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com';

/** 응답 텍스트에서 JSON 객체 하나를 꺼낸다. 코드펜스로 감싸도 견딘다. */
export function extractJson(raw) {
  const text = String(raw).trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`모델 응답에서 JSON 을 찾지 못했습니다: ${text.slice(0, 200)}`);
  }
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * 모델에게 물어보고 JSON 으로 돌려받는다.
 * @returns {Promise<object>}
 */
export async function askJson({ system, user, model = cfg.model, maxTokens = 1500, tries = 3 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY 가 없습니다.');

  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    let res, text;
    try {
      res = await fetch(`${API}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      text = await res.text();
    } catch (e) {
      lastErr = new Error(`Anthropic 네트워크 실패: ${e.message}`);
      if (attempt < tries) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      throw lastErr;
    }

    if (!res.ok) {
      lastErr = new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
      const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
      if (retryable && attempt < tries) {
        warn(`${res.status} — 잠시 후 재시도 (${attempt}/${tries - 1})`);
        await sleep(3000 * 2 ** (attempt - 1));
        continue;
      }
      throw lastErr;
    }

    const payload = JSON.parse(text);
    const out = (payload.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return extractJson(out);
  }
  throw lastErr;
}
