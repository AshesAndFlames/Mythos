/**
 * Shown in place of any app page to signed-out visitors: the sign-in and
 * registration screen. Both paths open the DeepSpace auth overlay — an
 * account is created on a visitor's first sign-in with GitHub or Google, so
 * "Create an account" and "Sign in" differ only in their wording.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay } from 'deepspace'
import { BookOpenText, Network, Users } from 'lucide-react'
import { Button } from '@/components/ui'

type Mode = 'sign-in' | 'register'

const COPY: Record<Mode, { title: string; description: string }> = {
  'sign-in': { title: 'Welcome back to Mythos', description: 'Sign in to return to your universes.' },
  register: { title: 'Create your Mythos account', description: 'Choose a provider. Your account is created on first sign-in.' },
}

function Logo() {
  return (
    <span className="flex size-10 items-center justify-center rounded-full border border-primary/40 font-display text-2xl text-primary">M</span>
  )
}

export function SignedOutPanel() {
  const [mode, setMode] = useState<Mode | null>(null)

  return (
    <div className="mythos-atmosphere grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-border p-12 lg:flex">
        <Link to="/" className="flex items-center gap-3 text-foreground">
          <Logo />
          <span className="font-display text-2xl font-semibold">Mythos</span>
        </Link>
        <blockquote className="max-w-md">
          <p className="font-display text-4xl leading-tight text-foreground">
            “Every world worth visiting was first written down by someone.”
          </p>
          <div className="mythos-rule mt-8 max-w-48" aria-hidden>
            ✦
          </div>
        </blockquote>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-3">
            <BookOpenText className="size-4 text-primary" aria-hidden /> An encyclopedia for every world you build
          </li>
          <li className="flex items-center gap-3">
            <Network className="size-4 text-primary" aria-hidden /> Characters, places and legends, linked together
          </li>
          <li className="flex items-center gap-3">
            <Users className="size-4 text-primary" aria-hidden /> Written together, live, with the people you invite
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex justify-center lg:hidden">
            <Logo />
          </div>
          <p className="mythos-eyebrow">Private archive</p>
          <h1 className="mt-2 text-4xl font-semibold text-foreground">Sign in to continue</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Mythos universes are private to their members. Sign in to open yours, or create an account to found your first.
          </p>
          <div className="mt-8 space-y-3">
            <Button className="w-full" size="lg" onClick={() => setMode('sign-in')}>
              Sign in
            </Button>
            <Button className="w-full" size="lg" variant="outline" onClick={() => setMode('register')}>
              Create an account
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Mythos uses GitHub or Google to sign you in. We never see your password.
          </p>
          <Link to="/" className="mt-6 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Back to home
          </Link>
        </div>
      </div>

      {mode && (
        <AuthOverlay onClose={() => setMode(null)} title={COPY[mode].title} description={COPY[mode].description} logo={<Logo />} />
      )}
    </div>
  )
}
