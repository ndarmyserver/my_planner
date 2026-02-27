/* ═══════════════════════════════════════════════
   DRAG CONTEXT (module-level)
═══════════════════════════════════════════════ */

const dragState = {
  taskId:      null,
  sourceColId: null,
  sourceIndex: null
};
let taskDropPlaceholder = null;
const TASK_REORDER_HYSTERESIS_PX = 6;

const SNAP_STEPS_PER_HOUR = 12; // 5-minute snapping
let calZCounter = 1;

// Set to true while a resize is in progress so dragstart can cancel itself
let calResizeInProgress = false;

// Cal-event drag state (module-level so renderCalendarEvents can attach dragstart directly)
let calDragEventId     = null;
let calDragSrc         = null;  // direct reference to drag-source element (survives detach)
let droppedOnGrid      = false;
let calGrabOffsetHours = 0;
let calPointerDrag     = null;  // { eventId, grabOffsetHours, sourceEl }
let activeDragType     = null;  // 'task' | 'calendar'
let activeDragId       = null;
let pendingDragType    = null;  // Safari fallback when dragstart is skipped
let pendingDragId      = null;

/* ═══════════════════════════════════════════════
   DATA MODEL
═══════════════════════════════════════════════ */

const INTEGRATION = {
  linear: '#5e6ad2',
  notion: '#000000',
  asana:  '#f06a6a',
  none:   null
};

const CHANNEL_COLORS = {
  '#product':  { hashColor: '#4a90d9', eventClass: 'cal-event--blue'   },
  '#planning': { hashColor: '#f59e0b', eventClass: 'cal-event--orange' },
  '#growth':   { hashColor: '#22c55e', eventClass: 'cal-event--green'  }
};

const state = {
  columns: [
    {
      id: 'col-mon',
      dayName: 'Monday',
      date: 'January 10',
      tasks: [
        {
          id: 'task-1',
          title: 'Build daily notes feature',
          timeEstimateMinutes: 240,
          scheduledTime: null,
          complete: false,
          tag: '#product',
          integrationColor: INTEGRATION.linear,
          subtasks: [
            { id: 'st-1-1', label: 'Mockups',             done: true },
            { id: 'st-1-2', label: 'Data model',          done: true },
            { id: 'st-1-3', label: 'Basic functionality', done: false }
          ]
        },
        {
          id: 'task-2',
          title: 'Document customer feedback',
          timeEstimateMinutes: 90,
          scheduledTime: null,
          complete: false,
          tag: '#product',
          integrationColor: INTEGRATION.notion,
          subtasks: [
            { id: 'st-2-1', label: 'Summarize customer churn surveys', done: true },
            { id: 'st-2-2', label: 'Review top posts in Canny',        done: false }
          ]
        },
        {
          id: 'task-3',
          title: 'Investigate secondary growth channels',
          timeEstimateMinutes: 60,
          scheduledTime: null,
          complete: false,
          tag: '#planning',
          integrationColor: null,
          subtasks: []
        },
        {
          id: 'task-4',
          title: 'Product demo with Jenn',
          timeEstimateMinutes: 90,
          scheduledTime: '10:00',
          complete: false,
          tag: '#growth',
          integrationColor: INTEGRATION.notion,
          subtasks: []
        }
      ]
    },
    {
      id: 'col-tue',
      dayName: 'Tuesday',
      date: 'January 11',
      tasks: [
        {
          id: 'task-5',
          title: 'Answer customer support tickets',
          timeEstimateMinutes: 30,
          scheduledTime: null,
          complete: false,
          tag: '#growth',
          integrationColor: null,
          subtasks: []
        },
        {
          id: 'task-6',
          title: 'Investigate secondary growth channels',
          timeEstimateMinutes: 30,
          scheduledTime: null,
          complete: false,
          tag: '#growth',
          integrationColor: null,
          subtasks: []
        },
        {
          id: 'task-7',
          title: 'Review prototype of new feature',
          timeEstimateMinutes: 120,
          scheduledTime: '10:00',
          complete: false,
          tag: '#product',
          integrationColor: INTEGRATION.notion,
          subtasks: []
        },
        {
          id: 'task-8',
          title: '1:1 with Tomoa',
          timeEstimateMinutes: 30,
          scheduledTime: '11:00',
          complete: false,
          tag: '#growth',
          integrationColor: INTEGRATION.asana,
          subtasks: []
        }
      ]
    }
  ],

  calendarEvents: [
    { id: 'evt-1', title: 'Morning routine',                colorClass: 'cal-event--blue',   offset: 1,  duration: 0.5, taskId: null },
    { id: 'evt-2', title: 'Product demo with Jenn',         colorClass: 'cal-event--orange', offset: 4,  duration: 1.5, taskId: 'task-4' },
    { id: 'evt-3', title: 'Lunch',                          colorClass: 'cal-event--blue',   offset: 6,  duration: 1,   taskId: null },
    { id: 'evt-4', title: 'Review prototype of new feature',colorClass: 'cal-event--purple', offset: 7,  duration: 2,   taskId: null }
  ]
};

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */

function formatMinutes(mins) {
  if (!mins) return '0:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function computeProgress(column) {
  const total = column.tasks.reduce((s, t) => s + t.timeEstimateMinutes, 0);
  if (total === 0) return 0;
  const done = column.tasks
    .filter(t => t.complete)
    .reduce((s, t) => s + t.timeEstimateMinutes, 0);
  return Math.round((done / total) * 100);
}

function uid() {
  return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeTag(tag) {
  return typeof tag === 'string' ? tag.trim().toLowerCase() : '';
}

function getChannelStyle(tag) {
  return CHANNEL_COLORS[normalizeTag(tag)] || null;
}

function getTaskEventColorClass(task, fallback = 'cal-event--blue') {
  const style = task ? getChannelStyle(task.tag) : null;
  return style ? style.eventClass : fallback;
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || '').trim().replace('#', '');
  const full = raw.length === 3
    ? raw.split('').map(ch => ch + ch).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(59, 130, 246, ${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Find a task across all columns
function findTaskById(taskId) {
  for (const col of state.columns) {
    const task = col.tasks.find(t => t.id === taskId);
    if (task) return task;
  }
  return null;
}

// offset (float hours from 6 AM) → "HH:MM" 24-hour string  e.g. 4 → "10:00"
function offsetToScheduledTime(offset) {
  const totalMinutes = Math.round(offset * 60);
  const hour   = 6 + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// "HH:MM" → float hours from 6 AM  e.g. "10:00" → 4
function scheduledTimeToOffset(scheduledTime) {
  const [h, m] = scheduledTime.split(':').map(Number);
  return (h - 6) + m / 60;
}

// Format a time range label: e.g. offset=4, duration=1 → "10 AM – 11 AM"
function formatTimeRange(offset, duration) {
  function fmt(totalHoursFromMidnight) {
    const totalH = 6 + totalHoursFromMidnight;
    const h = Math.floor(totalH);
    const m = Math.round((totalHoursFromMidnight % 1) * 60);
    // Handle fractional carry (e.g. 0.99 * 60 rounding)
    const adjH = m === 60 ? h + 1 : h;
    const adjM = m === 60 ? 0 : m;
    const period = adjH < 12 ? 'AM' : 'PM';
    const h12    = adjH > 12 ? adjH - 12 : (adjH === 0 ? 12 : adjH);
    return adjM === 0
      ? `${h12} ${period}`
      : `${h12}:${String(adjM).padStart(2, '0')} ${period}`;
  }
  return `${fmt(offset)} – ${fmt(offset + duration)}`;
}

function buildCalendarLaneLayout(events) {
  const sorted = [...events].sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset;
    return (a.offset + a.duration) - (b.offset + b.duration);
  });

  const groups = [];
  let group = [];
  let groupMaxEnd = -Infinity;

  for (const evt of sorted) {
    const evtEnd = evt.offset + evt.duration;
    if (!group.length || evt.offset < groupMaxEnd) {
      group.push(evt);
      groupMaxEnd = Math.max(groupMaxEnd, evtEnd);
      continue;
    }
    groups.push(group);
    group = [evt];
    groupMaxEnd = evtEnd;
  }
  if (group.length) groups.push(group);

  const layout = new Map();

  for (const g of groups) {
    const laneEnds = [];
    for (const evt of g) {
      let laneIndex = laneEnds.findIndex(end => end <= evt.offset);
      if (laneIndex === -1) laneIndex = laneEnds.length;
      laneEnds[laneIndex] = evt.offset + evt.duration;
      layout.set(evt.id, { laneIndex, laneCount: 1 }); // laneCount patched after full group pass
    }
    const laneCount = laneEnds.length || 1;
    for (const evt of g) {
      const current = layout.get(evt.id);
      layout.set(evt.id, { laneIndex: current.laneIndex, laneCount });
    }
  }

  return layout;
}

// Convert clientY to grid offset in hours (snapped to 5-min increments, clamped)
function yToOffset(clientY, timeGridEl) {
  const rect = timeGridEl.getBoundingClientRect();
  const raw  = (clientY - rect.top) / 60; // 60px = --hour-height
  return Math.max(0, Math.min(Math.round(raw * SNAP_STEPS_PER_HOUR) / SNAP_STEPS_PER_HOUR, 11));
}

// For column reorder: compute stable insert index using midpoint thresholds + hysteresis.
function getInsertIndexFromPointer(taskList, clientY, previousIndex = null) {
  const cards = [...taskList.querySelectorAll('.task-card:not(.task-card--dragging):not(.task-card--placeholder)')];
  const midpoints = cards.map(card => {
    const box = card.getBoundingClientRect();
    return box.top + box.height / 2;
  });

  let index = midpoints.findIndex(mid => clientY < mid);
  if (index === -1) index = cards.length;

  if (Number.isFinite(previousIndex)) {
    const prev = Math.max(0, Math.min(previousIndex, cards.length));
    if (index > prev && prev < cards.length) {
      if (clientY < midpoints[prev] + TASK_REORDER_HYSTERESIS_PX) index = prev;
    } else if (index < prev && prev > 0) {
      if (clientY > midpoints[prev - 1] - TASK_REORDER_HYSTERESIS_PX) index = prev;
    }
  }

  return { index, cards };
}

function clearTaskDragState() {
  dragState.taskId = dragState.sourceColId = dragState.sourceIndex = null;
}

function clearCalendarDragState() {
  calDragEventId     = null;
  calDragSrc         = null;
  droppedOnGrid      = false;
  calGrabOffsetHours = 0;
}

function setActiveDrag(type, id) {
  activeDragType = type;
  activeDragId   = id;
}

function clearActiveDrag() {
  activeDragType = null;
  activeDragId   = null;
}

function setPendingDrag(type, id) {
  pendingDragType = type;
  pendingDragId   = id;
}

function clearPendingDrag() {
  pendingDragType = null;
  pendingDragId   = null;
}

function getTransferId(e) {
  return e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
}

function promotePendingDrag() {
  if (!pendingDragType || !pendingDragId) return;
  if (activeDragType === pendingDragType && activeDragId === pendingDragId) return;
  setActiveDrag(pendingDragType, pendingDragId);
}

function resolveCalendarDragEventId(e) {
  promotePendingDrag();
  if (pendingDragType === 'task') return null;
  if (pendingDragType === 'calendar' && pendingDragId && state.calendarEvents.some(ev => ev.id === pendingDragId)) {
    return pendingDragId;
  }
  if (activeDragType === 'task') return null;
  if (activeDragType === 'calendar' && activeDragId && state.calendarEvents.some(ev => ev.id === activeDragId)) {
    return activeDragId;
  }
  const transferId = getTransferId(e);
  if (transferId && state.calendarEvents.some(ev => ev.id === transferId)) return transferId;
  if (document.querySelector('.cal-event--dragging')) {
    if (calDragEventId && state.calendarEvents.some(ev => ev.id === calDragEventId)) return calDragEventId;
    if (calDragSrc && state.calendarEvents.some(ev => ev.id === calDragSrc.dataset.eventId)) {
      return calDragSrc.dataset.eventId;
    }
  }
  return null;
}

function resolveTaskDragTaskId(e) {
  promotePendingDrag();
  if (pendingDragType === 'calendar') return null;
  if (pendingDragType === 'task' && pendingDragId && findTaskById(pendingDragId)) return pendingDragId;
  if (activeDragType === 'calendar') return null;
  if (activeDragType === 'task' && activeDragId && findTaskById(activeDragId)) return activeDragId;
  const transferId = getTransferId(e);
  if (transferId && findTaskById(transferId)) return transferId;
  if (document.querySelector('.task-card--dragging') && dragState.taskId && findTaskById(dragState.taskId)) {
    return dragState.taskId;
  }
  return null;
}

const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

/* ═══════════════════════════════════════════════
   RENDERING
═══════════════════════════════════════════════ */

function renderSubtasks(subtasks) {
  if (!subtasks.length) return '';
  const items = subtasks.map(s => `
    <li class="subtask ${s.done ? 'subtask--done' : ''}" data-subtask-id="${escapeHtml(s.id)}">
      <span class="subtask__check">${CHECK_SVG}</span>
      <span class="subtask__label">${escapeHtml(s.label)}</span>
    </li>
  `).join('');
  return `<ul class="task-card__subtasks">${items}</ul>`;
}

function renderIntegrationIcon(color) {
  if (!color) return '';
  return `<span class="task-card__integration-icon" style="background:${escapeHtml(color)};"></span>`;
}

function renderTaskTag(tag) {
  if (!tag) return '';
  const raw = String(tag).trim();
  const hasHash = raw.startsWith('#');
  const word = hasHash ? raw.slice(1) : raw;
  const channel = getChannelStyle(raw);
  const hashColor = channel ? channel.hashColor : '#9b8ec4';
  const hash = hasHash
    ? `<span class="task-card__tag-hash" style="color:${escapeHtml(hashColor)};">#</span>`
    : '';
  return `<span class="task-card__tag">${hash}<span class="task-card__tag-word">${escapeHtml(word)}</span></span>`;
}

function renderTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card' + (task.complete ? ' task-card--complete' : '');
  card.dataset.taskId = task.id;
  card.draggable = true;

  const scheduledPill = task.scheduledTime
    ? `<span class="task-card__scheduled-pill">${escapeHtml(task.scheduledTime)}</span>`
    : '';

  const timeBadge = task.timeEstimateMinutes
    ? `<span class="task-card__time-badge">${formatMinutes(task.timeEstimateMinutes)}</span>`
    : '';

  card.innerHTML = `
    <div class="task-card__header">
      <div class="task-card__title-wrap">
        ${scheduledPill}
        <span class="task-card__title">${escapeHtml(task.title)}</span>
      </div>
      ${timeBadge}
    </div>
    ${renderSubtasks(task.subtasks)}
    <div class="task-card__footer">
      <button class="task-card__complete-btn" aria-label="Mark complete">
        <span class="complete-circle">${CHECK_SVG}</span>
      </button>
      ${renderIntegrationIcon(task.integrationColor)}
      ${renderTaskTag(task.tag)}
    </div>
  `;

  return card;
}

function renderColumn(column) {
  const colEl = document.querySelector(`.day-column[data-col-id="${column.id}"]`);
  if (!colEl) return;

  const progress = computeProgress(column);
  colEl.querySelector('.progress-bar__fill').style.width = progress + '%';

  const totalMins = column.tasks.reduce((s, t) => s + t.timeEstimateMinutes, 0);
  colEl.querySelector('.column-time-total').textContent = formatMinutes(totalMins);

  const taskList = colEl.querySelector('.task-list');
  taskList.innerHTML = '';
  column.tasks.forEach(task => taskList.appendChild(renderTaskCard(task)));
}

function renderCalendarEvents() {
  const timeGrid = document.getElementById('time-grid');
  const ghost    = document.getElementById('cal-event-ghost');
  const laneLayout = buildCalendarLaneLayout(state.calendarEvents);

  // Remove all rendered events, keeping the ghost element
  timeGrid.querySelectorAll('.cal-event:not(#cal-event-ghost)').forEach(el => el.remove());

  state.calendarEvents.forEach(evt => {
    if (!Number.isFinite(evt.zOrder)) {
      evt.zOrder = ++calZCounter;
    }

    const linkedTask = evt.taskId ? findTaskById(evt.taskId) : null;
    const eventColorClass = linkedTask
      ? getTaskEventColorClass(linkedTask, evt.colorClass || 'cal-event--blue')
      : (evt.colorClass || 'cal-event--blue');
    evt.colorClass = eventColorClass;

    const el = document.createElement('div');
    el.className = `cal-event ${eventColorClass}`;
    if (evt.taskId) el.classList.add('cal-event--movable');
    el.dataset.eventId = evt.id;
    el.style.setProperty('--offset',   evt.offset);
    el.style.setProperty('--duration', evt.duration);
    el.style.zIndex = String(evt.zOrder);
    const lane = laneLayout.get(evt.id) || { laneIndex: 0, laneCount: 1 };
    el.style.setProperty('--lane-frac', String(lane.laneIndex / lane.laneCount));
    el.style.setProperty('--lane-size', String(1 / lane.laneCount));
    el.innerHTML = `
      <span class="cal-event__title">${escapeHtml(evt.title)}</span>
      <span class="cal-event__time">${formatTimeRange(evt.offset, evt.duration)}</span>
      <div class="cal-event__resize-handle" draggable="false"></div>
    `;

    // Insert before ghost so ghost stays on top in DOM/z-order
    timeGrid.insertBefore(el, ghost);
  });
}

function createColumnElement(column) {
  const colEl = document.createElement('div');
  colEl.className = 'day-column';
  colEl.dataset.colId = column.id;

  colEl.innerHTML = `
    <div class="day-column__header">
      <span class="day-name">${escapeHtml(column.dayName)}</span>
      <span class="day-date">${escapeHtml(column.date)}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar__fill" style="width:0%"></div>
    </div>
    <div class="add-task-row">
      <button class="add-task-btn">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add task
      </button>
      <span class="column-time-total">0:00</span>
    </div>
    <div class="add-task-input-wrap" hidden>
      <input type="text" class="add-task-input" placeholder="Task name…">
      <button class="add-task-confirm">Add</button>
      <button class="add-task-cancel">✕</button>
    </div>
    <div class="task-list"></div>
  `;

  return colEl;
}

function renderAllColumns() {
  const container = document.getElementById('day-columns');
  container.innerHTML = '';
  state.columns.forEach(col => {
    const colEl = createColumnElement(col);
    container.appendChild(colEl);
    renderColumn(col);
  });
}

/* ═══════════════════════════════════════════════
   ADD TASK HELPERS
═══════════════════════════════════════════════ */

function showAddTaskInput(colEl) {
  colEl.querySelector('.add-task-row').style.display = 'none';
  const wrap = colEl.querySelector('.add-task-input-wrap');
  wrap.removeAttribute('hidden');
  wrap.querySelector('.add-task-input').focus();
}

function hideAddTaskInput(colEl) {
  const wrap = colEl.querySelector('.add-task-input-wrap');
  wrap.querySelector('.add-task-input').value = '';
  wrap.setAttribute('hidden', '');
  colEl.querySelector('.add-task-row').style.display = '';
}

function commitAddTask(colEl) {
  const input = colEl.querySelector('.add-task-input');
  const title = input.value.trim();
  if (!title) { hideAddTaskInput(colEl); return; }

  const colId  = colEl.dataset.colId;
  const column = state.columns.find(c => c.id === colId);
  if (!column) return;

  column.tasks.push({
    id: uid(),
    title,
    timeEstimateMinutes: 0,
    scheduledTime: null,
    complete: false,
    tag: null,
    integrationColor: null,
    subtasks: []
  });

  hideAddTaskInput(colEl);
  renderColumn(column);
}

/* ═══════════════════════════════════════════════
   COLUMN EVENT DELEGATION
═══════════════════════════════════════════════ */

function attachEvents() {
  const container = document.getElementById('day-columns');

  function resolveTaskListFromTarget(target) {
    const direct = target.closest('.task-list');
    if (direct) return direct;
    const colEl = target.closest('.day-column');
    return colEl ? colEl.querySelector('.task-list') : null;
  }

  // Safari fallback: remember intended source before native dragstart fires.
  // Capture phase ensures this runs even when dragstart is flaky on dynamic nodes.
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.cal-event__resize-handle')) {
      clearPendingDrag();
      return;
    }
    const card = e.target.closest('.task-card');
    if (card) {
      setPendingDrag('task', card.dataset.taskId);
      return;
    }
    clearPendingDrag();
  }, true);

  // ── Complete task toggle ────────────────────
  container.addEventListener('click', e => {
    const btn = e.target.closest('.task-card__complete-btn');
    if (!btn) return;
    const card   = btn.closest('.task-card');
    const taskId = card.dataset.taskId;
    for (const col of state.columns) {
      const task = col.tasks.find(t => t.id === taskId);
      if (task) { task.complete = !task.complete; renderColumn(col); break; }
    }
  });

  // ── Show add-task input ─────────────────────
  container.addEventListener('click', e => {
    const btn = e.target.closest('.add-task-btn');
    if (!btn) return;
    showAddTaskInput(btn.closest('.day-column'));
  });

  // ── Confirm add task ────────────────────────
  container.addEventListener('click', e => {
    if (!e.target.closest('.add-task-confirm')) return;
    commitAddTask(e.target.closest('.day-column'));
  });

  // ── Cancel add task ─────────────────────────
  container.addEventListener('click', e => {
    if (!e.target.closest('.add-task-cancel')) return;
    hideAddTaskInput(e.target.closest('.day-column'));
  });

  // ── Enter / Escape in input ─────────────────
  container.addEventListener('keydown', e => {
    const input = e.target.closest('.add-task-input');
    if (!input) return;
    const colEl = input.closest('.day-column');
    if (e.key === 'Enter')  { e.preventDefault(); commitAddTask(colEl); }
    if (e.key === 'Escape') { hideAddTaskInput(colEl); }
  });

  // ════ DRAG AND DROP — COLUMNS ════════════════

  // ── dragstart: pick up a task card ──────────
  container.addEventListener('dragstart', e => {
    const card = e.target.closest('.task-card');
    if (!card) return;

    // Forcibly clear any stale cal-event drag state before task drag begins.
    clearCalendarDragState();

    const colEl = card.closest('.day-column');
    dragState.taskId      = card.dataset.taskId;
    dragState.sourceColId = colEl.dataset.colId;

    const col = state.columns.find(c => c.id === dragState.sourceColId);
    dragState.sourceIndex = col.tasks.findIndex(t => t.id === dragState.taskId);

    if (taskDropPlaceholder && taskDropPlaceholder.parentElement) {
      taskDropPlaceholder.remove();
    }
    taskDropPlaceholder = card.cloneNode(true);
    taskDropPlaceholder.classList.remove('task-card--dragging');
    taskDropPlaceholder.classList.add('task-card--placeholder');
    taskDropPlaceholder.removeAttribute('draggable');
    taskDropPlaceholder.dataset.taskId = 'placeholder';
    taskDropPlaceholder.style.height = `${card.offsetHeight}px`;
    taskDropPlaceholder.style.minHeight = `${card.offsetHeight}px`;

    // Insert placeholder immediately so column layout does not "jump" before first dragover.
    const sourceTaskList = colEl.querySelector('.task-list');
    if (sourceTaskList) {
      sourceTaskList.insertBefore(taskDropPlaceholder, card);
      sourceTaskList.dataset.dropIndex = String(Math.max(0, dragState.sourceIndex));
    }

    e.dataTransfer.effectAllowed = 'move';
    // setData is required in Firefox/Safari for a drag to be recognized as valid
    e.dataTransfer.setData('text/plain', dragState.taskId);
    setActiveDrag('task', dragState.taskId);
    clearPendingDrag();
    document.body.classList.add('is-task-reordering');

    // Delay so browser snapshots the full-opacity card as the drag image
    requestAnimationFrame(() => card.classList.add('task-card--dragging'));
  });

  // ── dragend: clean up ───────────────────────
  container.addEventListener('dragend', () => {
    // Sweep all cards — more reliable than e.target when DOM has been re-rendered
    container.querySelectorAll('.task-card--dragging').forEach(el => el.classList.remove('task-card--dragging'));

    // Clean up any lingering indicators / highlights
    if (taskDropPlaceholder && taskDropPlaceholder.parentElement) taskDropPlaceholder.remove();
    taskDropPlaceholder = null;
    document.querySelectorAll('.task-list.drag-over').forEach(el => {
      el.classList.remove('drag-over');
      delete el.dataset.dropIndex;
    });
    document.querySelectorAll('.task-list').forEach(el => {
      delete el.dataset.dropIndex;
    });

    // Delay reset for Firefox (dragend fires before drop in FF)
    setTimeout(() => {
      clearTaskDragState();
      if (activeDragType === 'task') clearActiveDrag();
      clearPendingDrag();
      document.body.classList.remove('is-task-reordering');
    }, 0);
  });

  // ── dragenter: highlight task list ──────────
  container.addEventListener('dragenter', e => {
    if (!dragState.taskId) return;
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList) return;
    taskList.classList.add('drag-over');
  });

  // ── dragover: show drop indicator ───────────
  container.addEventListener('dragover', e => {
    if (!dragState.taskId) return;
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    taskList.classList.add('drag-over');

    let placeholder = taskDropPlaceholder;
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'task-card task-card--placeholder';
      taskDropPlaceholder = placeholder;
    }
    if (placeholder.parentElement !== taskList) taskList.appendChild(placeholder);

    let previousIndex = null;
    if (taskList.dataset.dropIndex !== undefined) {
      const parsed = Number.parseInt(taskList.dataset.dropIndex, 10);
      if (Number.isFinite(parsed)) previousIndex = parsed;
    }

    const { index: insertIndex, cards } = getInsertIndexFromPointer(taskList, e.clientY, previousIndex);
    if (previousIndex !== insertIndex) {
      taskList.dataset.dropIndex = String(insertIndex);
      const beforeCard = cards[insertIndex] || null;
      taskList.insertBefore(placeholder, beforeCard);
    } else if (taskList.dataset.dropIndex === undefined) {
      taskList.dataset.dropIndex = String(insertIndex);
      const beforeCard = cards[insertIndex] || null;
      taskList.insertBefore(placeholder, beforeCard);
    }
  });

  // ── dragleave: un-highlight ──────────────────
  container.addEventListener('dragleave', e => {
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList) return;
    // Safari may emit dragleave with null relatedTarget while still inside the list.
    const nextTarget = e.relatedTarget || document.elementFromPoint(e.clientX, e.clientY);
    const colEl = taskList.closest('.day-column');
    if (nextTarget && taskList.contains(nextTarget)) return;
    if (nextTarget && nextTarget.closest('.task-list') === taskList) return;
    if (colEl && nextTarget && colEl.contains(nextTarget)) return;
    taskList.classList.remove('drag-over');
    delete taskList.dataset.dropIndex;
    if (taskDropPlaceholder && taskDropPlaceholder.parentElement === taskList) {
      taskDropPlaceholder.remove();
    }
  });

  // ── drop: move task in state ─────────────────
  container.addEventListener('drop', e => {
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList || !dragState.taskId) return;
    e.preventDefault();

    const targetColEl = taskList.closest('.day-column');
    const targetColId = targetColEl.dataset.colId;

    // Determine insert index from dragover-computed target.
    const cards = [...taskList.querySelectorAll('.task-card:not(.task-card--dragging):not(.task-card--placeholder)')];
    let insertIndex = cards.length; // default: append
    if (taskList.dataset.dropIndex !== undefined) {
      const parsed = Number.parseInt(taskList.dataset.dropIndex, 10);
      if (Number.isFinite(parsed)) insertIndex = Math.max(0, Math.min(parsed, cards.length));
    }

    const sourceCol = state.columns.find(c => c.id === dragState.sourceColId);
    const targetCol = state.columns.find(c => c.id === targetColId);
    const taskIndex = sourceCol.tasks.findIndex(t => t.id === dragState.taskId);
    const [task]    = sourceCol.tasks.splice(taskIndex, 1);

    targetCol.tasks.splice(insertIndex, 0, task);

    // Clean up visual state
    taskList.classList.remove('drag-over');
    delete taskList.dataset.dropIndex;
    if (taskDropPlaceholder && taskDropPlaceholder.parentElement) taskDropPlaceholder.remove();
    taskDropPlaceholder = null;

    renderColumn(sourceCol);
    if (sourceCol !== targetCol) renderColumn(targetCol);
  });
}

/* ═══════════════════════════════════════════════
   CALENDAR DRAG-AND-DROP
═══════════════════════════════════════════════ */

function attachCalendarEvents() {
  const timeGrid    = document.getElementById('time-grid');
  const ghost       = document.getElementById('cal-event-ghost');
  const calDragLine = document.getElementById('cal-drag-line');

  function bringEventToFront(eventId, el) {
    const evt = state.calendarEvents.find(ev => ev.id === eventId);
    if (!evt) return;
    evt.zOrder = ++calZCounter;
    if (el) el.style.zIndex = String(evt.zOrder);
  }

  timeGrid.addEventListener('mousedown', e => {
    const anyEventEl = e.target.closest('.cal-event:not(#cal-event-ghost)');
    if (!anyEventEl) return;
    bringEventToFront(anyEventEl.dataset.eventId, anyEventEl);
  });

  function eventOffsetFromPointer(clientY, duration, grabOffsetHours) {
    const gridTop = timeGrid.getBoundingClientRect().top;
    const rawTop  = (clientY - gridTop) / 60 - grabOffsetHours;
    const snapped = Math.round(rawTop * SNAP_STEPS_PER_HOUR) / SNAP_STEPS_PER_HOUR;
    return Math.max(0, Math.min(snapped, 12 - duration));
  }

  // Pointer-based move for existing timeline events (Safari-safe).
  timeGrid.addEventListener('mousedown', e => {
    if (e.target.closest('.cal-event__resize-handle')) return;

    const evEl = e.target.closest('.cal-event--movable:not(#cal-event-ghost)');
    if (!evEl) return;

    const evt = state.calendarEvents.find(ev => ev.id === evEl.dataset.eventId);
    if (!evt) return;

    e.preventDefault();
    const gridTop = timeGrid.getBoundingClientRect().top;
    const grabOffsetHours = (e.clientY - gridTop) / 60 - evt.offset;

    calPointerDrag = {
      eventId: evt.id,
      grabOffsetHours,
      sourceEl: evEl
    };

    evEl.classList.add('cal-event--dragging');
    ghost.hidden = true;
    calDragLine.hidden = true;
  });

  document.addEventListener('mousemove', e => {
    if (!calPointerDrag) return;

    const evt = state.calendarEvents.find(ev => ev.id === calPointerDrag.eventId);
    if (!evt) return;

    e.preventDefault();
    const offset = eventOffsetFromPointer(e.clientY, evt.duration, calPointerDrag.grabOffsetHours);
    if (calPointerDrag.sourceEl) {
      calPointerDrag.sourceEl.style.setProperty('--offset', offset);
      calPointerDrag.sourceEl.querySelector('.cal-event__time').textContent = formatTimeRange(offset, evt.duration);
    }
  });

  document.addEventListener('mouseup', e => {
    if (!calPointerDrag) return;

    const { eventId, grabOffsetHours, sourceEl } = calPointerDrag;
    calPointerDrag = null;
    if (sourceEl) sourceEl.classList.remove('cal-event--dragging');

    const evt = state.calendarEvents.find(ev => ev.id === eventId);
    calDragLine.hidden = true;
    if (!evt) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const droppedOnTimeline = !!(target && target.closest('#time-grid'));

    if (droppedOnTimeline) {
      const offset = eventOffsetFromPointer(e.clientY, evt.duration, grabOffsetHours);
      evt.offset = offset;
      if (evt.taskId) {
        const task = findTaskById(evt.taskId);
        if (task) task.scheduledTime = offsetToScheduledTime(offset);
        const col = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
        if (col) renderColumn(col);
      }
    } else if (evt.taskId) {
      const task = findTaskById(evt.taskId);
      if (task) task.scheduledTime = null;
      const col = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
      if (col) renderColumn(col);
      state.calendarEvents = state.calendarEvents.filter(ev => ev.id !== eventId);
    }

    renderCalendarEvents();
  });

  // Task card drag preview over timeline.
  timeGrid.addEventListener('dragenter', e => {
    const taskDragId = resolveTaskDragTaskId(e);
    if (!taskDragId) return;
    e.preventDefault();
    ghost.hidden = false;
    calDragLine.hidden = true;
  });

  timeGrid.addEventListener('dragover', e => {
    const taskDragId = resolveTaskDragTaskId(e);
    if (!taskDragId) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const offset = yToOffset(e.clientY, timeGrid);
    const task   = findTaskById(taskDragId);
    if (!task) return;

    const durationHours = task.timeEstimateMinutes > 0
      ? task.timeEstimateMinutes / 60
      : 0.5;
    const channelStyle = getChannelStyle(task.tag);
    const ghostColor = channelStyle ? channelStyle.hashColor : '#3b82f6';

    ghost.hidden = false;
    ghost.style.backgroundColor = hexToRgba(ghostColor, 0.28);
    ghost.style.borderColor = hexToRgba(ghostColor, 0.95);
    ghost.style.borderStyle = 'dashed';
    ghost.style.borderWidth = '2px';
    ghost.style.setProperty('--offset',   offset);
    ghost.style.setProperty('--duration', durationHours);
    ghost.querySelector('.cal-event__title').textContent = task.title;
    ghost.querySelector('.cal-event__time').textContent  = formatTimeRange(offset, durationHours);
  });

  timeGrid.addEventListener('dragleave', e => {
    if (timeGrid.contains(e.relatedTarget)) return;
    ghost.hidden = true;
  });

  // Task card drop onto timeline.
  timeGrid.addEventListener('drop', e => {
    const taskDragId = resolveTaskDragTaskId(e);
    if (!taskDragId) return;

    e.preventDefault();
    ghost.hidden = true;
    calDragLine.hidden = true;

    const task = findTaskById(taskDragId);
    if (!task) return;

    const offset   = yToOffset(e.clientY, timeGrid);
    const duration = task.timeEstimateMinutes > 0
      ? task.timeEstimateMinutes / 60
      : 0.5;

    task.scheduledTime = offsetToScheduledTime(offset);

    const existing = state.calendarEvents.find(ev => ev.taskId === task.id);
    if (existing) {
      existing.offset   = offset;
      existing.duration = duration;
      existing.title    = task.title;
      existing.colorClass = getTaskEventColorClass(task, existing.colorClass);
      existing.zOrder   = ++calZCounter;
    } else {
      state.calendarEvents.push({
        id:         'evt-' + uid(),
        title:      task.title,
        colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
        offset,
        duration,
        taskId:     task.id,
        zOrder:     ++calZCounter
      });
    }

    const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
    if (col) renderColumn(col);

    setTimeout(renderCalendarEvents, 0);
  });

}

/* ═══════════════════════════════════════════════
   CALENDAR EVENT RESIZE
═══════════════════════════════════════════════ */

function attachCalendarResizeEvents() {
  const timeGrid = document.getElementById('time-grid');

  timeGrid.addEventListener('mousedown', e => {
    const handle = e.target.closest('.cal-event__resize-handle');
    if (!handle) return;
    const eventEl = handle.closest('.cal-event');
    const eventId = eventEl.dataset.eventId;
    const evt = state.calendarEvents.find(ev => ev.id === eventId);
    if (!evt) return;

    e.preventDefault();
    e.stopPropagation();
    calResizeInProgress = true;

    const minDuration   = 1 / SNAP_STEPS_PER_HOUR;
    const startY        = e.clientY;
    const startOffset   = evt.offset;
    const startDuration = evt.duration;
    const startEnd      = startOffset + startDuration;
    eventEl.classList.add('cal-event--resizing');

    function onMouseMove(e) {
      const deltaHours = (e.clientY - startY) / 60;
      const rawHandle   = startEnd + deltaHours;
      const snapped     = Math.round(rawHandle * SNAP_STEPS_PER_HOUR) / SNAP_STEPS_PER_HOUR;
      const handleAt    = Math.max(0, Math.min(snapped, 12));

      let nextOffset;
      let nextDuration;

      if (handleAt >= startOffset) {
        // Normal downward/within-block resize: keep start fixed.
        nextOffset = startOffset;
        nextDuration = Math.min(Math.max(minDuration, handleAt - startOffset), 12 - startOffset);
      } else {
        // Crossed above original start: original start becomes new end.
        const maxUpOffset = Math.max(0, startOffset - minDuration);
        nextOffset = Math.max(0, Math.min(handleAt, maxUpOffset));
        nextDuration = startOffset - nextOffset;
      }

      evt.offset   = nextOffset;
      evt.duration = nextDuration;
      eventEl.style.setProperty('--offset', nextOffset);
      eventEl.style.setProperty('--duration', nextDuration);
      eventEl.querySelector('.cal-event__time').textContent = formatTimeRange(nextOffset, nextDuration);
    }

    function onMouseUp() {
      eventEl.classList.remove('cal-event--resizing');
      calResizeInProgress = false;

      // Keep linked task estimate in sync with resized calendar duration.
      if (evt.taskId) {
        const task = findTaskById(evt.taskId);
        if (task) {
          task.timeEstimateMinutes = Math.round(evt.duration * 60);
          task.scheduledTime = offsetToScheduledTime(evt.offset);
          const col = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
          if (col) renderColumn(col);
        }
      }

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
      renderCalendarEvents();
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  });
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  renderAllColumns();
  renderCalendarEvents();
  attachEvents();
  attachCalendarEvents();
  attachCalendarResizeEvents();

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});
