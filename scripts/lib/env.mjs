import fs from 'node:fs';

/**
 * .env 를 읽어 process.env 에 채운다.
 *
 * 윈도우 메모장이 만드는 파일까지 받아내야 한다:
 *  - 줄 끝이 CRLF 다. 정규식의 `.` 은 캐리지리턴을 매칭하지 않으므로 먼저 털어낸다.
 *  - UTF-16(LE/BE) 또는 BOM 붙은 UTF-8 로 저장되기도 한다.
 */
export function decodeEnvFile(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return buf.subarray(2).swap16().toString('utf16le');
  // BOM 없는 UTF-16LE: ASCII 자리에 널바이트가 섞여 들어온다
  if (buf.length > 1 && buf[1] === 0x00 && buf[3] === 0x00) return buf.toString('utf16le');
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

export function loadEnv() {
  let loaded = 0, found = null;
  for (const f of ['.env', '.env.local']) {
    if (!fs.existsSync(f)) continue;
    found = f;
    for (let line of decodeEnvFile(fs.readFileSync(f)).split(/\r?\n/)) {
      line = line.replace(/[\r\u0000]/g, '').trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (!v) continue;
      if (!process.env[m[1]]) process.env[m[1]] = v;
      loaded++;
    }
  }
  if (found && loaded === 0) {
    console.error(`⚠ ${found} 를 찾았지만 읽어낸 값이 없습니다.`);
    console.error('  KEY=값 형식인지, = 앞뒤에 공백이 없는지 확인하세요.');
  }
  return loaded;
}

/** 없는 자격증명을 한 번에 알려준다. 값은 절대 출력하지 않는다. */
export function requireEnv(names, hint) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(
      `자격증명이 없습니다: ${missing.join(', ')}\n` +
      `.env 파일에 넣거나 환경변수로 설정하세요.${hint ? `\n${hint}` : ''}`
    );
  }
}
