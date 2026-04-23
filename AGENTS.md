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
- View-level task filtering is transient UI state, not persisted settings. The shared Home/Today filter also drives Backlog, Archive, and task-linked calendar events; Daily Planning and Daily Shutdown each have their own temporary filter state and both reset their own filter plus the shared Home/Today filter when entering the ritual.
- Task channel tags should be written in canonical task-tag form, `#channelLabel` or `null`. Older bare-label tags may still exist, so channel matching/rendering should continue to normalize both bare labels and `#` labels.
- Task persistence depends on `taskToDoc`, `docToTask`, `getTaskContext`, and `persistTask`. If task fields change, update both serialization and deserialization paths.
- Repeating tasks use two layers:
  - persisted `repeatSeries` records in `state.repeatSeries`
  - derived visible occurrences in `repeatRuntimeState`
- Untouched repeating occurrences are often rendered from series rules without creating Firestore task docs. Be careful not to accidentally materialize or persist derived occurrences unless the interaction truly needs a durable task instance.
- Special task locations use sentinel `columnDate` values:
  - `__backlog__`
  - `__archive__`
- Settings persistence also stores channel definitions. Preserve the migration behavior in `onAuthReady()` that hydrates saved `channels` before merging settings. Settings that store channel IDs, such as `settings.ritualTaskChannelId`, should be normalized after channels are hydrated so deleted channels fall back safely.

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
- When changing repeating-task behavior, verify all of these areas stay aligned:
  - `normalizeRepeatSeries()`
  - `reconcileVisibleRepeatTasks()`
  - repeat navigation helpers such as `getRepeatNavigationDate()`
  - `renderRepeatBannerHtml()`
  - trash restore / expiration flows
- When changing channels or settings behavior, verify `rebuildChannelColors()`, `settings.channelEnabled`, settings rendering, saved-settings hydration, and channel-ID settings normalization still agree.

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
  - `repeatSeries`
  - `rituals/rituals`
- Prefer backward-compatible schema changes. If a new field is optional, default it safely in `docToTask()` or the relevant loader.

## Manual Verification

There is no built-in automated test command in this repo. After meaningful UI or data changes, do a focused manual smoke test by serving the static files locally and checking the affected flow.

Recommended smoke checks:

- Log in and confirm the app shell replaces the login screen.
- Create, edit, and reorder a task, then confirm it persists after refresh.
- Move a task between a day column, backlog, archive, and trash if your change touches task location logic.
- Create or edit a repeating task and confirm:
  - the repeat rule persists after refresh
  - visible future occurrences derive correctly without creating extra task docs
  - past missed untouched occurrences do not linger when a current/future occurrence already exists
  - series nav, stop/extend, and trash/restore behavior still make sense
- Check calendar rendering and event interactions if your change touches scheduling or timeboxing.
- If your change touches manual scheduled events, smoke-test both creation and editing flows: empty-space click/drag creation, quick-create modal, full modal, all-day row rendering, move/resize/delete, and persistence after refresh.
- Check topbar filtering if your change touches channels, board rendering, backlog/archive panels, or the calendar timeline. Home/Today/Backlog/Archive should stay aligned; Search and Trash should not be affected by the active topbar filter.
- Open Settings and verify updated values persist if your change touches settings or channels.
- If your change touches ritual tasks or settings channels, verify the Settings > Rituals default channel picker persists, new Daily Planning/Daily Shutdown system tasks use the chosen channel, and existing ritual tasks are not retagged when the setting changes.
- Confirm icons and Quill editors still initialize after any markup or script-order changes.

## Refactor Guidance

- If a task requires substantial work in `app.js`, prefer extracting self-contained helpers rather than rewriting unrelated logic.
- Keep write paths consistent with current behavior before attempting cleanup.
- Call out hidden coupling when present. In this repo, rendering, persistence, and drag/drop logic are tightly connected.

## Notes For Future Agents

- Expect local uncommitted changes from the user, especially in `app.js`. Read before editing and avoid reverting unrelated work.
- If you cannot fully verify a change because it requires Firebase credentials or browser interaction, say exactly what you were able to validate and what remains manual.
- Repeating tasks are series-driven. `repeatSeries` docs can include cadence config, `untilDate`, and `skippedOccurrences`. A deleted repeating occurrence should not stop the whole series; trashed occurrences stay navigable until permanently deleted, and permanent trash expiry turns that date into a skipped gap for the current rule fingerprint.
- Repeat-series visibility is coupled to Trash. `purgeExpiredTrash()` now affects repeat navigation/rendering, so changes to trash lifecycle can have repeat-series side effects even if the task cards themselves are derived.
- The right-sidebar search panel now has its own UI state in `searchPanelState`, but its persistent controls live in `settings.searchFilters`, `settings.searchDateRange`, and `settings.searchChannelFilterId`. If you change search behavior, keep `normalizeSearchSettings()`, `persistSettings()`, and the right-panel render path in sync.
- Search can hide repeating tasks via `settings.searchFilters.hideRepeatingTasks`. Keep that filter aligned with both persisted repeat instances and derived visible repeat occurrences.
- The search results intentionally use a dedicated renderer instead of `renderTaskCard()`. Search cards are clickable but non-draggable, exclude trash, and combine column tasks, backlog, and archive in one list.
- The search panel channel dropdown is intentionally grouped like the regular channel picker: contexts first, enabled child channels nested under them, uncategorized enabled channels next, and `Unassigned` last. Keep it aligned with `CHANNELS` plus `settings.channelEnabled` behavior.
- The topbar filter picker intentionally mirrors the regular channel picker styling and grouping, but with `#all` first and `#Unassigned` last. Keep its item rendering and typography aligned with the regular channel picker instead of introducing a separate visual treatment.
- The shared Home/Today filter is coupled to Backlog and Archive panel filtering and to task-linked calendar timeline filtering. Search and Trash intentionally ignore the active topbar filter.
- Settings has a Rituals section between Timeboxing and Schedule. `settings.ritualTaskChannelId` stores the stable channel ID for newly created Daily Planning/Daily Shutdown system tasks only; it should not retag existing ritual tasks when changed. Use the shared channel picker visual behavior and keep `normalizeRitualSettings()` aligned with channel create/delete/hydration paths.
- The Daily Planning sidebar item now has three today-only states: unvisited shows a small pink dot, visited-but-incomplete shows no indicator, and completed shows dimmed label/icon plus a check. That state is driven by `dailyPlanningState.visitedByDate` and `dailyPlanningState.runHistoryByDate`, with the sidebar DOM in `index.html` and styling in `styles.css`.
- Daily Planning can now start with an injected prior-shutdown review page for yesterday when planning today and `dailyShutdownHistory[yesterday]` is missing. That pre-step is not a numbered Daily Planning step, reuses the Daily Shutdown review panel/columns inside Daily Planning mode, and must not mark shutdown complete by itself. Keep `dailyPlanningState.showPriorShutdownReview` / `showingPriorShutdownReview` / `priorShutdownReviewDateISO`, `dailyShutdownState.historyByDate`, `goToNextDailyPlanningStep()`, `goToPrevDailyPlanningStep()`, and `updateTodayButtonLabel()` aligned if you change ritual flow.
- Daily Planning step 1 can temporarily branch from the shutdown-time card into a `Fill in calendar events` card. That branch is transient UI state in `dailyPlanningState.calendarEventsMode` and `calendarEventPickerSelectedIds`; do not persist it. Eligible events are unlinked scheduled events on the selected planning date, including all-day events when they are not excluded. Bulk-add must reuse the same event-backed task linking path as the scheduled-event modal / hover-card `Add to tasks` action.
- Calendar import defaults now come from two layers: per-calendar `importEvents` controls whether Daily Planning events from that calendar start checked, and global `settings.dailyPlanningEventExclusions` controls which matching events are default-unchecked. Missing `importEvents` should normalize to `true`, and events whose calendar metadata cannot be matched should default to checked rather than being silently skipped.
- The Calendars settings section now has two standard-width rows below the calendar accounts list: the Daily Planning exclusion-rules multiselect and `settings.autoCompleteImportedCalendarEvents`. Keep those rows aligned with normal settings rows rather than the wider calendar-account table, and preserve the divider above the first row.
- The app now has two tooltip paths:
  - simple CSS tooltips via `data-tooltip` / legacy `data-dp-tooltip` in `styles.css`
  - rich floating tooltips via `data-rich-tooltip-*` attributes plus the shared body-level overlay helpers in `app.js`
- Rich tooltips support `top`, `bottom`, `left`, and `right` placement, a shared 1-second hover delay, and compact shortcut keycaps rendered from the existing shortcuts UI styles. Prefer extending this shared system instead of creating one-off tooltip DOM/CSS.
- The shared non-donut tooltip style is intentionally standardized: `12px`, `500`, `#787878`, white background, `1px solid #f0f0f0`, `4px` radius, `6px 8px` padding, and a subtle `0 2px 8px rgba(0, 0, 0, 0.12)` shadow.
- Floating tooltips are rendered at the document body level and use a high z-index so they can sit above overlays like the task detail modal and focus mode. If a tooltip appears behind UI, check the shared `.app-tooltip` layer before adding local z-index fixes.
- The Daily Planning donut tooltip is intentionally separate from the shared default tooltip system; leave it alone unless the user explicitly asks to restyle that chart tooltip too.
- In task detail, subtask-row timer/actual/planned tooltips now imply real shortcut behavior: when the modal is open and a subtask row is hovered, `Space`, `E`, and `W` target that hovered subtask instead of the parent task. If modal shortcut behavior changes, keep the tooltip copy and hovered-subtask routing aligned.
- Task completion metadata now includes optional `completedAt` in addition to `completedOnDate`. Keep `taskToDoc()`, `docToTask()`, task creation defaults, archive/backlog/trash restore flows, and any completion/uncompletion paths aligned when touching completion state.
- Calendar completion checkmarks are rendered from task data (`completedOnDate` + `completedAt`), not stored as calendar events. They are visually gated by `settings.hideCompletedTasksInCalendar`, while slashed actual-time blocks are separately gated by `settings.visualizeActualTimeOnCalendar`.
- The task detail modal's "Timeboxed" section reads from persisted `state.calendarEvents`, not task-local fields. If timebox behavior changes, make sure in-memory event edits and `persistCalendarEvent()` / `persistDeleteCalendarEvent()` stay in sync.
- Manual scheduled events now also live in `state.calendarEvents` / Firestore `calendarEvents`, separate from tasks. They use `kind: 'scheduled_event'` and can carry `allDay`, `channelId`, `transparency`, `location`, and `description`. Existing task-linked and actual-time events still share the same collection, so keep normalization and rendering backward-compatible.
- The calendar timeline now supports manual scheduled-event creation from empty-space click/drag. Quick-create is a draft-only flow, while existing manual scheduled events open a full modal in read-only mode first.
- Existing manual scheduled events use a two-mode full modal: read-only view by default, edit mode after clicking `Edit`. `Back` must restore the saved snapshot, and delete uses the same two-click destructive-confirm pattern as the channel/context modal.
- Scheduled-event modal state is coupled to calendar rendering. Existing-event edit mode temporarily previews the draft on the timeline/all-day row instead of the saved event, and closing the modal must clear that preview by rerendering the calendar.
- Scheduled-event modal keyboard behavior intentionally suppresses background board navigation while the modal or its pickers are open. If you change picker handling, keep arrow-key navigation scoped to the open picker and avoid reactivating kanban/task shortcuts behind the overlay.
- The full scheduled-event modal overlay is intentionally scrollable rather than resizing the window. Open date/time/channel/blocking pickers may add temporary bottom padding so they can stay visible in short viewports; prefer extending that overlay-scrolling approach instead of portalizing those pickers unless the user asks for a redesign.
- Scheduled events can now be added to tasks as linked real task docs. Event-backed tasks use `taskKind: 'calendar_event'` plus `linkedCalendarEventId`, while the source event keeps `linkedTaskId`; the event remains the source of truth for title/channel/date/time/planned duration, and task-entry UI should open the event modal rather than normal task detail in most cases.
- Daily Planning's `Fill in calendar events` picker uses Lucide `square` / `square-check` icons instead of native checkboxes. Unchecked rows are dimmed, the event-open external-link button appears only on row hover, and opening a row should use the existing full scheduled-event modal.
- Event-backed tasks intentionally differ from normal tasks: no subtasks, no due dates/repeats/backlog/archive/trash moves, and focus mode is a special event version. In focus mode, planned time is intentionally non-clickable for event-backed tasks, while actual time still behaves normally.
- Event-backed task auto-complete is special. Auto-completing because the event ended should not create a second slashed actual-time timeline block or a green completion marker; manually completing an event-backed task before the event ends should still create the normal slashed actual-time block and green completion marker. That event-end auto-complete is now gated by the global Calendars toggle `settings.autoCompleteImportedCalendarEvents`; when the toggle is off, future event-end sync/reconcile sweeps must leave imported event tasks incomplete instead of auto-completing them, but should not reopen tasks that were already auto-completed earlier.
- Event-backed task actual-time autofill depends on timing: completing before the event starts uses the full planned duration; completing while the event is in progress uses `event start -> now`; auto-completing after the event ends fills task actual time internally but suppresses the duplicate actual-time calendar event. If the user later uncompletes a manually completed event task, only completion-generated actual time should be cleared; user-entered actual time must stay.
- Clicking timeline items now branches by source: scheduled-event blocks open the large event modal, timeboxed task blocks open task detail, task actual-time blocks open task detail, and event-backed actual-time blocks open the large event modal.
- Scheduled-event persistence now separates two concepts: `transparency` is calendar free/busy only, while `blocksTaskScheduling` is an app-only Firestore field that controls whether the `x` auto-scheduler treats that event as occupied time. Missing `blocksTaskScheduling` should default to `true`, and this setting must not affect manual drag/drop timeboxing.
- The large read-only event modal header now has event-task actions beyond `Add to tasks`/`Remove from tasks`: a task-blocking calendar/calendar-x toggle, and a focus (`maximize-2`) button only when the event is linked to a task. The `F` shortcut should only open focus from the event modal when a linked task exists.
- The all-day row is styled as a continuation of the day header/time-grid gutter. The `All day` label is intentionally hidden, and the day header border is cleared when a visible all-day row follows it so no divider line shows between the header and the all-day area.
- Start-date pickers should key off the task's actual `startDate` / repeat occurrence date, not just the current column date. `moveTaskToDate()` also needs to handle same-column date changes so "set to today" style updates do not no-op when column and `startDate` diverge.
- Completing a task now trims future non-actual timeboxes in the currently loaded `state.calendarEvents` window before auto-copying planned time to actual. If there are kept pre-completion segments, those planned events are converted into slashed actual events in place; otherwise the app falls back to backfilling actual time ending at completion. Be careful: trimming only guarantees coverage for calendar events that are loaded into memory, so changes to lazy-loading or completion logic can affect far-future cleanup.
