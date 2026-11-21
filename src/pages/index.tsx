/**
 * Landing page — a STATIC page (no DeepSpace providers, prerendered at
 * build). Keep it renderable without a browser: no window/document during
 * render, animations in CSS only. `<Seo>` comes first and reads src/seo.ts.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../seo'

const FEATURES = [
  {
    title: 'An encyclopedia per world',
    body: 'Characters, places, factions, histories and legends, each with its own article, cover and summary.',
  },
  {
    title: 'Everything connected',
    body: 'Link an heir to her house and a war to its battlefield. Every article shows who points to it and where it leads.',
  },
  {
    title: 'Written together, live',
    body: 'Invite editors and readers. Edits appear as they are typed, and every saved version is kept.',
  },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="mythos-atmosphere min-h-screen bg-background text-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full border border-primary/40 font-display text-xl text-primary">M</span>
            <span className="font-display text-2xl font-semibold">{APP_NAME}</span>
          </span>
          <Link to="/universes" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </header>

        <main>
          <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center sm:pt-28">
            <p className="mythos-eyebrow">A collaborative worldbuilding archive</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.05] sm:text-7xl">
              Chronicle the worlds
              <br />
              <span className="italic text-primary">you imagine.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {APP_NAME} is a private encyclopedia for your fictional universes: write its lore, link its people and places, and
              build it with the collaborators you choose.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                to="/universes"
                className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open the archive
              </Link>
            </div>
          </section>

          <div className="mythos-rule mx-auto max-w-md px-6" aria-hidden>
            ✦
          </div>

          <section aria-label="Features" className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6">
                <h2 className="text-2xl font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </section>
        </main>

        <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
          {APP_NAME} · Universes are private to their members.
        </footer>
      </div>
    </>
  )
}
