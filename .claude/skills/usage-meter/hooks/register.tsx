import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Reading } from '../types'

const PANE = 'usage-meter'
const TITLE = '클로드 사용량'
const reading = atom(
  { plugin: 'usage-meter', key: 'reading' } as const,
  { limits: [], at: 0 },
  { shape: 'reading-1' },
)

const NAMES: Record<string, string> = {
  five_hour: '현재 세션 (5시간)',
  seven_day: '주간 한도 (7일)',
}

const bar = (p: number) => {
  const n = Math.max(0, Math.min(10, Math.round(p / 10)))
  return '█'.repeat(n) + '░'.repeat(10 - n)
}

const color = (p: number) => (p >= 90 ? 'red' : p >= 70 ? 'yellow' : 'green')

// "11/3(화) 14:00 초기화" 처럼 한국 시간으로
const resetText = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  if (Number.isNaN(d.getTime())) return ''
  const day = '일월화수목금토'[d.getUTCDay()]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${day}) ${hh}:${mm} 초기화`
}

// 2026-11-02 사용자: 모든 대화에 띄우지 말고 요청할 때만 — 시작할 때 열지 않고, /usage-pane 을 쳤을 때만 패널·상태 줄을 보인다
let shown = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({ name: 'usage-pane', description: '클로드 사용량 패널 열기' })
    const u = await $.session.usage()
    const now = await $.clock.now()
    if (u.rateLimits.length > 0) await update($, reading, (): Reading => ({ limits: u.rateLimits.map((l): Limit => ({ ...l })), at: now }))
    return ran
  })

  on('command.run', { command: 'usage-pane' }, async $ => {
    shown = true
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: '클로드 사용량 패널을 열었어요.' }
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    if (e.rateLimits.length > 0) await update($, reading, (): Reading => ({ limits: e.rateLimits.map((l): Limit => ({ ...l })), at: now }))
    const p = e.rateLimits.find(l => l.kind === 'five_hour')?.percentUsed
    if (shown) $.ui.status(p === undefined ? undefined : `사용량 ${Math.round(p)}%`)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, reading)
    const order = (k: string) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : 2)
    const list = [...r.limits].sort((a, b) => order(a.kind) - order(b.kind))

    return (
      <Box flexDirection="column" gap={1}>
        {list.length === 0 && (
          <Text dimColor>첫 답변이 오면 사용량이 나타나요.</Text>
        )}
        {list.map(l => (
          <Box flexDirection="column">
            <Text bold>{NAMES[l.kind] ?? l.kind}</Text>
            <Text color={color(l.percentUsed)}>
              {bar(l.percentUsed)} {l.percentUsed}%
            </Text>
            {l.resetsAt && <Text dimColor>{resetText(l.resetsAt)}</Text>}
          </Box>
        ))}
        {r.at > 0 && (
          <Text dimColor>마지막 갱신 {resetText(new Date(r.at).toISOString()).replace(' 초기화', '')}</Text>
        )}
      </Box>
    )
  })
}
