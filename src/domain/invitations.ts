/**
 * What happened to an invitation email (ADR-023). The invitation itself is
 * saved in every case.
 * - `sent`: accepted by the email service.
 * - `skipped`: not attempted, because the address cannot receive mail (a
 *   DeepSpace test account or a reserved example domain).
 * - `limit`: not attempted, because the inviter reached today's cap.
 * - `failed`: the email service refused or could not be reached.
 */
export const INVITE_EMAIL_STATUSES = ['sent', 'skipped', 'limit', 'failed'] as const
export type InviteEmailStatus = (typeof INVITE_EMAIL_STATUSES)[number]

/** Invitation emails one user may trigger per UTC day. */
export const INVITE_EMAILS_PER_DAY = 20

/** The line shown to the owner after inviting; `ok: false` shows as a warning. */
export function inviteEmailNotice(status: InviteEmailStatus | undefined): { ok: boolean; text: string } {
  switch (status) {
    case 'sent':
      return { ok: true, text: 'We emailed them the invitation.' }
    case 'limit':
      return {
        ok: false,
        text: `No email was sent: you can send ${INVITE_EMAILS_PER_DAY} invitation emails a day. Let them know yourself; the invitation is on their dashboard when they sign in.`,
      }
    case 'failed':
      return {
        ok: false,
        text: "The invitation email couldn't be sent. Let them know yourself; the invitation is on their dashboard when they sign in.",
      }
    default:
      return { ok: true, text: 'The invitation is on their dashboard when they sign in.' }
  }
}
