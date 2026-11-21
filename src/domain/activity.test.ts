import { describe, expect, it } from 'vitest'
import { describeActivity, maskEmail, shouldCoalesce, UPDATE_COALESCE_MS } from './activity'
import { ACTIVITY_KINDS } from './mythos'
import {
  invitationIdSchema,
  inviteMemberSchema,
  noParamsSchema,
  respondToInvitationSchema,
} from '../server/mythos/validation'

const id = (c: string) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`

describe('folding repeated updates', () => {
  const now = new Date('2026-11-20T12:00:00.000Z')
  it('folds saves inside the window and not outside it', () => {
    expect(shouldCoalesce('2026-11-20T11:59:00.000Z', now)).toBe(true)
    expect(shouldCoalesce(new Date(now.getTime() - UPDATE_COALESCE_MS + 1).toISOString(), now)).toBe(true)
    expect(shouldCoalesce(new Date(now.getTime() - UPDATE_COALESCE_MS).toISOString(), now)).toBe(false)
    expect(shouldCoalesce('2026-11-19T12:00:00.000Z', now)).toBe(false)
  })
  it('never folds into a future or unreadable timestamp', () => {
    expect(shouldCoalesce('2026-11-20T12:05:00.000Z', now)).toBe(false)
    expect(shouldCoalesce('not a date', now)).toBe(false)
  })
})

describe('maskEmail', () => {
  it('keeps the first letter and the domain only', () => {
    expect(maskEmail('friend@example.com')).toBe('f•••@example.com')
    expect(maskEmail('a@b.co')).toBe('a•••@b.co')
    expect(maskEmail('nonsense')).toBe('•••')
    expect(maskEmail('@example.com')).toBe('•••')
  })
})

describe('describeActivity', () => {
  it('reads every kind', () => {
    const read = (kind: (typeof ACTIVITY_KINDS)[number]) => {
      const t = describeActivity({ kind, subjectTitle: 'Aria', detail: 'editor' })
      return [t.verb, t.subject, t.suffix, t.isArticle].join('|')
    }
    expect(ACTIVITY_KINDS.map(read)).toEqual([
      'created|Aria||true',
      'updated|Aria||true',
      'published|Aria||true',
      'invited|Aria|as editor|false',
      'joined||as editor|false',
    ])
  })
})

describe('invitation input', () => {
  it('normalises the email and refuses the owner role', () => {
    const base = { universeId: id('a'), role: 'editor' }
    expect(inviteMemberSchema.parse({ ...base, email: '  Friend@Example.COM ' }).email).toBe('friend@example.com')
    expect(inviteMemberSchema.safeParse({ ...base, role: 'owner', email: 'a@b.co' }).success).toBe(false)
    expect(inviteMemberSchema.safeParse({ ...base, email: `${'a'.repeat(320)}@b.co` }).success).toBe(false)
  })
  it('requires a real answer and a record id', () => {
    expect(respondToInvitationSchema.safeParse({ invitationId: id('b'), accept: true }).success).toBe(true)
    expect(respondToInvitationSchema.safeParse({ invitationId: id('b'), accept: 'yes' }).success).toBe(false)
    expect(respondToInvitationSchema.safeParse({ invitationId: '', accept: false }).success).toBe(false)
    expect(invitationIdSchema.safeParse({ invitationId: 'x'.repeat(101) }).success).toBe(false)
  })
  it('takes no parameters where none are expected', () => {
    expect(noParamsSchema.safeParse({}).success).toBe(true)
    expect(noParamsSchema.safeParse({ email: 'someone@else.com' }).success).toBe(false)
  })
})
