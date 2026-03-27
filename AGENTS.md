# AGENTS.md

## Project Scope

These instructions apply to the entire repository rooted at `/Users/shaida/repos/my_planner`.

## Project Overview

- This is a small client-side planner app built with plain `index.html`, `styles.css`, and global-script JavaScript files.
- There is no bundler, module system, package manifest, or automated test suite in the repo.
- Firebase is loaded from CDN compat builds in `index.html`, then initialized in `firebase-config.js`, with globals consumed by `auth.js`, `db.js`, and `app.js`.
- `app.js` is the main application file and currently owns most state, rendering, interaction logic, and persistence orchestration.

## File Roles

- `index.html`: Declares the app shell, modal containers, settings view, and script load order.
- `styles.css`: Global styles and design tokens for the full app.
- `firebase-config.js`: Firebase app initialization plus global `db` and `auth`.
- `auth.js`: Login/logout flow and auth-state handoff into the app.
- `db.js`: Firestore persistence helpers.
- `app.js`: Task model transforms, rendering, drag/drop, calendar, backlog/archive/trash, rituals, settings, and startup.

## Architecture Notes

- Script order matters. Keep `firebase-config.js`, `auth.js`, and `db.js` loaded before `app.js`.
- Stay compatible with the current global-script style. Do not introduce ESM imports, bundler-only syntax, or a Node-based runtime assumption unless the user explicitly asks for a larger refactor.
- The app state is primarily stored in module-level objects such as `state`, `settings`, `dailyPlanningState`, `dailyShutdownState`, `todayViewState`, and several drag/overlay state objects.
- Task persistence depends on `taskToDoc`, `docToTask`, `getTaskContext`, and `persistTask`. If task fields change, update both serialization and deserialization paths.
- Special task locations use sentinel `columnDate` values:
  - `__backlog__`
  - `__archive__`
- Settings persistence also stores channel definitions. Preserve the migration behavior in `onAuthReady()` that hydrates saved `channels` before merging settings.

## Editing Guidelines

- Prefer small, targeted changes. `app.js` is large and highly stateful, so avoid broad rewrites unless explicitly requested.
- Follow the existing style:
  - plain functions and module-level state
  - single quotes
  - semicolons
  - descriptive section comments
- Reuse existing render and persistence helpers instead of adding duplicate pathways.
- When a UI interaction changes data, make sure both the in-memory state and the Firestore persistence path stay in sync.
- When adding a new task property, check all of these areas:
  - task creation defaults
  - `taskToDoc()`
  - `docToTask()`
  - any renderers or modal editors that expose the field
  - any archive/backlog/trash flows that copy task objects
- When changing channels or settings behavior, verify `rebuildChannelColors()`, `settings.channelEnabled`, settings rendering, and saved-settings hydration still agree.

## Frontend Expectations

- Preserve the current visual language unless the user asks for a redesign.
- Favor targeted DOM updates where the codebase already does so, but it is acceptable to call the existing panel/column re-render helpers when that is the established pattern.
- Keep responsive behavior intact for the login screen and main shell.
- Maintain accessibility basics already present in the markup, including button semantics, labels, and `hidden` usage.

## Firebase / Data Safety

- Treat Firestore as the source of persisted user data.
- Avoid changing collection names or document shapes casually; this app reads and writes:
  - `users`
  - `settings/settings`
  - `tasks`
  - `calendarEvents`
  - `trash`
  - `rituals/rituals`
- Prefer backward-compatible schema changes. If a new field is optional, default it safely in `docToTask()` or the relevant loader.

## Manual Verification

There is no built-in automated test command in this repo. After meaningful UI or data changes, do a focused manual smoke test by serving the static files locally and checking the affected flow.

Recommended smoke checks:

- Log in and confirm the app shell replaces the login screen.
- Create, edit, and reorder a task, then confirm it persists after refresh.
- Move a task between a day column, backlog, archive, and trash if your change touches task location logic.
- Check calendar rendering and event interactions if your change touches scheduling or timeboxing.
- Open Settings and verify updated values persist if your change touches settings or channels.
- Confirm icons and Quill editors still initialize after any markup or script-order changes.

## Refactor Guidance

- If a task requires substantial work in `app.js`, prefer extracting self-contained helpers rather than rewriting unrelated logic.
- Keep write paths consistent with current behavior before attempting cleanup.
- Call out hidden coupling when present. In this repo, rendering, persistence, and drag/drop logic are tightly connected.

## Notes For Future Agents

- Expect local uncommitted changes from the user, especially in `app.js`. Read before editing and avoid reverting unrelated work.
- If you cannot fully verify a change because it requires Firebase credentials or browser interaction, say exactly what you were able to validate and what remains manual.
- The right-sidebar search panel now has its own UI state in `searchPanelState`, but its persistent controls live in `settings.searchFilters`, `settings.searchDateRange`, and `settings.searchChannelFilterId`. If you change search behavior, keep `normalizeSearchSettings()`, `persistSettings()`, and the right-panel render path in sync.
- The search results intentionally use a dedicated renderer instead of `renderTaskCard()`. Search cards are clickable but non-draggable, exclude trash, and combine column tasks, backlog, and archive in one list.
- The search panel channel dropdown is intentionally grouped like the regular channel picker: contexts first, enabled child channels nested under them, uncategorized enabled channels next, and `Unassigned` last. Keep it aligned with `CHANNELS` plus `settings.channelEnabled` behavior.
