/**
 * The "you were invited to a universe" email (ADR-023).
 *
 * Sent from `inviteMember` through the `email/send` integration, a paid call
 * billed to the app owner, so it is only reached after the owner check and
 * is capped per inviting user per UTC day. The email is a notification only:
 * it carries no token. The invitee still signs in with the invited address
 * and accepts on their dashboard, so a forwarded or leaked email grants
 * nothing.
 */

import { isTestAccountEmail, type ActionTools } from 'deepspace/worker'
import { INVITE_EMAILS_PER_DAY, type InviteEmailStatus } from '../../domain/invitations'
import type { AssignableRole } from '../../domain/mythos'
import { consumeDailyQuota } from './usage'

export { INVITE_EMAILS_PER_DAY, type InviteEmailStatus }

/**
 * Where the email sends people. Fixed rather than taken from the request, so
 * a caller cannot make Mythos email a link to another site.
 */
export const APP_URL = 'https://mythos.app.space'

/** Domains reserved for documentation and testing (RFC 2606 / RFC 6761). */
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org']
const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost']

/** Whether an email should be sent to this address at all. */
export function isDeliverableAddress(email: string): boolean {
  if (isTestAccountEmail(email)) return false
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  if (!domain) return false
  if (RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false
  const tld = domain.slice(domain.lastIndexOf('.') + 1)
  return !RESERVED_TLDS.includes(tld)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Collapses whitespace (no header or line injection) and bounds length. */
function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export interface InvitationEmailInput {
  universeName: string
  inviterName: string
  role: AssignableRole
  appUrl?: string
}

export interface InvitationEmail {
  subject: string
  text: string
  html: string
}

/** Builds the email. Names are user-supplied, so they are flattened and HTML-escaped. */
export function buildInvitationEmail(input: InvitationEmailInput): InvitationEmail {
  const universe = oneLine(input.universeName, 120) || 'a universe'
  const inviter = oneLine(input.inviterName, 80) || 'Someone'
  const url = input.appUrl ?? APP_URL
  const roleText = input.role === 'editor' ? 'an editor' : 'a viewer'
  const roleHelp =
    input.role === 'editor' ? 'Editors can write and organise articles.' : 'Viewers can read every article.'

  const subject = `${inviter} invited you to ${universe} on Mythos`
  const text = [
    `${inviter} invited you to join "${universe}" on Mythos as ${roleText}. ${roleHelp}`,
    '',
    `To accept, sign in at ${url} with this email address. The invitation is waiting on your dashboard.`,
    '',
    "If you weren't expecting this, you can ignore this email; nothing happens unless you accept.",
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f5f2;font-family:Georgia,'Times New Roman',serif;color:#1f1d1a">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e0d8;border-radius:12px;padding:28px">
<p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7a7368">Mythos</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:normal">You're invited to ${escapeHtml(universe)}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escapeHtml(inviter)} invited you to join as ${roleText}. ${roleHelp}</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">Sign in with this email address and accept the invitation on your dashboard.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1f1d1a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px">Open Mythos</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#7a7368">If you weren't expecting this, you can ignore this email; nothing happens unless you accept.</p>
</div></body></html>`

  return { subject, text, html }
}

export interface SendInvitationEmailInput extends InvitationEmailInput {
  to: string
  inviterId: string
}

/**
 * Sends the invitation email, within the inviter's daily cap. Never throws
 * for a delivery problem: the invitation is already saved, so the caller
 * reports the status instead. Failures are logged with context.
 */
export async function sendInvitationEmail(
  system: ActionTools,
  input: SendInvitationEmailInput,
  now = new Date(),
): Promise<InviteEmailStatus> {
  if (!isDeliverableAddress(input.to)) return 'skipped'
  if (!(await consumeDailyQuota(system, input.inviterId, 'invite_email', INVITE_EMAILS_PER_DAY, now))) return 'limit'

  const email = buildInvitationEmail(input)
  try {
    const res = await system.integration('email/send', { to: input.to, ...email })
    if (res.success) return 'sent'
    console.error(
      `[inviteMember] inviter=${input.inviterId} invitation email failed: ${res.code ?? 'error'} ${res.error ?? ''}`.trim(),
    )
  } catch (err) {
    console.error(
      `[inviteMember] inviter=${input.inviterId} invitation email failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  return 'failed'
}
