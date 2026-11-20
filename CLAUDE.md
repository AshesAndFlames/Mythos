# CLAUDE.md: Mythos Engineering Guidelines

## Project
Mythos is a collaborative worldbuilding and fictional encyclopedia application, built natively on the DeepSpace SDK (Cloudflare Workers, React, Vite).

DeepSpace SDK rules for agents are in [AGENTS.md](./AGENTS.md). The architecture and decisions live in `/docs`. Read `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md` and `docs/ARCHITECTURAL_DECISIONS.md` before changing behavior.

## Development philosophy
Build incrementally. Prefer working features over ambitious but incomplete implementations.

## Rules
- Always inspect existing code before modifying it.
- Never overwrite working functionality without a clear reason.
- Follow the architecture documented in `/docs`.
- Use strict TypeScript.
- Avoid unnecessary dependencies. Do not add Supabase, Next.js, ORMs, auth libraries, realtime services or provider SDKs; DeepSpace provides these.
- Use reusable components (UI primitives come from `src/components/ui`).
- Keep business logic out of presentation components (`src/server/mythos/` and feature hooks).
- Validate all user input with Zod in server actions.
- Enforce authorization on the server: DeepSpace collection RBAC in the Durable Object, plus role checks in server actions. Client-side gating is UX only.
- Never weaken collection permissions (`create: false`, `writableFields`, `read: 'team'`) to make a feature or test pass.
- Never expose privileged credentials. Secrets go only in `npx deepspace secrets`, never in code, `.dev.vars` edits, logs or commits.
- Call paid integrations only from server actions, behind membership checks and per-user caps.
- Add tests for important business logic.
- Handle loading, error and empty states.
- Never leave nonfunctional UI controls.
- Do not silently swallow errors.
- Schemas live in `src/schemas/` and ship on deploy. Document breaking schema changes (renames, removals, tightened enums) as an ADR with a backfill plan.

## Source control
- This app uses **GitHub source**. Never run `npx deepspace push`.
- The first deploy must run from a checkout whose remote is the GitHub repository.

## Workflow
Before implementing a feature:
- Inspect the relevant files.
- Explain the intended changes.
- Identify dependencies.
- Identify security implications.

After implementing a feature:
- Run the relevant tests (`npx deepspace test run`, or `test run all` before deploy).
- Run TypeScript checks.
- Run linting.
- Report changed files.
- Report known limitations.

## Scope management
The initial release must prioritize:
- Authentication.
- Universe creation.
- Article management.
- Article relationships.
- Basic collaboration.
- Role-based access.

Do not implement advanced features unless explicitly requested. Avoid premature abstractions and overengineering.

## Definition of done
A feature is complete only when:
- Its UI exists.
- Its backend functionality works.
- Its permissions are enforced.
- Its input is validated.
- Its error states are handled.
- Its important behavior is tested.
