# Mythos: Product Specification

Status: **Draft for approval** (2026-11-20)

## 1. Vision

Mythos is a collaborative knowledge base for fictional universes. It takes ideas from three products:
- **World Anvil:** structured, typed worldbuilding articles.
- **Fandom wikis:** an interconnected encyclopedia you can browse.
- **Notion:** fast, live, multi-person editing.

Writers, game masters and creative teams build a shared canon together. They can see, link, and research it, with AI help that only knows their universe.

## 2. Users and roles

| Persona | Goal |
|---|---|
| Solo worldbuilder | Organize a large private canon. Find anything fast |
| Writing team / TTRPG group | Co-author one universe. Control who can edit |
| Reader / player | Browse the universe encyclopedia without being able to change it |

Roles inside a universe:

| Role | Capabilities |
|---|---|
| **Owner** | Everything: settings, members and roles, delete the universe |
| **Editor** | Create, edit and delete articles, links, categories and references. Use AI and image tools |
| **Viewer** | Read and browse everything in the universe. Use research and the Lore Assistant read-only |
| *Non-member* | Private universe: nothing, it is invisible to them. Public universe (ADR-024): finds it on Explore, reads its published articles, and can join as a viewer |

App-level `admin` is the app owner, for support and moderation only.

## 3. Core concepts

- **Universe:** a top-level world with a name, tagline, description, cover, art style, and members.
- **Article:** one encyclopedia entry. It has:
  - a **type**: Character, Location, Faction, Event, Species, Item, Lore, Culture or Other;
  - a title, a summary, and a rich-text body (co-edited live);
  - a cover image;
  - an **infobox** of type-specific facts (e.g. Character: born, died, affiliation);
  - one **category**, plus **tags**;
  - a status (draft or published-within-universe).
- **Category:** a user-defined, nestable folder within a universe (e.g. "Kingdoms › The North"). It organizes articles independently of type.
- **Tag:** a free-form label on an article (e.g. `#prophecy`, `#second-age`). Used for cross-cutting filters.
- **Relationship (link):** a typed, directed connection between two articles in the same universe (e.g. *Aria* —member_of→ *Silver Order*). It is shown on both ends; the inverse label is computed.
- **Reference:** a saved research source (e.g. a Wikipedia page) attached to an article.

## 4. Functional requirements

### 4.1 Accounts
- F1: Sign in and out with GitHub or Google (DeepSpace auth). No passwords stored by Mythos.
- F2: The display name and avatar come from the DeepSpace profile.

### 4.2 Universes
- F3: Create a universe; the creator becomes its owner.
- F4: "My universes" lists every universe where I am an active member, with my role.
- F5: The owner edits the name, tagline, description, cover and art style.
- F6: The owner deletes the universe. Confirmation is required. It cascades to all universe content.

### 4.3 Membership
- F7: The owner invites a user by email as editor or viewer. The invitee must have signed in to Mythos once; a clear message explains this when they haven't.
- F8: The owner changes a member's role or removes them. Members can leave. The owner cannot be removed.
- F9: Role changes take effect immediately for connected clients.

### 4.4 Articles
- F10: Editors create an article with a type and title. The slug is unique within the universe.
- F11: Editors edit the summary, infobox, category, tags, status and cover.
- F12: The body is a rich-text document (headings, lists, quotes, bold/italic, links). It is co-edited live, with collaborator carets.
- F13: Editors delete an article. Its links and references are removed with it.
- F14: Viewers see the same pages read-only, with no edit controls.
- F15: Presence: avatars show who else is viewing or editing an article.

### 4.5 Organization
- F16: Editors create, rename, nest (one level deep in MVP) and delete categories. Deleting a category un-categorizes its articles; it never deletes them.
- F17: Tags can be added and removed freely. The universe tag list is derived from article tags.
- F18: The universe home can filter by type, category and tag.

### 4.6 Relationships
- F19: Editors link the current article to another article in the same universe, with a relationship type and an optional note.
- F20: The article page shows **Relationships** (outgoing) and **Referenced by** (incoming), grouped by relationship type, using inverse labels.
- F21: Duplicate links (same from, to and type) and self-links are rejected.

### 4.7 Browsing (encyclopedia)
- F22: The universe home shows the cover and description, a category tree, an A–Z index grouped by type, recently updated articles, and the tag cloud.
- F23: Search over titles, summaries and tags with ranked, highlighted results.
- F24: Every article mention in relationships is a navigable link. Breadcrumbs follow universe › category › article.

### 4.8 Integrations
- F25: **Research** (Wikipedia): search from the article sidebar, read summaries, and save one as a reference with attribution.
- F26: **Cover art** (Gemini): generate an image from the article and the universe's art style, then set it as the cover.
- F27: **Lore Assistant** (Claude): chat that answers questions about the universe from its articles only, and cites the articles it used.
- F28: **Expand article** and **Suggest relationships** (Claude). Suggestions are applied only after the user confirms.
- F29: Daily per-user limits on AI, images and research, with clear messages when a limit is reached.

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | Authorization is enforced server-side (DeepSpace DO RBAC and server actions). Cross-universe isolation. No secrets in the client |
| Real-time | Edits and list changes appear for other users within about 1 second under normal conditions |
| Validation | Every privileged input is validated with Zod in server actions. Schema enums and required fields are enforced in the DO |
| UX states | Every view has loading, empty and error states. No dead controls. Errors retry in place |
| Accessibility | Keyboard-navigable, labelled controls, sufficient contrast, and respect for reduced motion |
| Scale (MVP) | Up to about 50 universes per user, about 1,000 articles per universe, and about 10 concurrent editors per article |
| Cost | Integration spend is capped per user per day and is visible in `deepspace app usage` |

## 6. Out of scope for MVP

- ~~Public or published universes.~~ Added after MVP: public universes for signed-in users (ADR-024). Signed-out access is still out of scope.
- Payments.
- Mobile app.
- Maps.
- Timelines.
- Version history.
- Import/export.
- Private messaging.
- Ownership transfer.
- Inline `[[mentions]]` in the body (stretch).

## 7. Success criteria for submission

On the live `*.app.space` deployment, two real accounts can:
1. create a universe;
2. invite each other;
3. co-edit an article live;
4. link, categorize and tag articles;
5. browse the encyclopedia;
6. use all three integrations.

A viewer cannot edit, and an outsider sees nothing. Automated multi-user tests cover all of this.
