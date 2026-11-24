import type { ActionResult, ActionTools } from 'deepspace/worker'
import { describe, expect, it } from 'vitest'
import { inviteEmailNotice } from '../../domain/invitations'
import {
  APP_URL,
  buildInvitationEmail,
  INVITE_EMAILS_PER_DAY,
  isDeliverableAddress,
  sendInvitationEmail,
} from './invite-email'
import { consumeDailyQuota } from './usage'

interface Row {
  recordId: string
  data: Record<string, unknown>
}

/**
 * An in-memory stand-in for the system tools: enough of `usage` for the
 * daily cap, and an `integration` that records what it was asked to send.
 */
function fakeSystem(integration: (endpoint: string, data: unknown) => Promise<ActionResult<unknown>>) {
  const rows: Row[] = []
  const sent: { endpoint: string; data: unknown }[] = []
  const matches = (row: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => row.data[k] === v)
  const tools = {
    query: async (_c: string, options?: { where?: Record<string, unknown> }) => ({
      success: true,
      data: { records: rows.filter((r) => matches(r, options?.where)), count: 0 },
    }),
    create: async (_c: string, data: Record<string, unknown>) => {
      const row = { recordId: `r${rows.length + 1}`, data: { ...data } }
      rows.push(row)
      return { success: true, data: { recordId: row.recordId } }
    },
    update: async (_c: string, recordId: string, data: Record<string, unknown>) => {
      const row = rows.find((r) => r.recordId === recordId)
      if (!row) return { success: false, error: 'not found' }
      Object.assign(row.data, data)
      return { success: true, data: { recordId } }
    },
    integration: async (endpoint: string, data: unknown) => {
      sent.push({ endpoint, data })
      return integration(endpoint, data)
    },
  } as unknown as ActionTools
  return { tools, rows, sent }
}

const ok = async () => ({ success: true as const, data: { id: 'msg_1' } })
const input = {
  to: 'friend@gmail.com',
  inviterId: 'user_alice',
  inviterName: 'Alice',
  universeName: 'The Shattered Isles',
  role: 'editor' as const,
}
const NOW = new Date('2026-11-23T12:00:00Z')

describe('isDeliverableAddress', () => {
  it('accepts ordinary addresses', () => {
    expect(isDeliverableAddress('friend@gmail.com')).toBe(true)
    expect(isDeliverableAddress('a.b@mail.company.co.uk')).toBe(true)
  })

  it('skips DeepSpace test accounts and reserved example domains', () => {
    expect(isDeliverableAddress('bob@deepspace.test')).toBe(false)
    expect(isDeliverableAddress('nobody-1@example.com')).toBe(false)
    expect(isDeliverableAddress('x@mail.example.org')).toBe(false)
    expect(isDeliverableAddress('x@host.invalid')).toBe(false)
    expect(isDeliverableAddress('x@box.localhost')).toBe(false)
  })

  it('does not mistake look-alike domains for reserved ones', () => {
    expect(isDeliverableAddress('x@notexample.com')).toBe(true)
    expect(isDeliverableAddress('x@testing.io')).toBe(true)
  })
})

describe('buildInvitationEmail', () => {
  it('names the inviter, universe and role, and links to the app', () => {
    const email = buildInvitationEmail(input)
    expect(email.subject).toBe('Alice invited you to The Shattered Isles on Mythos')
    expect(email.text).toContain('as an editor')
    expect(email.text).toContain(APP_URL)
    expect(email.html).toContain(`href="${APP_URL}"`)
    expect(buildInvitationEmail({ ...input, role: 'viewer' }).text).toContain('as a viewer')
  })

  it('escapes user-supplied names in the HTML', () => {
    const email = buildInvitationEmail({
      ...input,
      inviterName: '<img src=x onerror=alert(1)>',
      universeName: 'Tom & "Jerry\'s" <World>',
    })
    expect(email.html).not.toContain('<img src=x')
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(email.html).toContain('Tom &amp; &quot;Jerry&#39;s&quot; &lt;World&gt;')
  })

  it('keeps names on one line, bounded, with fallbacks for blanks', () => {
    const email = buildInvitationEmail({ ...input, inviterName: 'Eve\r\nBcc: x@evil.com', universeName: 'U'.repeat(500) })
    expect(email.subject).not.toMatch(/[\r\n]/)
    expect(email.subject).toContain('Eve Bcc: x@evil.com')
    expect(email.subject.length).toBeLessThan(250)
    expect(buildInvitationEmail({ ...input, inviterName: '  ', universeName: '' }).subject).toBe(
      'Someone invited you to a universe on Mythos',
    )
  })
})

describe('sendInvitationEmail', () => {
  it('sends through email/send and counts against the cap', async () => {
    const { tools, rows, sent } = fakeSystem(ok)
    expect(await sendInvitationEmail(tools, input, NOW)).toBe('sent')
    expect(sent).toHaveLength(1)
    expect(sent[0].endpoint).toBe('email/send')
    expect(sent[0].data).toMatchObject({ to: 'friend@gmail.com', subject: expect.any(String), text: expect.any(String) })
    expect(rows[0].data).toMatchObject({ userId: 'user_alice', day: '2026-11-23', kind: 'invite_email', count: 1 })
  })

  it('does not call the service or spend quota for undeliverable addresses', async () => {
    const { tools, rows, sent } = fakeSystem(ok)
    expect(await sendInvitationEmail(tools, { ...input, to: 'bob@deepspace.test' }, NOW)).toBe('skipped')
    expect(sent).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })

  it('stops at the daily cap, per inviter, and resets the next day', async () => {
    const { tools, sent } = fakeSystem(ok)
    for (let i = 0; i < INVITE_EMAILS_PER_DAY; i++) expect(await sendInvitationEmail(tools, input, NOW)).toBe('sent')
    expect(await sendInvitationEmail(tools, input, NOW)).toBe('limit')
    expect(sent).toHaveLength(INVITE_EMAILS_PER_DAY)
    expect(await sendInvitationEmail(tools, { ...input, inviterId: 'user_bob' }, NOW)).toBe('sent')
    expect(await sendInvitationEmail(tools, input, new Date('2026-11-24T00:00:01Z'))).toBe('sent')
  })

  it('reports a refused or unreachable service as failed instead of throwing', async () => {
    const refused = fakeSystem(async () => ({ success: false as const, error: 'Insufficient credits', code: 'payment_required' }))
    expect(await sendInvitationEmail(refused.tools, input, NOW)).toBe('failed')
    const down = fakeSystem(async () => {
      throw new Error('network down')
    })
    expect(await sendInvitationEmail(down.tools, input, NOW)).toBe('failed')
  })
})

describe('consumeDailyQuota', () => {
  it('keeps separate counts per kind', async () => {
    const { tools } = fakeSystem(ok)
    expect(await consumeDailyQuota(tools, 'u', 'upload', 1, NOW)).toBe(true)
    expect(await consumeDailyQuota(tools, 'u', 'upload', 1, NOW)).toBe(false)
    expect(await consumeDailyQuota(tools, 'u', 'invite_email', 1, NOW)).toBe(true)
  })
})

describe('inviteEmailNotice', () => {
  it('warns the owner when no email went out', () => {
    expect(inviteEmailNotice('sent').ok).toBe(true)
    expect(inviteEmailNotice('skipped').ok).toBe(true)
    expect(inviteEmailNotice('limit')).toMatchObject({ ok: false, text: expect.stringContaining(`${INVITE_EMAILS_PER_DAY}`) })
    expect(inviteEmailNotice('failed').ok).toBe(false)
  })
})
