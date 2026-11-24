/**
 * Account settings. Reached at /settings — no auth logic lives here because
 * (protected)/_layout.tsx already wraps the subtree in <AuthGate>.
 * Preferences are saved to the account (ADR-026), so they follow the user
 * to every device.
 */

import { useState } from 'react'
import { signOut, useUser } from 'deepspace'
import { Button, Switch, useToast } from '@/components/ui'
import { useAccountSettings } from '@/features/account/hooks'
import { callAction } from '@/lib/actions'

export default function SettingsPage() {
  const { user } = useUser()

  return (
    // No background on page wrappers — pages render into whatever the app's
    // (app)/_layout provides (a plain background, or a raised panel), so they
    // stay transparent and inherit it.
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-20">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">Settings</h1>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Your account</h2>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{user?.email ?? '—'}</dd>
            </div>
          </dl>

          <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>

        <AssistantSetting />
      </div>
    </div>
  )
}

function AssistantSetting() {
  const { assistantEnabled, status } = useAccountSettings()
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  async function change(next: boolean) {
    setSaving(true)
    const res = await callAction('setAccountSettings', { assistantEnabled: next })
    setSaving(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(next ? 'AI assistant turned on' : 'AI assistant turned off')
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6" aria-labelledby="assistant-setting-heading">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 id="assistant-setting-heading" className="text-lg font-semibold">
            AI assistant
          </h2>
          <p id="assistant-setting-help" className="mt-1 text-sm text-muted-foreground">
            The chat panel beside every page, powered by GPT and Claude models. When off, the panel is hidden and no chat
            requests are sent for your account. Saved to your account, so it applies on every device.
          </p>
          {status === 'error' && <p className="mt-2 text-sm text-destructive">Your setting could not be loaded. Refresh to try again.</p>}
        </div>
        <Switch
          checked={assistantEnabled}
          disabled={status !== 'ready' || saving}
          onCheckedChange={(v) => void change(v)}
          aria-labelledby="assistant-setting-heading"
          aria-describedby="assistant-setting-help"
          data-testid="assistant-toggle"
        />
      </div>
    </section>
  )
}
