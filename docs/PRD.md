# Workbench PRD

12 Oct 2026 · Mohamad Razeen Iqbal bin Roslan

## Overview

Workbench is a personal project tracker where detailed Kanban cards drive the progress of plan items on a Gantt timeline, across several projects. It replaces the prototype built as a Claude artifact on 12 Oct 2026 and is rebuilt as a proper app with Claude Code.

**Problem.** Team Gantt tools (like the one used for DIC Abandonment) show deliverables and a percentage, but the percentage is typed by hand and drifts from reality. Day to day work lives somewhere else, so the plan and the work never meet.

## Goals

- One place to see every project Razeen is on, its plan and its detailed work.
- Plan item progress calculated from the cards linked to it, not typed in.
- Fast assignment of cards to the people on each project.
- A distinctive interface that feels like an engineer's planning sheet, not a generic SaaS template.

## Non goals for v1

- Multi user accounts, permissions or roles. The app has one user: Razeen.
- Notifications, email or chat integrations.
- Resource levelling, critical path or dependency scheduling.
- Time tracking or timesheets.

## User and core concepts

The only user is Razeen, a data and AI engineer who sits on several projects at once and needs to hand out work and report progress upward. Everything else in the app is one of five objects.

| Concept | What it is | Lives on | Example |
|---|---|---|---|
| Project | A body of work with its own plan, board and team | Sidebar | DIC Abandonment (code DIC) |
| Plan item | A deliverable or milestone with start and end dates, grouped by section | Timeline | Decom Cost Estimation: Data & System Mapping |
| Card | A detailed task with assignee, due date and effort, linked to one plan item | Board | Map cost tables to source schema |
| Person | Someone who can be assigned work, attached to one or more projects | Team | Saufi Nila Utama |
| Section | A grouping label for plan items inside a project | Timeline | PSC Management |

The link that matters: a card moves across the board, and its plan item's progress on the timeline updates on its own.

## Functional requirements

The app has four views (Board, Timeline, Team, Notes) scoped by the selected project, or by All projects. Must = v1, Should = v1 if time allows, Could = later.

### Projects and navigation

| ID | Requirement | Priority |
|---|---|---|
| P1 | Sidebar lists projects with a short code (2 to 3 letters) and overall % complete | Must |
| P2 | Create, rename and change the code of a project | Must |
| P3 | Delete a project only when it has no plan items or cards | Must |
| P4 | All projects option combines every board, timeline and team | Must |
| P5 | Sidebar collapses to an icon rail; the choice is remembered | Must |
| P6 | Last selected view and project are remembered on reload | Should |
| P7 | Archive a finished project without deleting it | Could |

### Board (cards)

| ID | Requirement | Priority |
|---|---|---|
| B1 | Five columns: Backlog, To do, In progress, Review, Done | Must |
| B2 | Drag a card between columns on desktop; change status from the editor on touch | Must |
| B3 | Card shows linked plan item, title, due date, effort points and assignee monogram | Must |
| B4 | Overdue cards are marked when due date is past and status is not Done | Must |
| B5 | Column header shows count, total points and how much the column counts toward progress | Must |
| B6 | Clicking a card's plan item reference filters the board to that item with a progress strip on top | Must |
| B7 | When a move changes a plan item's progress, show the before and after percentage | Should |
| B8 | Reorder cards inside a column by drag | Could |
| B9 | Checklist inside a card | Could |

### Timeline (plan items)

| ID | Requirement | Priority |
|---|---|---|
| T1 | Rows grouped by project (All projects only) then section, each with a summary bar | Must |
| T2 | Drag a bar to move it, drag either end to change dates | Must |
| T3 | Milestones as diamonds on a single date, draggable | Must |
| T4 | Progress fill from linked cards; a manual knob only when the item has no cards or is set to manual | Must |
| T5 | Zoom levels: Week, Month, Quarter; Today button scrolls to today | Must |
| T6 | Today line, weekend shading, behind schedule items flagged | Must |
| T7 | Each row shows owner monogram and a card counter (done of total) that opens the filtered board | Must |
| T8 | Small markers under a bar for each linked card's due date | Should |
| T9 | Collapse and expand sections | Must |
| T10 | Dependencies between plan items | Could |

### Team

| ID | Requirement | Priority |
|---|---|---|
| M1 | Table of people in the current project: open cards, open points, late cards, plan items owned, workload bar | Must |
| M2 | Add a new person to the current project by name | Must |
| M3 | Add an existing person from another project | Must |
| M4 | Rename a person inline | Must |
| M5 | Remove a person from a project; their assignments in that project become unassigned | Must |
| M6 | No roles or member types | Must |
| M7 | Razeen is marked as Me; a My work toggle filters every view to his cards and items | Must |

### Notes (pending items)

| ID | Requirement | Priority |
|---|---|---|
| N1 | Capture a pending item as one line of text, optionally filed under a project | Must |
| N2 | A project shows its own notes plus unfiled ones; All projects shows every note, newest first | Must |
| N3 | Edit a note's text inline, change or clear its project, delete it (second click confirms) | Must |
| N4 | Send a note to the board: opens the card editor prefilled with the note text; saving creates the card and removes the note in one transaction (`POST /notes/{id}/promote`) | Must |

### Editors and filters

| ID | Requirement | Priority |
|---|---|---|
| E1 | Card editor: title, linked plan item, project (when unlinked), assignee, status, due date, effort (1, 2, 3, 5, 8), notes | Must |
| E2 | Plan item editor: title, project, section, owner, start, end, milestone flag, progress mode (auto from cards or manual) and manual %, notes, list of linked cards with Add card | Must |
| E3 | Assignee dropdown lists the project's team first, then other people | Must |
| E4 | Deleting a plan item keeps its cards on the board, unlinked | Must |
| E5 | Delete actions ask for a second click to confirm | Must |
| E6 | Filters: search, plan item (multi-select, incl. No plan item), assignee (multi-select, incl. Unassigned), My work, Hide done; several values match any of them | Must |
| E7 | Keyboard: Esc closes editors, Enter opens a focused card, N creates a new card | Should |

## Data model and progress rules

Five stored collections; sections are a text field on plan items, not their own table. Dates are ISO strings (YYYY-MM-DD) in local time; ids are strings.

| Entity | Fields |
|---|---|
| projects | id, name, code, order, archived (later), updatedAt |
| plan_items | id, projectId, section, title, ownerId, start, end, milestone (bool), progressMode (auto or manual), manualProgress (0 to 100), notes, order, updatedAt |
| cards | id, planItemId (nullable), projectId (used when unlinked), title, assigneeId, status, due, points, notes, order, updatedAt |
| people | id, name, projectIds (list), isMe (bool), updatedAt |
| notes | id, projectId (nullable; cleared when the project is deleted), text, order, createdAt, updatedAt |

**Progress of a plan item.** When the item has linked cards and progressMode is auto, progress is the effort weighted credit of its cards:

```
progress = Σ(points_i × credit(status_i)) / Σ points_i
```

| Status | Credit |
|---|---|
| Backlog | 0% |
| To do | 0% |
| In progress | 50% |
| Review | 75% |
| Done | 100% |

Otherwise progress = manualProgress (typed in the editor or set with the knob). Dragging the knob on an item that has cards sets progressMode to manual. (Briefly cards-only on 14 Oct 2026; restored the same day.)

Plan items on the timeline are not all of the work: a card may have no plan item and still counts toward its project.

**Rollups** use the same card credit formula. A section's progress is the credit of the cards linked to its plan items. A project's progress, and the overall Complete figure, is the credit of every card in scope, linked to a plan item or not.

**Lateness.** A card is late when due < today and status is not Done. A plan item is behind when end < today and progress < 100%.

**Deletion rules.** Deleting a plan item unlinks its cards and moves them to the item's project. Removing a person from a project clears their assignments in that project only; deleting a person clears all of them. A project with any plan item or card cannot be deleted.

## Design direction

The rebuild should look like an engineer's planning sheet with real interaction polish, and must not read as a generic AI generated dashboard. The artifact prototype set the starting language; the Claude Code version should push it further.

**Keep from the prototype**

- Paper toned background, hairline rules instead of drop shadows, 2 to 3 px corners.
- A title block feel: monospace uppercase labels for metadata, a strong grotesk for names.
- Hatched fill for remaining work on timeline bars, solid fill for work done.
- Highlighter yellow for today and for "me"; one cobalt accent for selection and progress.
- Square monograms instead of colourful circle avatars.

**Push further in the rebuild**

- Motion with purpose: cards settle into a column, the plan item bar fills in step with the move, the % ticks up like a counter.
- A dense "drawing sheet" mode for the timeline with a ruled grid, week numbers and a sheet border.
- Command palette (Ctrl K) for jumping to a project, plan item or person and for creating cards.
- Inline editing on the board (rename a card, change due date) without opening a modal.
- A real dark theme designed on its own, not an inversion.

**Avoid**

- Gradient logos, glassmorphism, soft drop shadows on every card, purple to blue heroes.
- Emoji as icons, rounded pill buttons everywhere, Inter or Space Grotesk as the default face.
- Coloured rails on the edge of cards.

**Type and colour tokens (starting point)**

| Token | Light | Dark | Use |
|---|---|---|---|
| bg | #edefea | #141715 | Page |
| surface | #ffffff | #1f2421 | Cards, panels |
| ink | #1b211e | #e5e9e2 | Text, primary buttons |
| accent | #2443b8 | #93a6f2 | Selection, progress |
| mark | #f2d33c | #d8b72a | Today, me |
| danger | #c23b22 | #ef7c63 | Late, behind |
| UI font | Schibsted Grotesk | same | Names, body |
| Data font | IBM Plex Mono | same | Labels, dates, numbers |

## Stack, architecture and migration

Build it on the stack Razeen already runs: a React and Vite front end talking to a FastAPI service over PostgreSQL, deployable to the home server.

| Layer | Choice | Why |
|---|---|---|
| Front end | React 18, Vite, TypeScript | Familiar, fast dev loop |
| State and data | TanStack Query for server state, Zustand for UI state | Optimistic updates for drag moves |
| Drag and drop | dnd kit | Works with mouse, touch and keyboard |
| Timeline | Custom SVG component (no Gantt library) | Full control over the drawing sheet look |
| Styling | CSS variables and CSS modules (no component kit) | Avoids the template look |
| API | FastAPI, Pydantic models | Typed, matches the data model above |
| Database | PostgreSQL, own schema (e.g. workbench) | Progress rollups as SQL views |
| Hosting | Docker Compose on the home server, Tailscale for remote access | Private, single user |
| Auth | Single user: one password signs in to edit; a View only button gives read-only access without a password (the API rejects every write from it; `WORKBENCH_VIEW_ONLY=0` turns it off). Sessions end on browser close, after 30 idle minutes (`WORKBENCH_IDLE_MINUTES`), and on every page load (`WORKBENCH_LOGIN_EACH_LOAD`) | No accounts needed in v1 |

The browser never calculates rollups itself; it reads them from the API, which reads one SQL view.

**API outline.** REST resources for projects, plan_items, cards and people with list, create, update and delete. `GET /projects/{id}/summary` returns computed progress per plan item, section and project so the client never recalculates rollups differently from the server.

**Progress computation.** Done in one place: a SQL view (`plan_item_progress`) implementing the formula above, read by both the timeline and the sidebar.

**Migration from the artifact.** The prototype's data (1 project, 59 plan items, 21 people, any cards added since) can be exported as JSON and loaded with a one off seed script. Field renames: project becomes projectId, assignee becomes ownerId on plan items, link becomes planItemId on cards, progress becomes manualProgress.

**Working with Claude Code.** Put this PRD in the repo as docs/PRD.md and a CLAUDE.md with the design tokens and the Avoid list, so every session keeps the same visual rules.

## Delivery plan

Ship in four phases, each usable on its own; DIC Abandonment data goes in at phase 1 so the app is used for real from the start.

1. **Foundation:** repo, Docker Compose, Postgres schema, FastAPI CRUD, seed script with the migrated DIC data, app shell with collapsible sidebar and project switching.
2. **Board:** columns, drag and drop with optimistic updates, card editor, filters, My work, overdue flags.
3. **Timeline:** SVG timeline with zoom, drag to move and resize, milestones, progress from cards, section rollups, card due markers.
4. **Team and polish:** team table and workload, command palette, inline editing, motion, dark theme, keyboard shortcuts.

## Acceptance criteria for v1

- [ ] Moving a card from In progress to Done updates its plan item's % on the timeline within 1 second, without a reload.
- [ ] A plan item with no cards keeps its manual %, and the knob is hidden once a card is linked (auto mode).
- [ ] Creating a second project shows it in the sidebar with its own empty board, timeline and team.
- [ ] Removing a person from one project leaves their assignments in other projects untouched.
- [ ] The board and timeline are usable on a phone width of 400 px.
- [ ] Light and dark themes both pass WCAG AA contrast for text.
- [ ] All 59 DIC plan items and 21 people are present after migration with matching dates and owners.

## Open questions

- Should a plan item allow more than one owner (the BE#2 and Haris Ari pair suggests yes)?
- Are the credit weights (50% In progress, 75% Review) right, or should only Done count?
- Should the BE#1, FE#1, BE#2, FE#2 role slots become placeholder people that are filled later?
- Is any part of the team plan going to be shared with others, which would bring accounts back into scope?
