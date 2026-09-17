/**
 * 스레드(Threads) Graph API 클라이언트
 *
 * 의존성 없이 node 내장 fetch 만 쓴다 (node 18+).
 *
 * 엔드포인트와 필드 이름은 전부 아래 EP / FIELDS 한 곳에 모아 두었다.
 * Meta 가 규격을 바꾸면 여기만 고친다.
 *   https://developers.facebook.com/docs/threads
 *
 * 토큰은 절대 로그에 남기지 않는다 — 에러 메시지도 redact() 를 거친다.
 */
import { cfg, sleep, warn } from './config.mjs';

const BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const AUTH_BASE = process.env.THREADS_AUTH_BASE || 'https://graph.threads.net';

const EP = {
  me: () => '/me',
  myThreads: (uid) => `/${uid}/threads`,
  createContainer: (uid) => `/${uid}/threads`,
  publish: (uid) => `/${uid}/threads_publish`,
  conversation: (mediaId) => `/${mediaId}/conversation`,
  replies: (mediaId) => `/${mediaId}/replies`,
  manageReply: (replyId) => `/${replyId}/manage_reply`,
};

const FIELDS = {
  post: 'id,text,permalink,timestamp,media_type',
  reply: 'id,text,username,permalink,timestamp,replied_to,is_reply,hide_status,has_replies',
};

/** 토큰이 섞인 문자열을 로그에 쓰기 전에 가린다. */
export function redact(s) {
  return String(s).replace(/(access_token=)[^&\s"]+/g, '$1***');
}

class ThreadsError extends Error {
  constructor(status, body, where) {
    super(`스레드 API ${status} (${where}): ${redact(body).slice(0, 400)}`);
    this.status = status;
    this.body = body;
  }
}

/** 재시도해도 되는 실패인가 — 일시적 장애와 레이트리밋만 */
const retryable = (status) => status === 429 || (status >= 500 && status < 600);

export function threadsApi(token) {
  if (!token) throw new Error('스레드 액세스 토큰이 없습니다.');

  async function call(method, endpoint, params = {}, { tries = 4 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= tries; attempt++) {
      const url = new URL(BASE + endpoint);
      let init = { method, headers: {} };

      if (method === 'GET') {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
        }
        url.searchParams.set('access_token', token);
      } else {
        const form = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && v !== '') form.set(k, String(v));
        }
        form.set('access_token', token);
        init.body = form;
        init.headers['content-type'] = 'application/x-www-form-urlencoded';
      }

      let res, text;
      try {
        res = await fetch(url, init);
        text = await res.text();
      } catch (e) {
        lastErr = new Error(`네트워크 실패 (${endpoint}): ${redact(e.message)}`);
        if (attempt < tries) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
        throw lastErr;
      }

      if (res.ok) {
        try { return text ? JSON.parse(text) : {}; }
        catch { throw new Error(`응답이 JSON 이 아닙니다 (${endpoint}): ${text.slice(0, 200)}`); }
      }

      lastErr = new ThreadsError(res.status, text, endpoint);
      if (retryable(res.status) && attempt < tries) {
        const waitMs = 3000 * 2 ** (attempt - 1);
        warn(`${res.status} — ${waitMs / 1000}초 후 재시도 (${attempt}/${tries - 1})`);
        await sleep(waitMs);
        continue;
      }
      throw lastErr;
    }
    throw lastErr;
  }

  /** paging.next 를 따라가며 최대 maxPages 쪽까지 모은다 */
  async function callPaged(endpoint, params, maxPages = 5) {
    const out = [];
    let page = await call('GET', endpoint, params);
    out.push(...(page.data || []));
    for (let i = 1; i < maxPages && page?.paging?.cursors?.after; i++) {
      page = await call('GET', endpoint, { ...params, after: page.paging.cursors.after });
      out.push(...(page.data || []));
    }
    return out;
  }

  return {
    /** 연결 확인 — 내 계정 id/username */
    async me() {
      return call('GET', EP.me(), { fields: 'id,username,threads_profile_picture_url' });
    },

    /** 내가 쓴 최근 글. since 는 유닉스 초 */
    async myPosts({ limit = 25, since } = {}) {
      const me = await this.me();
      return callPaged(EP.myThreads(me.id), { fields: FIELDS.post, limit, since }, 3);
    },

    /** 한국시간 오늘 내가 발행한 글 수 — 하루 상한 계산에 쓴다 */
    async countPostsSince(unixSeconds) {
      const posts = await this.myPosts({ limit: 50, since: unixSeconds });
      return posts.filter((p) => Date.parse(p.timestamp) / 1000 >= unixSeconds).length;
    },

    /** 글 하나에 달린 대화 전체 (중첩 답글 포함) */
    async conversation(mediaId) {
      return callPaged(EP.conversation(mediaId), { fields: FIELDS.reply, limit: 50 }, 3);
    },

    /** 글 하나에 달린 최상위 댓글만 */
    async replies(mediaId) {
      return callPaged(EP.replies(mediaId), { fields: FIELDS.reply, limit: 50 }, 3);
    },

    /**
     * 글 또는 답글을 올린다. 컨테이너를 만들고 잠깐 기다렸다 발행하는 2단계다.
     * replyToId 를 주면 그 글/댓글에 달리는 답글이 된다.
     */
    async postText(text, { replyToId, replyControl } = {}) {
      const me = await this.me();
      const container = await call('POST', EP.createContainer(me.id), {
        media_type: 'TEXT',
        text,
        reply_to_id: replyToId,
        reply_control: replyControl,
      });
      if (!container?.id) throw new Error(`컨테이너 생성 응답에 id 가 없습니다: ${JSON.stringify(container)}`);

      await sleep(cfg.publishDelayMs);

      const published = await call('POST', EP.publish(me.id), { creation_id: container.id });
      if (!published?.id) throw new Error(`발행 응답에 id 가 없습니다: ${JSON.stringify(published)}`);
      return published;
    },

    /** 댓글 숨기기 */
    async hideReply(replyId, hide = true) {
      return call('POST', EP.manageReply(replyId), { hide: hide ? 'true' : 'false' });
    },
  };
}

/**
 * 장기 토큰(60일) 갱신. 발급 24시간 이후 ~ 만료 전에만 된다.
 * 응답: { access_token, token_type, expires_in }
 */
export async function refreshLongLivedToken(token) {
  const url = new URL(`${AUTH_BASE}/refresh_access_token`);
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new ThreadsError(res.status, text, 'refresh_access_token');
  return JSON.parse(text);
}

export { EP, FIELDS, BASE };
