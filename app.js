/* ═══════════════════════════════════════════════
   DRAG CONTEXT (module-level)
═══════════════════════════════════════════════ */

const dragState = {
  taskId:      null,
  sourceColId: null,
  sourceIndex: null
};
let taskDropPlaceholder = null;
let taskDragClassRaf = null;
let taskDragClassToken = 0;
const TASK_REORDER_HYSTERESIS_PX = 6;
const TASK_POINTER_DRAG_THRESHOLD_PX = 5;
let taskPointerDrag = null;
let suppressTaskCardClick = false;

const SNAP_STEPS_PER_HOUR = 12; // 5-minute snapping
const CALENDAR_START_HOUR = 0;
const DEFAULT_CALENDAR_TOTAL_HOURS = 24;
const DEFAULT_HOUR_HEIGHT_PX = 60;
const DEFAULT_WORKDAY_START_HOUR = 8;
const DEFAULT_WORKDAY_END_HOUR = 17;
const WORKDAY_SCROLL_LEAD_HOURS = 1;
const MIN_CALENDAR_ZOOM = 1;
const MAX_CALENDAR_ZOOM = 3;
const DEFAULT_CALENDAR_ZOOM = 1;
let calZCounter = 1;
const DAY_WINDOW_RADIUS = 15;
const DAY_WINDOW_SHIFT_STEP = 7;
const DAY_WINDOW_SHIFT_TRIGGER_COLUMNS = 5;
const DAY_WINDOW_RECYCLE_SUPPRESS_MS = 700;
let dayWindowRecycleSuppressed = false;
let dayWindowRecycleSuppressTimer = null;
let labelUpdateSuppressed = false;
let labelUpdateSuppressTimer = null;

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
let workdayMarkerDrag  = null;  // { type: 'start' | 'end' }

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
      dayName: 'Thursday',
      date: 'March 5',
      isoDate: '2026-03-05',
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
      dayName: 'Friday',
      date: 'March 6',
      isoDate: '2026-03-06',
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
    { id: 'evt-1', title: 'Morning routine',                colorClass: 'cal-event--blue',   offset: 7,  duration: 0.5, taskId: null,    date: '2026-03-05' },
    { id: 'evt-2', title: 'Product demo with Jenn',         colorClass: 'cal-event--orange', offset: 10, duration: 1.5, taskId: 'task-4', date: '2026-03-05' },
    { id: 'evt-3', title: 'Lunch',                          colorClass: 'cal-event--blue',   offset: 12, duration: 1,   taskId: null,    date: '2026-03-05' },
    { id: 'evt-4', title: 'Review prototype of new feature',colorClass: 'cal-event--purple', offset: 13, duration: 2,   taskId: null,    date: '2026-03-05' }
  ],

  workday: {
    startOffset: DEFAULT_WORKDAY_START_HOUR,
    endOffset: DEFAULT_WORKDAY_END_HOUR
  },

  calendarZoom: DEFAULT_CALENDAR_ZOOM,
  dayWindow: {
    startISO: null,
    endISO: null
  }
};

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */

function getTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function parseISO(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function toISO(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function formatDateDisplay(isoStr) {
  const d = parseISO(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

function getDayName(isoStr) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[parseISO(isoStr).getDay()];
}

function addDays(isoStr, n) {
  const d = parseISO(isoStr);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function isIsoInRange(isoDate, startISO, endISO) {
  return isoDate >= startISO && isoDate <= endISO;
}

function createEmptyColumnForDate(isoDate) {
  return {
    id: 'col-' + isoDate,
    dayName: getDayName(isoDate),
    date: formatDateDisplay(isoDate),
    isoDate,
    tasks: []
  };
}

function ensureColumnForDate(isoDate) {
  let col = state.columns.find(c => c.isoDate === isoDate);
  if (col) return col;

  col = createEmptyColumnForDate(isoDate);
  state.columns.push(col);
  state.columns.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  return col;
}

function ensureColumnsForWindow(startISO, endISO) {
  let cursor = startISO;
  while (cursor <= endISO) {
    ensureColumnForDate(cursor);
    cursor = addDays(cursor, 1);
  }
}

function getColumnsInWindow(startISO, endISO) {
  return state.columns.filter(col => isIsoInRange(col.isoDate, startISO, endISO));
}

function initializeDayWindow() {
  const todayISO = getTodayISO();
  state.dayWindow.startISO = addDays(todayISO, -DAY_WINDOW_RADIUS);
  state.dayWindow.endISO = addDays(todayISO, DAY_WINDOW_RADIUS);
  ensureColumnsForWindow(state.dayWindow.startISO, state.dayWindow.endISO);
}

function pruneFarEmptyColumns() {
  if (!state.dayWindow.startISO || !state.dayWindow.endISO) return;
  const keepStart = addDays(state.dayWindow.startISO, -DAY_WINDOW_RADIUS);
  const keepEnd = addDays(state.dayWindow.endISO, DAY_WINDOW_RADIUS);

  state.columns = state.columns.filter(col => {
    if ((col.tasks || []).length > 0) return true;
    return isIsoInRange(col.isoDate, keepStart, keepEnd);
  });
}

function formatMinutes(mins) {
  if (!mins) return '0:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatColumnTimeSummary(column) {
  const plannedMinutes = column.tasks.reduce((sum, task) => {
    ensureTaskTimeState(task);
    return sum + (task.timeEstimateMinutes || 0);
  }, 0);
  const actualSeconds = column.tasks.reduce((sum, task) => sum + (task.actualTimeSeconds || 0), 0);
  const actualMinutes = Math.floor(actualSeconds / 60);

  if (actualMinutes > 0 && plannedMinutes > 0) {
    return `${formatMinutes(actualMinutes)} / ${formatMinutes(plannedMinutes)}`;
  }
  if (actualMinutes > 0) {
    return `${formatMinutes(actualMinutes)} / --:--`;
  }
  if (plannedMinutes > 0) {
    return formatMinutes(plannedMinutes);
  }
  return '';
}

function hasActualTime(actualSeconds) {
  return (actualSeconds || 0) > 0;
}

function formatActualDisplay(actualSeconds) {
  return hasActualTime(actualSeconds)
    ? formatMinutes(Math.floor(actualSeconds / 60))
    : '--:--';
}

function computeProgress(column) {
  const total = column.tasks.reduce((s, t) => {
    ensureTaskTimeState(t);
    return s + t.timeEstimateMinutes;
  }, 0);
  if (total === 0) return 0;
  const done = column.tasks
    .filter(t => t.complete)
    .reduce((s, t) => s + t.timeEstimateMinutes, 0);
  return Math.round((done / total) * 100);
}

function moveCompletedTasksToBottom(column) {
  const activeTasks = [];
  const completedTasks = [];

  for (const task of column.tasks) {
    if (task.complete) completedTasks.push(task);
    else activeTasks.push(task);
  }

  column.tasks = activeTasks.concat(completedTasks);
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
    if (task) {
      ensureTaskTimeState(task);
      return task;
    }
  }
  return null;
}

function findTaskContext(taskId) {
  for (const col of state.columns) {
    const index = col.tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      ensureTaskTimeState(col.tasks[index]);
      return { column: col, task: col.tasks[index], index };
    }
  }
  return null;
}

function ensureSubtaskTimeState(subtask) {
  if (!subtask || typeof subtask !== 'object') return;
  if (!Number.isFinite(subtask.plannedMinutes)) subtask.plannedMinutes = 0;
  if (!Number.isFinite(subtask.actualTimeSeconds)) subtask.actualTimeSeconds = 0;
  if (typeof subtask.label !== 'string') subtask.label = '';
  if (typeof subtask.done !== 'boolean') subtask.done = false;
}

function ensureTaskTimeState(task) {
  if (!task || typeof task !== 'object') return;
  if (!Array.isArray(task.subtasks)) task.subtasks = [];
  task.subtasks.forEach(ensureSubtaskTimeState);

  if (!Number.isFinite(task.ownPlannedMinutes)) {
    task.ownPlannedMinutes = Number.isFinite(task.timeEstimateMinutes) ? task.timeEstimateMinutes : 0;
  }
  if (!Number.isFinite(task.ownActualTimeSeconds)) {
    task.ownActualTimeSeconds = Number.isFinite(task.actualTimeSeconds) ? task.actualTimeSeconds : 0;
  }
  if (typeof task.showSubtasks !== 'boolean') task.showSubtasks = task.subtasks.length > 0;

  syncTaskAggregateTimes(task);
}

function syncTaskAggregateTimes(task) {
  if (!task) return;
  const subtaskPlanned = (task.subtasks || []).reduce((sum, subtask) => {
    ensureSubtaskTimeState(subtask);
    return sum + (subtask.plannedMinutes || 0);
  }, 0);
  const subtaskActual = (task.subtasks || []).reduce((sum, subtask) => {
    ensureSubtaskTimeState(subtask);
    return sum + (subtask.actualTimeSeconds || 0);
  }, 0);

  task.timeEstimateMinutes = Math.max(0, (task.ownPlannedMinutes || 0) + subtaskPlanned);
  task.actualTimeSeconds = Math.max(0, (task.ownActualTimeSeconds || 0) + subtaskActual);
}

function findSubtask(task, subtaskId) {
  if (!task || !Array.isArray(task.subtasks)) return null;
  const subtask = task.subtasks.find(s => s.id === subtaskId) || null;
  if (subtask) ensureSubtaskTimeState(subtask);
  return subtask;
}

function createEmptySubtask() {
  return {
    id: uid(),
    label: '',
    done: false,
    plannedMinutes: 0,
    actualTimeSeconds: 0,
    deleteReady: false
  };
}

function getFocusTarget(task) {
  if (!task) return null;
  if (focusState.subtaskId) {
    const subtask = findSubtask(task, focusState.subtaskId);
    if (subtask) {
      return {
        type: 'subtask',
        title: subtask.label || 'Subtask',
        complete: !!subtask.done,
        plannedMinutes: subtask.plannedMinutes || 0,
        actualTimeSeconds: subtask.actualTimeSeconds || 0,
        subtask
      };
    }
  }
  return {
    type: 'task',
    title: task.title || 'Task',
    complete: !!task.complete,
    plannedMinutes: task.timeEstimateMinutes || 0,
    actualTimeSeconds: task.actualTimeSeconds || 0,
    subtask: null
  };
}

function initializeTaskTimeState() {
  state.columns.forEach(col => {
    col.tasks.forEach(task => {
      ensureTaskTimeState(task);
    });
  });
}

function getHourHeightPx(timeGridEl = null) {
  if (!timeGridEl) return DEFAULT_HOUR_HEIGHT_PX;
  const raw = getComputedStyle(timeGridEl).getPropertyValue('--hour-height');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HOUR_HEIGHT_PX;
}

function getCalendarTotalHours(timeGridEl = null) {
  if (!timeGridEl) return DEFAULT_CALENDAR_TOTAL_HOURS;
  const rows = timeGridEl.querySelectorAll('.time-grid__row').length;
  return rows > 0 ? rows : DEFAULT_CALENDAR_TOTAL_HOURS;
}

function clampCalendarOffset(offset, duration = 0, timeGridEl = null) {
  const totalHours = getCalendarTotalHours(timeGridEl);
  const maxOffset = Math.max(0, totalHours - duration);
  return Math.max(0, Math.min(offset, maxOffset));
}

// offset (float hours from grid start) → "HH:MM" 24-hour string
function offsetToScheduledTime(offset) {
  const totalMinutes = Math.round(offset * 60);
  const hour   = CALENDAR_START_HOUR + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// "HH:MM" → float hours from grid start
function scheduledTimeToOffset(scheduledTime) {
  const [h, m] = scheduledTime.split(':').map(Number);
  return (h - CALENDAR_START_HOUR) + m / 60;
}

function formatOffsetAsClock(totalHoursFromGridStart) {
  const totalH = CALENDAR_START_HOUR + totalHoursFromGridStart;
  const h = Math.floor(totalH);
  const m = Math.round((totalHoursFromGridStart % 1) * 60);
  // Handle fractional carry (e.g. 0.99 * 60 rounding)
  const adjH = m === 60 ? h + 1 : h;
  const adjM = m === 60 ? 0 : m;
  const normalizedHour = ((adjH % 24) + 24) % 24;
  const period = normalizedHour < 12 ? 'AM' : 'PM';
  const h12    = normalizedHour % 12 || 12;
  return adjM === 0
    ? `${h12} ${period}`
    : `${h12}:${String(adjM).padStart(2, '0')} ${period}`;
}

function formatOffsetAsClockNoPeriod(totalHoursFromGridStart) {
  const totalH = CALENDAR_START_HOUR + totalHoursFromGridStart;
  const h = Math.floor(totalH);
  const m = Math.round((totalHoursFromGridStart % 1) * 60);
  const adjH = m === 60 ? h + 1 : h;
  const adjM = m === 60 ? 0 : m;
  const normalizedHour = ((adjH % 24) + 24) % 24;
  const h12 = normalizedHour % 12 || 12;
  return `${h12}:${String(adjM).padStart(2, '0')}`;
}

// Format a time range label from grid offsets.
function formatTimeRange(offset, duration) {
  return `${formatOffsetAsClock(offset)} – ${formatOffsetAsClock(offset + duration)}`;
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

// Convert clientY to grid offset in hours (snapped and clamped to visible rows)
function yToOffset(clientY, timeGridEl, duration = 0) {
  const rect = timeGridEl.getBoundingClientRect();
  const hourHeight = getHourHeightPx(timeGridEl);
  const raw  = (clientY - rect.top) / hourHeight;
  const snapped = Math.round(raw * SNAP_STEPS_PER_HOUR) / SNAP_STEPS_PER_HOUR;
  return clampCalendarOffset(snapped, duration, timeGridEl);
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

function clearTaskDraggingClass() {
  if (taskDragClassRaf !== null) {
    cancelAnimationFrame(taskDragClassRaf);
    taskDragClassRaf = null;
  }
  taskDragClassToken += 1;
  document.querySelectorAll('.task-card--dragging').forEach(el => el.classList.remove('task-card--dragging'));
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
  const visibleSubtasks = subtasks.filter(s => String(s?.label || '').trim().length > 0);
  if (!visibleSubtasks.length) return '';
  const items = visibleSubtasks.map(s => `
    <li class="subtask ${s.done ? 'subtask--done' : ''}" data-subtask-id="${escapeHtml(s.id)}">
      <button class="subtask__check" type="button" data-card-subtask-check aria-label="Toggle subtask completion">${CHECK_SVG}</button>
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

function renderTaskDetailSubtaskRow(subtask) {
  ensureSubtaskTimeState(subtask);
  const isRunning = focusState.running && focusState.subtaskId === subtask.id && focusState.taskId === openModalTaskId;
  const actualDisplay = isRunning
    ? formatSeconds(subtask.actualTimeSeconds || 0)
    : formatActualDisplay(subtask.actualTimeSeconds || 0);
  const plannedDisplay = subtask.plannedMinutes ? formatMinutes(subtask.plannedMinutes) : '--:--';
  const hasLabel = !!String(subtask.label || '').trim();

  return `
    <div class="task-modal__subtask-row" data-modal-subtask-row data-modal-subtask-id="${escapeHtml(subtask.id)}">
      <span class="task-modal__subtask-grab" data-modal-subtask-grab><i data-lucide="grip-vertical"></i></span>
      <button class="task-modal__check task-modal__subtask-check ${subtask.done ? 'task-modal__check--complete' : ''}" type="button" data-modal-subtask-check="${escapeHtml(subtask.id)}">${CHECK_SVG}</button>
      <div class="task-modal__subtask-text${hasLabel ? ' task-modal__subtask-text--filled' : ''}" contenteditable="true" draggable="false" data-modal-subtask-label="${escapeHtml(subtask.id)}" data-placeholder="Subtask description...">${hasLabel ? escapeHtml(subtask.label) : ''}</div>
      <div class="task-modal__subtask-actions">
        <button class="task-modal__subtask-action" type="button" data-modal-subtask-detach="${escapeHtml(subtask.id)}" aria-label="Convert to standalone task">
          <i data-lucide="copy"></i>
        </button>
        <button class="task-modal__subtask-action" type="button" data-modal-subtask-play="${escapeHtml(subtask.id)}" aria-label="${isRunning ? 'Pause subtask timer' : 'Start subtask timer'}">
          <i data-lucide="${isRunning ? 'pause' : 'play'}"></i>
        </button>
      </div>
      <button class="task-modal__subtask-time" type="button" data-modal-subtask-actual-btn="${escapeHtml(subtask.id)}">
        <span class="task-modal__subtask-time-value ${isRunning ? 'task-modal__subtask-time-value--running' : (subtask.actualTimeSeconds ? 'task-modal__subtask-time-value--set' : 'task-modal__subtask-time-value--placeholder')}">${actualDisplay}</span>
      </button>
      <button class="task-modal__subtask-time" type="button" data-modal-subtask-planned-btn="${escapeHtml(subtask.id)}">
        <span class="task-modal__subtask-time-value ${subtask.plannedMinutes ? 'task-modal__subtask-time-value--set' : 'task-modal__subtask-time-value--placeholder'}">${plannedDisplay}</span>
      </button>
    </div>
  `;
}

function renderTaskDetailSubtasks(task) {
  ensureTaskTimeState(task);
  if (!task.showSubtasks && task.subtasks.length === 0) return '';

  const rows = task.subtasks.map(renderTaskDetailSubtaskRow).join('');
  return `
    <div class="task-modal__subtasks" data-modal-subtasks>
      <div class="task-modal__subtask-list" data-modal-subtask-list>
        ${rows}
      </div>
      <button class="task-modal__add-subtask" type="button" data-modal-add-subtask>
        <span class="task-modal__add-subtask-icon"><i data-lucide="plus"></i></span>
        <span>Add subtask</span>
      </button>
    </div>
  `;
}

function renderTaskDetailModal(task, column) {
  ensureTaskTimeState(task);
  const rawTag = task.tag ? String(task.tag).trim() : '';
  const hasHash = rawTag.startsWith('#');
  const channelWord = rawTag ? (hasHash ? rawTag.slice(1) : rawTag) : 'general';
  const channelStyle = getChannelStyle(rawTag);
  const hashColor = channelStyle ? channelStyle.hashColor : '#7da2ff';
  const todayISO = getTodayISO();
  const colDate = column.isoDate || todayISO;
  let startLabel;
  if (colDate === todayISO) startLabel = 'Today';
  else if (colDate === addDays(todayISO, 1)) startLabel = 'Tomorrow';
  else startLabel = formatDateDisplay(colDate);

  const actualTime = formatActualDisplay(task.actualTimeSeconds || 0);
  const actualValueClass = hasActualTime(task.actualTimeSeconds)
    ? 'task-modal__metric-value task-modal__metric-value--set'
    : 'task-modal__metric-value task-modal__metric-value--placeholder';
  const plannedTime = formatMinutes(task.timeEstimateMinutes);
  const timelineEntries = [
    `${column.dayName} list task created`,
    task.complete ? 'Marked complete' : 'Marked incomplete',
    task.scheduledTime ? `Scheduled for ${task.scheduledTime}` : 'No scheduled time yet'
  ];
  const timelineHtml = timelineEntries
    .map(entry => `<li class="task-modal__timeline-item">${escapeHtml(entry)}</li>`)
    .join('');

  return `
    <div class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <div class="task-modal__header">
        <div class="task-modal__meta-group">
          <span class="task-modal__meta-label">CHANNEL</span>
          <span class="task-modal__channel">
            ${hasHash ? `<span class="task-modal__channel-hash" style="color:${escapeHtml(hashColor)};">#</span>` : ''}
            <span class="task-modal__channel-word">${escapeHtml(channelWord)}</span>
          </span>
        </div>
        <div class="task-modal__meta-right">
          <div class="task-modal__meta-group task-modal__meta-group--start">
            <span class="task-modal__meta-label">START</span>
            <button class="task-modal__meta-start-btn" type="button">${escapeHtml(startLabel)}</button>
          </div>
          ${task.dueDate ? `<div class="task-modal__meta-group task-modal__due-wrap">
            <span class="task-modal__meta-label">DUE</span>
            <button class="task-modal__meta-start-btn${task.dueDate < todayISO ? ' task-modal__meta-start-btn--overdue' : ''}" type="button" data-due-btn>${escapeHtml(task.dueDate === todayISO ? 'Today' : formatDateDisplay(task.dueDate))}</button>
          </div>` : ''}
          <div class="task-modal__top-actions">
            ${!task.dueDate ? '<div class="task-modal__due-wrap"><button class="task-modal__top-action" type="button" data-due-btn><i data-lucide="calendar"></i><span>Due</span></button></div>' : ''}
            <button class="task-modal__top-action" type="button" data-modal-add-two-subtasks><i data-lucide="plus"></i><span>Subtasks</span></button>
            <button class="task-modal__top-action task-modal__top-action--icon" type="button" aria-label="More"><i data-lucide="ellipsis"></i></button>
            <button class="task-modal__top-action task-modal__top-action--icon" type="button" aria-label="Expand" data-expand-btn><i data-lucide="maximize-2"></i></button>
            <button class="task-modal__top-action task-modal__top-action--icon" type="button" aria-label="Close details" data-task-modal-close><i data-lucide="x"></i></button>
          </div>
        </div>
      </div>

      <div class="task-modal__body">
        <div class="task-modal__hero">
          <div class="task-modal__title-wrap">
            <button class="task-modal__check ${task.complete ? 'task-modal__check--complete' : ''}" type="button" data-modal-check>${CHECK_SVG}</button>
            <h2 class="task-modal__title" id="task-modal-title" contenteditable="true">${escapeHtml(task.title)}</h2>
          </div>
          <div class="task-modal__hero-right">
            <button class="task-modal__start-btn" type="button">
              <i data-lucide="play"></i>
              <span>START</span>
            </button>
            <div class="task-modal__metric task-modal__metric--actual" data-actual-btn>
              <span class="task-modal__metric-label">ACTUAL</span>
              <span class="${actualValueClass}">${actualTime}</span>
            </div>
            <div class="task-modal__metric task-modal__metric--planned" data-planned-btn>
              <span class="task-modal__metric-label">PLANNED</span>
              <span class="task-modal__metric-value ${task.timeEstimateMinutes ? 'task-modal__metric-value--set' : 'task-modal__metric-value--placeholder'}">${task.timeEstimateMinutes ? escapeHtml(plannedTime) : '--:--'}</span>
            </div>
          </div>
        </div>

        ${renderTaskDetailSubtasks(task)}

        <div class="task-modal__notes" contenteditable="true" data-placeholder="Notes..." aria-label="Task notes">${task.notes ? escapeHtml(task.notes) : ''}</div>

        <div class="task-modal__divider"></div>

        <div class="task-modal__timeline">
          <ul class="task-modal__timeline-list">
            ${timelineHtml}
          </ul>
        </div>
      </div>
    </div>
  `;
}

/* ── Shared Calendar Grid ──────────────────── */

function renderCalendarGrid(selectedIsoDate, viewYear, viewMonth) {
  const todayISO = getTodayISO();
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(viewYear, viewMonth, 1 - mondayOffset, 12);

  const calendarRows = [];
  for (let row = 0; row < 6; row++) {
    const tds = [];
    let allOutside = true;
    for (let col = 0; col < 7; col++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + row * 7 + col);
      const iso = toISO(d);
      const inMonth = d.getMonth() === viewMonth;
      if (inMonth) allOutside = false;
      let cls = 'sdp-cal__day';
      if (!inMonth) cls += ' sdp-cal__day--outside';
      if (iso === todayISO) cls += ' sdp-cal__day--today';
      if (iso === selectedIsoDate) cls += ' sdp-cal__day--selected';
      tds.push(`<td><button class="${cls}" type="button" data-date="${iso}">${d.getDate()}</button></td>`);
    }
    if (row > 4 && allOutside) break;
    calendarRows.push(`<tr>${tds.join('')}</tr>`);
  }

  return `
    <div class="sdp-cal">
      <div class="sdp-cal__nav">
        <button class="sdp-cal__nav-btn" data-cal-prev type="button">
          <i data-lucide="chevron-left"></i>
        </button>
        <span class="sdp-cal__month-label">${monthNames[viewMonth]} ${viewYear}</span>
        <button class="sdp-cal__nav-btn" data-cal-next type="button">
          <i data-lucide="chevron-right"></i>
        </button>
      </div>
      <table class="sdp-cal__grid">
        <thead>
          <tr><th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th><th>S</th></tr>
        </thead>
        <tbody>${calendarRows.join('')}</tbody>
      </table>
    </div>
  `;
}

/* ── Start Date Picker Dropdown ─────────────── */

function renderStartDateDropdown(currentIsoDate, viewYear, viewMonth) {
  return `
    <div class="start-date-picker" data-sdp>
      <div class="sdp__arrow"></div>
      <div class="sdp__section">
        <span class="sdp__section-label">Move:</span>
        <button class="sdp__menu-item" data-action="snooze-day" type="button">
          <span>Snooze one day</span><kbd class="sdp__shortcut">D</kbd>
        </button>
        <button class="sdp__menu-item" data-action="snooze-week" type="button">
          <span>Snooze one week</span>
        </button>
        <button class="sdp__menu-item" data-action="move-backlog" type="button">
          <span>Move to backlog</span><kbd class="sdp__shortcut">Z</kbd>
        </button>
        <button class="sdp__menu-item" data-action="move-top-backlog" type="button">
          <span>Move to top of backlog</span>
          <span class="sdp__shortcut-group"><kbd class="sdp__shortcut">\u21E7</kbd><kbd class="sdp__shortcut">Z</kbd></span>
        </button>
      </div>
      <div class="sdp__divider"></div>
      <div class="sdp__section">
        <span class="sdp__section-label">Start date:</span>
        ${renderCalendarGrid(currentIsoDate, viewYear, viewMonth)}
      </div>
    </div>
  `;
}

function renderTopbarTodayDropdown(selectedIsoDate, viewYear, viewMonth) {
  return `
    <div class="start-date-picker topbar-date-picker" data-topbar-sdp>
      <div class="sdp__arrow"></div>
      <div class="sdp__section">
        <button class="sdp__menu-item" data-action="go-today" type="button">
          <span>Go to today</span>
        </button>
        <button class="sdp__menu-item" data-action="go-next-day" type="button">
          <span>Go to next day</span>
        </button>
        <button class="sdp__menu-item" data-action="go-previous-day" type="button">
          <span>Go to previous day</span>
        </button>
      </div>
      <div class="sdp__divider"></div>
      <div class="sdp__section">
        ${renderCalendarGrid(selectedIsoDate, viewYear, viewMonth)}
      </div>
    </div>
  `;
}

/* ── Due Date Picker Dropdown ─────────────── */

function renderDueDateDropdown(currentDueDate, viewYear, viewMonth) {
  const removeHtml = currentDueDate ? `
      <div class="sdp__divider"></div>
      <div class="sdp__section">
        <button class="sdp__menu-item" data-action="remove-due" type="button">
          <span>Remove due date</span>
        </button>
      </div>` : '';

  return `
    <div class="due-date-picker" data-ddp>
      <div class="sdp__arrow"></div>
      <div class="sdp__section">
        <span class="sdp__section-label">Due date:</span>
        ${renderCalendarGrid(currentDueDate, viewYear, viewMonth)}
      </div>${removeHtml}
    </div>
  `;
}

let startDatePickerState = null;
let topbarTodayPickerState = null; // { selectedIsoDate, viewYear, viewMonth }

function openStartDatePicker(taskId) {
  closeDueDatePicker();
  const ctx = findTaskContext(taskId);
  if (!ctx) return;
  const today = new Date();
  startDatePickerState = {
    taskId,
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth()
  };
  renderStartDatePickerInModal();
}

function closeStartDatePicker() {
  startDatePickerState = null;
  const existing = document.querySelector('[data-sdp]');
  if (existing) existing.remove();
}

function renderStartDatePickerInModal() {
  if (!startDatePickerState) return;
  const ctx = findTaskContext(startDatePickerState.taskId);
  if (!ctx) return;

  const currentIsoDate = ctx.column.isoDate || getTodayISO();

  const existing = document.querySelector('[data-sdp]');
  if (existing) existing.remove();

  const overlay = document.getElementById('task-modal-overlay');
  const startBtn = overlay.querySelector('.task-modal__meta-start-btn');
  if (!startBtn) return;

  const metaGroup = startBtn.closest('.task-modal__meta-group');
  if (!metaGroup) return;
  metaGroup.classList.add('task-modal__meta-group--start');

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderStartDateDropdown(
    currentIsoDate,
    startDatePickerState.viewYear,
    startDatePickerState.viewMonth
  );
  const dropdown = wrapper.firstElementChild;
  metaGroup.appendChild(dropdown);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function handleStartDateAction(action, data) {
  if (!startDatePickerState) return;
  const taskId = startDatePickerState.taskId;
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  const currentIsoDate = ctx.column.isoDate || getTodayISO();
  let targetDate = null;

  switch (action) {
    case 'snooze-day':
      targetDate = addDays(currentIsoDate, 1);
      break;
    case 'snooze-week':
      targetDate = addDays(currentIsoDate, 7);
      break;
    case 'select-date':
      targetDate = data;
      break;
    default:
      break;
  }

  if (targetDate) {
    moveTaskToDate(taskId, targetDate);

    const overlay = document.getElementById('task-modal-overlay');
    const startBtn = overlay.querySelector('.task-modal__meta-start-btn');
    if (startBtn) {
      const todayISO = getTodayISO();
      if (targetDate === todayISO) {
        startBtn.textContent = 'Today';
      } else if (targetDate === addDays(todayISO, 1)) {
        startBtn.textContent = 'Tomorrow';
      } else {
        startBtn.textContent = formatDateDisplay(targetDate);
      }
    }
  }

  closeStartDatePicker();
}

/* ── Card-Level Start Date Picker (hover icon) ─ */

let cardDatePickerState = null; // { taskId, viewYear, viewMonth }

function openCardDatePicker(taskId) {
  closeCardDatePicker();
  const ctx = findTaskContext(taskId);
  if (!ctx) return;
  const today = new Date();
  cardDatePickerState = {
    taskId,
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth()
  };
  // Keep hover icons visible while picker is open
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (card) card.classList.add('task-card--picker-open');
  renderCardDatePicker();
}

function closeCardDatePicker() {
  if (cardDatePickerState) {
    const card = document.querySelector(`.task-card[data-task-id="${cardDatePickerState.taskId}"]`);
    if (card) card.classList.remove('task-card--picker-open');
  }
  cardDatePickerState = null;
  const existing = document.querySelector('[data-card-sdp]');
  if (existing) existing.remove();
}

function renderCardDatePicker() {
  if (!cardDatePickerState) return;
  const ctx = findTaskContext(cardDatePickerState.taskId);
  if (!ctx) return;

  const existing = document.querySelector('[data-card-sdp]');
  if (existing) existing.remove();

  const currentIsoDate = ctx.column.isoDate || getTodayISO();

  const card = document.querySelector(`.task-card[data-task-id="${cardDatePickerState.taskId}"]`);
  if (!card) return;

  const dateBtn = card.querySelector('[data-card-date-btn]');
  if (!dateBtn) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderStartDateDropdown(
    currentIsoDate,
    cardDatePickerState.viewYear,
    cardDatePickerState.viewMonth
  );
  const dropdown = wrapper.firstElementChild;
  dropdown.setAttribute('data-card-sdp', '');

  // Position absolutely from the footer so it overlays without pushing the timer area
  const footer = card.querySelector('.task-card__footer');
  if (!footer) return;
  footer.style.position = 'relative';

  dropdown.style.position = 'absolute';
  dropdown.style.top = '100%';
  dropdown.style.marginTop = '12px';
  dropdown.style.zIndex = '6000';
  dropdown.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15), 0 1px 4px rgba(0, 0, 0, 0.1)';

  // Center the dropdown under the card
  const cardWidth = card.offsetWidth;
  const ddWidth = 260; // dropdown width from CSS
  dropdown.style.left = (-12 + (cardWidth - ddWidth) / 2) + 'px'; // -12 accounts for card padding
  dropdown.style.width = ddWidth + 'px';

  footer.appendChild(dropdown);

  // Position arrow to point at the calendar button
  const arrow = dropdown.querySelector('.sdp__arrow');
  if (arrow) {
    const btnRect = dateBtn.getBoundingClientRect();
    const ddRect = dropdown.getBoundingClientRect();
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const arrowLeft = btnCenterX - ddRect.left - 6; // 6 = half arrow width
    arrow.style.left = Math.max(8, arrowLeft) + 'px';
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Scroll the column so the dropdown is fully visible
  requestAnimationFrame(() => {
    const ddRect = dropdown.getBoundingClientRect();
    const col = card.closest('.day-column');
    if (col) {
      const colRect = col.getBoundingClientRect();
      if (ddRect.bottom > colRect.bottom) {
        col.scrollTop += ddRect.bottom - colRect.bottom + 8;
      }
    }
  });
}

function handleCardDateAction(action, data) {
  if (!cardDatePickerState) return;
  const taskId = cardDatePickerState.taskId;
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  const currentIsoDate = ctx.column.isoDate || getTodayISO();
  let targetDate = null;

  switch (action) {
    case 'snooze-day':
      targetDate = addDays(currentIsoDate, 1);
      break;
    case 'snooze-week':
      targetDate = addDays(currentIsoDate, 7);
      break;
    case 'select-date':
      targetDate = data;
      break;
    default:
      break;
  }

  if (targetDate) {
    moveTaskToDate(taskId, targetDate);
  }

  closeCardDatePicker();
}

/* ── Due Date Picker Toggle ────────────────── */

let dueDatePickerState = null;

function openDueDatePicker(taskId) {
  closeStartDatePicker();
  const ctx = findTaskContext(taskId);
  if (!ctx) return;
  const today = new Date();
  dueDatePickerState = {
    taskId,
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth()
  };
  renderDueDatePickerInModal();
}

function closeDueDatePicker() {
  dueDatePickerState = null;
  const existing = document.querySelector('[data-ddp]');
  if (existing) existing.remove();
}

function renderDueDatePickerInModal() {
  if (!dueDatePickerState) return;
  const ctx = findTaskContext(dueDatePickerState.taskId);
  if (!ctx) return;

  const currentDueDate = ctx.task.dueDate || null;

  const existing = document.querySelector('[data-ddp]');
  if (existing) existing.remove();

  const overlay = document.getElementById('task-modal-overlay');
  const dueBtn = overlay.querySelector('[data-due-btn]');
  if (!dueBtn) return;

  const dueWrap = dueBtn.closest('.task-modal__due-wrap');
  if (!dueWrap) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderDueDateDropdown(
    currentDueDate,
    dueDatePickerState.viewYear,
    dueDatePickerState.viewMonth
  );
  const dropdown = wrapper.firstElementChild;
  dueWrap.appendChild(dropdown);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function handleDueDateAction(isoDate) {
  if (!dueDatePickerState) return;
  const taskId = dueDatePickerState.taskId;
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  ctx.task.dueDate = isoDate;
  closeDueDatePicker();

  // Re-render modal to update layout (DUE label + button position changes)
  openTaskDetailModal(taskId);
}

function handleRemoveDueDate() {
  if (!dueDatePickerState) return;
  const taskId = dueDatePickerState.taskId;
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  ctx.task.dueDate = null;
  closeDueDatePicker();

  // Re-render modal to remove DUE label and move button back to top-actions
  openTaskDetailModal(taskId);
}

/* ── Planned Time Picker ──────────────────── */

let plannedPickerOpen = false;
let plannedPickerEditMode = false; // true = time entry mode
let plannedPickerSubtaskId = null;

const PLANNED_TIME_OPTIONS = [
  { label: '5 min',  minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '20 min', minutes: 20 },
  { label: '25 min', minutes: 25 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hr',   minutes: 60 },
];

function closePlannedPicker() {
  plannedPickerOpen = false;
  plannedPickerEditMode = false;
  plannedPickerSubtaskId = null;
  const existing = document.querySelector('[data-planned-picker]');
  if (existing) existing.remove();
}

function openPlannedPicker(subtaskId = null) {
  plannedPickerOpen = true;
  plannedPickerEditMode = false;
  plannedPickerSubtaskId = subtaskId;
  renderPlannedPickerInModal();
}

function getPlannedDateLabel(column) {
  const todayISO = getTodayISO();
  const colDate = column.isoDate || todayISO;
  if (colDate === todayISO) return 'today';
  if (colDate === addDays(todayISO, 1)) return 'tomorrow';
  return formatDateDisplay(colDate);
}

function attachPickerInputColorListeners(dropdown) {
  const inputs = dropdown.querySelectorAll('.planned-picker__input');
  const colon = dropdown.querySelector('.planned-picker__colon');
  function update() {
    const hasTyped = Array.from(inputs).some(inp => parseInt(inp.value, 10) > 0);
    inputs.forEach(inp => inp.classList.toggle('planned-picker__input--has-value', hasTyped));
    if (colon) colon.classList.toggle('planned-picker__colon--has-value', hasTyped);
  }
  inputs.forEach(inp => inp.addEventListener('input', update));
}

function renderPlannedPickerInModal() {
  if (!openModalTaskId) return;
  const ctx = findTaskContext(openModalTaskId);
  if (!ctx) return;
  const task = ctx.task;
  const subtask = plannedPickerSubtaskId ? findSubtask(task, plannedPickerSubtaskId) : null;

  const existing = document.querySelector('[data-planned-picker]');
  if (existing) existing.remove();

  const overlay = document.getElementById('task-modal-overlay');
  const metricEl = subtask
    ? overlay.querySelector(`[data-modal-subtask-planned-btn="${plannedPickerSubtaskId}"]`)
    : overlay.querySelector('[data-planned-btn]');
  if (!metricEl) return;

  const currentMins = subtask ? (subtask.plannedMinutes || 0) : (task.timeEstimateMinutes || 0);
  const currentFormatted = currentMins ? formatMinutes(currentMins) : '--:--';
  const dateLabel = getPlannedDateLabel(ctx.column);

  let html;
  if (plannedPickerEditMode) {
    // Time entry mode
    const h = Math.floor(currentMins / 60);
    const m = currentMins % 60;
    const hasVal = currentMins > 0;
    const valClass = hasVal ? ' planned-picker__input--has-value' : '';
    const colonClass = hasVal ? ' planned-picker__colon--has-value' : '';
    html = `
      <div class="planned-picker" data-planned-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Planned (${escapeHtml(dateLabel)}):</div>
        <div class="planned-picker__time-entry">
          <input class="planned-picker__input planned-picker__input--hours${valClass}" type="text" maxlength="2" value="${h}" data-planned-hours>
          <span class="planned-picker__colon${colonClass}">:</span>
          <input class="planned-picker__input${valClass}" type="text" maxlength="2" value="${String(m).padStart(2, '0')}" data-planned-mins>
        </div>
        <div class="planned-picker__hint">↵ Return to save</div>
      </div>
    `;
  } else {
    // Quick-select mode
    const optionsHtml = PLANNED_TIME_OPTIONS.map(opt => {
      const isSelected = currentMins === opt.minutes;
      return `<button class="planned-picker__option${isSelected ? ' planned-picker__option--selected' : ''}" type="button" data-planned-minutes="${opt.minutes}">
        <span>${opt.label}</span>
        ${isSelected ? '<span class="planned-picker__check">✓</span>' : ''}
      </button>`;
    }).join('');

    const clearHtml = currentMins
      ? '<div class="planned-picker__divider"></div><button class="planned-picker__clear" type="button" data-planned-clear>Clear planned</button>'
      : '';

    html = `
      <div class="planned-picker" data-planned-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Planned (${escapeHtml(dateLabel)}):</div>
        <button class="planned-picker__time-display" type="button" data-planned-edit-mode>${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        ${optionsHtml}
        ${clearHtml}
      </div>
    `;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const dropdown = wrapper.firstElementChild;
  metricEl.style.position = 'relative';
  metricEl.appendChild(dropdown);

  if (plannedPickerEditMode) {
    attachPickerInputColorListeners(dropdown);
    const hoursInput = dropdown.querySelector('[data-planned-hours]');
    if (hoursInput) {
      hoursInput.focus();
      hoursInput.select();
    }
  }
}

function applyPlannedTime(minutes) {
  if (!openModalTaskId) return;
  const ctx = findTaskContext(openModalTaskId);
  if (!ctx) return;
  const task = ctx.task;
  const subtask = plannedPickerSubtaskId ? findSubtask(task, plannedPickerSubtaskId) : null;

  if (subtask) {
    subtask.plannedMinutes = minutes;
    subtask.deleteReady = false;
  } else {
    const subtaskPlanned = task.subtasks.reduce((sum, s) => sum + (s.plannedMinutes || 0), 0);
    task.ownPlannedMinutes = Math.max(0, minutes - subtaskPlanned);
  }
  syncTaskAggregateTimes(task);
  closePlannedPicker();
  const overlay = document.getElementById('task-modal-overlay');
  const parentMetricEl = overlay.querySelector('[data-planned-btn] .task-modal__metric-value');
  if (parentMetricEl) {
    if (task.timeEstimateMinutes) {
      parentMetricEl.textContent = formatMinutes(task.timeEstimateMinutes);
      parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--set';
    } else {
      parentMetricEl.textContent = '--:--';
      parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--placeholder';
    }
  }

  if (subtask) {
    const subtaskMetricEl = overlay.querySelector(`[data-modal-subtask-planned-btn="${subtask.id}"] .task-modal__subtask-time-value`);
    if (subtaskMetricEl) {
      if (subtask.plannedMinutes) {
        subtaskMetricEl.textContent = formatMinutes(subtask.plannedMinutes);
        subtaskMetricEl.className = 'task-modal__subtask-time-value task-modal__subtask-time-value--set';
      } else {
        subtaskMetricEl.textContent = '--:--';
        subtaskMetricEl.className = 'task-modal__subtask-time-value task-modal__subtask-time-value--placeholder';
      }
    }
  }

  if (ctx.column) renderColumn(ctx.column);
}

function handlePlannedTimeEntry() {
  const picker = document.querySelector('[data-planned-picker]');
  if (!picker) return;
  const hInput = picker.querySelector('[data-planned-hours]');
  const mInput = picker.querySelector('[data-planned-mins]');
  if (!hInput || !mInput) return;
  const h = parseInt(hInput.value, 10) || 0;
  const m = parseInt(mInput.value, 10) || 0;
  const total = h * 60 + m;
  applyPlannedTime(total);
}

/* ─── Actual Time Picker ─── */
let actualPickerOpen = false;
let actualPickerEditMode = false;
let actualPickerSubtaskId = null;

const ACTUAL_TIME_OPTIONS = [
  { label: '5 min',  minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '20 min', minutes: 20 },
  { label: '25 min', minutes: 25 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hr',   minutes: 60 },
];

function closeActualPicker() {
  actualPickerOpen = false;
  actualPickerEditMode = false;
  actualPickerSubtaskId = null;
  const existing = document.querySelector('[data-actual-picker]');
  if (existing) existing.remove();
}

function openActualPicker(subtaskId = null) {
  actualPickerOpen = true;
  actualPickerEditMode = false;
  actualPickerSubtaskId = subtaskId;
  renderActualPickerInModal();
}

function getActualDateLabel(column) {
  const todayISO = getTodayISO();
  const colDate = column.isoDate || todayISO;
  if (colDate === todayISO) return 'today';
  if (colDate === addDays(todayISO, 1)) return 'tomorrow';
  return formatDateDisplay(colDate);
}

function renderActualPickerInModal() {
  if (!openModalTaskId) return;
  const ctx = findTaskContext(openModalTaskId);
  if (!ctx) return;
  const task = ctx.task;
  const subtask = actualPickerSubtaskId ? findSubtask(task, actualPickerSubtaskId) : null;

  const existing = document.querySelector('[data-actual-picker]');
  if (existing) existing.remove();

  const overlay = document.getElementById('task-modal-overlay');
  const metricEl = subtask
    ? overlay.querySelector(`[data-modal-subtask-actual-btn="${actualPickerSubtaskId}"]`)
    : overlay.querySelector('[data-actual-btn]');
  if (!metricEl) return;

  const currentSeconds = subtask ? (subtask.actualTimeSeconds || 0) : (task.actualTimeSeconds || 0);
  const currentMins = currentSeconds ? Math.floor(currentSeconds / 60) : 0;
  const hasCurrentActual = hasActualTime(currentSeconds);
  const currentFormatted = hasCurrentActual ? formatMinutes(currentMins) : '--:--';
  const dateLabel = getActualDateLabel(ctx.column);

  let html;
  if (actualPickerEditMode) {
    const h = Math.floor(currentMins / 60);
    const m = currentMins % 60;
    const hasVal = hasCurrentActual;
    const valClass = hasVal ? ' planned-picker__input--has-value' : '';
    const colonClass = hasVal ? ' planned-picker__colon--has-value' : '';
    html = `
      <div class="planned-picker" data-actual-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Actual (${escapeHtml(dateLabel)}):</div>
        <div class="planned-picker__time-entry">
          <input class="planned-picker__input planned-picker__input--hours${valClass}" type="text" maxlength="2" value="${h}" data-actual-hours>
          <span class="planned-picker__colon${colonClass}">:</span>
          <input class="planned-picker__input${valClass}" type="text" maxlength="2" value="${String(m).padStart(2, '0')}" data-actual-mins>
        </div>
        <div class="planned-picker__hint">↵ Return to save</div>
      </div>
    `;
  } else {
    const optionsHtml = ACTUAL_TIME_OPTIONS.map(opt => {
      const isSelected = currentMins === opt.minutes;
      return `<button class="planned-picker__option${isSelected ? ' planned-picker__option--selected' : ''}" type="button" data-actual-minutes="${opt.minutes}">
        <span>${opt.label}</span>
        ${isSelected ? '<span class="planned-picker__check">✓</span>' : ''}
      </button>`;
    }).join('');

    const clearHtml = hasCurrentActual
      ? '<div class="planned-picker__divider"></div><button class="planned-picker__clear" type="button" data-actual-clear>Clear actual</button>'
      : '';

    html = `
      <div class="planned-picker" data-actual-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Actual (${escapeHtml(dateLabel)}):</div>
        <button class="planned-picker__time-display" type="button" data-actual-edit-mode>${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        ${optionsHtml}
        ${clearHtml}
      </div>
    `;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const dropdown = wrapper.firstElementChild;
  metricEl.style.position = 'relative';
  metricEl.appendChild(dropdown);

  if (actualPickerEditMode) {
    attachPickerInputColorListeners(dropdown);
    const hoursInput = dropdown.querySelector('[data-actual-hours]');
    if (hoursInput) {
      hoursInput.focus();
      hoursInput.select();
    }
  }
}

function applyActualTime(minutes) {
  if (!openModalTaskId) return;
  const ctx = findTaskContext(openModalTaskId);
  if (!ctx) return;
  const task = ctx.task;
  const subtask = actualPickerSubtaskId ? findSubtask(task, actualPickerSubtaskId) : null;

  if (subtask) {
    subtask.actualTimeSeconds = minutes * 60;
    subtask.deleteReady = false;
  } else {
    const subtaskActual = task.subtasks.reduce((sum, s) => sum + (s.actualTimeSeconds || 0), 0);
    task.ownActualTimeSeconds = Math.max(0, minutes * 60 - subtaskActual);
  }
  syncTaskAggregateTimes(task);

  closeActualPicker();
  const overlay = document.getElementById('task-modal-overlay');
  const parentMetricEl = overlay.querySelector('[data-actual-btn] .task-modal__metric-value');
  if (parentMetricEl) {
    if (task.actualTimeSeconds) {
      parentMetricEl.textContent = formatMinutes(Math.floor(task.actualTimeSeconds / 60));
      parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--set';
    } else {
      parentMetricEl.textContent = '--:--';
      parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--placeholder';
    }
  }

  if (subtask) {
    const subtaskMetricEl = overlay.querySelector(`[data-modal-subtask-actual-btn="${subtask.id}"] .task-modal__subtask-time-value`);
    if (subtaskMetricEl) {
      if (subtask.actualTimeSeconds) {
        subtaskMetricEl.textContent = formatMinutes(Math.floor(subtask.actualTimeSeconds / 60));
        subtaskMetricEl.className = 'task-modal__subtask-time-value task-modal__subtask-time-value--set';
      } else {
        subtaskMetricEl.textContent = '--:--';
        subtaskMetricEl.className = 'task-modal__subtask-time-value task-modal__subtask-time-value--placeholder';
      }
    }
  }
  if (ctx.column) renderColumn(ctx.column);
}

function handleActualTimeEntry() {
  const picker = document.querySelector('[data-actual-picker]');
  if (!picker) return;
  const hInput = picker.querySelector('[data-actual-hours]');
  const mInput = picker.querySelector('[data-actual-mins]');
  if (!hInput || !mInput) return;
  const h = parseInt(hInput.value, 10) || 0;
  const m = parseInt(mInput.value, 10) || 0;
  const total = h * 60 + m;
  applyActualTime(total);
}

/* ═══════════════════════════════════════════════
   FOCUS MODE
═══════════════════════════════════════════════ */
let focusState = { taskId: null, subtaskId: null, running: false, intervalId: null, enteredFrom: null };
let cardTimerExpanded = new Set(); // taskIds with expanded timer dropdown on kanban card
let cardPickerState = null; // { taskId, type: 'actual'|'planned', editMode: false }
let focusPickerState = null; // { type: 'actual'|'planned', editMode: false, subtaskId: string|null }
let focusEscKeyHandler = null;

function removeFocusEscKeyHandler() {
  if (!focusEscKeyHandler) return;
  document.removeEventListener('keydown', focusEscKeyHandler);
  focusEscKeyHandler = null;
}

function focusSubtaskTitleInput(subtaskId) {
  const focusEl = document.getElementById('focus-modal');
  if (!focusEl || !subtaskId) return;
  const input = focusEl.querySelector(`[data-focus-subtask-title="${subtaskId}"]`);
  if (!(input instanceof HTMLElement)) return;
  input.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function rerenderFocusModal(focusSubtaskId = null) {
  if (!focusState.taskId) return;
  const task = findTaskById(focusState.taskId);
  if (!task) return;
  renderFocusModal(task, focusState.running);
  if (focusSubtaskId) {
    requestAnimationFrame(() => focusSubtaskTitleInput(focusSubtaskId));
  }
}

function closeCardPicker() {
  cardPickerState = null;
  const existing = document.querySelector('[data-card-picker]');
  if (existing) existing.remove();
}

function openCardPicker(taskId, type) {
  closeCardPicker();
  cardPickerState = { taskId, type, editMode: false };
  renderCardPicker();
}

function renderCardPicker() {
  if (!cardPickerState) return;
  const { taskId, type, editMode } = cardPickerState;
  const task = findTaskById(taskId);
  if (!task) return;

  const existing = document.querySelector('[data-card-picker]');
  if (existing) existing.remove();

  const btnAttr = type === 'actual' ? 'data-card-actual-picker-btn' : 'data-card-planned-picker-btn';
  const metricEl = document.querySelector(`.task-card[data-task-id="${taskId}"] [${btnAttr}]`);
  if (!metricEl) return;

  const isActual = type === 'actual';
  const currentSeconds = task.actualTimeSeconds || 0;
  const hasCurrentActual = isActual && hasActualTime(currentSeconds);
  const currentMins = isActual
    ? Math.floor(currentSeconds / 60)
    : (task.timeEstimateMinutes || 0);
  const currentFormatted = (isActual ? hasCurrentActual : currentMins > 0) ? formatMinutes(currentMins) : '--:--';
  const options = isActual ? ACTUAL_TIME_OPTIONS : PLANNED_TIME_OPTIONS;
  const label = isActual ? 'Actual' : 'Planned';
  const clearLabel = isActual ? 'Clear actual' : 'Clear planned';

  let html;
  if (editMode) {
    const h = Math.floor(currentMins / 60);
    const m = currentMins % 60;
    const hasVal = isActual ? hasCurrentActual : currentMins > 0;
    html = `
      <div class="planned-picker" data-card-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">${label}:</div>
        <div class="planned-picker__time-entry">
          <input class="planned-picker__input planned-picker__input--hours${hasVal ? ' planned-picker__input--has-value' : ''}" type="text" maxlength="2" value="${h}" data-card-picker-hours>
          <span class="planned-picker__colon${hasVal ? ' planned-picker__colon--has-value' : ''}">:</span>
          <input class="planned-picker__input${hasVal ? ' planned-picker__input--has-value' : ''}" type="text" maxlength="2" value="${String(m).padStart(2, '0')}" data-card-picker-mins>
        </div>
        <div class="planned-picker__hint">↵ Return to save</div>
      </div>
    `;
  } else {
    const optionsHtml = options.map(opt => {
      const isSelected = currentMins === opt.minutes;
      return `<button class="planned-picker__option${isSelected ? ' planned-picker__option--selected' : ''}" type="button" data-card-picker-minutes="${opt.minutes}">
        <span>${opt.label}</span>
        ${isSelected ? '<span class="planned-picker__check">✓</span>' : ''}
      </button>`;
    }).join('');

    const clearHtml = (isActual ? hasCurrentActual : currentMins > 0)
      ? `<div class="planned-picker__divider"></div><button class="planned-picker__clear" type="button" data-card-picker-clear>${clearLabel}</button>`
      : '';

    html = `
      <div class="planned-picker" data-card-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">${label}:</div>
        <button class="planned-picker__time-display" type="button" data-card-picker-edit>${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        ${optionsHtml}
        ${clearHtml}
      </div>
    `;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const dropdown = wrapper.firstElementChild;
  metricEl.style.position = 'relative';
  metricEl.appendChild(dropdown);

  if (editMode) {
    attachPickerInputColorListeners(dropdown);
    const hoursInput = dropdown.querySelector('[data-card-picker-hours]');
    if (hoursInput) { hoursInput.focus(); hoursInput.select(); }
  }

  // Scroll column so the picker is fully visible
  requestAnimationFrame(() => {
    const ddRect = dropdown.getBoundingClientRect();
    const colEl = metricEl.closest('.day-column');
    if (colEl) {
      const colRect = colEl.getBoundingClientRect();
      if (ddRect.bottom > colRect.bottom) {
        colEl.scrollTop += ddRect.bottom - colRect.bottom + 8;
      }
    }
  });
}

function applyCardPickerTime(minutes) {
  if (!cardPickerState) return;
  const { taskId, type } = cardPickerState;
  const task = findTaskById(taskId);
  if (!task) return;

  if (type === 'actual') {
    const subtaskActual = task.subtasks.reduce((sum, s) => sum + (s.actualTimeSeconds || 0), 0);
    task.ownActualTimeSeconds = Math.max(0, minutes * 60 - subtaskActual);
  } else {
    const subtaskPlanned = task.subtasks.reduce((sum, s) => sum + (s.plannedMinutes || 0), 0);
    task.ownPlannedMinutes = Math.max(0, minutes - subtaskPlanned);
  }
  syncTaskAggregateTimes(task);

  closeCardPicker();
  const col = state.columns.find(c => c.tasks.some(t => t.id === taskId));
  if (col) renderColumn(col);
}

function handleCardPickerTimeEntry() {
  const picker = document.querySelector('[data-card-picker]');
  if (!picker) return;
  const hInput = picker.querySelector('[data-card-picker-hours]');
  const mInput = picker.querySelector('[data-card-picker-mins]');
  if (!hInput || !mInput) return;
  const h = parseInt(hInput.value, 10) || 0;
  const m = parseInt(mInput.value, 10) || 0;
  applyCardPickerTime(h * 60 + m);
}

function formatSeconds(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function openFocusMode(taskId, autoStart, from, subtaskId = null) {
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  focusState.taskId = taskId;
  focusState.subtaskId = subtaskId;
  focusState.enteredFrom = from || 'kanban';
  // Hide card detail modal but keep it in DOM for returning later
  const overlay = document.getElementById('task-modal-overlay');
  if (overlay && !overlay.hidden) {
    if (focusState.enteredFrom === 'card-detail') {
      overlay.hidden = true;
    } else {
      // Entered from kanban — close card detail fully
      closeTaskDetailModal();
    }
  }

  renderFocusModal(ctx.task, autoStart);
  if (autoStart) startFocusTimer();
}

function closeFocusMode() {
  closeFocusPicker();
  removeFocusEscKeyHandler();
  saveFocusModalEdits();
  const taskId = focusState.taskId;
  const enteredFrom = focusState.enteredFrom;
  const el = document.getElementById('focus-modal');
  if (el) el.remove();

  if (taskId && enteredFrom === 'card-detail') {
    // Return to card detail modal
    const overlay = document.getElementById('task-modal-overlay');
    const ctx = findTaskContext(taskId);
    if (ctx && overlay) {
      openModalTaskId = taskId;
      overlay.innerHTML = renderTaskDetailModal(ctx.task, ctx.column);
      overlay.hidden = false;
      document.body.classList.add('modal-open');
      if (typeof lucide !== 'undefined') lucide.createIcons();
      if (focusState.running) {
        updateCardDetailTimerState();
      }
    }
  } else if (taskId && focusState.running) {
    // Return to kanban with timer running — show timer on card
    cardTimerExpanded.add(taskId);
    const ctx = findTaskContext(taskId);
    if (ctx) renderColumn(ctx.column);
  }

  // Don't clear focusState.taskId or stop timer — timer may still be running
  if (!focusState.running) {
    focusState.taskId = null;
    focusState.subtaskId = null;
  }
  focusState.enteredFrom = null;
}

function startFocusTimer() {
  if (focusState.running) return;
  focusState.running = true;

  // Immediately show H:MM:SS format
  const task = findTaskById(focusState.taskId);
  if (task) {
    const focusActual = document.querySelector('[data-focus-actual]');
    if (focusActual) focusActual.textContent = formatSeconds(task.actualTimeSeconds || 0);
  }

  updateFocusTimerUI();
  updateCardDetailTimerState();

  focusState.intervalId = setInterval(() => {
    const task = findTaskById(focusState.taskId);
    if (!task) { stopFocusTimer(); return; }
    const target = getFocusTarget(task);
    if (!target) { stopFocusTimer(); return; }

    if (target.type === 'subtask' && target.subtask) {
      target.subtask.actualTimeSeconds = (target.subtask.actualTimeSeconds || 0) + 1;
    } else {
      task.ownActualTimeSeconds = (task.ownActualTimeSeconds || 0) + 1;
    }
    syncTaskAggregateTimes(task);

    const targetSeconds = target.type === 'subtask' && target.subtask
      ? target.subtask.actualTimeSeconds
      : task.actualTimeSeconds;

    // Update focus modal if visible
    updateFocusModalValues(task);
    // Update card detail modal if visible
    const overlay = document.getElementById('task-modal-overlay');
    if (overlay && !overlay.hidden) {
      const actualMetric = overlay.querySelector('[data-actual-btn] .task-modal__metric-value');
      if (actualMetric) actualMetric.textContent = formatSeconds(task.actualTimeSeconds);
      if (focusState.subtaskId) {
        const subtaskMetric = overlay.querySelector(`[data-modal-subtask-actual-btn="${focusState.subtaskId}"] .task-modal__subtask-time-value`);
        if (subtaskMetric) subtaskMetric.textContent = formatSeconds(targetSeconds || 0);
      }
    }
    // Update kanban card timer if visible
    const cardTimerActual = document.querySelector(`.task-card[data-task-id="${focusState.taskId}"] [data-card-timer-actual]`);
    if (cardTimerActual) cardTimerActual.textContent = formatSeconds(task.actualTimeSeconds);
    // Update kanban card time badge only when minute changes
    if (task.actualTimeSeconds % 60 === 0) {
      const cardBadge = document.querySelector(`.task-card[data-task-id="${focusState.taskId}"] [data-card-time-badge]`);
      if (cardBadge) {
        const mins = Math.floor(task.actualTimeSeconds / 60);
        const planned = task.timeEstimateMinutes;
        cardBadge.textContent = planned ? `${formatMinutes(mins)} / ${formatMinutes(planned)}` : `${formatMinutes(mins)} / --:--`;
      }
    }
  }, 1000);
}

function stopFocusTimer() {
  if (focusState.intervalId) {
    clearInterval(focusState.intervalId);
    focusState.intervalId = null;
  }
  focusState.running = false;

  const task = findTaskById(focusState.taskId);
  updateFocusTimerUI();

  // Update card detail modal if visible
  updateCardDetailTimerState();

  // Re-render the column to update kanban card
  if (task) {
    const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
    if (col) renderColumn(col);
  }

  // Only clear taskId if focus modal is not open (user can restart from there)
  if (!document.getElementById('focus-modal')) {
    focusState.taskId = null;
    focusState.subtaskId = null;
  }
}

function updateFocusModalValues(task) {
  const el = document.getElementById('focus-modal');
  if (!el || !task) return;

  const actualMetric = el.querySelector('[data-focus-actual-metric]');
  const plannedMetric = el.querySelector('[data-focus-planned-metric]');
  const actualVal = el.querySelector('[data-focus-actual]');
  if (actualVal) {
    if (focusState.running) {
      actualVal.textContent = formatSeconds(task.actualTimeSeconds || 0);
      actualVal.classList.add('focus-modal__actual--running');
      actualVal.classList.remove('focus-modal__actual--placeholder');
      actualVal.classList.add('focus-modal__actual--set');
      actualMetric?.classList.add('focus-modal__metric--has-value');
    } else {
      const hasActual = hasActualTime(task.actualTimeSeconds);
      actualVal.textContent = formatActualDisplay(task.actualTimeSeconds || 0);
      actualVal.classList.remove('focus-modal__actual--running');
      actualVal.classList.toggle('focus-modal__actual--set', hasActual);
      actualVal.classList.toggle('focus-modal__actual--placeholder', !hasActual);
      actualMetric?.classList.toggle('focus-modal__metric--has-value', hasActual);
    }
  }

  const plannedVal = el.querySelector('[data-focus-planned]');
  if (plannedVal) {
    const hasPlanned = !!task.timeEstimateMinutes;
    plannedVal.textContent = hasPlanned ? formatMinutes(task.timeEstimateMinutes) : '--:--';
    plannedVal.classList.toggle('focus-modal__planned--set', hasPlanned);
    plannedVal.classList.toggle('focus-modal__planned--placeholder', !hasPlanned);
    plannedMetric?.classList.toggle('focus-modal__metric--has-value', hasPlanned);
  }

  const topCheck = el.querySelector('[data-focus-check]');
  if (topCheck) {
    topCheck.classList.toggle('task-modal__check--complete', !!task.complete);
  }

  let iconChanged = false;
  el.querySelectorAll('[data-focus-subtask-row]').forEach(row => {
    const subtaskId = row.getAttribute('data-focus-subtask-id');
    const subtask = findSubtask(task, subtaskId);
    if (!subtask) return;

    const isRunningSubtask = focusState.running && focusState.taskId === task.id && focusState.subtaskId === subtask.id;
    row.classList.toggle('focus-modal__subtask-row--active', isRunningSubtask);

    const checkBtn = row.querySelector('[data-focus-subtask-check]');
    if (checkBtn) {
      checkBtn.classList.toggle('task-modal__check--complete', !!subtask.done);
    }

    const actualEl = row.querySelector('[data-focus-subtask-actual]');
    if (actualEl) {
      if (isRunningSubtask) {
        actualEl.textContent = formatSeconds(subtask.actualTimeSeconds || 0);
        actualEl.classList.add('focus-modal__subtask-actual--running');
        actualEl.classList.remove('focus-modal__subtask-actual--placeholder');
        actualEl.classList.add('focus-modal__subtask-actual--set');
      } else {
        const hasActual = hasActualTime(subtask.actualTimeSeconds);
        actualEl.textContent = formatActualDisplay(subtask.actualTimeSeconds || 0);
        actualEl.classList.remove('focus-modal__subtask-actual--running');
        actualEl.classList.toggle('focus-modal__subtask-actual--set', hasActual);
        actualEl.classList.toggle('focus-modal__subtask-actual--placeholder', !hasActual);
      }
    }

    const plannedEl = row.querySelector('[data-focus-subtask-planned]');
    if (plannedEl) {
      const hasPlanned = !!subtask.plannedMinutes;
      plannedEl.textContent = hasPlanned ? formatMinutes(subtask.plannedMinutes) : '--:--';
      plannedEl.classList.toggle('focus-modal__subtask-planned--set', hasPlanned);
      plannedEl.classList.toggle('focus-modal__subtask-planned--placeholder', !hasPlanned);
    }

    const playBtn = row.querySelector('[data-focus-subtask-play]');
    if (playBtn) {
      const desiredState = isRunningSubtask ? 'running' : 'stopped';
      const desiredIcon = isRunningSubtask ? 'pause' : 'play';
      const desiredLabel = isRunningSubtask ? 'STOP' : 'START';
      playBtn.classList.toggle('focus-modal__subtask-start-btn--running', isRunningSubtask);
      playBtn.setAttribute('aria-label', isRunningSubtask ? 'Pause subtask timer' : 'Start subtask timer');
      if (playBtn.getAttribute('data-focus-subtask-state') !== desiredState) {
        playBtn.setAttribute('data-focus-subtask-state', desiredState);
        playBtn.innerHTML = `<span class="focus-modal__subtask-start-btn-icon"><i data-lucide="${desiredIcon}"></i></span><span class="focus-modal__subtask-start-btn-label">${desiredLabel}</span>`;
        iconChanged = true;
      }
    }
  });

  if (iconChanged && typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function updateFocusTimerUI() {
  const el = document.getElementById('focus-modal');
  if (!el) return;
  const task = findTaskById(focusState.taskId);
  if (!task) return;
  if (focusState.running) {
    el.querySelector('[data-focus-start]')?.classList.add('focus-modal__btn--hidden');
    el.querySelector('[data-focus-stop]')?.classList.remove('focus-modal__btn--hidden');
  } else {
    el.querySelector('[data-focus-stop]')?.classList.add('focus-modal__btn--hidden');
    el.querySelector('[data-focus-start]')?.classList.remove('focus-modal__btn--hidden');
  }
  updateFocusModalValues(task);
}

function updateCardDetailTimerState() {
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay || overlay.hidden) return;
  const task = findTaskById(focusState.taskId);
  const startBtn = overlay.querySelector('.task-modal__start-btn');
  const actualMetric = overlay.querySelector('[data-actual-btn] .task-modal__metric-value');

  const actualContainer = overlay.querySelector('[data-actual-btn]');

  if (focusState.running && task) {
    // Transform START → STOP
    if (startBtn) {
      startBtn.classList.add('task-modal__start-btn--stop');
      startBtn.innerHTML = '<i data-lucide="pause"></i><span>STOP</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    // Green H:MM:SS
    if (actualMetric) {
      actualMetric.textContent = formatSeconds(task.actualTimeSeconds);
      actualMetric.classList.add('task-modal__metric-value--running');
      actualMetric.classList.remove('task-modal__metric-value--placeholder');
      actualMetric.classList.add('task-modal__metric-value--set');
    }
    // Disable actual picker
    if (actualContainer) actualContainer.classList.add('task-modal__metric--disabled');
  } else {
    // Revert STOP → START
    if (startBtn) {
      startBtn.classList.remove('task-modal__start-btn--stop');
      startBtn.innerHTML = '<i data-lucide="play"></i><span>START</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    // Revert to normal H:MM
    if (actualMetric && task) {
      const hasActual = hasActualTime(task.actualTimeSeconds);
      actualMetric.textContent = formatActualDisplay(task.actualTimeSeconds || 0);
      actualMetric.classList.remove('task-modal__metric-value--running');
      if (hasActual) {
        actualMetric.classList.add('task-modal__metric-value--set');
        actualMetric.classList.remove('task-modal__metric-value--placeholder');
      } else {
        actualMetric.classList.remove('task-modal__metric-value--set');
        actualMetric.classList.add('task-modal__metric-value--placeholder');
      }
    }
    // Re-enable actual picker
    if (actualContainer) actualContainer.classList.remove('task-modal__metric--disabled');
  }

  if (overlay) {
    const subtaskPlayButtons = overlay.querySelectorAll('[data-modal-subtask-play]');
    subtaskPlayButtons.forEach(btn => {
      const subtaskId = btn.getAttribute('data-modal-subtask-play');
      const icon = btn.querySelector('i');
      const isRunningSubtask = focusState.running && focusState.taskId === openModalTaskId && focusState.subtaskId === subtaskId;
      if (icon) {
        icon.setAttribute('data-lucide', isRunningSubtask ? 'pause' : 'play');
      }
      btn.setAttribute('aria-label', isRunningSubtask ? 'Pause subtask timer' : 'Start subtask timer');
    });

    if (task) {
      overlay.querySelectorAll('[data-modal-subtask-row]').forEach(row => {
        const subtaskId = row.getAttribute('data-modal-subtask-id');
        const subtask = findSubtask(task, subtaskId);
        if (!subtask) return;
        const actualVal = row.querySelector('[data-modal-subtask-actual-btn] .task-modal__subtask-time-value');
        if (!actualVal) return;
        const isRunningSubtask = focusState.running && focusState.taskId === task.id && focusState.subtaskId === subtask.id;
        if (isRunningSubtask) {
          actualVal.textContent = formatSeconds(subtask.actualTimeSeconds || 0);
          actualVal.className = 'task-modal__subtask-time-value task-modal__subtask-time-value--running';
        } else if (subtask.actualTimeSeconds) {
          actualVal.textContent = formatMinutes(Math.floor(subtask.actualTimeSeconds / 60));
          actualVal.className = 'task-modal__subtask-time-value task-modal__subtask-time-value--set';
        } else {
          actualVal.textContent = '--:--';
          actualVal.className = 'task-modal__subtask-time-value task-modal__subtask-time-value--placeholder';
        }
      });
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function saveFocusModalEdits() {
  const el = document.getElementById('focus-modal');
  if (!el || !focusState.taskId) return;
  const task = findTaskById(focusState.taskId);
  if (!task) return;

  const titleEl = el.querySelector('.focus-modal__title');
  if (titleEl) {
    const newTitle = titleEl.textContent.trim();
    if (newTitle) {
      task.title = newTitle;
    }
  }
  const notesEl = el.querySelector('.focus-modal__notes');
  if (notesEl) {
    task.notes = notesEl.textContent.trim() || '';
  }
  el.querySelectorAll('[data-focus-subtask-title]').forEach(titleEl => {
    const subtaskId = titleEl.getAttribute('data-focus-subtask-title');
    const subtask = findSubtask(task, subtaskId);
    if (!subtask) return;
    const clean = titleEl.textContent.replace(/\n/g, '').trim();
    subtask.label = clean;
    subtask.deleteReady = false;
  });

  syncTaskAggregateTimes(task);

  // Re-render kanban column
  const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
  if (col) renderColumn(col);
}

function closeFocusPicker() {
  if (!focusPickerState) return;
  const existing = document.querySelector('[data-focus-picker]');
  if (existing) existing.remove();
  focusPickerState = null;
}

function openFocusPicker(type, subtaskId = null) {
  closeFocusPicker();
  focusPickerState = { type, editMode: false, subtaskId };
  renderFocusPicker();
}

function renderFocusPicker() {
  if (!focusPickerState) return;
  const { type, editMode, subtaskId } = focusPickerState;
  const task = findTaskById(focusState.taskId);
  if (!task) return;
  const subtask = subtaskId ? findSubtask(task, subtaskId) : null;
  if (subtaskId && !subtask) return;

  const existing = document.querySelector('[data-focus-picker]');
  if (existing) existing.remove();

  const isActual = type === 'actual';
  let metricEl;
  if (subtask) {
    const subtaskAttr = isActual ? 'data-focus-subtask-actual-metric' : 'data-focus-subtask-planned-metric';
    metricEl = document.querySelector(`#focus-modal [${subtaskAttr}="${subtask.id}"]`);
  } else {
    const metricAttr = isActual ? 'data-focus-actual-metric' : 'data-focus-planned-metric';
    metricEl = document.querySelector(`#focus-modal [${metricAttr}]`);
  }
  if (!metricEl) return;

  const currentSeconds = isActual
    ? (subtask ? (subtask.actualTimeSeconds || 0) : (task.actualTimeSeconds || 0))
    : 0;
  const hasCurrentActual = isActual && hasActualTime(currentSeconds);
  const currentMins = isActual
    ? Math.floor(currentSeconds / 60)
    : (subtask ? (subtask.plannedMinutes || 0) : (task.timeEstimateMinutes || 0));
  const currentFormatted = (isActual ? hasCurrentActual : currentMins > 0) ? formatMinutes(currentMins) : '--:--';
  const options = isActual ? ACTUAL_TIME_OPTIONS : PLANNED_TIME_OPTIONS;
  const label = isActual ? 'Actual' : 'Planned';
  const clearLabel = isActual ? 'Clear actual' : 'Clear planned';

  let html;
  if (editMode) {
    const h = Math.floor(currentMins / 60);
    const m = currentMins % 60;
    const hasVal = isActual ? hasCurrentActual : currentMins > 0;
    const valClass = hasVal ? ' planned-picker__input--has-value' : '';
    const colonClass = hasVal ? ' planned-picker__colon--has-value' : '';
    html = `
      <div class="planned-picker" data-focus-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">${label}:</div>
        <div class="planned-picker__time-entry">
          <input class="planned-picker__input planned-picker__input--hours${valClass}" type="text" maxlength="2" value="${h}" data-focus-picker-hours>
          <span class="planned-picker__colon${colonClass}">:</span>
          <input class="planned-picker__input${valClass}" type="text" maxlength="2" value="${String(m).padStart(2, '0')}" data-focus-picker-mins>
        </div>
        <div class="planned-picker__hint">↵ Return to save</div>
      </div>
    `;
  } else {
    const optionsHtml = options.map(opt => {
      const isSelected = currentMins === opt.minutes;
      return `<button class="planned-picker__option${isSelected ? ' planned-picker__option--selected' : ''}" type="button" data-focus-picker-minutes="${opt.minutes}">
        <span>${opt.label}</span>
        ${isSelected ? '<span class="planned-picker__check">✓</span>' : ''}
      </button>`;
    }).join('');

    const clearHtml = (isActual ? hasCurrentActual : currentMins > 0)
      ? `<div class="planned-picker__divider"></div><button class="planned-picker__clear" type="button" data-focus-picker-clear>${clearLabel}</button>`
      : '';

    html = `
      <div class="planned-picker" data-focus-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">${label}:</div>
        <button class="planned-picker__time-display" type="button" data-focus-picker-edit>${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        ${optionsHtml}
        ${clearHtml}
      </div>
    `;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const dropdown = wrapper.firstElementChild;
  metricEl.style.position = 'relative';
  metricEl.appendChild(dropdown);

  if (editMode) {
    attachPickerInputColorListeners(dropdown);
    const hoursInput = dropdown.querySelector('[data-focus-picker-hours]');
    if (hoursInput) { hoursInput.focus(); hoursInput.select(); }
  }
}

function applyFocusPickerTime(minutes) {
  if (!focusPickerState) return;
  const { type, subtaskId } = focusPickerState;
  const task = findTaskById(focusState.taskId);
  if (!task) return;
  const subtask = subtaskId ? findSubtask(task, subtaskId) : null;
  if (subtaskId && !subtask) return;

  if (subtask) {
    if (type === 'actual') {
      subtask.actualTimeSeconds = Math.max(0, minutes * 60);
    } else {
      subtask.plannedMinutes = Math.max(0, minutes);
    }
  } else if (type === 'actual') {
    const subtaskActual = task.subtasks.reduce((sum, s) => sum + (s.actualTimeSeconds || 0), 0);
    task.ownActualTimeSeconds = Math.max(0, minutes * 60 - subtaskActual);
  } else {
    const subtaskPlanned = task.subtasks.reduce((sum, s) => sum + (s.plannedMinutes || 0), 0);
    task.ownPlannedMinutes = Math.max(0, minutes - subtaskPlanned);
  }
  syncTaskAggregateTimes(task);
  closeFocusPicker();
  updateFocusModalValues(task);
  updateCardDetailTimerState();
  // Update kanban card
  const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
  if (col) renderColumn(col);
}

function handleFocusPickerTimeEntry() {
  if (!focusPickerState || !focusPickerState.editMode) return;
  const hoursInput = document.querySelector('[data-focus-picker-hours]');
  const minsInput = document.querySelector('[data-focus-picker-mins]');
  if (!hoursInput || !minsInput) return;
  const h = parseInt(hoursInput.value, 10) || 0;
  const m = parseInt(minsInput.value, 10) || 0;
  applyFocusPickerTime(h * 60 + m);
}

function renderFocusSubtaskRows(task) {
  const subtasks = task.subtasks || [];
  if (!subtasks.length) return '';

  const rows = subtasks.map(subtask => {
    ensureSubtaskTimeState(subtask);
    const hasLabel = !!String(subtask.label || '').trim();
    const isRunning = focusState.running && focusState.taskId === task.id && focusState.subtaskId === subtask.id;
    const hasActual = isRunning || !!subtask.actualTimeSeconds;
    const hasPlanned = !!subtask.plannedMinutes;
    const actualDisplay = isRunning
      ? formatSeconds(subtask.actualTimeSeconds || 0)
      : (subtask.actualTimeSeconds ? formatMinutes(Math.floor(subtask.actualTimeSeconds / 60)) : '--:--');
    const plannedDisplay = subtask.plannedMinutes ? formatMinutes(subtask.plannedMinutes) : '--:--';

    return `
      <div class="focus-modal__subtask-row${isRunning ? ' focus-modal__subtask-row--active' : ''}" data-focus-subtask-row data-focus-subtask-id="${escapeHtml(subtask.id)}">
        <span class="focus-modal__subtask-grab" data-focus-subtask-grab><i data-lucide="grip-vertical"></i></span>
        <button class="task-modal__check focus-modal__subtask-check ${subtask.done ? 'task-modal__check--complete' : ''}" type="button" data-focus-subtask-check="${escapeHtml(subtask.id)}">${CHECK_SVG}</button>
        <div class="focus-modal__subtask-title${hasLabel ? ' focus-modal__subtask-title--filled' : ''}" contenteditable="true" draggable="false" data-focus-subtask-title="${escapeHtml(subtask.id)}" data-placeholder="Subtask description...">${hasLabel ? escapeHtml(subtask.label) : ''}</div>
        <div class="focus-modal__subtask-metrics">
          <button class="focus-modal__subtask-time-btn" type="button" data-focus-subtask-actual-metric="${escapeHtml(subtask.id)}">
            <span class="focus-modal__subtask-actual${isRunning ? ' focus-modal__subtask-actual--running' : (hasActual ? ' focus-modal__subtask-actual--set' : ' focus-modal__subtask-actual--placeholder')}" data-focus-subtask-actual="${escapeHtml(subtask.id)}">${actualDisplay}</span>
          </button>
          <button class="focus-modal__subtask-time-btn" type="button" data-focus-subtask-planned-metric="${escapeHtml(subtask.id)}">
            <span class="focus-modal__subtask-planned${hasPlanned ? ' focus-modal__subtask-planned--set' : ' focus-modal__subtask-planned--placeholder'}" data-focus-subtask-planned="${escapeHtml(subtask.id)}">${plannedDisplay}</span>
          </button>
          <button class="focus-modal__subtask-start-btn${isRunning ? ' focus-modal__subtask-start-btn--running' : ''}" type="button" data-focus-subtask-play="${escapeHtml(subtask.id)}" data-focus-subtask-state="${isRunning ? 'running' : 'stopped'}" aria-label="${isRunning ? 'Pause subtask timer' : 'Start subtask timer'}">
            <span class="focus-modal__subtask-start-btn-icon"><i data-lucide="${isRunning ? 'pause' : 'play'}"></i></span>
            <span class="focus-modal__subtask-start-btn-label">${isRunning ? 'STOP' : 'START'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="focus-modal__subtask-list">${rows}</div>`;
}

function renderFocusModal(task, autoStart) {
  const existing = document.getElementById('focus-modal');
  if (existing) existing.remove();

  const isRunning = autoStart || focusState.running;
  const hasActual = isRunning || !!task.actualTimeSeconds;
  const hasPlanned = !!task.timeEstimateMinutes;
  const plannedDisplay = hasPlanned ? formatMinutes(task.timeEstimateMinutes) : '--:--';
  const actualDisplay = isRunning
    ? formatSeconds(task.actualTimeSeconds || 0)
    : (task.actualTimeSeconds ? formatMinutes(Math.floor(task.actualTimeSeconds / 60)) : '--:--');

  const el = document.createElement('div');
  el.id = 'focus-modal';
  el.className = 'focus-modal';
  el.innerHTML = `
    <div class="focus-modal__topbar">
      <button class="focus-modal__tab" type="button">
        <i data-lucide="timer"></i>
        <span>Focus</span>
      </button>
    </div>
    <div class="focus-modal__content">
      <div class="focus-modal__task-row">
        <div class="focus-modal__title-wrap">
          <button class="task-modal__check ${task.complete ? 'task-modal__check--complete' : ''}" type="button" data-focus-check>${CHECK_SVG}</button>
          <h2 class="focus-modal__title" contenteditable="true">${escapeHtml(task.title || 'Task')}</h2>
        </div>
        <div class="focus-modal__metrics">
          <div class="focus-modal__metric focus-modal__metric--clickable${hasActual ? ' focus-modal__metric--has-value' : ''}" data-focus-actual-metric>
            <span class="focus-modal__metric-label">ACTUAL</span>
            <span class="focus-modal__actual${isRunning ? ' focus-modal__actual--running' : (hasActual ? ' focus-modal__actual--set' : ' focus-modal__actual--placeholder')}" data-focus-actual>${actualDisplay}</span>
          </div>
          <div class="focus-modal__metric focus-modal__metric--clickable${hasPlanned ? ' focus-modal__metric--has-value' : ''}" data-focus-planned-metric>
            <span class="focus-modal__metric-label">PLANNED</span>
            <span class="focus-modal__planned${hasPlanned ? ' focus-modal__planned--set' : ' focus-modal__planned--placeholder'}" data-focus-planned>${plannedDisplay}</span>
          </div>
          <button class="focus-modal__stop-btn${isRunning ? '' : ' focus-modal__btn--hidden'}" type="button" data-focus-stop>
            <i data-lucide="pause"></i>
            <span>STOP</span>
          </button>
          <button class="focus-modal__start-btn${isRunning ? ' focus-modal__btn--hidden' : ''}" type="button" data-focus-start>
            <i data-lucide="play"></i>
            <span>START</span>
          </button>
        </div>
      </div>
      <div class="focus-modal__body">
        ${renderFocusSubtaskRows(task)}
        <button class="focus-modal__add-subtask" type="button" data-focus-add-subtask>
          <i data-lucide="plus-circle"></i>
          <span>Add subtask</span>
        </button>
        <div class="focus-modal__notes" contenteditable="true" data-placeholder="Notes...">${task.notes ? escapeHtml(task.notes) : ''}</div>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Attach focus mode events
  el.addEventListener('click', e => {
    // Inside an open focus picker
    const picker = e.target.closest('[data-focus-picker]');
    if (picker) {
      e.stopImmediatePropagation();
      const optBtn = e.target.closest('[data-focus-picker-minutes]');
      if (optBtn) { applyFocusPickerTime(parseInt(optBtn.dataset.focusPickerMinutes, 10)); return; }
      if (e.target.closest('[data-focus-picker-edit]')) {
        if (focusPickerState) { focusPickerState.editMode = true; renderFocusPicker(); }
        return;
      }
      if (e.target.closest('[data-focus-picker-clear]')) { applyFocusPickerTime(0); return; }
      return;
    }
    if (e.target.closest('[data-focus-close]')) {
      closeFocusPicker();
      closeFocusMode();
      return;
    }
    if (e.target.closest('[data-focus-stop]')) {
      closeFocusPicker();
      stopFocusTimer();
      return;
    }
    if (e.target.closest('[data-focus-start]')) {
      closeFocusPicker();
      startFocusTimer();
      return;
    }
    if (e.target.closest('[data-focus-add-subtask]')) {
      closeFocusPicker();
      const t = findTaskById(focusState.taskId);
      if (!t) return;
      const subtask = addModalSubtask(t);
      const col = state.columns.find(c => c.tasks.some(tk => tk.id === t.id));
      if (col) renderColumn(col);
      rerenderFocusModal(subtask.id);
      return;
    }
    const subtaskPlayBtn = e.target.closest('[data-focus-subtask-play]');
    if (subtaskPlayBtn) {
      closeFocusPicker();
      const t = findTaskById(focusState.taskId);
      if (!t) return;
      const subtaskId = subtaskPlayBtn.getAttribute('data-focus-subtask-play');
      if (!subtaskId) return;

      const isSameRunning = focusState.running && focusState.taskId === t.id && focusState.subtaskId === subtaskId;
      if (isSameRunning) {
        stopFocusTimer();
        return;
      }

      if (focusState.running) stopFocusTimer();
      focusState.subtaskId = subtaskId;
      startFocusTimer();
      return;
    }
    const subtaskCheckBtn = e.target.closest('[data-focus-subtask-check]');
    if (subtaskCheckBtn) {
      closeFocusPicker();
      const t = findTaskById(focusState.taskId);
      if (!t) return;
      const subtaskId = subtaskCheckBtn.getAttribute('data-focus-subtask-check');
      const subtask = findSubtask(t, subtaskId);
      if (!subtask) return;
      subtask.done = !subtask.done;
      subtask.deleteReady = false;
      subtaskCheckBtn.classList.toggle('task-modal__check--complete', subtask.done);
      updateFocusModalValues(t);
      const col = state.columns.find(c => c.tasks.some(tk => tk.id === t.id));
      if (col) renderColumn(col);
      return;
    }
    if (e.target.closest('[data-focus-check]')) {
      closeFocusPicker();
      const t = findTaskById(focusState.taskId);
      if (!t) return;
      t.complete = !t.complete;
      if (t.complete && t.subtasks) t.subtasks.forEach(s => { s.done = true; });
      const btn = el.querySelector('[data-focus-check]');
      if (btn) {
        btn.classList.toggle('task-modal__check--complete', t.complete);
      }
      if (t.complete && t.subtasks) {
        el.querySelectorAll('[data-focus-subtask-check]').forEach(cb => {
          cb.classList.add('task-modal__check--complete');
        });
      }
      const col = state.columns.find(c => c.tasks.some(tk => tk.id === t.id));
      if (col) renderColumn(col);
      return;
    }
    // Actual metric click
    if (e.target.closest('[data-focus-actual-metric]')) {
      // Disabled while timer is running
      if (focusState.running) return;
      if (focusPickerState && focusPickerState.type === 'actual' && !focusPickerState.subtaskId) {
        closeFocusPicker();
      } else {
        openFocusPicker('actual');
      }
      return;
    }
    // Planned metric click
    if (e.target.closest('[data-focus-planned-metric]')) {
      if (focusPickerState && focusPickerState.type === 'planned' && !focusPickerState.subtaskId) {
        closeFocusPicker();
      } else {
        openFocusPicker('planned');
      }
      return;
    }
    // Subtask actual metric click
    const subtaskActualMetric = e.target.closest('[data-focus-subtask-actual-metric]');
    if (subtaskActualMetric) {
      const t = findTaskById(focusState.taskId);
      if (!t) return;
      const subtaskId = subtaskActualMetric.getAttribute('data-focus-subtask-actual-metric');
      if (!subtaskId) return;
      const isRunningSubtask = focusState.running && focusState.taskId === t.id && focusState.subtaskId === subtaskId;
      if (isRunningSubtask) return;
      if (focusPickerState && focusPickerState.type === 'actual' && focusPickerState.subtaskId === subtaskId) {
        closeFocusPicker();
      } else {
        openFocusPicker('actual', subtaskId);
      }
      return;
    }
    // Subtask planned metric click
    const subtaskPlannedMetric = e.target.closest('[data-focus-subtask-planned-metric]');
    if (subtaskPlannedMetric) {
      const subtaskId = subtaskPlannedMetric.getAttribute('data-focus-subtask-planned-metric');
      if (!subtaskId) return;
      if (focusPickerState && focusPickerState.type === 'planned' && focusPickerState.subtaskId === subtaskId) {
        closeFocusPicker();
      } else {
        openFocusPicker('planned', subtaskId);
      }
      return;
    }
    // Click elsewhere in focus modal closes picker
    if (focusPickerState) { closeFocusPicker(); }
  });

  el.addEventListener('input', e => {
    const notesEl = e.target instanceof Element ? e.target.closest('.focus-modal__notes') : null;
    if (notesEl) {
      const cleanNotes = notesEl.textContent.replace(/\n/g, '').trim();
      if (!cleanNotes && notesEl.innerHTML !== '') {
        notesEl.textContent = '';
      }
      return;
    }

    const titleEl = e.target instanceof Element ? e.target.closest('[data-focus-subtask-title]') : null;
    if (!titleEl) return;
    const t = findTaskById(focusState.taskId);
    if (!t) return;
    const subtaskId = titleEl.getAttribute('data-focus-subtask-title');
    const subtask = findSubtask(t, subtaskId);
    if (!subtask) return;

    const cleanText = titleEl.textContent.replace(/\n/g, '').trim();
    if (!cleanText && titleEl.innerHTML !== '') {
      titleEl.textContent = '';
    }
    subtask.label = cleanText;
    subtask.deleteReady = false;
    titleEl.classList.toggle('focus-modal__subtask-title--filled', !!cleanText);
  });

  el.addEventListener('focusout', e => {
    const titleEl = e.target instanceof Element ? e.target.closest('[data-focus-subtask-title]') : null;
    if (!titleEl) return;
    const t = findTaskById(focusState.taskId);
    if (!t) return;
    const subtaskId = titleEl.getAttribute('data-focus-subtask-title');
    const subtask = findSubtask(t, subtaskId);
    if (!subtask) return;

    const cleanText = titleEl.textContent.replace(/\n/g, '').trim();
    subtask.label = cleanText;
    subtask.deleteReady = false;
    if (!cleanText && titleEl.innerHTML !== '') titleEl.textContent = '';
    titleEl.classList.toggle('focus-modal__subtask-title--filled', !!cleanText);

    const col = state.columns.find(c => c.tasks.some(tk => tk.id === t.id));
    if (col) renderColumn(col);
  });

  el.addEventListener('keydown', e => {
    const titleEl = e.target instanceof Element ? e.target.closest('[data-focus-subtask-title]') : null;
    if (!titleEl) return;
    const t = findTaskById(focusState.taskId);
    if (!t) return;
    const subtaskId = titleEl.getAttribute('data-focus-subtask-title');
    const index = t.subtasks.findIndex(st => st.id === subtaskId);
    if (index === -1) return;
    const subtask = t.subtasks[index];
    if (!subtask) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const inserted = addModalSubtask(t, index + 1);
      const col = state.columns.find(c => c.tasks.some(tk => tk.id === t.id));
      if (col) renderColumn(col);
      rerenderFocusModal(inserted.id);
      return;
    }

    if (e.key === 'Backspace') {
      const cleanText = titleEl.textContent.replace(/\n/g, '').trim();
      if (cleanText.length > 0) {
        subtask.deleteReady = false;
        return;
      }
      e.preventDefault();
      const nextFocusId = t.subtasks[index + 1]?.id || t.subtasks[index - 1]?.id || null;
      removeModalSubtask(t, subtaskId);
      closeFocusPicker();
      const col = state.columns.find(c => c.tasks.some(tk => tk.id === t.id));
      if (col) renderColumn(col);
      rerenderFocusModal(nextFocusId);
    }
  });

  let focusSubtaskPointerDrag = null;

  const clearFocusSubtaskDropTargets = () => {
    el.querySelectorAll('.focus-modal__subtask-row--drop-before, .focus-modal__subtask-row--drop-after')
      .forEach(row => row.classList.remove('focus-modal__subtask-row--drop-before', 'focus-modal__subtask-row--drop-after'));
  };

  const onFocusSubtaskPointerMove = ev => {
    if (!focusSubtaskPointerDrag) return;
    ev.preventDefault();

    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const row = target instanceof Element ? target.closest('[data-focus-subtask-row]') : null;
    clearFocusSubtaskDropTargets();

    if (!row) {
      focusSubtaskPointerDrag.targetId = null;
      return;
    }

    const targetId = row.getAttribute('data-focus-subtask-id');
    if (!targetId || targetId === focusSubtaskPointerDrag.draggedId) {
      focusSubtaskPointerDrag.targetId = null;
      return;
    }

    const rect = row.getBoundingClientRect();
    const placeAfter = ev.clientY > rect.top + rect.height / 2;
    focusSubtaskPointerDrag.targetId = targetId;
    focusSubtaskPointerDrag.placeAfter = placeAfter;
    row.classList.add(placeAfter ? 'focus-modal__subtask-row--drop-after' : 'focus-modal__subtask-row--drop-before');
  };

  const endFocusSubtaskPointerDrag = commit => {
    if (!focusSubtaskPointerDrag) return;
    const drag = focusSubtaskPointerDrag;
    focusSubtaskPointerDrag = null;

    document.removeEventListener('mousemove', onFocusSubtaskPointerMove, true);
    document.removeEventListener('mouseup', onFocusSubtaskPointerUp, true);
    el.classList.remove('focus-modal--subtask-dragging');
    el.querySelectorAll('.focus-modal__subtask-row--dragging').forEach(row => {
      row.classList.remove('focus-modal__subtask-row--dragging');
    });
    clearFocusSubtaskDropTargets();

    if (!commit || !drag.targetId || drag.targetId === drag.draggedId) {
      return;
    }

    const t = findTaskById(focusState.taskId);
    if (!t) return;
    const from = t.subtasks.findIndex(st => st.id === drag.draggedId);
    const to = t.subtasks.findIndex(st => st.id === drag.targetId);
    if (from === -1 || to === -1) return;

    const [moved] = t.subtasks.splice(from, 1);
    let insertAt = to;
    if (from < to) insertAt -= 1;
    if (drag.placeAfter) insertAt += 1;
    insertAt = Math.max(0, Math.min(insertAt, t.subtasks.length));
    t.subtasks.splice(insertAt, 0, moved);

    const col = state.columns.find(c => c.tasks.some(tk => tk.id === t.id));
    if (col) renderColumn(col);
    rerenderFocusModal(drag.draggedId);
  };

  const onFocusSubtaskPointerUp = ev => {
    if (!focusSubtaskPointerDrag) return;
    ev.preventDefault();
    endFocusSubtaskPointerDrag(true);
  };

  el.addEventListener('mousedown', e => {
    const grab = e.target instanceof Element ? e.target.closest('[data-focus-subtask-grab]') : null;
    if (!grab) return;
    const row = grab.closest('[data-focus-subtask-row]');
    if (!row) return;
    const draggedId = row.getAttribute('data-focus-subtask-id');
    if (!draggedId) return;

    e.preventDefault();
    clearFocusSubtaskDropTargets();
    row.classList.add('focus-modal__subtask-row--dragging');
    el.classList.add('focus-modal--subtask-dragging');
    focusSubtaskPointerDrag = {
      draggedId,
      targetId: null,
      placeAfter: false
    };

    document.addEventListener('mousemove', onFocusSubtaskPointerMove, true);
    document.addEventListener('mouseup', onFocusSubtaskPointerUp, true);
  });

  removeFocusEscKeyHandler();
  focusEscKeyHandler = function focusEsc(e) {
    if (e.key === 'Enter' && focusPickerState && focusPickerState.editMode) {
      e.preventDefault();
      handleFocusPickerTimeEntry();
      return;
    }
    if (e.key === 'Escape' && document.getElementById('focus-modal')) {
      e.preventDefault();
      if (focusPickerState) { closeFocusPicker(); return; }
      closeFocusMode();
    }
  };
  document.addEventListener('keydown', focusEscKeyHandler);
}

let openModalTaskId = null;

function openTaskDetailModal(taskId) {
  const context = findTaskContext(taskId);
  if (!context) return;

  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return;

  openModalTaskId = taskId;
  overlay.innerHTML = renderTaskDetailModal(context.task, context.column);
  overlay.hidden = false;
  document.body.classList.add('modal-open');

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // If timer is running for this task, update card detail to show STOP state
  if (focusState.running && focusState.taskId === taskId) {
    updateCardDetailTimerState();
  }
}

function closeTaskDetailModal() {
  closeStartDatePicker();
  closeDueDatePicker();
  closePlannedPicker();
  closeActualPicker();
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return;

  // Save title and notes before closing
  if (openModalTaskId) {
    const ctx = findTaskContext(openModalTaskId);
    if (ctx) {
      const titleEl = overlay.querySelector('.task-modal__title');
      if (titleEl) {
        const newTitle = titleEl.textContent.trim();
        if (newTitle) {
          ctx.task.title = newTitle;
        }
      }
      const notesEl = overlay.querySelector('.task-modal__notes');
      if (notesEl) {
        ctx.task.notes = notesEl.textContent.trim() || '';
      }
      syncTaskAggregateTimes(ctx.task);
      // If timer is running for this task, show timer on kanban card
      if (focusState.running && focusState.taskId === openModalTaskId) {
        cardTimerExpanded.add(openModalTaskId);
      }
      renderColumn(ctx.column);
    }
    openModalTaskId = null;
  }

  overlay.hidden = true;
  overlay.innerHTML = '';
  document.body.classList.remove('modal-open');
}

function renderTaskCard(task) {
  ensureTaskTimeState(task);
  const card = document.createElement('div');
  card.className = 'task-card' + (task.complete ? ' task-card--complete' : '');
  card.dataset.taskId = task.id;
  card.draggable = false;

  const scheduledPill = task.scheduledTime
    ? `<span class="task-card__scheduled-pill">${escapeHtml(task.scheduledTime)}</span>`
    : '';

  const isTimerRunning = focusState.running && focusState.taskId === task.id;
  const showTimerDropdown = isTimerRunning || cardTimerExpanded.has(task.id);
  const badgeGreenClass = isTimerRunning ? ' task-card__time-badge--running' : '';

  let timeBadge = '';
  const actualMins = task.actualTimeSeconds ? Math.floor(task.actualTimeSeconds / 60) : 0;
  const showActualOnBadge = hasActualTime(task.actualTimeSeconds) || isTimerRunning;
  if (showActualOnBadge && task.timeEstimateMinutes) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}" data-card-time-badge>${formatMinutes(actualMins)} / ${formatMinutes(task.timeEstimateMinutes)}</span>`;
  } else if (showActualOnBadge) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}" data-card-time-badge>${formatMinutes(actualMins)} / --:--</span>`;
  } else if (task.timeEstimateMinutes) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}" data-card-time-badge>${formatMinutes(task.timeEstimateMinutes)}</span>`;
  }

  const actualDisplay = isTimerRunning
    ? formatSeconds(task.actualTimeSeconds || 0)
    : formatActualDisplay(task.actualTimeSeconds || 0);
  const plannedDisplay = task.timeEstimateMinutes ? formatMinutes(task.timeEstimateMinutes) : '--:--';

  const timerSection = showTimerDropdown ? `
    <div class="task-card__timer" data-card-timer>
      <button class="task-card__timer-btn" type="button" data-card-timer-toggle>
        <i data-lucide="${isTimerRunning ? 'pause' : 'play'}"></i>
      </button>
      <div class="task-card__timer-metrics">
        <div class="task-card__timer-metric${isTimerRunning ? '' : ' task-card__timer-metric--clickable'}" data-card-actual-picker-btn>
          <span class="task-card__timer-label">ACTUAL</span>
          <span class="task-card__timer-value${isTimerRunning ? ' task-card__timer-value--running' : ''}" data-card-timer-actual>${actualDisplay}</span>
        </div>
        <div class="task-card__timer-metric task-card__timer-metric--clickable" data-card-planned-picker-btn>
          <span class="task-card__timer-label">PLANNED</span>
          <span class="task-card__timer-value">${plannedDisplay}</span>
        </div>
      </div>
    </div>
  ` : '';

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
      <button class="task-card__hover-icon" data-card-date-btn aria-label="Set start date" type="button">
        <i data-lucide="calendar"></i>
      </button>
      <button class="task-card__hover-icon" data-card-clock-btn aria-label="Timer" type="button">
        <i data-lucide="clock"></i>
      </button>
      ${renderTaskTag(task.tag)}
    </div>
    ${timerSection}
  `;

  return card;
}

function renderColumn(column) {
  const colEl = document.querySelector(`.day-column[data-col-id="${column.id}"]`);
  if (!colEl) return;

  moveCompletedTasksToBottom(column);
  column.tasks.forEach(ensureTaskTimeState);

  const progress = computeProgress(column);
  const progressFill = colEl.querySelector('.progress-bar__fill');
  if (progressFill) progressFill.style.width = progress + '%';

  const colTotalEl = colEl.querySelector('.column-time-total');
  if (colTotalEl) {
    const daySummary = formatColumnTimeSummary(column);
    colTotalEl.textContent = daySummary;
    colTotalEl.hidden = !daySummary;
  }

  const taskList = colEl.querySelector('.task-list');
  taskList.innerHTML = '';
  column.tasks.forEach(task => taskList.appendChild(renderTaskCard(task)));
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function getCalendarEventsForDate(isoDate) {
  // 1. Get stored calendar events for this date
  const stored = state.calendarEvents.filter(evt => evt.date === isoDate);
  const taskIdsInStored = new Set(stored.filter(e => e.taskId).map(e => e.taskId));

  // 2. Find tasks with scheduledTime in the matching column that don't already have a stored event
  const col = state.columns.find(c => c.isoDate === isoDate);
  const dynamic = [];
  if (col) {
    for (const task of col.tasks) {
      if (task.scheduledTime && !taskIdsInStored.has(task.id)) {
        const offset = scheduledTimeToOffset(task.scheduledTime);
        const duration = (task.timeEstimateMinutes || 30) / 60;
        dynamic.push({
          id: 'dyn-' + task.id,
          title: task.title,
          colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
          offset,
          duration,
          taskId: task.id,
          date: isoDate
        });
      }
    }
  }

  return [...stored, ...dynamic];
}

function renderCalendarEvents() {
  const timeGrid = document.getElementById('time-grid');
  const ghost    = document.getElementById('cal-event-ghost');
  const visibleDate = renderCalendarEvents._overrideDate || getFirstVisibleDate();
  renderCalendarEvents._overrideDate = null;
  const eventsForDate = getCalendarEventsForDate(visibleDate);
  const laneLayout = buildCalendarLaneLayout(eventsForDate);

  // Remove all rendered events, keeping the ghost element
  timeGrid.querySelectorAll('.cal-event:not(#cal-event-ghost)').forEach(el => el.remove());

  eventsForDate.forEach(evt => {
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

function normalizeWorkdayBounds(timeGridEl = null) {
  const totalHours = getCalendarTotalHours(timeGridEl);
  const minGapHours = 1 / SNAP_STEPS_PER_HOUR;

  let start = clampCalendarOffset(state.workday.startOffset, 0, timeGridEl);
  let end = clampCalendarOffset(state.workday.endOffset, 0, timeGridEl);

  if (end - start < minGapHours) {
    if (start + minGapHours <= totalHours) {
      end = start + minGapHours;
    } else {
      end = totalHours;
      start = Math.max(0, end - minGapHours);
    }
  }

  state.workday.startOffset = start;
  state.workday.endOffset = end;
}

function renderWorkdayMarkers() {
  const timeGrid = document.getElementById('time-grid');
  const startMarker = document.getElementById('workday-start-marker');
  const endMarker = document.getElementById('workday-end-marker');
  const startBadge = startMarker ? startMarker.querySelector('.workday-marker__badge') : null;
  const endBadge = endMarker ? endMarker.querySelector('.workday-marker__badge') : null;
  if (!timeGrid || !startMarker || !endMarker) return;

  normalizeWorkdayBounds(timeGrid);

  const draggingStart = !!(workdayMarkerDrag && workdayMarkerDrag.type === 'start');
  const draggingEnd = !!(workdayMarkerDrag && workdayMarkerDrag.type === 'end');

  startMarker.style.setProperty('--offset', String(state.workday.startOffset));
  endMarker.style.setProperty('--offset', String(state.workday.endOffset));
  startMarker.classList.toggle('workday-marker--active', draggingStart);
  endMarker.classList.toggle('workday-marker--active', draggingEnd);

  if (startBadge) {
    startBadge.textContent = draggingStart ? formatOffsetAsClockNoPeriod(state.workday.startOffset) : 'START';
  }
  if (endBadge) {
    endBadge.textContent = draggingEnd ? formatOffsetAsClockNoPeriod(state.workday.endOffset) : 'END';
  }

  startMarker.title = `Workday start (${formatOffsetAsClock(state.workday.startOffset)})`;
  endMarker.title = `Workday end (${formatOffsetAsClock(state.workday.endOffset)})`;
}

function scrollTimelineToWorkdayStart() {
  const wrapper = document.querySelector('.time-grid-wrapper');
  const timeGrid = document.getElementById('time-grid');
  if (!wrapper || !timeGrid) return;

  normalizeWorkdayBounds(timeGrid);
  const targetOffset = Math.max(0, state.workday.startOffset - WORKDAY_SCROLL_LEAD_HOURS);
  wrapper.scrollTop = targetOffset * getHourHeightPx(timeGrid);
}

function applyCalendarZoom(zoomLevel, options = {}) {
  const { preserveViewport = true } = options;
  const wrapper = document.querySelector('.time-grid-wrapper');
  const timeGrid = document.getElementById('time-grid');
  const zoomInBtn = document.getElementById('calendar-zoom-in');
  const zoomOutBtn = document.getElementById('calendar-zoom-out');
  const zoomValue = document.getElementById('calendar-zoom-value');

  const nextZoom = Math.max(MIN_CALENDAR_ZOOM, Math.min(MAX_CALENDAR_ZOOM, Math.round(zoomLevel)));
  let centerHour = null;

  if (wrapper && timeGrid && preserveViewport) {
    const hourHeightBefore = getHourHeightPx(timeGrid);
    centerHour = (wrapper.scrollTop + wrapper.clientHeight / 2) / hourHeightBefore;
  }

  state.calendarZoom = nextZoom;

  if (timeGrid) {
    timeGrid.style.setProperty('--hour-height', `${DEFAULT_HOUR_HEIGHT_PX * nextZoom}px`);
  }

  if (wrapper && timeGrid && centerHour !== null) {
    const hourHeightAfter = getHourHeightPx(timeGrid);
    wrapper.scrollTop = Math.max(0, centerHour * hourHeightAfter - wrapper.clientHeight / 2);
  }

  const isAtMin = nextZoom <= MIN_CALENDAR_ZOOM;
  const isAtMax = nextZoom >= MAX_CALENDAR_ZOOM;

  if (zoomOutBtn) {
    zoomOutBtn.disabled = isAtMin;
    zoomOutBtn.setAttribute('aria-disabled', String(isAtMin));
  }
  if (zoomInBtn) {
    zoomInBtn.disabled = isAtMax;
    zoomInBtn.setAttribute('aria-disabled', String(isAtMax));
  }
  if (zoomValue) {
    zoomValue.textContent = `${nextZoom}x`;
  }
}

function attachCalendarZoomEvents() {
  const zoomInBtn = document.getElementById('calendar-zoom-in');
  const zoomOutBtn = document.getElementById('calendar-zoom-out');
  if (!zoomInBtn || !zoomOutBtn) return;

  zoomInBtn.addEventListener('click', () => {
    applyCalendarZoom(state.calendarZoom + 1);
  });

  zoomOutBtn.addEventListener('click', () => {
    applyCalendarZoom(state.calendarZoom - 1);
  });

  applyCalendarZoom(state.calendarZoom, { preserveViewport: false });
}

function attachWorkdayMarkerEvents() {
  const timeGrid = document.getElementById('time-grid');
  const startMarker = document.getElementById('workday-start-marker');
  const endMarker = document.getElementById('workday-end-marker');
  if (!timeGrid || !startMarker || !endMarker) return;

  function beginMarkerDrag(e, type) {
    if (e.button !== 0) return;
    e.preventDefault();
    workdayMarkerDrag = { type };
    document.body.classList.add('is-workday-marker-dragging');
    renderWorkdayMarkers();
  }

  startMarker.addEventListener('mousedown', e => beginMarkerDrag(e, 'start'));
  endMarker.addEventListener('mousedown', e => beginMarkerDrag(e, 'end'));

  document.addEventListener('mousemove', e => {
    if (!workdayMarkerDrag) return;
    e.preventDefault();

    const minGapHours = 1 / SNAP_STEPS_PER_HOUR;
    const totalHours = getCalendarTotalHours(timeGrid);
    const snapped = yToOffset(e.clientY, timeGrid, 0);

    if (workdayMarkerDrag.type === 'start') {
      state.workday.startOffset = Math.max(0, Math.min(snapped, state.workday.endOffset - minGapHours));
    } else {
      state.workday.endOffset = Math.max(state.workday.startOffset + minGapHours, Math.min(snapped, totalHours));
    }

    renderWorkdayMarkers();
  });

  document.addEventListener('mouseup', () => {
    if (!workdayMarkerDrag) return;
    workdayMarkerDrag = null;
    document.body.classList.remove('is-workday-marker-dragging');
    renderWorkdayMarkers();
  });
}

function createColumnElement(column) {
  const todayISO = getTodayISO();
  const isToday = column.isoDate === todayISO;
  const isPast = column.isoDate < todayISO;
  const dayTotal = formatColumnTimeSummary(column);
  const colEl = document.createElement('div');
  colEl.className = 'day-column' + (isToday ? ' day-column--today' : '') + (isPast ? ' day-column--past' : '');
  colEl.dataset.colId = column.id;
  colEl.dataset.isoDate = column.isoDate;

  colEl.innerHTML = `
    <div class="day-column__header">
      <a href="#" class="day-name day-name--link" data-day-header-link>${escapeHtml(column.dayName)}</a>
      <span class="day-date">${escapeHtml(column.date)}</span>
    </div>
    <div class="progress-bar${isToday ? '' : ' progress-bar--hidden'}">
      <div class="progress-bar__fill" style="width:0%"></div>
    </div>
    <div class="add-task-row">
      <button class="add-task-btn">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span class="add-task-btn__label">Add task</span>
      </button>
      <span class="column-time-total task-card__time-badge"${dayTotal ? '' : ' hidden'}>${escapeHtml(dayTotal || '')}</span>
    </div>
    <div class="add-task-input-wrap" hidden>
      <input type="text" class="add-task-input" placeholder="Task name…">
      <button class="add-task-confirm" type="button" aria-label="Add task">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
    </div>
    <div class="task-list"></div>
  `;

  return colEl;
}

function renderAllColumns() {
  const container = document.getElementById('day-columns');
  const { startISO, endISO } = state.dayWindow;
  if (!startISO || !endISO) return;
  ensureColumnsForWindow(startISO, endISO);
  const visibleCols = getColumnsInWindow(startISO, endISO);
  container.innerHTML = '';
  visibleCols.forEach(col => {
    const colEl = createColumnElement(col);
    container.appendChild(colEl);
    renderColumn(col);
  });
}

function getColumnSpanPx(container) {
  if (!container) return 0;
  const rootStyles = getComputedStyle(document.documentElement);
  const colWidth = parseFloat(rootStyles.getPropertyValue('--column-width')) || 0;
  const gap = parseFloat(getComputedStyle(container).columnGap || getComputedStyle(container).gap || '0') || 0;
  return colWidth + gap;
}

function suppressDayWindowRecycle(durationMs = DAY_WINDOW_RECYCLE_SUPPRESS_MS) {
  dayWindowRecycleSuppressed = true;
  if (dayWindowRecycleSuppressTimer) clearTimeout(dayWindowRecycleSuppressTimer);
  dayWindowRecycleSuppressTimer = setTimeout(() => {
    dayWindowRecycleSuppressed = false;
    dayWindowRecycleSuppressTimer = null;
  }, Math.max(0, durationMs));
}

function shiftDayWindowBy(daysDelta, options = {}) {
  if (!daysDelta) return;
  const { preserveScrollPosition = false } = options;
  const container = document.getElementById('day-columns');
  const prevScrollLeft = container ? container.scrollLeft : 0;
  const columnSpan = getColumnSpanPx(container);

  state.dayWindow.startISO = addDays(state.dayWindow.startISO, daysDelta);
  state.dayWindow.endISO = addDays(state.dayWindow.endISO, daysDelta);
  ensureColumnsForWindow(state.dayWindow.startISO, state.dayWindow.endISO);
  pruneFarEmptyColumns();
  renderAllColumns();

  if (container && preserveScrollPosition && columnSpan > 0) {
    container.scrollLeft = Math.max(0, prevScrollLeft - daysDelta * columnSpan);
  }
}

function recycleDayWindowIfNeeded() {
  const container = document.getElementById('day-columns');
  if (!container || container.clientWidth <= 0) return;
  if (dayWindowRecycleSuppressed) return;
  if (activeDragType || dragState.taskId || taskPointerDrag || calPointerDrag) return;

  const columnSpan = getColumnSpanPx(container);
  if (columnSpan <= 0) return;

  const triggerPx = columnSpan * DAY_WINDOW_SHIFT_TRIGGER_COLUMNS;
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);

  if (container.scrollLeft <= triggerPx) {
    shiftDayWindowBy(-DAY_WINDOW_SHIFT_STEP, { preserveScrollPosition: true });
  } else if (container.scrollLeft >= maxScrollLeft - triggerPx) {
    shiftDayWindowBy(DAY_WINDOW_SHIFT_STEP, { preserveScrollPosition: true });
  }
}

function ensureDateIsVisibleInWindow(isoDate) {
  if (!state.dayWindow.startISO || !state.dayWindow.endISO) initializeDayWindow();
  if (isIsoInRange(isoDate, state.dayWindow.startISO, state.dayWindow.endISO)) return false;

  state.dayWindow.startISO = addDays(isoDate, -DAY_WINDOW_RADIUS);
  state.dayWindow.endISO = addDays(isoDate, DAY_WINDOW_RADIUS);
  ensureColumnsForWindow(state.dayWindow.startISO, state.dayWindow.endISO);
  pruneFarEmptyColumns();
  renderAllColumns();
  return true;
}

function scrollToDateColumn(isoDate, options = {}) {
  const container = document.getElementById('day-columns');
  if (!container) return;

  const { behavior = 'smooth' } = options;
  suppressDayWindowRecycle(behavior === 'smooth' ? DAY_WINDOW_RECYCLE_SUPPRESS_MS : 80);
  ensureDateIsVisibleInWindow(isoDate);

  const visibleCols = getColumnsInWindow(state.dayWindow.startISO, state.dayWindow.endISO);
  const targetIndex = visibleCols.findIndex(col => col.isoDate === isoDate);
  if (targetIndex === -1) return;

  const columnSpan = getColumnSpanPx(container);
  if (columnSpan <= 0) return;
  const targetLeft = targetIndex * columnSpan;

  // Set label to target immediately (unless suppressed during init)
  if (!labelUpdateSuppressed) updateTodayButtonLabel(isoDate);

  // Suppress scroll-based label updates during programmatic smooth scroll
  if (behavior === 'smooth') {
    labelUpdateSuppressed = true;
    if (labelUpdateSuppressTimer) clearTimeout(labelUpdateSuppressTimer);
    labelUpdateSuppressTimer = setTimeout(() => {
      labelUpdateSuppressed = false;
      labelUpdateSuppressTimer = null;
      updateTodayButtonLabel();
    }, DAY_WINDOW_RECYCLE_SUPPRESS_MS);
  }

  if (behavior === 'auto') {
    container.scrollLeft = targetLeft;
    return;
  }

  container.scrollTo({
    left: targetLeft,
    behavior
  });
}

function initializeTodayFirstColumnPosition() {
  const todayISO = getTodayISO();
  const container = document.getElementById('day-columns');

  // Suppress all label updates during init
  labelUpdateSuppressed = true;
  updateTodayButtonLabel(todayISO);

  const snap = () => scrollToDateColumn(todayISO, { behavior: 'auto' });

  function reveal() {
    snap();
    labelUpdateSuppressed = false;
    updateTodayButtonLabel._lastCalDate = null; // force calendar re-render
    updateTodayButtonLabel(todayISO);
    if (container) container.classList.add('board__columns--ready');
  }

  // Keep snapping until scroll position stabilizes, then reveal
  let lastScrollLeft = -1;
  let stableCount = 0;
  function pollUntilStable() {
    snap();
    if (container) {
      if (container.scrollLeft === lastScrollLeft && lastScrollLeft >= 0) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastScrollLeft = container.scrollLeft;
    }
    if (stableCount >= 3) {
      reveal();
    } else {
      requestAnimationFrame(pollUntilStable);
    }
  }

  snap();
  requestAnimationFrame(pollUntilStable);
}

/* ═══════════════════════════════════════════════
   COLUMN LOOKUP / TASK MOVEMENT
═══════════════════════════════════════════════ */

function findOrCreateColumn(isoDate) {
  return ensureColumnForDate(isoDate);
}

function moveTaskToDate(taskId, targetIsoDate) {
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  const sourceCol = ctx.column;
  const targetCol = findOrCreateColumn(targetIsoDate);

  if (sourceCol.id === targetCol.id) return;

  sourceCol.tasks.splice(ctx.index, 1);
  targetCol.tasks.push(ctx.task);

  renderColumn(sourceCol);
  renderColumn(targetCol);
}

/* ═══════════════════════════════════════════════
   ADD TASK HELPERS
═══════════════════════════════════════════════ */

function showAddTaskInput(colEl) {
  colEl.querySelector('.add-task-row').style.display = 'none';
  const wrap = colEl.querySelector('.add-task-input-wrap');
  const input = wrap.querySelector('.add-task-input');
  input.value = '';
  wrap.removeAttribute('hidden');
  input.focus();
}

function hideAddTaskInput(colEl) {
  const wrap = colEl.querySelector('.add-task-input-wrap');
  const input = wrap.querySelector('.add-task-input');
  input.value = '';
  if (document.activeElement === input) input.blur();
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

  column.tasks.unshift({
    id: uid(),
    title,
    timeEstimateMinutes: 0,
    actualTimeSeconds: 0,
    ownPlannedMinutes: 0,
    ownActualTimeSeconds: 0,
    scheduledTime: null,
    complete: false,
    tag: null,
    integrationColor: null,
    subtasks: [],
    showSubtasks: false
  });

  hideAddTaskInput(colEl);
  renderColumn(column);
}

/* ═══════════════════════════════════════════════
   COLUMN EVENT DELEGATION
═══════════════════════════════════════════════ */

function attachEvents() {
  const container = document.getElementById('day-columns');
  const timeGrid = document.getElementById('time-grid');
  const calGhost = document.getElementById('cal-event-ghost');
  const calDragLine = document.getElementById('cal-drag-line');

  function closestFromTarget(target, selector) {
    if (target instanceof Element) return target.closest(selector);
    if (target instanceof Node && target.parentElement) return target.parentElement.closest(selector);
    return null;
  }

  function resolveTaskListFromTarget(target) {
    const direct = closestFromTarget(target, '.task-list');
    if (direct) return direct;
    const colEl = closestFromTarget(target, '.day-column');
    return colEl ? colEl.querySelector('.task-list') : null;
  }

  function hideOpenAddTaskInputs(exceptColEl = null) {
    container.querySelectorAll('.day-column').forEach(colEl => {
      if (exceptColEl && colEl === exceptColEl) return;
      const wrap = colEl.querySelector('.add-task-input-wrap');
      if (!wrap || wrap.hasAttribute('hidden')) return;
      hideAddTaskInput(colEl);
    });
  }

  let recycleRaf = null;
  container.addEventListener('scroll', () => {
    if (recycleRaf !== null) return;
    recycleRaf = requestAnimationFrame(() => {
      recycleRaf = null;
      recycleDayWindowIfNeeded();
      if (!labelUpdateSuppressed) updateTodayButtonLabel();
    });
  }, { passive: true });

  function scheduleTaskDragClass(card) {
    const localToken = taskDragClassToken + 1;
    taskDragClassToken = localToken;
    if (taskDragClassRaf !== null) cancelAnimationFrame(taskDragClassRaf);
    taskDragClassRaf = requestAnimationFrame(() => {
      taskDragClassRaf = null;
      if (taskDragClassToken !== localToken) return;
      if (activeDragType !== 'task') return;
      if (dragState.taskId !== card.dataset.taskId) return;
      if (!card.isConnected) return;
      card.classList.add('task-card--dragging');
    });
  }

  function beginTaskDragFromCard(card) {
    if (!card) return false;
    const colEl = card.closest('.day-column');
    if (!colEl) return false;

    // Recover from any prior interrupted drag that left a card hidden.
    clearTaskDraggingClass();

    // Forcibly clear any stale cal-event drag state before task drag begins.
    clearCalendarDragState();

    dragState.taskId      = card.dataset.taskId;
    dragState.sourceColId = colEl.dataset.colId;

    const col = state.columns.find(c => c.id === dragState.sourceColId);
    if (!col) return false;
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

    setActiveDrag('task', dragState.taskId);
    clearPendingDrag();
    document.body.classList.add('is-task-reordering');
    scheduleTaskDragClass(card);
    return true;
  }

  function ensureTaskDragStateFromEvent(e) {
    if (dragState.taskId) return true;
    const taskId = resolveTaskDragTaskId(e);
    if (!taskId) return false;
    const sourceCard = container.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!sourceCard) return false;
    return beginTaskDragFromCard(sourceCard);
  }

  function cleanupTaskDropVisuals() {
    clearTaskDraggingClass();
    if (taskDropPlaceholder && taskDropPlaceholder.parentElement) taskDropPlaceholder.remove();
    taskDropPlaceholder = null;
    document.querySelectorAll('.task-list.drag-over').forEach(el => {
      el.classList.remove('drag-over');
      delete el.dataset.dropIndex;
    });
    document.querySelectorAll('.task-list').forEach(el => {
      delete el.dataset.dropIndex;
    });
  }

  function finalizeTaskDragState() {
    clearTaskDragState();
    if (activeDragType === 'task') clearActiveDrag();
    clearPendingDrag();
    document.body.classList.remove('is-task-reordering');
  }

  function updateTaskPlaceholderForList(taskList, clientY) {
    if (!taskList) return;
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

    const { index: insertIndex, cards } = getInsertIndexFromPointer(taskList, clientY, previousIndex);
    if (previousIndex !== insertIndex) {
      taskList.dataset.dropIndex = String(insertIndex);
      const beforeCard = cards[insertIndex] || null;
      taskList.insertBefore(placeholder, beforeCard);
    } else if (taskList.dataset.dropIndex === undefined) {
      taskList.dataset.dropIndex = String(insertIndex);
      const beforeCard = cards[insertIndex] || null;
      taskList.insertBefore(placeholder, beforeCard);
    }
  }

  function showCalendarGhostForTask(taskId, clientY) {
    if (!timeGrid || !calGhost) return;
    const task = findTaskById(taskId);
    if (!task) return;

    const durationHours = task.timeEstimateMinutes > 0
      ? task.timeEstimateMinutes / 60
      : 0.5;
    const offset = yToOffset(clientY, timeGrid, durationHours);
    const channelStyle = getChannelStyle(task.tag);
    const ghostColor = channelStyle ? channelStyle.hashColor : '#3b82f6';

    calGhost.hidden = false;
    if (calDragLine) calDragLine.hidden = true;
    calGhost.style.backgroundColor = hexToRgba(ghostColor, 0.28);
    calGhost.style.borderColor = hexToRgba(ghostColor, 0.95);
    calGhost.style.borderStyle = 'dashed';
    calGhost.style.borderWidth = '2px';
    calGhost.style.setProperty('--offset', offset);
    calGhost.style.setProperty('--duration', durationHours);
    calGhost.querySelector('.cal-event__title').textContent = task.title;
    calGhost.querySelector('.cal-event__time').textContent = formatTimeRange(offset, durationHours);
  }

  function hideCalendarGhost() {
    if (calGhost) calGhost.hidden = true;
    if (calDragLine) calDragLine.hidden = true;
  }

  function dropTaskOnTimeline(taskId, clientY) {
    if (!timeGrid) return false;
    const task = findTaskById(taskId);
    if (!task) return false;

    const duration = task.timeEstimateMinutes > 0
      ? task.timeEstimateMinutes / 60
      : 0.5;
    const offset = yToOffset(clientY, timeGrid, duration);

    task.scheduledTime = offsetToScheduledTime(offset);

    const existing = state.calendarEvents.find(ev => ev.taskId === task.id);
    if (existing) {
      existing.offset = offset;
      existing.duration = duration;
      existing.title = task.title;
      existing.colorClass = getTaskEventColorClass(task, existing.colorClass);
      existing.zOrder = ++calZCounter;
    } else {
      const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
      state.calendarEvents.push({
        id: 'evt-' + uid(),
        title: task.title,
        colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
        offset,
        duration,
        taskId: task.id,
        date: col ? col.isoDate : getFirstVisibleDate(),
        zOrder: ++calZCounter
      });
    }

    const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
    if (col) renderColumn(col);
    renderCalendarEvents();
    return true;
  }

  function dropTaskIntoList(taskList) {
    if (!taskList || !dragState.taskId) return false;
    const targetColEl = taskList.closest('.day-column');
    if (!targetColEl) return false;
    const targetColId = targetColEl.dataset.colId;

    const cards = [...taskList.querySelectorAll('.task-card:not(.task-card--dragging):not(.task-card--placeholder)')];
    let insertIndex = cards.length;
    if (taskList.dataset.dropIndex !== undefined) {
      const parsed = Number.parseInt(taskList.dataset.dropIndex, 10);
      if (Number.isFinite(parsed)) insertIndex = Math.max(0, Math.min(parsed, cards.length));
    }

    const sourceCol = state.columns.find(c => c.id === dragState.sourceColId);
    const targetCol = state.columns.find(c => c.id === targetColId);
    if (!sourceCol || !targetCol) return false;
    const taskIndex = sourceCol.tasks.findIndex(t => t.id === dragState.taskId);
    if (taskIndex === -1) return false;

    const [task] = sourceCol.tasks.splice(taskIndex, 1);
    targetCol.tasks.splice(insertIndex, 0, task);

    cleanupTaskDropVisuals();
    renderColumn(sourceCol);
    if (sourceCol !== targetCol) renderColumn(targetCol);
    setTimeout(finalizeTaskDragState, 0);
    return true;
  }

  // Safari fallback: remember intended source before native dragstart fires.
  // Capture phase ensures this runs even when dragstart is flaky on dynamic nodes.
  document.addEventListener('mousedown', e => {
    if (closestFromTarget(e.target, '.cal-event__resize-handle')) {
      clearPendingDrag();
      return;
    }
    const card = closestFromTarget(e.target, '.task-card');
    if (card) {
      setPendingDrag('task', card.dataset.taskId);
      return;
    }
    clearPendingDrag();
  }, true);

  // ── Complete task toggle ────────────────────
  container.addEventListener('click', e => {
    const btn = closestFromTarget(e.target, '.task-card__complete-btn');
    if (!btn) return;
    const card   = btn.closest('.task-card');
    const taskId = card.dataset.taskId;
    for (const col of state.columns) {
      const task = col.tasks.find(t => t.id === taskId);
      if (task) {
        if (!task.complete) {
          const incompleteTasks = col.tasks.filter(t => !t.complete);
          task.previousIncompleteIndex = incompleteTasks.findIndex(t => t.id === task.id);
          task.complete = true;
          if (task.subtasks) task.subtasks.forEach(s => { s.done = true; });
          // Auto-set actual time to planned time when completing without actual time
          if (!task.actualTimeSeconds && task.timeEstimateMinutes) {
            task.actualTimeSeconds = task.timeEstimateMinutes * 60;
          }
          moveCompletedTasksToBottom(col);
        } else {
          const taskIndex = col.tasks.findIndex(t => t.id === task.id);
          if (taskIndex === -1) break;

          task.complete = false;
          const [uncompletedTask] = col.tasks.splice(taskIndex, 1);

          const firstCompletedIndex = col.tasks.findIndex(t => t.complete);
          const incompleteCount = firstCompletedIndex === -1 ? col.tasks.length : firstCompletedIndex;
          const requestedIndex = Number.isInteger(uncompletedTask.previousIncompleteIndex)
            ? uncompletedTask.previousIncompleteIndex
            : incompleteCount;
          const insertionIndex = Math.max(0, Math.min(requestedIndex, incompleteCount));

          col.tasks.splice(insertionIndex, 0, uncompletedTask);
          delete uncompletedTask.previousIncompleteIndex;
        }

        renderColumn(col);
        break;
      }
    }
  });

  // ── Kanban subtask completion toggle ────────
  container.addEventListener('click', e => {
    const subtaskBtn = closestFromTarget(e.target, '[data-card-subtask-check]');
    if (!subtaskBtn) return;
    e.stopImmediatePropagation();

    const subtaskEl = subtaskBtn.closest('.subtask');
    const card = subtaskBtn.closest('.task-card');
    if (!subtaskEl || !card) return;

    const ctx = findTaskContext(card.dataset.taskId);
    if (!ctx) return;

    const subtaskId = subtaskEl.dataset.subtaskId;
    const subtask = findSubtask(ctx.task, subtaskId);
    if (!subtask) return;

    subtask.done = !subtask.done;
    subtask.deleteReady = false;
    renderColumn(ctx.column);
  });

  // ── Show add-task input ─────────────────────
  container.addEventListener('click', e => {
    const row = closestFromTarget(e.target, '.add-task-row');
    if (!row) return;
    if (closestFromTarget(e.target, '.column-time-total')) return;
    const colEl = row.closest('.day-column');
    if (!colEl) return;
    hideOpenAddTaskInputs(colEl);
    showAddTaskInput(colEl);
  });

  // ── Day header link: scroll clicked column to first visible ──
  container.addEventListener('click', e => {
    const dayLink = closestFromTarget(e.target, '[data-day-header-link]');
    if (!dayLink) return;
    e.preventDefault();
    const colEl = dayLink.closest('.day-column');
    if (!colEl) return;
    const isoDate = colEl.dataset.isoDate;
    if (!isoDate) return;
    scrollToDateColumn(isoDate, { behavior: 'smooth' });
  });

  // ── Confirm add task ────────────────────────
  container.addEventListener('click', e => {
    if (!closestFromTarget(e.target, '.add-task-confirm')) return;
    commitAddTask(closestFromTarget(e.target, '.day-column'));
  });

  // ── Enter / Escape in input ─────────────────
  container.addEventListener('keydown', e => {
    const input = closestFromTarget(e.target, '.add-task-input');
    if (!input) return;
    const colEl = input.closest('.day-column');
    if (e.key === 'Enter')  { e.preventDefault(); commitAddTask(colEl); }
    if (e.key === 'Escape') { hideAddTaskInput(colEl); }
  });

  // ── Outside click cancels add-task input ────
  document.addEventListener('mousedown', e => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('.add-task-input-wrap')) return;
    if (e.target.closest('.add-task-btn')) return;
    hideOpenAddTaskInputs();
  });

  // ── Card hover: calendar icon (date picker) ──
  container.addEventListener('click', e => {
    const btn = closestFromTarget(e.target, '[data-card-date-btn]');
    if (!btn) return;
    e.stopImmediatePropagation();
    // Close time picker if open
    if (cardPickerState) closeCardPicker();
    const card = btn.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.taskId;
    if (cardDatePickerState && cardDatePickerState.taskId === taskId) {
      closeCardDatePicker();
    } else {
      openCardDatePicker(taskId);
    }
  });

  // ── Card hover: clock icon (timer + planned) ──
  container.addEventListener('click', e => {
    const btn = closestFromTarget(e.target, '[data-card-clock-btn]');
    if (!btn) return;
    e.stopImmediatePropagation();
    // Close date picker if open
    if (cardDatePickerState) closeCardDatePicker();
    const card = btn.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.taskId;
    const task = findTaskById(taskId);
    if (!task) return;

    // If timer area is not showing, expand it
    if (!cardTimerExpanded.has(taskId) && !(focusState.running && focusState.taskId === taskId)) {
      cardTimerExpanded.add(taskId);
      const col = state.columns.find(c => c.tasks.some(t => t.id === taskId));
      if (col) renderColumn(col);

      // If no planned time, also open the planned time picker
      if (!task.timeEstimateMinutes) {
        setTimeout(() => openCardPicker(taskId, 'planned'), 0);
      }

      // Scroll card into view if timer area extends below column
      requestAnimationFrame(() => {
        const updatedCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (updatedCard) {
          const colEl = updatedCard.closest('.day-column');
          if (colEl) {
            const cardRect = updatedCard.getBoundingClientRect();
            const colRect = colEl.getBoundingClientRect();
            if (cardRect.bottom > colRect.bottom) {
              colEl.scrollTop += cardRect.bottom - colRect.bottom + 8;
            }
          }
        }
      });
    } else {
      // Timer area already visible — collapse it
      if (cardPickerState) closeCardPicker();
      cardTimerExpanded.delete(taskId);
      const col = state.columns.find(c => c.tasks.some(t => t.id === taskId));
      if (col) renderColumn(col);
    }
  });

  // ── Kanban card time badge toggle ───────────
  container.addEventListener('click', e => {
    const badge = closestFromTarget(e.target, '[data-card-time-badge]');
    if (!badge) return;
    e.stopPropagation();
    const card = badge.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.taskId;
    if (cardTimerExpanded.has(taskId)) {
      cardTimerExpanded.delete(taskId);
    } else {
      cardTimerExpanded.add(taskId);
    }
    const col = state.columns.find(c => c.tasks.some(t => t.id === taskId));
    if (col) renderColumn(col);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  // ── Kanban card timer pause/play ──────────
  container.addEventListener('click', e => {
    const btn = closestFromTarget(e.target, '[data-card-timer-toggle]');
    if (!btn) return;
    e.stopPropagation();
    const card = btn.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.taskId;
    if (focusState.running && focusState.taskId === taskId) {
      // Pause: stop timer and hide timer area
      stopFocusTimer();
      cardTimerExpanded.delete(taskId);
      const col = state.columns.find(c => c.tasks.some(t => t.id === taskId));
      if (col) renderColumn(col);
    } else {
      // Play: enter focus mode and start timer
      openFocusMode(taskId, true);
    }
  });

  // ── Card timer actual/planned picker ────────
  container.addEventListener('click', e => {
    // Inside an open card picker
    const picker = closestFromTarget(e.target, '[data-card-picker]');
    if (picker) {
      e.stopImmediatePropagation();
      const optBtn = closestFromTarget(e.target, '[data-card-picker-minutes]');
      if (optBtn) { applyCardPickerTime(parseInt(optBtn.dataset.cardPickerMinutes, 10)); return; }
      if (closestFromTarget(e.target, '[data-card-picker-edit]')) {
        if (cardPickerState) { cardPickerState.editMode = true; renderCardPicker(); }
        return;
      }
      if (closestFromTarget(e.target, '[data-card-picker-clear]')) { applyCardPickerTime(0); return; }
      return;
    }
    // Actual picker toggle
    const actualBtn = closestFromTarget(e.target, '[data-card-actual-picker-btn]');
    if (actualBtn) {
      e.stopPropagation();
      const card = actualBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      // Disabled while timer is running
      if (focusState.running && focusState.taskId === taskId) return;
      if (cardPickerState && cardPickerState.taskId === taskId && cardPickerState.type === 'actual') {
        closeCardPicker();
      } else {
        openCardPicker(taskId, 'actual');
      }
      return;
    }
    // Planned picker toggle
    const plannedBtn = closestFromTarget(e.target, '[data-card-planned-picker-btn]');
    if (plannedBtn) {
      e.stopPropagation();
      const card = plannedBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (cardPickerState && cardPickerState.taskId === taskId && cardPickerState.type === 'planned') {
        closeCardPicker();
      } else {
        openCardPicker(taskId, 'planned');
      }
      return;
    }
  });

  // ── Open task detail modal ──────────────────
  container.addEventListener('click', e => {
    if (suppressTaskCardClick) {
      suppressTaskCardClick = false;
      return;
    }
    if (closestFromTarget(e.target, '.task-card__complete-btn')) return;
    if (closestFromTarget(e.target, '[data-card-subtask-check]')) return;
    if (closestFromTarget(e.target, '[data-card-time-badge]')) return;
    if (closestFromTarget(e.target, '[data-card-timer-toggle]')) return;
    if (closestFromTarget(e.target, '[data-card-actual-picker-btn]')) return;
    if (closestFromTarget(e.target, '[data-card-planned-picker-btn]')) return;
    if (closestFromTarget(e.target, '[data-card-picker]')) return;
    if (closestFromTarget(e.target, '[data-card-date-btn]')) return;
    if (closestFromTarget(e.target, '[data-card-sdp]')) return;
    if (closestFromTarget(e.target, '[data-card-clock-btn]')) return;
    // Close any open card picker when clicking elsewhere
    if (cardPickerState) { closeCardPicker(); }
    if (cardDatePickerState) { closeCardDatePicker(); }
    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    openTaskDetailModal(card.dataset.taskId);
  });

  // ════ DRAG AND DROP — COLUMNS ════════════════

  // Pointer fallback: reorder and timeline drop without relying on native HTML5 drag.
  container.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (closestFromTarget(e.target, '.task-card__complete-btn')) return;
    if (closestFromTarget(e.target, '[data-card-subtask-check]')) return;
    if (closestFromTarget(e.target, '[data-card-time-badge]')) return;
    if (closestFromTarget(e.target, '[data-card-timer-toggle]')) return;
    if (closestFromTarget(e.target, '[data-card-actual-picker-btn]')) return;
    if (closestFromTarget(e.target, '[data-card-planned-picker-btn]')) return;
    if (closestFromTarget(e.target, '[data-card-picker]')) return;
    if (closestFromTarget(e.target, '[data-card-date-btn]')) return;
    if (closestFromTarget(e.target, '[data-card-sdp]')) return;
    if (closestFromTarget(e.target, '[data-card-clock-btn]')) return;
    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    e.preventDefault();
    taskPointerDrag = {
      taskId: card.dataset.taskId,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      sourceCard: card,
      ghostEl: null
    };
  });

  document.addEventListener('mousemove', e => {
    if (!taskPointerDrag) return;

    if (!taskPointerDrag.started) {
      const dx = e.clientX - taskPointerDrag.startX;
      const dy = e.clientY - taskPointerDrag.startY;
      if (Math.hypot(dx, dy) < TASK_POINTER_DRAG_THRESHOLD_PX) return;
      if (!beginTaskDragFromCard(taskPointerDrag.sourceCard)) {
        taskPointerDrag = null;
        return;
      }

      const ghost = taskPointerDrag.sourceCard.cloneNode(true);
      ghost.classList.remove('task-card--dragging', 'task-card--placeholder');
      ghost.classList.add('task-card--pointer-ghost');
      ghost.removeAttribute('draggable');
      ghost.style.width = `${taskPointerDrag.sourceCard.offsetWidth}px`;
      document.body.appendChild(ghost);

      taskPointerDrag.ghostEl = ghost;
      taskPointerDrag.started = true;
    }

    e.preventDefault();
    const ghost = taskPointerDrag.ghostEl;
    if (ghost) {
      ghost.style.left = `${e.clientX + 12}px`;
      ghost.style.top = `${e.clientY + 12}px`;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const taskList = resolveTaskListFromTarget(target);
    if (taskList) {
      updateTaskPlaceholderForList(taskList, e.clientY);
    } else {
      document.querySelectorAll('.task-list.drag-over').forEach(el => {
        el.classList.remove('drag-over');
        delete el.dataset.dropIndex;
      });
      document.querySelectorAll('.task-list').forEach(el => {
        delete el.dataset.dropIndex;
      });
      if (taskDropPlaceholder && taskDropPlaceholder.parentElement) {
        taskDropPlaceholder.remove();
      }
    }

    const overTimeline = !!(target && closestFromTarget(target, '#time-grid'));
    if (overTimeline) {
      showCalendarGhostForTask(taskPointerDrag.taskId, e.clientY);
    } else {
      hideCalendarGhost();
    }
  });

  document.addEventListener('mouseup', e => {
    if (!taskPointerDrag) return;
    const { started, taskId, ghostEl } = taskPointerDrag;
    taskPointerDrag = null;

    if (ghostEl && ghostEl.parentElement) ghostEl.remove();
    if (!started) return;
    suppressTaskCardClick = true;
    setTimeout(() => {
      suppressTaskCardClick = false;
    }, 0);

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const taskList = resolveTaskListFromTarget(target);
    if (taskList && dragState.taskId) {
      dropTaskIntoList(taskList);
      hideCalendarGhost();
      return;
    }

    const overTimeline = !!(target && closestFromTarget(target, '#time-grid'));
    if (overTimeline) {
      dropTaskOnTimeline(taskId, e.clientY);
    }

    hideCalendarGhost();
    cleanupTaskDropVisuals();
    finalizeTaskDragState();
  });

  // ── dragstart: pick up a task card ──────────
  container.addEventListener('dragstart', e => {
    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    if (!beginTaskDragFromCard(card)) return;
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    // setData is required in Firefox/Safari for a drag to be recognized as valid
    e.dataTransfer.setData('text/plain', dragState.taskId);
  });

  // ── dragend: clean up ───────────────────────
  container.addEventListener('dragend', () => {
    cleanupTaskDropVisuals();

    // Delay reset for Firefox (dragend fires before drop in FF)
    setTimeout(finalizeTaskDragState, 0);
  });

  // Safety net: Safari can miss source-scoped cleanup after some aborted drops.
  document.addEventListener('drop', () => {
    setTimeout(clearTaskDraggingClass, 0);
  }, true);
  document.addEventListener('dragend', () => {
    setTimeout(clearTaskDraggingClass, 0);
  }, true);

  // ── dragenter: highlight task list ──────────
  container.addEventListener('dragenter', e => {
    if (!dragState.taskId && !ensureTaskDragStateFromEvent(e)) return;
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList) return;
    taskList.classList.add('drag-over');
  });

  // ── dragover: show drop indicator ───────────
  container.addEventListener('dragover', e => {
    if (!dragState.taskId && !ensureTaskDragStateFromEvent(e)) return;
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    updateTaskPlaceholderForList(taskList, e.clientY);
  });

  // ── dragleave: un-highlight ──────────────────
  container.addEventListener('dragleave', e => {
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList) return;
    // Safari may emit dragleave with null relatedTarget while still inside the list.
    const nextTarget = e.relatedTarget || document.elementFromPoint(e.clientX, e.clientY);
    const colEl = taskList.closest('.day-column');
    if (nextTarget && taskList.contains(nextTarget)) return;
    if (nextTarget && closestFromTarget(nextTarget, '.task-list') === taskList) return;
    if (colEl && nextTarget && colEl.contains(nextTarget)) return;
    taskList.classList.remove('drag-over');
    delete taskList.dataset.dropIndex;
  });

  // ── drop: move task in state ─────────────────
  container.addEventListener('drop', e => {
    if (!dragState.taskId && !ensureTaskDragStateFromEvent(e)) return;
    const taskList = resolveTaskListFromTarget(e.target);
    if (!taskList || !dragState.taskId) return;
    e.preventDefault();
    dropTaskIntoList(taskList);
  });
}

function closeAnyPicker() {
  if (actualPickerOpen) { closeActualPicker(); return true; }
  if (plannedPickerOpen) { closePlannedPicker(); return true; }
  if (startDatePickerState) { closeStartDatePicker(); return true; }
  if (dueDatePickerState) { closeDueDatePicker(); return true; }
  if (focusPickerState) { closeFocusPicker(); return true; }
  return false;
}

function navigatePicker(dir) {
  const st = startDatePickerState || dueDatePickerState;
  if (!st) return;
  st.viewMonth += dir;
  if (st.viewMonth < 0) { st.viewMonth = 11; st.viewYear--; }
  if (st.viewMonth > 11) { st.viewMonth = 0; st.viewYear++; }
  if (startDatePickerState) renderStartDatePickerInModal();
  else renderDueDatePickerInModal();
}

function focusModalSubtaskInput(subtaskId) {
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay || overlay.hidden) return;
  const labelEl = overlay.querySelector(`[data-modal-subtask-label="${subtaskId}"]`);
  if (!labelEl) return;
  labelEl.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(labelEl);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function rerenderOpenTaskDetailModal(focusSubtaskId = null) {
  if (!openModalTaskId) return;
  const ctx = findTaskContext(openModalTaskId);
  if (!ctx) return;
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return;

  overlay.innerHTML = renderTaskDetailModal(ctx.task, ctx.column);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (focusState.running && focusState.taskId === openModalTaskId) {
    updateCardDetailTimerState();
  }
  if (focusSubtaskId) {
    requestAnimationFrame(() => focusModalSubtaskInput(focusSubtaskId));
  }
}

function addModalSubtask(task, insertAt = null) {
  ensureTaskTimeState(task);
  const subtask = createEmptySubtask();
  const index = Number.isInteger(insertAt) ? Math.max(0, Math.min(insertAt, task.subtasks.length)) : task.subtasks.length;
  task.subtasks.splice(index, 0, subtask);
  task.showSubtasks = true;
  syncTaskAggregateTimes(task);
  return subtask;
}

function removeModalSubtask(task, subtaskId) {
  ensureTaskTimeState(task);
  const index = task.subtasks.findIndex(s => s.id === subtaskId);
  if (index === -1) return null;
  const [removed] = task.subtasks.splice(index, 1);
  if (task.subtasks.length === 0) task.showSubtasks = false;
  syncTaskAggregateTimes(task);
  return removed;
}

function detachModalSubtaskToTask(task, column, subtaskId) {
  const removed = removeModalSubtask(task, subtaskId);
  if (!removed) return null;

  const parentIndex = column.tasks.findIndex(t => t.id === task.id);
  const standaloneTitle = String(removed.label || '').trim() || 'Untitled subtask';
  const newTask = {
    id: uid(),
    title: standaloneTitle,
    timeEstimateMinutes: removed.plannedMinutes || 0,
    actualTimeSeconds: removed.actualTimeSeconds || 0,
    ownPlannedMinutes: removed.plannedMinutes || 0,
    ownActualTimeSeconds: removed.actualTimeSeconds || 0,
    scheduledTime: null,
    complete: !!removed.done,
    tag: task.tag || null,
    integrationColor: task.integrationColor || null,
    subtasks: [],
    showSubtasks: false,
    notes: ''
  };

  const insertAt = parentIndex === -1 ? column.tasks.length : parentIndex + 1;
  column.tasks.splice(insertAt, 0, newTask);
  ensureTaskTimeState(newTask);

  return newTask;
}

function attachTaskModalEvents() {
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return;
  let clearSubtaskHoverSuppression = null;
  let suppressTopActionClick = false;

  const suppressSubtaskHoverUntilPointerMove = () => {
    overlay.classList.add('task-modal-overlay--suppress-subtask-hover');

    const release = () => {
      overlay.classList.remove('task-modal-overlay--suppress-subtask-hover');
      window.removeEventListener('mousemove', release, true);
      if (clearSubtaskHoverSuppression === release) {
        clearSubtaskHoverSuppression = null;
      }
    };

    if (clearSubtaskHoverSuppression) {
      window.removeEventListener('mousemove', clearSubtaskHoverSuppression, true);
      clearSubtaskHoverSuppression();
    }
    clearSubtaskHoverSuppression = release;
    window.addEventListener('mousemove', release, { once: true, capture: true });
  };

  const suppressNextTopActionClick = () => {
    suppressTopActionClick = true;
    requestAnimationFrame(() => {
      suppressTopActionClick = false;
    });
  };

  // Handle close/expand on mousedown so focused subtask inputs don't require a second click.
  overlay.addEventListener('mousedown', e => {
    if (!(e.target instanceof Element)) return;
    const closeBtn = e.target.closest('[data-task-modal-close]');
    if (closeBtn) {
      e.preventDefault();
      suppressNextTopActionClick();
      closeTaskDetailModal();
      return;
    }
    const expandBtn = e.target.closest('[data-expand-btn]');
    if (expandBtn) {
      if (!openModalTaskId) return;
      e.preventDefault();
      suppressNextTopActionClick();
      openFocusMode(openModalTaskId, false, 'card-detail');
    }
  }, true);

  overlay.addEventListener('click', e => {
    // Click on overlay background
    if (e.target === overlay) {
      if (!closeAnyPicker()) closeTaskDetailModal();
      return;
    }
    if (!(e.target instanceof Element)) return;
    if (suppressTopActionClick) {
      if (e.target.closest('[data-task-modal-close]') || e.target.closest('[data-expand-btn]')) {
        return;
      }
    }

    // Close modal button
    if (e.target.closest('[data-task-modal-close]')) {
      closeTaskDetailModal();
      return;
    }

    // "+ Subtasks" top action: create one row initially and focus label
    if (e.target.closest('[data-modal-add-two-subtasks]')) {
      if (!openModalTaskId) return;
      const ctx = findTaskContext(openModalTaskId);
      if (!ctx) return;
      const { task, column } = ctx;

      task.showSubtasks = true;
      let focusSubtaskId;
      if (task.subtasks.length === 0) {
        focusSubtaskId = addModalSubtask(task).id;
      } else {
        const emptyExisting = task.subtasks.find(st => !String(st.label || '').trim());
        focusSubtaskId = emptyExisting ? emptyExisting.id : addModalSubtask(task).id;
      }

      renderColumn(column);
      rerenderOpenTaskDetailModal(focusSubtaskId);
      return;
    }

    // Add subtask row button
    if (e.target.closest('[data-modal-add-subtask]')) {
      if (!openModalTaskId) return;
      const ctx = findTaskContext(openModalTaskId);
      if (!ctx) return;
      const subtask = addModalSubtask(ctx.task);
      renderColumn(ctx.column);
      rerenderOpenTaskDetailModal(subtask.id);
      return;
    }

    // Subtask checkbox toggle
    const subtaskCheckBtn = e.target.closest('[data-modal-subtask-check]');
    if (subtaskCheckBtn) {
      if (!openModalTaskId) return;
      const ctx = findTaskContext(openModalTaskId);
      if (!ctx) return;
      const subtaskId = subtaskCheckBtn.getAttribute('data-modal-subtask-check');
      const subtask = findSubtask(ctx.task, subtaskId);
      if (!subtask) return;
      subtask.done = !subtask.done;
      subtask.deleteReady = false;
      subtaskCheckBtn.classList.toggle('task-modal__check--complete', subtask.done);
      renderColumn(ctx.column);
      return;
    }

    // Convert subtask into standalone task (time moves with it and parent recalculates)
    const detachBtn = e.target.closest('[data-modal-subtask-detach]');
    if (detachBtn) {
      if (!openModalTaskId) return;
      const ctx = findTaskContext(openModalTaskId);
      if (!ctx) return;
      const subtaskId = detachBtn.getAttribute('data-modal-subtask-detach');

      if (focusState.running && focusState.taskId === openModalTaskId && focusState.subtaskId === subtaskId) {
        stopFocusTimer();
      }

      detachModalSubtaskToTask(ctx.task, ctx.column, subtaskId);
      renderColumn(ctx.column);
      rerenderOpenTaskDetailModal();
      return;
    }

    // Subtask play/pause
    const subtaskPlayBtn = e.target.closest('[data-modal-subtask-play]');
    if (subtaskPlayBtn) {
      if (!openModalTaskId) return;
      const subtaskId = subtaskPlayBtn.getAttribute('data-modal-subtask-play');
      if (!subtaskId) return;

      const isSameRunning = focusState.running
        && focusState.taskId === openModalTaskId
        && focusState.subtaskId === subtaskId;

      if (isSameRunning) {
        stopFocusTimer();
        return;
      }

      if (focusState.running) stopFocusTimer();
      openFocusMode(openModalTaskId, true, 'card-detail', subtaskId);
      return;
    }

    // START/STOP button on card detail
    if (e.target.closest('.task-modal__start-btn')) {
      if (!openModalTaskId) return;
      if (focusState.running && focusState.taskId === openModalTaskId) {
        // Timer is running — stop it
        stopFocusTimer();
      } else {
        // Open focus mode and auto-start timer
        openFocusMode(openModalTaskId, true, 'card-detail');
      }
      return;
    }

    // Expand button → enter focus mode without starting timer
    if (e.target.closest('[data-expand-btn]')) {
      if (openModalTaskId) openFocusMode(openModalTaskId, false, 'card-detail');
      return;
    }

    // Modal checkmark toggle
    if (e.target.closest('[data-modal-check]')) {
      if (!openModalTaskId) return;
      let task = null;
      let col = null;
      for (const c of state.columns) {
        const t = c.tasks.find(t => t.id === openModalTaskId);
        if (t) { task = t; col = c; break; }
      }
      if (!task) return;
      task.complete = !task.complete;
      if (task.complete && task.subtasks) task.subtasks.forEach(s => { s.done = true; });
      // Auto-set actual time to planned time when completing without actual time
      if (task.complete && !task.actualTimeSeconds && task.timeEstimateMinutes) {
        task.ownActualTimeSeconds = task.timeEstimateMinutes * 60;
        syncTaskAggregateTimes(task);
        const actualMetric = overlay.querySelector('[data-actual-btn]');
        if (actualMetric) {
          const valEl = actualMetric.querySelector('.task-modal__metric-value');
          if (valEl) {
            valEl.textContent = formatMinutes(task.timeEstimateMinutes);
            valEl.className = 'task-modal__metric-value task-modal__metric-value--set';
          }
        }
      }
      const btn = overlay.querySelector('[data-modal-check]');
      if (btn) {
        btn.classList.toggle('task-modal__check--complete', task.complete);
      }
      if (task.complete && task.subtasks) {
        overlay.querySelectorAll('[data-modal-subtask-check]').forEach(cb => {
          cb.classList.add('task-modal__check--complete');
        });
      }
      if (col) renderColumn(col);
      return;
    }

    // Due date picker toggle (check before start btn since due btn may also have meta-start-btn class)
    if (e.target.closest('[data-due-btn]')) {
      closeStartDatePicker();
      closePlannedPicker();
      closeActualPicker();
      if (dueDatePickerState) {
        closeDueDatePicker();
      } else if (openModalTaskId) {
        openDueDatePicker(openModalTaskId);
      }
      return;
    }

    // Start date picker toggle
    if (e.target.closest('.task-modal__meta-start-btn')) {
      closeDueDatePicker();
      closePlannedPicker();
      closeActualPicker();
      if (startDatePickerState) {
        closeStartDatePicker();
      } else if (openModalTaskId) {
        openStartDatePicker(openModalTaskId);
      }
      return;
    }

    // Inside start date dropdown
    const sdp = e.target.closest('[data-sdp]');
    if (sdp) {
      const dayBtn = e.target.closest('.sdp-cal__day');
      if (dayBtn && dayBtn.dataset.date) {
        handleStartDateAction('select-date', dayBtn.dataset.date);
        return;
      }
      const menuItem = e.target.closest('.sdp__menu-item');
      if (menuItem && menuItem.dataset.action) {
        handleStartDateAction(menuItem.dataset.action);
        return;
      }
      if (e.target.closest('[data-cal-prev]')) { navigatePicker(-1); return; }
      if (e.target.closest('[data-cal-next]')) { navigatePicker(1); return; }
      return;
    }

    // Inside due date dropdown
    const ddp = e.target.closest('[data-ddp]');
    if (ddp) {
      const dayBtn = e.target.closest('.sdp-cal__day');
      if (dayBtn && dayBtn.dataset.date) {
        handleDueDateAction(dayBtn.dataset.date);
        return;
      }
      const menuItem = e.target.closest('[data-action="remove-due"]');
      if (menuItem) {
        handleRemoveDueDate();
        return;
      }
      if (e.target.closest('[data-cal-prev]')) { navigatePicker(-1); return; }
      if (e.target.closest('[data-cal-next]')) { navigatePicker(1); return; }
      return;
    }

    // Inside planned time picker
    const ptp = e.target.closest('[data-planned-picker]');
    if (ptp) {
      // Quick-select option
      const optBtn = e.target.closest('[data-planned-minutes]');
      if (optBtn) {
        applyPlannedTime(parseInt(optBtn.dataset.plannedMinutes, 10));
        return;
      }
      // Switch to edit mode
      if (e.target.closest('[data-planned-edit-mode]')) {
        plannedPickerEditMode = true;
        renderPlannedPickerInModal();
        return;
      }
      // Clear planned
      if (e.target.closest('[data-planned-clear]')) {
        applyPlannedTime(0);
        return;
      }
      return;
    }

    // Planned time picker toggle (PLANNED metric click)
    if (e.target.closest('[data-planned-btn]')) {
      closeStartDatePicker();
      closeDueDatePicker();
      closeActualPicker();
      if (plannedPickerOpen) {
        closePlannedPicker();
      } else {
        openPlannedPicker();
      }
      return;
    }

    // Planned picker toggle on subtask row
    const subtaskPlannedBtn = e.target.closest('[data-modal-subtask-planned-btn]');
    if (subtaskPlannedBtn) {
      const subtaskId = subtaskPlannedBtn.getAttribute('data-modal-subtask-planned-btn');
      closeStartDatePicker();
      closeDueDatePicker();
      closeActualPicker();
      if (plannedPickerOpen && plannedPickerSubtaskId === subtaskId) {
        closePlannedPicker();
      } else {
        openPlannedPicker(subtaskId);
      }
      return;
    }

    // Inside actual time picker
    const atp = e.target.closest('[data-actual-picker]');
    if (atp) {
      const optBtn = e.target.closest('[data-actual-minutes]');
      if (optBtn) {
        applyActualTime(parseInt(optBtn.dataset.actualMinutes, 10));
        return;
      }
      if (e.target.closest('[data-actual-edit-mode]')) {
        actualPickerEditMode = true;
        renderActualPickerInModal();
        return;
      }
      if (e.target.closest('[data-actual-clear]')) {
        applyActualTime(0);
        return;
      }
      return;
    }

    // Actual time picker toggle (ACTUAL metric click) — disabled while timer running
    if (e.target.closest('[data-actual-btn]')) {
      if (focusState.running && focusState.taskId === openModalTaskId) return;
      closeStartDatePicker();
      closeDueDatePicker();
      closePlannedPicker();
      if (actualPickerOpen) {
        closeActualPicker();
      } else {
        openActualPicker();
      }
      return;
    }

    // Actual picker toggle on subtask row
    const subtaskActualBtn = e.target.closest('[data-modal-subtask-actual-btn]');
    if (subtaskActualBtn) {
      const subtaskId = subtaskActualBtn.getAttribute('data-modal-subtask-actual-btn');
      if (focusState.running && focusState.taskId === openModalTaskId && focusState.subtaskId === subtaskId) return;
      closeStartDatePicker();
      closeDueDatePicker();
      closePlannedPicker();
      if (actualPickerOpen && actualPickerSubtaskId === subtaskId) {
        closeActualPicker();
      } else {
        openActualPicker(subtaskId);
      }
      return;
    }

    // Click inside modal but outside any dropdown — close picker
    closeAnyPicker();
  });

  overlay.addEventListener('input', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    if (!(targetEl instanceof Element)) return;
    const notesEl = targetEl.closest('.task-modal__notes');
    if (notesEl) {
      const cleanNotes = notesEl.textContent.replace(/\n/g, '').trim();
      if (!cleanNotes && notesEl.innerHTML !== '') {
        notesEl.textContent = '';
      }
      return;
    }
    const labelEl = targetEl.closest('[data-modal-subtask-label]');
    if (!labelEl) return;
    if (!openModalTaskId) return;
    const ctx = findTaskContext(openModalTaskId);
    if (!ctx) return;

    const subtaskId = labelEl.getAttribute('data-modal-subtask-label');
    const subtask = findSubtask(ctx.task, subtaskId);
    if (!subtask) return;

    const cleanText = labelEl.textContent.replace(/\n/g, '').trim();
    if (!cleanText && labelEl.innerHTML !== '') {
      labelEl.textContent = '';
    }
    subtask.label = cleanText;
    subtask.deleteReady = false;
    labelEl.classList.toggle('task-modal__subtask-text--filled', !!cleanText);
  });

  overlay.addEventListener('focusout', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    if (!(targetEl instanceof Element)) return;
    const labelEl = targetEl.closest('[data-modal-subtask-label]');
    if (!labelEl) return;
    if (!openModalTaskId) return;
    const ctx = findTaskContext(openModalTaskId);
    if (!ctx) return;

    const subtaskId = labelEl.getAttribute('data-modal-subtask-label');
    const subtask = findSubtask(ctx.task, subtaskId);
    if (!subtask) return;

    const cleanText = labelEl.textContent.replace(/\n/g, '').trim();
    subtask.label = cleanText;
    subtask.deleteReady = false;
    labelEl.classList.toggle('task-modal__subtask-text--filled', !!cleanText);
    if (!cleanText) {
      labelEl.textContent = '';
    }

    // Reflect subtask title changes on the kanban card as soon as field focus leaves.
    renderColumn(ctx.column);
  });

  overlay.addEventListener('keydown', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    if (!(targetEl instanceof Element)) return;
    const labelEl = targetEl.closest('[data-modal-subtask-label]');
    if (!labelEl) return;
    if (!openModalTaskId) return;
    const ctx = findTaskContext(openModalTaskId);
    if (!ctx) return;

    const subtaskId = labelEl.getAttribute('data-modal-subtask-label');
    const task = ctx.task;
    const index = task.subtasks.findIndex(s => s.id === subtaskId);
    if (index === -1) return;
    const subtask = task.subtasks[index];

    if (e.key === 'Enter') {
      e.preventDefault();
      const inserted = addModalSubtask(task, index + 1);
      renderColumn(ctx.column);
      rerenderOpenTaskDetailModal(inserted.id);
      return;
    }

    if (e.key === 'Backspace') {
      const cleanText = labelEl.textContent.replace(/\n/g, '').trim();
      if (cleanText.length > 0) {
        subtask.deleteReady = false;
        return;
      }
      e.preventDefault();
      const nextFocusId = task.subtasks[index + 1]?.id || task.subtasks[index - 1]?.id || null;
      removeModalSubtask(task, subtaskId);
      renderColumn(ctx.column);
      rerenderOpenTaskDetailModal(nextFocusId);
    }
  });

  let modalSubtaskPointerDrag = null;

  const clearSubtaskDropTargets = () => {
    overlay.querySelectorAll('.task-modal__subtask-row--drop-before, .task-modal__subtask-row--drop-after')
      .forEach(row => row.classList.remove('task-modal__subtask-row--drop-before', 'task-modal__subtask-row--drop-after'));
  };

  const onSubtaskPointerMove = e => {
    if (!modalSubtaskPointerDrag) return;
    e.preventDefault();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const row = target instanceof Element ? target.closest('[data-modal-subtask-row]') : null;
    clearSubtaskDropTargets();

    if (!row) {
      modalSubtaskPointerDrag.targetId = null;
      return;
    }

    const targetId = row.getAttribute('data-modal-subtask-id');
    if (!targetId || targetId === modalSubtaskPointerDrag.draggedId) {
      modalSubtaskPointerDrag.targetId = null;
      return;
    }

    const rect = row.getBoundingClientRect();
    const placeAfter = e.clientY > rect.top + rect.height / 2;
    modalSubtaskPointerDrag.targetId = targetId;
    modalSubtaskPointerDrag.placeAfter = placeAfter;
    row.classList.add(placeAfter ? 'task-modal__subtask-row--drop-after' : 'task-modal__subtask-row--drop-before');
  };

  const endSubtaskPointerDrag = commit => {
    if (!modalSubtaskPointerDrag) return;
    const drag = modalSubtaskPointerDrag;
    modalSubtaskPointerDrag = null;

    document.removeEventListener('mousemove', onSubtaskPointerMove, true);
    document.removeEventListener('mouseup', onSubtaskPointerUp, true);
    overlay.classList.remove('task-modal-overlay--subtask-dragging');
    overlay.querySelectorAll('.task-modal__subtask-row--dragging')
      .forEach(row => row.classList.remove('task-modal__subtask-row--dragging'));
    clearSubtaskDropTargets();

    if (!commit || !openModalTaskId || !drag.targetId || drag.targetId === drag.draggedId) {
      suppressSubtaskHoverUntilPointerMove();
      return;
    }

    const ctx = findTaskContext(openModalTaskId);
    if (!ctx) {
      suppressSubtaskHoverUntilPointerMove();
      return;
    }

    const list = ctx.task.subtasks;
    const from = list.findIndex(s => s.id === drag.draggedId);
    const to = list.findIndex(s => s.id === drag.targetId);
    if (from === -1 || to === -1) {
      suppressSubtaskHoverUntilPointerMove();
      return;
    }

    const [moved] = list.splice(from, 1);
    let insertAt = to;
    if (from < to) insertAt -= 1;
    if (drag.placeAfter) insertAt += 1;
    insertAt = Math.max(0, Math.min(insertAt, list.length));
    list.splice(insertAt, 0, moved);

    renderColumn(ctx.column);
    rerenderOpenTaskDetailModal(drag.draggedId);
    suppressSubtaskHoverUntilPointerMove();
  };

  const onSubtaskPointerUp = e => {
    if (!modalSubtaskPointerDrag) return;
    e.preventDefault();
    endSubtaskPointerDrag(true);
  };

  overlay.addEventListener('mousedown', e => {
    const grab = e.target instanceof Element ? e.target.closest('[data-modal-subtask-grab]') : null;
    if (!grab) return;
    if (!openModalTaskId) return;

    const row = grab.closest('[data-modal-subtask-row]');
    if (!row) return;
    const draggedId = row.getAttribute('data-modal-subtask-id');
    if (!draggedId) return;

    e.preventDefault();
    clearSubtaskDropTargets();
    row.classList.add('task-modal__subtask-row--dragging');
    overlay.classList.add('task-modal-overlay--subtask-dragging');
    modalSubtaskPointerDrag = {
      draggedId,
      targetId: null,
      placeAfter: false
    };

    document.addEventListener('mousemove', onSubtaskPointerMove, true);
    document.addEventListener('mouseup', onSubtaskPointerUp, true);
  });

  document.addEventListener('keydown', e => {
    if (overlay.hidden) return;
    // Handle Enter in planned time entry mode
    if (e.key === 'Enter' && plannedPickerEditMode) {
      e.preventDefault();
      handlePlannedTimeEntry();
      return;
    }
    // Handle Enter in actual time entry mode
    if (e.key === 'Enter' && actualPickerEditMode) {
      e.preventDefault();
      handleActualTimeEntry();
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (!closeAnyPicker()) closeTaskDetailModal();
  });
}

function openTopbarTodayPicker() {
  const currentDate = getFirstVisibleDate();
  const d = new Date(currentDate + 'T12:00:00');
  topbarTodayPickerState = {
    selectedIsoDate: currentDate,
    viewYear: d.getFullYear(),
    viewMonth: d.getMonth()
  };
  renderTopbarTodayPicker();
}

function closeTopbarTodayPicker() {
  topbarTodayPickerState = null;
  const existing = document.querySelector('[data-topbar-sdp]');
  if (existing) existing.remove();
}

function renderTopbarTodayPicker() {
  if (!topbarTodayPickerState) return;
  const todayBtn = document.querySelector('[data-view="today"]');
  if (!todayBtn) return;

  const existing = document.querySelector('[data-topbar-sdp]');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderTopbarTodayDropdown(
    topbarTodayPickerState.selectedIsoDate,
    topbarTodayPickerState.viewYear,
    topbarTodayPickerState.viewMonth
  );
  const dropdown = wrapper.firstElementChild;
  todayBtn.appendChild(dropdown);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function getFirstVisibleDate() {
  const container = document.getElementById('day-columns');
  if (!container) return getTodayISO();
  const columnSpan = getColumnSpanPx(container);
  if (columnSpan <= 0) return getTodayISO();
  const visibleCols = getColumnsInWindow(state.dayWindow.startISO, state.dayWindow.endISO);
  const firstVisibleIndex = Math.round(container.scrollLeft / columnSpan);
  if (firstVisibleIndex >= 0 && firstVisibleIndex < visibleCols.length) {
    return visibleCols[firstVisibleIndex].isoDate;
  }
  return getTodayISO();
}

function updateTodayButtonLabel(overrideDate) {
  const btn = document.querySelector('[data-view="today"]');
  if (!btn) return;
  const firstDate = overrideDate || getFirstVisibleDate();
  const todayISO = getTodayISO();
  const isToday = firstDate === todayISO;
  let label;
  if (isToday) {
    label = 'Today';
  } else if (firstDate === addDays(todayISO, 1)) {
    label = 'Tomorrow';
  } else if (firstDate === addDays(todayISO, -1)) {
    label = 'Yesterday';
  } else {
    label = formatDateDisplay(firstDate);
  }
  // Update the text node after the icon (last text node)
  const textNodes = Array.from(btn.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
  const textNode = textNodes[textNodes.length - 1];
  if (textNode) {
    textNode.textContent = ' ' + label;
  }
  // Add/remove close button
  const existing = btn.querySelector('[data-today-close]');
  if (isToday) {
    if (existing) existing.remove();
  } else if (!existing) {
    const closeBtn = document.createElement('span');
    closeBtn.className = 'view-btn__close';
    closeBtn.setAttribute('data-today-close', '');
    closeBtn.innerHTML = '<i data-lucide="x"></i>';
    btn.appendChild(closeBtn);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Update calendar timeline header and events when date changes
  updateCalendarDayHeader(firstDate);
  if (updateTodayButtonLabel._lastCalDate !== firstDate) {
    updateTodayButtonLabel._lastCalDate = firstDate;
    renderCalendarEvents._overrideDate = firstDate;
    renderCalendarEvents();
  }
}

function updateCalendarDayHeader(isoDate) {
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const d = parseISO(isoDate);
  const infoEl = document.querySelector('.calendar-day-info');
  const nameEl = document.querySelector('.calendar-day-name');
  const numEl = document.querySelector('.calendar-day-number');
  if (nameEl) nameEl.textContent = dayNames[d.getDay()];
  if (numEl) numEl.textContent = d.getDate();
  if (infoEl) infoEl.classList.add('calendar-day-info--ready');
}

function handleTopbarTodayAction(action, data) {
  if (!topbarTodayPickerState) return;
  const todayISO = getTodayISO();
  let targetIsoDate = null;

  switch (action) {
    case 'go-today':
      targetIsoDate = todayISO;
      break;
    case 'go-next-day':
      targetIsoDate = addDays(getFirstVisibleDate(), 1);
      break;
    case 'go-previous-day':
      targetIsoDate = addDays(getFirstVisibleDate(), -1);
      break;
    case 'select-date':
      targetIsoDate = data;
      break;
    default:
      break;
  }

  if (targetIsoDate) {
    scrollToDateColumn(targetIsoDate, { behavior: 'smooth' });
    closeTopbarTodayPicker();
  }
}

function attachBoardTopbarEvents() {
  const todayBtn = document.querySelector('[data-view="today"]');
  if (!todayBtn) return;

  todayBtn.addEventListener('click', e => {
    // Ignore clicks inside the picker dropdown — handled by document listener
    if (e.target.closest('[data-topbar-sdp]')) return;
    // Close button — go back to today
    if (e.target.closest('[data-today-close]')) {
      e.preventDefault();
      e.stopPropagation();
      closeTopbarTodayPicker();
      scrollToDateColumn(getTodayISO(), { behavior: 'smooth' });
      return;
    }
    e.preventDefault();
    if (topbarTodayPickerState) {
      closeTopbarTodayPicker();
    } else {
      openTopbarTodayPicker();
    }
  });
}

function attachSidebarEvents() {
  const focusBtn = document.querySelector('[data-sidebar-focus]');
  if (!focusBtn) return;

  focusBtn.addEventListener('click', e => {
    e.preventDefault();

    const topCard = document.querySelector(
      '#day-columns .day-column:first-child .task-list .task-card:not(.task-card--placeholder):not(.task-card--dragging)'
    );

    if (topCard && topCard.dataset.taskId) {
      openFocusMode(topCard.dataset.taskId, false, 'sidebar');
      return;
    }

    const firstTaskId = state.columns[0]?.tasks[0]?.id;
    if (firstTaskId) {
      openFocusMode(firstTaskId, false, 'sidebar');
    }
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
    const hourHeight = getHourHeightPx(timeGrid);
    const rawTop  = (clientY - gridTop) / hourHeight - grabOffsetHours;
    const snapped = Math.round(rawTop * SNAP_STEPS_PER_HOUR) / SNAP_STEPS_PER_HOUR;
    return clampCalendarOffset(snapped, duration, timeGrid);
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
    const hourHeight = getHourHeightPx(timeGrid);
    const grabOffsetHours = (e.clientY - gridTop) / hourHeight - evt.offset;

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

    const task   = findTaskById(taskDragId);
    if (!task) return;

    const durationHours = task.timeEstimateMinutes > 0
      ? task.timeEstimateMinutes / 60
      : 0.5;
    const offset = yToOffset(e.clientY, timeGrid, durationHours);
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

    const duration = task.timeEstimateMinutes > 0
      ? task.timeEstimateMinutes / 60
      : 0.5;
    const offset   = yToOffset(e.clientY, timeGrid, duration);

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
      const hourHeight = getHourHeightPx(timeGrid);
      const totalHours = getCalendarTotalHours(timeGrid);
      const deltaHours = (e.clientY - startY) / hourHeight;
      const rawHandle   = startEnd + deltaHours;
      const snapped     = Math.round(rawHandle * SNAP_STEPS_PER_HOUR) / SNAP_STEPS_PER_HOUR;
      const handleAt    = Math.max(0, Math.min(snapped, totalHours));

      let nextOffset;
      let nextDuration;

      if (handleAt >= startOffset) {
        // Normal downward/within-block resize: keep start fixed.
        nextOffset = startOffset;
        nextDuration = Math.min(Math.max(minDuration, handleAt - startOffset), totalHours - startOffset);
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

// Topbar today picker: handle internal clicks and close on outside click
document.addEventListener('click', e => {
  if (!topbarTodayPickerState) return;
  if (!(e.target instanceof Element)) { closeTopbarTodayPicker(); return; }

  const picker = e.target.closest('[data-topbar-sdp]');
  if (picker) {
    e.stopImmediatePropagation();
    if (e.target.closest('[data-cal-prev]')) {
      topbarTodayPickerState.viewMonth--;
      if (topbarTodayPickerState.viewMonth < 0) {
        topbarTodayPickerState.viewMonth = 11;
        topbarTodayPickerState.viewYear--;
      }
      renderTopbarTodayPicker();
      return;
    }
    if (e.target.closest('[data-cal-next]')) {
      topbarTodayPickerState.viewMonth++;
      if (topbarTodayPickerState.viewMonth > 11) {
        topbarTodayPickerState.viewMonth = 0;
        topbarTodayPickerState.viewYear++;
      }
      renderTopbarTodayPicker();
      return;
    }
    const dayCell = e.target.closest('[data-date]');
    if (dayCell) {
      topbarTodayPickerState.selectedIsoDate = dayCell.dataset.date || topbarTodayPickerState.selectedIsoDate;
      handleTopbarTodayAction('select-date', dayCell.dataset.date);
      return;
    }
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      handleTopbarTodayAction(actionBtn.dataset.action);
      return;
    }
    return;
  }

  // Toggle button click is handled by attachBoardTopbarEvents()
  if (e.target.closest('[data-view="today"]')) return;

  closeTopbarTodayPicker();
});

// Escape key for topbar today picker
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && topbarTodayPickerState) {
    e.preventDefault();
    closeTopbarTodayPicker();
  }
});

// Close card picker on outside click
document.addEventListener('click', e => {
  if (!cardPickerState) return;
  if (e.target instanceof Element) {
    if (e.target.closest('[data-card-picker]')) return;
    if (e.target.closest('[data-card-actual-picker-btn]')) return;
    if (e.target.closest('[data-card-planned-picker-btn]')) return;
  }
  closeCardPicker();
});

// Card date picker: handle internal clicks and close on outside click
document.addEventListener('click', e => {
  if (!cardDatePickerState) return;
  if (!(e.target instanceof Element)) { closeCardDatePicker(); return; }

  // Clicks on the toggle button are handled by the container listener
  if (e.target.closest('[data-card-date-btn]')) return;

  // Internal clicks inside the dropdown
  const cardSdp = e.target.closest('[data-card-sdp]');
  if (cardSdp) {
    e.stopImmediatePropagation();
    // Calendar prev/next
    if (e.target.closest('[data-cal-prev]')) {
      cardDatePickerState.viewMonth--;
      if (cardDatePickerState.viewMonth < 0) { cardDatePickerState.viewMonth = 11; cardDatePickerState.viewYear--; }
      renderCardDatePicker();
      return;
    }
    if (e.target.closest('[data-cal-next]')) {
      cardDatePickerState.viewMonth++;
      if (cardDatePickerState.viewMonth > 11) { cardDatePickerState.viewMonth = 0; cardDatePickerState.viewYear++; }
      renderCardDatePicker();
      return;
    }
    // Date cell click
    const dayCell = e.target.closest('[data-date]');
    if (dayCell) { handleCardDateAction('select-date', dayCell.dataset.date); return; }
    // Snooze / move actions
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) { handleCardDateAction(actionBtn.dataset.action); return; }
    return;
  }

  // Outside click — close
  closeCardDatePicker();
});

// Escape key for card date picker
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && cardDatePickerState) {
    e.preventDefault();
    closeCardDatePicker();
  }
});

// Enter key for card picker edit mode
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && cardPickerState && cardPickerState.editMode) {
    e.preventDefault();
    handleCardPickerTimeEntry();
  }
  if (e.key === 'Escape' && cardPickerState) {
    e.preventDefault();
    closeCardPicker();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initializeDayWindow();
  initializeTaskTimeState();
  renderAllColumns();
  initializeTodayFirstColumnPosition();
  renderCalendarEvents();
  renderWorkdayMarkers();
  attachCalendarZoomEvents();
  attachEvents();
  attachBoardTopbarEvents();
  attachSidebarEvents();
  attachTaskModalEvents();
  attachCalendarEvents();
  attachCalendarResizeEvents();
  attachWorkdayMarkerEvents();
  requestAnimationFrame(scrollTimelineToWorkdayStart);

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});
