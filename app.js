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
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri
const userSettings = {
  // TODO: wire to user settings storage/UI
  workingDays: DEFAULT_WORKING_DAYS.slice()
};
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

const CHANNELS = [
  { id: 'unassigned', label: 'Unassigned', context: null, hashColor: '#999999', eventClass: 'cal-event--blue' },
  { id: 'ch-work', label: 'work', context: null, hashColor: '#e67e22', eventClass: 'cal-event--orange', isContext: true },
  { id: 'ch-code-reviews', label: 'code reviews', context: 'work', hashColor: '#e74c3c', eventClass: 'cal-event--orange' },
  { id: 'ch-coding', label: 'coding', context: 'work', hashColor: '#f39c12', eventClass: 'cal-event--orange' },
  { id: 'ch-debugging', label: 'debugging', context: 'work', hashColor: '#e67e22', eventClass: 'cal-event--orange' },
  { id: 'ch-growth', label: 'growth', context: 'work', hashColor: '#22c55e', eventClass: 'cal-event--green' },
  { id: 'ch-meetings', label: 'meetings', context: 'work', hashColor: '#9b59b6', eventClass: 'cal-event--purple' },
  { id: 'ch-planning', label: 'planning', context: 'work', hashColor: '#f59e0b', eventClass: 'cal-event--orange' },
  { id: 'ch-product', label: 'product', context: 'work', hashColor: '#4a90d9', eventClass: 'cal-event--blue' },
  { id: 'ch-personal', label: 'personal', context: null, hashColor: '#3498db', eventClass: 'cal-event--blue', isContext: true },
  { id: 'ch-test', label: 'test', context: null, hashColor: '#9b8ec4', eventClass: 'cal-event--purple' },
];

// Build lookup map from channels
const CHANNEL_COLORS = {};
CHANNELS.forEach(ch => {
  if (ch.id !== 'unassigned') {
    CHANNEL_COLORS['#' + ch.label] = { hashColor: ch.hashColor, eventClass: ch.eventClass };
  }
});

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
  workdayDefault: {
    startOffset: DEFAULT_WORKDAY_START_HOUR,
    endOffset: DEFAULT_WORKDAY_END_HOUR
  },
  workdayByDate: {},

  calendarZoom: DEFAULT_CALENDAR_ZOOM,
  dayWindow: {
    startISO: null,
    endISO: null
  }
};

const DAILY_PLANNING_STEPS = {
  ADD_TASKS: 1,
  WORKLOAD: 2,
  FINALIZE: 3,
  SHARE: 4
};

const DAILY_PLANNING_STEP_ORDER = [
  DAILY_PLANNING_STEPS.ADD_TASKS,
  DAILY_PLANNING_STEPS.WORKLOAD,
  DAILY_PLANNING_STEPS.FINALIZE,
  DAILY_PLANNING_STEPS.SHARE
];

const DAILY_PLANNING_DEFER_MODES = {
  NEXT_MONDAY: 'next_monday'
};

const DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME = '16:55';

const dailyPlanningState = {
  isActive: false,
  selectedDate: null,
  returnToDate: null,
  step: DAILY_PLANNING_STEPS.ADD_TASKS,
  runDraft: null,
  runHistoryByDate: {},
  deferPolicy: {
    nextWeekMode: DAILY_PLANNING_DEFER_MODES.NEXT_MONDAY
  },
  capacityConfig: {
    mode: 'remaining_before_shutdown',
    defaultMinutes: 480,
    perDayOverrides: {}
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

function daysBetween(isoA, isoB) {
  const a = parseISO(isoA);
  const b = parseISO(isoB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function getWorkingDaysSet() {
  const raw = Array.isArray(userSettings.workingDays) ? userSettings.workingDays : DEFAULT_WORKING_DAYS;
  const cleaned = raw.filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
  return new Set(cleaned.length > 0 ? cleaned : DEFAULT_WORKING_DAYS);
}

function isWorkingDay(isoDate) {
  const day = parseISO(isoDate).getDay();
  return getWorkingDaysSet().has(day);
}

function getNextWorkingDayOnOrAfter(isoDate) {
  const workingDays = getWorkingDaysSet();
  if (workingDays.size === 0) return isoDate;
  let cursor = isoDate;
  for (let i = 0; i < 14; i++) { // guard against malformed settings
    if (workingDays.has(parseISO(cursor).getDay())) return cursor;
    cursor = addDays(cursor, 1);
  }
  return isoDate;
}

function countWorkingDaysBetween(startISO, endISO) {
  if (!startISO || !endISO || startISO >= endISO) return 0;
  const workingDays = getWorkingDaysSet();
  if (workingDays.size === 0) return Math.max(0, daysBetween(startISO, endISO));
  let count = 0;
  let cursor = addDays(startISO, 1);
  while (cursor <= endISO) {
    if (workingDays.has(parseISO(cursor).getDay())) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
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

function getRolloverTargetDate(task, todayISO) {
  if (!isWorkTask(task)) return todayISO;
  return getNextWorkingDayOnOrAfter(todayISO);
}

function performRollover() {
  const todayISO = getTodayISO();
  const todayCol = ensureColumnForDate(todayISO);

  for (const col of state.columns) {
    if (col.isoDate >= todayISO) continue;
    for (let i = col.tasks.length - 1; i >= 0; i--) {
      const task = col.tasks[i];
      ensureTaskRolloverState(task);
      if (task.complete) continue;
      if (!task.startDate) {
        task.startDate = col.isoDate;
      }
      // Clear scheduledTime so it doesn't auto-generate a calendar event on today
      task.scheduledTime = null;
      // Leave stored calendar events on the old date as-is (historical record)
      col.tasks.splice(i, 1);
      const targetISO = getRolloverTargetDate(task, todayISO);
      const targetCol = targetISO === todayISO ? todayCol : ensureColumnForDate(targetISO);
      targetCol.tasks.push(task);
    }
  }
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
  const todayISO = getTodayISO();
  const isPastCol = column.isoDate < todayISO;
  let plannedMinutes = column.tasks.reduce((sum, task) => {
    ensureTaskTimeState(task);
    return sum + (isPastCol ? getPlannedMinutesForDate(task, column.isoDate) : (task.timeEstimateMinutes || 0));
  }, 0);
  // Use daily actual time for the column's date
  const actualSeconds = column.tasks.reduce((sum, task) => {
    return sum + getTaskDailyActualSeconds(task, column.isoDate);
  }, 0);
  // Also include ghost tasks' daily time and planned time for past columns
  let ghostActualSeconds = 0;
  if (isPastCol) {
    const ghosts = getGhostTasksForDate(column.isoDate);
    ghostActualSeconds = ghosts.reduce((sum, task) => sum + getTaskDailyActualSeconds(task, column.isoDate), 0);
    plannedMinutes += ghosts.reduce((sum, task) => {
      ensureTaskTimeState(task);
      return sum + getPlannedMinutesForDate(task, column.isoDate);
    }, 0);
  }
  const actualMinutes = Math.floor((actualSeconds + ghostActualSeconds) / 60);

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

function ensureTaskRolloverState(task) {
  if (!task || typeof task !== 'object') return;
  if (typeof task.startDate !== 'string' && task.startDate !== null) task.startDate = null;
  if (!task.dailyActualTime || typeof task.dailyActualTime !== 'object') task.dailyActualTime = {};
  if (!task.subtaskCompletionsByDate || typeof task.subtaskCompletionsByDate !== 'object') task.subtaskCompletionsByDate = {};
  if (typeof task.completedOnDate !== 'string' && task.completedOnDate !== null) task.completedOnDate = null;
}

function getRolloverCount(task, columnIsoDate) {
  ensureTaskRolloverState(task);
  if (!task.startDate || !columnIsoDate) return 0;
  const count = isWorkTask(task)
    ? countWorkingDaysBetween(task.startDate, columnIsoDate)
    : daysBetween(task.startDate, columnIsoDate);
  return count > 0 ? count : 0;
}

function getTaskDailyActualSeconds(task, isoDate) {
  ensureTaskRolloverState(task);
  const dayEntry = task.dailyActualTime[isoDate];
  if (!dayEntry) return 0;
  let total = dayEntry.ownSeconds || 0;
  if (dayEntry.subtasks) {
    for (const stId in dayEntry.subtasks) {
      total += dayEntry.subtasks[stId] || 0;
    }
  }
  return total;
}

function recordDailyTime(task, isoDate, deltaSeconds, subtaskId) {
  ensureTaskRolloverState(task);
  if (!task.dailyActualTime[isoDate]) {
    task.dailyActualTime[isoDate] = { ownSeconds: 0, subtasks: {} };
  }
  const entry = task.dailyActualTime[isoDate];
  if (subtaskId) {
    entry.subtasks[subtaskId] = (entry.subtasks[subtaskId] || 0) + deltaSeconds;
  } else {
    entry.ownSeconds = (entry.ownSeconds || 0) + deltaSeconds;
  }
}

function hasActivityOnDate(task, isoDate) {
  ensureTaskRolloverState(task);
  if (task.completedOnDate === isoDate) return true;
  if (task.subtaskCompletionsByDate[isoDate] && task.subtaskCompletionsByDate[isoDate].length > 0) return true;
  if (getTaskDailyActualSeconds(task, isoDate) > 0) return true;
  // Check for stored calendar events (timeboxed) on this date
  if (state.calendarEvents.some(e => e.taskId === task.id && e.date === isoDate)) return true;
  return false;
}

// Get all timebox events for a task on a specific date
function getTaskTimeboxesForDate(task, isoDate) {
  if (!task || !isoDate) return [];
  return state.calendarEvents.filter(e => e.taskId === task.id && e.date === isoDate);
}

function hasTimeboxForDate(task, isoDate) {
  return getTaskTimeboxesForDate(task, isoDate).length > 0;
}

// Get the planned minutes to display for a task on a specific date.
// If timeboxed on that date, returns the sum of all timebox durations; otherwise returns timeEstimateMinutes.
function getPlannedMinutesForDate(task, isoDate) {
  ensureTaskTimeState(task);
  const timeboxes = getTaskTimeboxesForDate(task, isoDate);
  if (timeboxes.length > 0) {
    return timeboxes.reduce((sum, tb) => sum + Math.round(tb.duration * 60), 0);
  }
  return task.timeEstimateMinutes || 0;
}

// Get the aggregate planned minutes across all dates where the task appears.
// = timeEstimateMinutes (shared/current) + sum of past timebox durations
function getAggregatePlannedMinutes(task) {
  ensureTaskTimeState(task);
  const todayISO = getTodayISO();
  let totalTimeboxMinutes = 0;
  for (const evt of state.calendarEvents) {
    if (evt.taskId === task.id && evt.date < todayISO) {
      totalTimeboxMinutes += Math.round(evt.duration * 60);
    }
  }
  return (task.timeEstimateMinutes || 0) + totalTimeboxMinutes;
}

function completeTaskAsOf(task, isoDate) {
  ensureTaskRolloverState(task);
  ensureTaskTimeState(task);
  task.complete = true;
  task.completedOnDate = isoDate;
  // Auto-set actual time to planned time if no actual time exists
  if (!task.actualTimeSeconds && task.timeEstimateMinutes) {
    task.ownActualTimeSeconds = (task.ownPlannedMinutes || 0) * 60;
    task.subtasks.forEach(s => {
      if (s.plannedMinutes && !s.actualTimeSeconds) {
        s.actualTimeSeconds = s.plannedMinutes * 60;
      }
    });
    syncTaskAggregateTimes(task);
    // Log to daily actual time
    if (!task.dailyActualTime[isoDate]) task.dailyActualTime[isoDate] = { ownSeconds: 0, subtasks: {} };
    task.dailyActualTime[isoDate].ownSeconds = (task.ownActualTimeSeconds || 0);
    task.subtasks.forEach(s => {
      if (s.actualTimeSeconds) {
        task.dailyActualTime[isoDate].subtasks[s.id] = s.actualTimeSeconds;
      }
    });
  }
  // Mark subtasks complete
  if (task.subtasks) {
    task.subtasks.forEach(s => {
      if (!s.done) {
        s.done = true;
        if (!task.subtaskCompletionsByDate[isoDate]) task.subtaskCompletionsByDate[isoDate] = [];
        if (!task.subtaskCompletionsByDate[isoDate].includes(s.id)) {
          task.subtaskCompletionsByDate[isoDate].push(s.id);
        }
      }
    });
  }
}

function rerenderGhostColumns(task) {
  const todayISO = getTodayISO();
  for (const col of state.columns) {
    if (col.isoDate >= todayISO) continue;
    if (col.tasks.some(t => t.id === task.id)) continue; // skip home column
    const colEl = document.querySelector(`.day-column[data-col-id="${col.id}"]`);
    if (colEl) renderColumn(col);
  }
}

function getGhostTasksForDate(isoDate) {
  const ghosts = [];
  for (const col of state.columns) {
    if (col.isoDate === isoDate) continue;
    for (const task of col.tasks) {
      ensureTaskRolloverState(task);
      if (hasActivityOnDate(task, isoDate)) {
        ghosts.push(task);
      }
    }
  }
  return ghosts;
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

  ensureTaskRolloverState(task);
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

function getRelativeDateLabel(isoDate) {
  const todayISO = getTodayISO();
  if (isoDate === todayISO) return 'Today';
  if (isoDate === addDays(todayISO, 1)) return 'Tomorrow';
  if (isoDate === addDays(todayISO, -1)) return 'Yesterday';
  return formatDateDisplay(isoDate);
}

function getOrdinalSuffix(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatMonthDayOrdinal(isoDate) {
  const d = parseISO(isoDate);
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const day = d.getDate();
  return `${months[d.getMonth()]} ${day}${getOrdinalSuffix(day)}`;
}

function getWeekStartISO(isoDate) {
  const d = parseISO(isoDate);
  const mondayIndex = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayIndex);
  return toISO(d);
}

function isSameWeek(isoDate, todayISO) {
  return getWeekStartISO(isoDate) === getWeekStartISO(todayISO);
}

function getDailyPlanningDateLabel(isoDate) {
  const todayISO = getTodayISO();
  if (isoDate === todayISO) return 'Today';
  if (isoDate === addDays(todayISO, 1)) return 'Tomorrow';
  if (isSameWeek(isoDate, todayISO)) return getDayName(isoDate);
  return formatMonthDayOrdinal(isoDate);
}

function getDailyPlanningDateLabelForSentence(isoDate) {
  const label = getDailyPlanningDateLabel(isoDate);
  if (label === 'Today') return 'today';
  if (label === 'Tomorrow') return 'tomorrow';
  return label;
}

function getNextMondayISO(isoDate) {
  const dayIndex = parseISO(isoDate).getDay(); // 0 = Sunday ... 6 = Saturday
  let delta = (8 - dayIndex) % 7;
  if (delta === 0) delta = 7;
  return addDays(isoDate, delta);
}

function getDailyPlanningNextWeekDate(isoDate) {
  const tomorrowISO = addDays(isoDate, 1);
  switch (dailyPlanningState.deferPolicy.nextWeekMode) {
    case DAILY_PLANNING_DEFER_MODES.NEXT_MONDAY:
    default: {
      let nextMonday = getNextMondayISO(isoDate);
      // Avoid duplicate Tomorrow/Next week buckets on Sundays.
      if (nextMonday === tomorrowISO) {
        nextMonday = addDays(nextMonday, 7);
      }
      return nextMonday;
    }
  }
}

function getWorkdayBoundsForDate(isoDate) {
  const override = state.workdayByDate[isoDate];
  if (override) {
    return {
      startOffset: override.startOffset,
      endOffset: override.endOffset
    };
  }
  if (state.workdayDefault) {
    return {
      startOffset: state.workdayDefault.startOffset,
      endOffset: state.workdayDefault.endOffset
    };
  }
  return {
    startOffset: state.workday.startOffset,
    endOffset: state.workday.endOffset
  };
}

function applyWorkdayBoundsForDate(isoDate) {
  if (!isoDate) return;
  const bounds = getWorkdayBoundsForDate(isoDate);
  state.workday.startOffset = bounds.startOffset;
  state.workday.endOffset = bounds.endOffset;
  renderWorkdayMarkers();
}

function storeWorkdayOverrideForDate(isoDate) {
  if (!isoDate) return;
  state.workdayByDate[isoDate] = {
    startOffset: state.workday.startOffset,
    endOffset: state.workday.endOffset
  };
}

function getDailyPlanningCapacityMinutes(isoDate) {
  const specific = dailyPlanningState.capacityConfig.perDayOverrides[isoDate];
  if (Number.isFinite(specific) && specific > 0) return specific;

  if (dailyPlanningState.capacityConfig.mode === 'remaining_before_shutdown') {
    const bounds = getWorkdayBoundsForDate(isoDate);
    const startMinutes = Math.max(0, Math.round(bounds.startOffset * 60));
    const endMinutes = Math.max(startMinutes, Math.round(bounds.endOffset * 60));
    const todayISO = getTodayISO();

    if (isoDate === todayISO) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const effectiveStart = Math.max(startMinutes, nowMinutes);
      return Math.max(0, endMinutes - effectiveStart);
    }

    return Math.max(0, endMinutes - startMinutes);
  }

  return dailyPlanningState.capacityConfig.defaultMinutes;
}

function isDailyPlanningArtifactTask(task) {
  return !!(task && task.systemType === 'daily_planning');
}

function isWorkTask(task) {
  if (!task) return false;
  const tag = normalizeTag(task.tag);
  if (!tag) return false;
  if (tag === '#work') return true;
  const channel = CHANNELS.find(ch => '#' + ch.label === tag);
  if (!channel) return false;
  return channel.context === 'work' || channel.label === 'work';
}

function getDailyPlanningWorkloadSummary(isoDate) {
  const col = ensureColumnForDate(isoDate);
  const tasks = (col.tasks || []).filter(task => !isDailyPlanningArtifactTask(task));
  const plannedWorkMinutes = tasks.reduce((sum, task) => {
    ensureTaskTimeState(task);
    return sum + (isWorkTask(task) ? (task.timeEstimateMinutes || 0) : 0);
  }, 0);
  const plannedTotalMinutes = tasks.reduce((sum, task) => {
    ensureTaskTimeState(task);
    return sum + (task.timeEstimateMinutes || 0);
  }, 0);
  const capacityMinutes = getDailyPlanningCapacityMinutes(isoDate);
  const deltaMinutes = capacityMinutes - plannedWorkMinutes;
  let status = 'ok';
  if (plannedWorkMinutes >= capacityMinutes) {
    status = 'over';
  } else if (deltaMinutes <= 60) {
    status = 'near';
  }
  return {
    plannedWorkMinutes,
    plannedTotalMinutes,
    capacityMinutes,
    overcommitted: plannedWorkMinutes > capacityMinutes,
    status
  };
}

function createDailyPlanningRunDraft(dateISO) {
  const shutdownTask = getDailyShutdownTaskForDate(dateISO);
  const shutdownTime = shutdownTask && /^\d{2}:\d{2}$/.test(String(shutdownTask.scheduledTime || ''))
    ? shutdownTask.scheduledTime
    : DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME;

  return {
    runId: 'daily-plan-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    dateISO,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shutdownTime,
    reflectionText: '',
    obstaclesText: '',
    shareText: ''
  };
}

function ensureDailyPlanningRunDraft() {
  if (!dailyPlanningState.runDraft || dailyPlanningState.runDraft.dateISO !== dailyPlanningState.selectedDate) {
    dailyPlanningState.runDraft = createDailyPlanningRunDraft(dailyPlanningState.selectedDate || getTodayISO());
  }
  return dailyPlanningState.runDraft;
}

function getDailyShutdownTaskForDate(isoDate) {
  const col = ensureColumnForDate(isoDate);
  return col.tasks.find(task =>
    task.systemType === 'daily_shutdown'
    || String(task.title || '').trim().toLowerCase() === 'daily shutdown'
  ) || null;
}

function getDailyPlanningShutdownTimeForDate(isoDate, fallback = DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME) {
  const shutdownTask = getDailyShutdownTaskForDate(isoDate);
  const fromTask = shutdownTask && /^\d{2}:\d{2}$/.test(String(shutdownTask.scheduledTime || ''))
    ? shutdownTask.scheduledTime
    : null;
  if (fromTask) return fromTask;
  if (/^\d{2}:\d{2}$/.test(String(fallback || ''))) return fallback;
  return DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME;
}

function getShutdownTimeOptions() {
  const options = [];
  const startMinutes = 15 * 60; // 3:00 PM
  const endMinutes = (23 * 60) + 55; // 11:55 PM
  for (let total = startMinutes; total <= endMinutes; total += 5) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return options;
}

function buildDailyPlanShareTemplate(isoDate) {
  const tasks = getDailyPlanningTaskList(isoDate);
  const taskLines = tasks.length
    ? tasks.map(task => {
      const estimate = task.timeEstimateMinutes > 0 ? formatMinutes(task.timeEstimateMinutes) : '--:--';
      return `- ${task.title} (${estimate})`;
    }).join('\n')
    : '- No tasks planned';

  const label = getDailyPlanningDateLabelForSentence(isoDate);
  return [
    `Planned for ${label}:`,
    taskLines,
    '',
    'Obstacles in my way:',
    '- '
  ].join('\n');
}

function getDailyPlanningStepColumnDescriptors() {
  const selectedDate = dailyPlanningState.selectedDate || getTodayISO();
  if (dailyPlanningState.step === DAILY_PLANNING_STEPS.WORKLOAD) {
    const selectedHeading = getDailyPlanningDateLabel(selectedDate);
    const tomorrowHeading = getDailyPlanningDateLabel(addDays(selectedDate, 1));
    return [
      {
        isoDate: selectedDate,
        bucket: 'today',
        heading: selectedHeading,
        subtitle: "Keep only what's essential"
      },
      {
        isoDate: addDays(selectedDate, 1),
        bucket: 'tomorrow',
        heading: tomorrowHeading,
        subtitle: 'Drag over tasks that can wait'
      },
      {
        isoDate: getDailyPlanningNextWeekDate(selectedDate),
        bucket: 'next-week',
        heading: 'Next week',
        subtitle: 'Drag over tasks that can wait'
      }
    ];
  }

  return [
      {
        isoDate: selectedDate,
        bucket: 'today',
        heading: getDailyPlanningDateLabel(selectedDate),
        subtitle: 'Drag your first tasks to the top'
      }
    ];
  }

function getDailyPlanningVisibleIsoDates() {
  return getDailyPlanningStepColumnDescriptors().map(desc => desc.isoDate);
}

function getDailyPlanningTaskList(isoDate) {
  const col = ensureColumnForDate(isoDate);
  return (col.tasks || []).filter(task => !isDailyPlanningArtifactTask(task));
}

function formatSnapshotTimestamp(isoDateTime) {
  const d = new Date(isoDateTime);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatTime24AsDisplay(timeValue) {
  if (!/^\d{2}:\d{2}$/.test(String(timeValue || ''))) return '5:00 PM';
  const [hRaw, mRaw] = String(timeValue).split(':').map(Number);
  const hour = Math.max(0, Math.min(23, hRaw));
  const minute = Math.max(0, Math.min(59, mRaw));
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function parseTime24ToOffset(timeValue) {
  if (!/^\d{2}:\d{2}$/.test(String(timeValue || ''))) return 17;
  const [hRaw, mRaw] = String(timeValue).split(':').map(Number);
  const hour = Math.max(0, Math.min(23, hRaw));
  const minute = Math.max(0, Math.min(59, mRaw));
  const offset = (hour - CALENDAR_START_HOUR) + minute / 60;
  return clampCalendarOffset(offset, 0);
}

function setSidebarActiveNav(mode) {
  const homeNav = document.querySelector('[data-sidebar-home]');
  const dailyPlanningNav = document.querySelector('[data-sidebar-daily-planning]');
  [homeNav, dailyPlanningNav].forEach(el => {
    if (el) el.classList.remove('nav-item--active');
  });
  if (mode === 'daily-planning') {
    if (dailyPlanningNav) dailyPlanningNav.classList.add('nav-item--active');
    return;
  }
  if (homeNav) homeNav.classList.add('nav-item--active');
}

function renderDailyPlanningTaskPreviewHtml(isoDate) {
  const tasks = getDailyPlanningTaskList(isoDate);
  if (!tasks.length) return '<li>No tasks planned yet.</li>';
  return tasks.map(task => {
    ensureTaskTimeState(task);
    const estimate = task.timeEstimateMinutes > 0 ? ` · ${formatMinutes(task.timeEstimateMinutes)}` : '';
    return `<li>${escapeHtml(task.title)}${escapeHtml(estimate)}</li>`;
  }).join('');
}

function renderDailyPlanningPanelHtml() {
  if (!dailyPlanningState.isActive) return '';
  const draft = ensureDailyPlanningRunDraft();
  const selectedDate = dailyPlanningState.selectedDate || getTodayISO();
  const workload = getDailyPlanningWorkloadSummary(selectedDate);
  const step = dailyPlanningState.step;
  const hasShutdownTask = !!getDailyShutdownTaskForDate(selectedDate);
  const shareText = draft.shareText || buildDailyPlanShareTemplate(selectedDate);

  const workloadSummary = `${formatMinutes(workload.plannedWorkMinutes)} of ${formatMinutes(workload.capacityMinutes)} planned`;
  let workloadClass = '';
  if (workload.status === 'near') workloadClass = ' daily-planning-panel__workload--near';
  if (workload.status === 'over') workloadClass = ' daily-planning-panel__workload--over';

  if (step === DAILY_PLANNING_STEPS.ADD_TASKS) {
    const sentenceLabel = getDailyPlanningDateLabelForSentence(selectedDate);
    const shutdownValue = draft.shutdownTime || DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME;
    const shutdownDisplay = formatTime24AsDisplay(shutdownValue);
    const shutdownOptions = getShutdownTimeOptions().map(timeValue => {
      const isSelected = timeValue === shutdownValue;
      return `
        <button class="daily-planning-panel__time-option${isSelected ? ' daily-planning-panel__time-option--selected' : ''}" type="button" data-dp-shutdown-option="${timeValue}">
          <span>${escapeHtml(formatTime24AsDisplay(timeValue))}</span>
          ${isSelected ? '<i data-lucide="check"></i>' : ''}
        </button>
      `;
    }).join('');
    const shutdownCard = hasShutdownTask ? '' : `
      <div class="daily-planning-panel__card daily-planning-panel__card--spaced">
        <h3>Shutdown time</h3>
        <p>What time would you like to wrap up work by?</p>
        <div class="daily-planning-panel__shutdown-row">
          <div class="daily-planning-panel__time-select" data-dp-shutdown-select>
            <button class="daily-planning-panel__time" type="button" data-dp-shutdown-toggle aria-expanded="false">
              <span>${escapeHtml(shutdownDisplay)}</span>
            </button>
            <div class="daily-planning-panel__time-dropdown" data-dp-shutdown-dropdown hidden>
              ${shutdownOptions}
            </div>
          </div>
          <button class="daily-planning-panel__btn daily-planning-panel__btn--success" type="button" data-dp-add-shutdown>
            <i data-lucide="calendar"></i>
            <span>Add to calendar</span>
          </button>
        </div>
      </div>
    `;

    return `
      <div class="daily-planning-panel__inner">
        <h2 class="daily-planning-panel__title">What do you want to get done ${escapeHtml(sentenceLabel)}?</h2>
        <p class="daily-planning-panel__subtitle">Add tasks you want to work on ${escapeHtml(sentenceLabel)}.</p>
        <div class="daily-planning-panel__metric${workloadClass}">${escapeHtml(workloadSummary)}</div>
        ${shutdownCard}
        <div class="daily-planning-panel__actions">
          <span class="daily-planning-panel__btn-spacer" aria-hidden="true"></span>
          <button class="daily-planning-panel__btn daily-planning-panel__btn--primary" type="button" data-dp-next>Next</button>
        </div>
        <div class="daily-planning-panel__prompt">
          <p class="daily-planning-panel__prompt-text">What are the most high-impact things you could do ${escapeHtml(sentenceLabel)}?</p>
        </div>
      </div>
    `;
  }

  if (step === DAILY_PLANNING_STEPS.WORKLOAD) {
    const sentenceLabel = getDailyPlanningDateLabelForSentence(selectedDate);
    const cautionTitleClass = workload.status === 'near'
      ? 'daily-planning-panel__caution-title daily-planning-panel__caution-title--near'
      : workload.status === 'over'
        ? 'daily-planning-panel__caution-title daily-planning-panel__caution-title--over'
        : 'daily-planning-panel__caution-title';
    const caution = workload.overcommitted
      ? `
        <div class="daily-planning-panel__card daily-planning-panel__card--warn daily-planning-panel__card--caution">
          <h3 class="${cautionTitleClass}">Caution: Unrealistic workload</h3>
          <p>There's not enough time before shutdown for all your work tasks.</p>
        </div>
      `
      : '';

    return `
      <div class="daily-planning-panel__inner">
        <h2 class="daily-planning-panel__title">What can wait?</h2>
        <p class="daily-planning-panel__subtitle">Bump back tasks that aren't essential to work on ${escapeHtml(sentenceLabel)}.</p>
        <div class="daily-planning-panel__metric${workloadClass}">${escapeHtml(workloadSummary)}</div>
        ${caution}
        <div class="daily-planning-panel__actions daily-planning-panel__actions--spaced">
          <button class="daily-planning-panel__btn daily-planning-panel__btn--ghost" type="button" data-dp-prev>
            <i data-lucide="arrow-left"></i>
          </button>
          <button class="daily-planning-panel__btn daily-planning-panel__btn--primary" type="button" data-dp-next>Next</button>
        </div>
        <div class="daily-planning-panel__prompt">
          <p class="daily-planning-panel__prompt-text">If a task is low-priority or doesn't need to be done ${escapeHtml(sentenceLabel)}, bump it back.</p>
        </div>
      </div>
    `;
  }

  if (step === DAILY_PLANNING_STEPS.FINALIZE) {
    const sentenceLabel = getDailyPlanningDateLabelForSentence(selectedDate);
    return `
      <div class="daily-planning-panel__inner">
        <h2 class="daily-planning-panel__title">Finalize your plan for ${escapeHtml(sentenceLabel)}</h2>
        <p class="daily-planning-panel__subtitle">Arrange your tasks in the order that you want to work on them.</p>
        <div class="daily-planning-panel__metric${workloadClass}">${escapeHtml(workloadSummary)}</div>
        <div class="daily-planning-panel__card daily-planning-panel__card--caution">
          <p>Tip: drag tasks to reorder, then drag to the timeline to timebox your day.</p>
        </div>
        <div class="daily-planning-panel__actions daily-planning-panel__actions--spaced">
          <button class="daily-planning-panel__btn daily-planning-panel__btn--ghost" type="button" data-dp-prev>
            <i data-lucide="arrow-left"></i>
          </button>
          <button class="daily-planning-panel__btn daily-planning-panel__btn--primary" type="button" data-dp-next>Looks good</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="daily-planning-panel__inner">
      <h2 class="daily-planning-panel__title">Daily plan</h2>
      <p class="daily-planning-panel__subtitle">Document and share your plan for ${escapeHtml(getDailyPlanningDateLabelForSentence(selectedDate))}.</p>
      <div class="daily-planning-panel__metric${workloadClass}">${escapeHtml(workloadSummary)}</div>
      <textarea class="daily-planning-panel__textarea daily-planning-panel__textarea--share" id="dp-share-text" data-dp-share-text>${escapeHtml(shareText)}</textarea>
      <div class="daily-planning-panel__actions daily-planning-panel__actions--final">
        <button class="daily-planning-panel__btn daily-planning-panel__btn--ghost" type="button" data-dp-prev>
          <i data-lucide="arrow-left"></i>
        </button>
        <button class="daily-planning-panel__btn" type="button" data-dp-copy>Copy</button>
        <button class="daily-planning-panel__btn daily-planning-panel__btn--primary" type="button" data-dp-finish>Get started</button>
      </div>
    </div>
  `;
}

function renderDailyPlanningPanel() {
  const panel = document.getElementById('daily-planning-panel');
  if (!panel) return;

  if (!dailyPlanningState.isActive) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.innerHTML = renderDailyPlanningPanelHtml();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeDailyPlanningShutdownDropdown() {
  const dropdown = document.querySelector('[data-dp-shutdown-dropdown]');
  if (dropdown) dropdown.hidden = true;
  const toggle = document.querySelector('[data-dp-shutdown-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function toggleDailyPlanningShutdownDropdown() {
  const dropdown = document.querySelector('[data-dp-shutdown-dropdown]');
  if (!dropdown) return;
  const nextOpen = dropdown.hidden;
  dropdown.hidden = !nextOpen;
  const toggle = document.querySelector('[data-dp-shutdown-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', String(nextOpen));
  if (nextOpen) {
    const selected = dropdown.querySelector('.daily-planning-panel__time-option--selected');
    if (selected) dropdown.scrollTop = selected.offsetTop;
  }
}

function applyDailyPlanningColumnPresentation(colEl, descriptor) {
  if (!colEl || !descriptor) return;
  const headingEl = colEl.querySelector('.day-name');
  const subtitleEl = colEl.querySelector('.day-date');
  if (headingEl) {
    headingEl.textContent = descriptor.heading || 'Today';
    headingEl.classList.remove('day-name--link');
    headingEl.removeAttribute('data-day-header-link');
    headingEl.removeAttribute('href');
  }
  if (subtitleEl) {
    subtitleEl.textContent = descriptor.subtitle || formatDateDisplay(descriptor.isoDate);
    subtitleEl.classList.add('day-date--daily-hint');
  }
  colEl.classList.remove('day-column--past');
  colEl.setAttribute('data-dp-bucket', descriptor.bucket || 'today');

  const progressBar = colEl.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.classList.add('progress-bar--hidden');
  }
}

function renderDailyPlanningColumns() {
  const container = document.getElementById('day-columns');
  if (!container) return;
  const descriptors = getDailyPlanningStepColumnDescriptors();

  descriptors.forEach(desc => ensureColumnForDate(desc.isoDate));
  container.innerHTML = '';

  descriptors.forEach(desc => {
    const col = ensureColumnForDate(desc.isoDate);
    const colEl = createColumnElement(col);
    applyDailyPlanningColumnPresentation(colEl, desc);
    container.appendChild(colEl);
    renderColumn(col);
  });

  container.scrollLeft = 0;
}

function renderDailyPlanningMode() {
  const board = document.querySelector('.board');
  const container = document.getElementById('day-columns');
  if (!board || !container) return;

  if (!dailyPlanningState.isActive) {
    board.classList.remove('board--daily-planning');
    container.classList.remove('board__columns--daily-planning');
    board.removeAttribute('data-dp-step');
    document.querySelector('.main-card')?.classList.remove('main-card--hide-calendar');
    renderDailyPlanningPanel();
    return;
  }

  const mainCard = document.querySelector('.main-card');
  const hideCalendar = dailyPlanningState.step === DAILY_PLANNING_STEPS.WORKLOAD
    || dailyPlanningState.step === DAILY_PLANNING_STEPS.SHARE;
  if (mainCard) {
    mainCard.classList.toggle('main-card--hide-calendar', hideCalendar);
  }

  board.classList.add('board--daily-planning');
  board.setAttribute('data-dp-step', String(dailyPlanningState.step));
  container.classList.add('board__columns--daily-planning');
  container.classList.add('board__columns--ready');
  renderDailyPlanningPanel();
  renderDailyPlanningColumns();
  updateTodayButtonLabel(dailyPlanningState.selectedDate || getTodayISO());
}

function setDailyPlanningStep(nextStep) {
  if (!dailyPlanningState.isActive) return;
  if (!DAILY_PLANNING_STEP_ORDER.includes(nextStep)) return;
  const draft = ensureDailyPlanningRunDraft();
  dailyPlanningState.step = nextStep;
  if (nextStep === DAILY_PLANNING_STEPS.SHARE && !String(draft.shareText || '').trim()) {
    draft.shareText = buildDailyPlanShareTemplate(dailyPlanningState.selectedDate || getTodayISO());
  }
  draft.updatedAt = new Date().toISOString();
  renderDailyPlanningMode();
}

function goToNextDailyPlanningStep() {
  if (!dailyPlanningState.isActive) return;
  const idx = DAILY_PLANNING_STEP_ORDER.indexOf(dailyPlanningState.step);
  if (idx === -1) return;
  const next = DAILY_PLANNING_STEP_ORDER[idx + 1];
  if (next) {
    setDailyPlanningStep(next);
  }
}

function goToPrevDailyPlanningStep() {
  if (!dailyPlanningState.isActive) return;
  const idx = DAILY_PLANNING_STEP_ORDER.indexOf(dailyPlanningState.step);
  if (idx <= 0) {
    exitDailyPlanningMode();
    return;
  }
  setDailyPlanningStep(DAILY_PLANNING_STEP_ORDER[idx - 1]);
}

function setDailyPlanningSelectedDate(nextIsoDate, options = {}) {
  if (!dailyPlanningState.isActive) return;
  if (!nextIsoDate) return;
  const todayISO = getTodayISO();
  const { resetStep = true } = options;
  const clampedDate = nextIsoDate < todayISO ? todayISO : nextIsoDate;
  if (dailyPlanningState.selectedDate === clampedDate) {
    updateTodayButtonLabel(clampedDate);
    return;
  }
  dailyPlanningState.selectedDate = clampedDate;
  if (resetStep) dailyPlanningState.step = DAILY_PLANNING_STEPS.ADD_TASKS;
  dailyPlanningState.runDraft = createDailyPlanningRunDraft(clampedDate);
  dailyPlanningState.runDraft.shareText = '';
  applyWorkdayBoundsForDate(clampedDate);
  renderDailyPlanningMode();
}

function enterDailyPlanningMode() {
  const returnDate = getFirstVisibleDate();
  const selectedDate = getTodayISO();
  dailyPlanningState.isActive = true;
  dailyPlanningState.selectedDate = selectedDate;
  dailyPlanningState.returnToDate = returnDate;
  dailyPlanningState.step = DAILY_PLANNING_STEPS.ADD_TASKS;
  dailyPlanningState.runDraft = createDailyPlanningRunDraft(selectedDate);
  dailyPlanningState.runDraft.shareText = '';
  applyWorkdayBoundsForDate(selectedDate);
  setSidebarActiveNav('daily-planning');
  closeTopbarTodayPicker();
  renderDailyPlanningMode();
}

function exitDailyPlanningMode(options = {}) {
  const { restoreTodayFirstColumn = false } = options;
  const returnDate = dailyPlanningState.returnToDate || getTodayISO();
  dailyPlanningState.isActive = false;
  dailyPlanningState.selectedDate = null;
  dailyPlanningState.returnToDate = null;
  dailyPlanningState.step = DAILY_PLANNING_STEPS.ADD_TASKS;
  dailyPlanningState.runDraft = null;

  renderDailyPlanningMode();
  setSidebarActiveNav('home');

  renderAllColumns();
  const targetDate = restoreTodayFirstColumn ? getTodayISO() : returnDate;
  initializeFirstColumnPosition(targetDate);
}

function upsertDailyShutdownForDate(isoDate, shutdownTime) {
  const col = ensureColumnForDate(isoDate);
  const sanitizedTime = /^\d{2}:\d{2}$/.test(String(shutdownTime || ''))
    ? shutdownTime
    : DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME;
  const existingTask = getDailyShutdownTaskForDate(isoDate);
  const task = existingTask || {
    id: uid(),
    title: 'Daily shutdown',
    timeEstimateMinutes: 5,
    actualTimeSeconds: 0,
    ownPlannedMinutes: 5,
    ownActualTimeSeconds: 0,
    scheduledTime: null,
    complete: false,
    tag: '#planning',
    integrationColor: null,
    subtasks: [],
    showSubtasks: false,
    systemType: 'daily_shutdown'
  };

  task.scheduledTime = sanitizedTime;
  task.timeEstimateMinutes = 5;
  task.ownPlannedMinutes = 5;
  if (!existingTask) col.tasks.push(task);

  const offset = parseTime24ToOffset(sanitizedTime);
  const existingEvent = state.calendarEvents.find(evt => evt.systemType === 'daily_shutdown' && evt.date === isoDate);
  if (existingEvent) {
    existingEvent.offset = offset;
    existingEvent.duration = 5 / 60;
    existingEvent.title = task.title;
    existingEvent.taskId = task.id;
    existingEvent.colorClass = getTaskEventColorClass(task, 'cal-event--orange');
    existingEvent.zOrder = ++calZCounter;
  } else {
    state.calendarEvents.push({
      id: 'evt-' + uid(),
      title: task.title,
      colorClass: getTaskEventColorClass(task, 'cal-event--orange'),
      offset,
      duration: 5 / 60,
      taskId: task.id,
      date: isoDate,
      systemType: 'daily_shutdown',
      zOrder: ++calZCounter
    });
  }

  renderColumn(col);
  renderCalendarEvents._overrideDate = isoDate;
  renderCalendarEvents();
}

function buildDailyPlanningSnapshot() {
  const selectedDate = dailyPlanningState.selectedDate || getTodayISO();
  const draft = ensureDailyPlanningRunDraft();
  const workload = getDailyPlanningWorkloadSummary(selectedDate);
  const orderedTasks = getDailyPlanningTaskList(selectedDate).map(task => ({
    id: task.id,
    title: task.title,
    timeEstimateMinutes: task.timeEstimateMinutes || 0,
    scheduledTime: task.scheduledTime || null,
    tag: task.tag || null
  }));

  return {
    runId: draft.runId,
    dateISO: selectedDate,
    completedAt: new Date().toISOString(),
    orderedTasks,
    plannedWorkMinutes: workload.plannedWorkMinutes,
    capacityMinutes: workload.capacityMinutes,
    overcommitted: workload.overcommitted,
    reflectionText: '',
    obstaclesText: '',
    shareText: draft.shareText || buildDailyPlanShareTemplate(selectedDate)
  };
}

function formatDailyPlanningSnapshotEntry(snapshot) {
  const formattedShareText = String(snapshot.shareText || '').trim()
    || buildDailyPlanShareTemplate(snapshot.dateISO);

  return [
    'DAILY PLANNING',
    `Created at: ${formatSnapshotTimestamp(snapshot.completedAt)}`,
    `Date: ${snapshot.dateISO}`,
    `Workload: ${formatMinutes(snapshot.plannedWorkMinutes)} / ${formatMinutes(snapshot.capacityMinutes)} (${snapshot.overcommitted ? 'Overcommitted' : 'Within capacity'})`,
    '',
    formattedShareText
  ].join('\n');
}

function getOrCreateDailyPlanningTask(isoDate) {
  const col = ensureColumnForDate(isoDate);
  let task = col.tasks.find(t =>
    t.systemType === 'daily_planning'
    || (
      String(t.title || '').trim().toLowerCase() === 'daily planning'
      && normalizeTag(t.tag) === '#planning'
    )
  );
  if (!task) {
    task = {
      id: uid(),
      title: 'Daily planning',
      timeEstimateMinutes: 0,
      actualTimeSeconds: 0,
      ownPlannedMinutes: 0,
      ownActualTimeSeconds: 0,
      scheduledTime: null,
      complete: true,
      tag: '#planning',
      integrationColor: null,
      subtasks: [],
      showSubtasks: false,
      notes: '',
      systemType: 'daily_planning'
    };
    col.tasks.push(task);
  }
  task.complete = true;
  task.tag = '#planning';
  task.systemType = 'daily_planning';
  return { task, column: col };
}

function appendDailyPlanningSnapshotToTask(snapshot) {
  const { task, column } = getOrCreateDailyPlanningTask(snapshot.dateISO);
  const entry = formatDailyPlanningSnapshotEntry(snapshot);
  const prior = String(task.notes || '').trim();
  task.notes = prior ? `${prior}\n\n----------\n\n${entry}` : entry;
  renderColumn(column);
}

function buildDailyPlanningCopyText() {
  const selectedDate = dailyPlanningState.selectedDate || getTodayISO();
  const draft = ensureDailyPlanningRunDraft();
  const workload = getDailyPlanningWorkloadSummary(selectedDate);
  const shareText = String(draft.shareText || '').trim() || buildDailyPlanShareTemplate(selectedDate);

  return [
    `Daily plan (${selectedDate})`,
    `Created at: ${formatSnapshotTimestamp(new Date().toISOString())}`,
    `Workload: ${formatMinutes(workload.plannedWorkMinutes)} / ${formatMinutes(workload.capacityMinutes)} (${workload.overcommitted ? 'Overcommitted' : 'Within capacity'})`,
    '',
    shareText
  ].join('\n');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }
  const fallback = document.createElement('textarea');
  fallback.value = text;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'fixed';
  fallback.style.left = '-9999px';
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand('copy');
  fallback.remove();
}

function completeDailyPlanningRun() {
  if (!dailyPlanningState.isActive) return;
  const snapshot = buildDailyPlanningSnapshot();
  const history = dailyPlanningState.runHistoryByDate[snapshot.dateISO] || [];
  history.push(snapshot);
  dailyPlanningState.runHistoryByDate[snapshot.dateISO] = history;
  appendDailyPlanningSnapshotToTask(snapshot);
  exitDailyPlanningMode({ restoreTodayFirstColumn: true });
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

function renderSubtasks(subtasks, taskId) {
  const visibleSubtasks = subtasks.filter(s => String(s?.label || '').trim().length > 0);
  if (!visibleSubtasks.length) return '';
  const items = visibleSubtasks.map(s => {
    ensureSubtaskTimeState(s);
    const isTimerActive = focusState.running && focusState.taskId === taskId && focusState.subtaskId === s.id;
    const hasAny = hasActualTime(s.actualTimeSeconds) || s.plannedMinutes > 0 || isTimerActive;
    let timeHtml = '';
    if (hasAny) {
      const activeClass = isTimerActive ? ' subtask__time--active' : '';
      const actualDisplay = hasActualTime(s.actualTimeSeconds) ? formatMinutes(Math.floor(s.actualTimeSeconds / 60)) : '--:--';
      const plannedDisplay = s.plannedMinutes > 0 ? formatMinutes(s.plannedMinutes) : '--:--';
      timeHtml = `<span class="subtask__time${activeClass}"><span data-card-subtask-actual="${escapeHtml(s.id)}">${actualDisplay}</span> / <span data-card-subtask-planned="${escapeHtml(s.id)}">${plannedDisplay}</span></span>`;
    }
    return `
    <li class="subtask ${s.done ? 'subtask--done' : ''}" data-subtask-id="${escapeHtml(s.id)}">
      <button class="subtask__check" type="button" data-card-subtask-check aria-label="Toggle subtask completion">${CHECK_SVG}</button>
      <span class="subtask__label">${escapeHtml(s.label)}</span>
      ${timeHtml}
    </li>`;
  }).join('');
  return `<ul class="task-card__subtasks">${items}</ul>`;
}

function renderIntegrationIcon(color) {
  if (!color) return '';
  return `<span class="task-card__integration-icon" style="background:${escapeHtml(color)};"></span>`;
}

function renderTaskTag(tag) {
  const raw = tag ? String(tag).trim() : '';
  const hasTag = raw.length > 0;
  const hasHash = raw.startsWith('#');
  const word = hasHash ? raw.slice(1) : (hasTag ? raw : 'Unassigned');
  const channel = hasTag ? getChannelStyle(raw) : null;
  const hashColor = channel ? channel.hashColor : (hasTag ? '#9b8ec4' : '#999999');
  const unassignedClass = hasTag ? '' : ' task-card__tag--unassigned';
  return `<span class="task-card__tag${unassignedClass}" data-channel-btn>` +
    `<span class="task-card__tag-hash" style="color:${escapeHtml(hashColor)};">#</span>` +
    `<span class="task-card__tag-word">${escapeHtml(word)}</span></span>`;
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

function renderTaskTimeboxEntries(task) {
  const events = state.calendarEvents
    .filter(e => e.taskId === task.id)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.offset - b.offset;
    });
  if (events.length === 0) return '';

  const dayNamesLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const entries = events.map(evt => {
    const [y, m, d] = evt.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12);
    const dayName = dayNamesLong[dateObj.getDay()];
    const monthName = monthNamesShort[dateObj.getMonth()];
    const dayNum = dateObj.getDate();

    const startTime = formatOffsetAsClock(evt.offset);
    const endTime = formatOffsetAsClock(evt.offset + evt.duration);
    const totalMins = Math.round(evt.duration * 60);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    let durationStr = '';
    if (hours > 0 && mins > 0) durationStr = `${hours} hr ${mins} min`;
    else if (hours > 0) durationStr = `${hours} hr`;
    else durationStr = `${mins} min`;

    return `<div class="task-modal__timebox-entry">
      <div class="task-modal__timebox-date">${escapeHtml(dayName)}, ${escapeHtml(monthName)} ${dayNum}</div>
      <div class="task-modal__timebox-time">${escapeHtml(startTime)} - ${escapeHtml(endTime)}</div>
      <div class="task-modal__timebox-duration">${escapeHtml(durationStr)}</div>
    </div>`;
  }).join('');

  return `
    <div class="task-modal__divider"></div>
    <div class="task-modal__timebox-section">
      <div class="task-modal__timebox-heading">Timeboxed</div>
      ${entries}
    </div>`;
}

function renderTaskDetailModal(task, column) {
  ensureTaskTimeState(task);
  const rawTag = task.tag ? String(task.tag).trim() : '';
  const hasHash = rawTag.startsWith('#');
  const channelWord = rawTag ? (hasHash ? rawTag.slice(1) : rawTag) : 'Unassigned';
  const channelStyle = getChannelStyle(rawTag);
  const hashColor = channelStyle ? channelStyle.hashColor : (rawTag ? '#7da2ff' : '#999999');
  const todayISO = getTodayISO();
  const colDate = column.isoDate || todayISO;
  const displayDate = task.startDate || colDate;
  let startLabel;
  if (displayDate === todayISO) startLabel = 'Today';
  else if (displayDate === addDays(todayISO, 1)) startLabel = 'Tomorrow';
  else startLabel = formatDateDisplay(displayDate);

  const actualTime = formatActualDisplay(task.actualTimeSeconds || 0);
  const actualValueClass = hasActualTime(task.actualTimeSeconds)
    ? 'task-modal__metric-value task-modal__metric-value--set'
    : 'task-modal__metric-value task-modal__metric-value--placeholder';
  const aggregatePlanned = getAggregatePlannedMinutes(task);
  const plannedTime = formatMinutes(aggregatePlanned);
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
          <span class="task-modal__channel" data-modal-channel-btn>
            <span class="task-modal__channel-hash" style="color:${escapeHtml(hashColor)};">#</span>
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
              <span class="task-modal__metric-value ${aggregatePlanned ? 'task-modal__metric-value--set' : 'task-modal__metric-value--placeholder'}">${aggregatePlanned ? escapeHtml(plannedTime) : '--:--'}</span>
            </div>
          </div>
        </div>

        ${renderTaskDetailSubtasks(task)}

        <div class="task-modal__notes" contenteditable="true" data-placeholder="Notes..." aria-label="Task notes">${task.notes ? escapeHtml(task.notes) : ''}</div>

        ${renderTaskTimeboxEntries(task)}

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

function renderCalendarGrid(selectedIsoDate, viewYear, viewMonth, options = {}) {
  const todayISO = getTodayISO();
  const minIsoDate = options.minIsoDate || null;
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
      const isDisabled = minIsoDate && iso < minIsoDate;
      if (isDisabled) cls += ' sdp-cal__day--disabled';
      const disabledAttr = isDisabled ? ' disabled' : '';
      tds.push(`<td><button class="${cls}" type="button" data-date="${iso}"${disabledAttr}>${d.getDate()}</button></td>`);
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
  const isDailyPlanning = dailyPlanningState.isActive;
  const minIsoDate = isDailyPlanning ? getTodayISO() : null;
  const disablePrev = isDailyPlanning;
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
        <button class="sdp__menu-item" data-action="go-previous-day" type="button"${disablePrev ? ' disabled' : ''}>
          <span>Go to previous day</span>
        </button>
      </div>
      <div class="sdp__divider"></div>
      <div class="sdp__section">
        ${renderCalendarGrid(selectedIsoDate, viewYear, viewMonth, { minIsoDate })}
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
  closeChannelPicker();
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
  const ddWidth = 240; // dropdown width from CSS
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

/* ── Channel Picker ─────────────────────────── */

let channelPickerState = null; // { taskId, highlightIndex }

function openChannelPicker(taskId) {
  closeCardDatePicker();
  closeCardPicker();
  if (channelPickerState && channelPickerState.taskId === taskId) {
    closeChannelPicker();
    return;
  }
  closeChannelPicker();
  channelPickerState = { taskId, highlightIndex: 0 };

  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (card) card.classList.add('task-card--picker-open');

  renderChannelPicker();
}

function closeChannelPicker() {
  if (channelPickerState) {
    const card = document.querySelector(`.task-card[data-task-id="${channelPickerState.taskId}"]`);
    if (card) card.classList.remove('task-card--picker-open');
  }
  channelPickerState = null;
  const existing = document.querySelector('[data-channel-picker]');
  if (existing) existing.remove();
}

function getFilteredChannels(query) {
  if (!query) return CHANNELS;
  const q = query.toLowerCase();
  return CHANNELS.filter(ch => ch.label.toLowerCase().includes(q));
}

function renderChannelListHTML(filtered, currentTag) {
  const normalizedCurrent = normalizeTag(currentTag);
  return filtered.map((ch, i) => {
    const isSelected = ch.id === 'unassigned'
      ? !currentTag
      : normalizedCurrent === '#' + ch.label;
    const nested = ch.context ? ' channel-picker__item--nested' : '';
    const selected = isSelected ? ' channel-picker__item--selected' : '';
    const highlighted = (channelPickerState && channelPickerState.highlightIndex === i)
      ? ' channel-picker__item--highlighted' : '';
    const checkmark = isSelected ? '<span class="channel-picker__check">\u2713</span>' : '';
    return `<div class="channel-picker__item${nested}${selected}${highlighted}" data-channel-id="${ch.id}" data-channel-idx="${i}">` +
      `<span class="channel-picker__hash" style="color:${escapeHtml(ch.hashColor)};">#</span>` +
      `<span class="channel-picker__label">${escapeHtml(ch.label)}</span>${checkmark}</div>`;
  }).join('');
}

function renderChannelPicker() {
  if (!channelPickerState) return;
  const taskId = channelPickerState.taskId;
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  const existing = document.querySelector('[data-channel-picker]');
  if (existing) existing.remove();

  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (!card) return;

  const footer = card.querySelector('.task-card__footer');
  if (!footer) return;
  footer.style.position = 'relative';

  const filtered = getFilteredChannels('');
  const listHTML = renderChannelListHTML(filtered, ctx.task.tag);

  const dropdown = document.createElement('div');
  dropdown.className = 'channel-picker';
  dropdown.setAttribute('data-channel-picker', '');
  dropdown.innerHTML =
    `<div class="channel-picker__arrow"></div>` +
    `<div class="channel-picker__header">Assign to channel:</div>` +
    `<input class="channel-picker__search" placeholder="Search..." type="text">` +
    `<div class="channel-picker__list">${listHTML}</div>` +
    `<div class="channel-picker__divider"></div>` +
    `<a class="channel-picker__manage" href="#">Manage channels</a>`;

  footer.appendChild(dropdown);

  // Position: right-aligned under tag button
  const tagBtn = card.querySelector('[data-channel-btn]');
  const ddWidth = 220;

  dropdown.style.position = 'absolute';
  dropdown.style.top = '100%';
  dropdown.style.marginTop = '12px';
  dropdown.style.zIndex = '6000';
  dropdown.style.width = ddWidth + 'px';

  // Right-align to the tag button
  requestAnimationFrame(() => {
    const tagRect = tagBtn ? tagBtn.getBoundingClientRect() : null;
    const footerRect = footer.getBoundingClientRect();
    if (tagRect) {
      const tagCenterX = tagRect.left + tagRect.width / 2 - footerRect.left;
      let left = tagCenterX - ddWidth / 2;
      // Clamp so dropdown doesn't overflow card left
      const maxLeft = footerRect.width - ddWidth;
      left = Math.max(-12, Math.min(left, maxLeft + 12));
      dropdown.style.left = left + 'px';

      // Position arrow
      const arrow = dropdown.querySelector('.channel-picker__arrow');
      if (arrow) {
        const ddRect = dropdown.getBoundingClientRect();
        const arrowLeft = tagRect.left + tagRect.width / 2 - ddRect.left - 6;
        arrow.style.left = arrowLeft + 'px';
      }
    } else {
      dropdown.style.right = '-12px';
    }

    // Scroll column so dropdown is visible
    const ddRect = dropdown.getBoundingClientRect();
    const col = card.closest('.day-column');
    if (col) {
      const colRect = col.getBoundingClientRect();
      if (ddRect.bottom > colRect.bottom) {
        col.scrollTop += ddRect.bottom - colRect.bottom + 8;
      }
    }
  });

  // Focus search input
  const searchInput = dropdown.querySelector('.channel-picker__search');
  if (searchInput) {
    requestAnimationFrame(() => searchInput.focus());
    attachChannelPickerEvents(searchInput, dropdown);
  }
}

function attachChannelPickerEvents(searchInput, dropdown) {
  const taskId = channelPickerState.taskId;

  // Search filtering
  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    const ctx = findTaskContext(taskId);
    if (!ctx) return;
    const filtered = getFilteredChannels(query);
    channelPickerState.highlightIndex = 0;
    const list = dropdown.querySelector('.channel-picker__list');
    if (list) list.innerHTML = renderChannelListHTML(filtered, ctx.task.tag);
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', e => {
    if (!channelPickerState) return;
    const query = searchInput.value;
    const filtered = getFilteredChannels(query);
    const count = filtered.length;
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      channelPickerState.highlightIndex = Math.min(channelPickerState.highlightIndex + 1, count - 1);
      updateChannelHighlight(dropdown);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      channelPickerState.highlightIndex = Math.max(channelPickerState.highlightIndex - 1, 0);
      updateChannelHighlight(dropdown);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const ch = filtered[channelPickerState.highlightIndex];
      if (ch) selectChannel(taskId, ch);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeChannelPicker();
    }
  });
}

function updateChannelHighlight(dropdown) {
  const items = dropdown.querySelectorAll('.channel-picker__item');
  items.forEach((item, i) => {
    item.classList.toggle('channel-picker__item--highlighted', i === channelPickerState.highlightIndex);
  });
  // Scroll highlighted item into view
  const highlighted = dropdown.querySelector('.channel-picker__item--highlighted');
  if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
}

function selectChannel(taskId, channel) {
  const ctx = findTaskContext(taskId);
  if (!ctx) { closeChannelPicker(); return; }

  if (channel.id === 'unassigned') {
    ctx.task.tag = null;
  } else {
    ctx.task.tag = '#' + channel.label;
  }

  closeChannelPicker();
  renderColumn(ctx.column);

  // Update modal if open for this task
  if (openModalTaskId === taskId) {
    const overlay = document.querySelector('.task-modal-overlay');
    if (overlay) {
      const channelEl = overlay.querySelector('.task-modal__channel');
      if (channelEl) {
        const style = getChannelStyle(ctx.task.tag);
        const hashColor = style ? style.hashColor : '#7da2ff';
        const word = ctx.task.tag ? ctx.task.tag.replace(/^#/, '') : 'Unassigned';
        channelEl.innerHTML =
          `<span class="task-modal__channel-hash" style="color:${hashColor};">#</span>` +
          `<span class="task-modal__channel-word">${escapeHtml(word)}</span>`;
      }
    }
  }

  // Re-initialize icons for re-rendered card
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ── Modal Channel Picker ───────────────────── */

let modalChannelPickerState = null; // { taskId, highlightIndex }

function openModalChannelPicker(taskId) {
  closeStartDatePicker();
  closeDueDatePicker();
  if (modalChannelPickerState && modalChannelPickerState.taskId === taskId) {
    closeModalChannelPicker();
    return;
  }
  closeModalChannelPicker();
  modalChannelPickerState = { taskId, highlightIndex: 0 };
  renderModalChannelPicker();
}

function closeModalChannelPicker() {
  modalChannelPickerState = null;
  const existing = document.querySelector('[data-modal-channel-picker]');
  if (existing) existing.remove();
}

function renderModalChannelPicker() {
  if (!modalChannelPickerState) return;
  const taskId = modalChannelPickerState.taskId;
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  const existing = document.querySelector('[data-modal-channel-picker]');
  if (existing) existing.remove();

  const overlay = document.querySelector('.task-modal-overlay');
  if (!overlay) return;

  const channelBtn = overlay.querySelector('[data-modal-channel-btn]');
  if (!channelBtn) return;

  const metaGroup = channelBtn.closest('.task-modal__meta-group');
  if (!metaGroup) return;

  const filtered = getFilteredChannels('');
  const listHTML = renderModalChannelListHTML(filtered, ctx.task.tag);

  const dropdown = document.createElement('div');
  dropdown.className = 'channel-picker';
  dropdown.setAttribute('data-modal-channel-picker', '');
  dropdown.innerHTML =
    `<div class="channel-picker__arrow"></div>` +
    `<div class="channel-picker__header">Assign to channel:</div>` +
    `<input class="channel-picker__search" placeholder="Search..." type="text">` +
    `<div class="channel-picker__list">${listHTML}</div>` +
    `<div class="channel-picker__divider"></div>` +
    `<a class="channel-picker__manage" href="#">Manage channels</a>`;

  metaGroup.style.position = 'relative';
  metaGroup.appendChild(dropdown);

  dropdown.style.position = 'absolute';
  dropdown.style.top = 'calc(100% + 8px)';
  dropdown.style.left = '-8px';
  dropdown.style.zIndex = '6000';
  dropdown.style.width = '220px';

  // Position arrow under channel button
  requestAnimationFrame(() => {
    const btnRect = channelBtn.getBoundingClientRect();
    const ddRect = dropdown.getBoundingClientRect();
    const arrow = dropdown.querySelector('.channel-picker__arrow');
    if (arrow) {
      const arrowLeft = btnRect.left + btnRect.width / 2 - ddRect.left - 6;
      arrow.style.left = arrowLeft + 'px';
    }
  });

  // Focus search input
  const searchInput = dropdown.querySelector('.channel-picker__search');
  if (searchInput) {
    requestAnimationFrame(() => searchInput.focus());
    attachModalChannelPickerEvents(searchInput, dropdown);
  }
}

function renderModalChannelListHTML(filtered, currentTag) {
  const normalizedCurrent = normalizeTag(currentTag);
  return filtered.map((ch, i) => {
    const isSelected = ch.id === 'unassigned'
      ? !currentTag
      : normalizedCurrent === '#' + ch.label;
    const nested = ch.context ? ' channel-picker__item--nested' : '';
    const selected = isSelected ? ' channel-picker__item--selected' : '';
    const highlighted = (modalChannelPickerState && modalChannelPickerState.highlightIndex === i)
      ? ' channel-picker__item--highlighted' : '';
    const checkmark = isSelected ? '<span class="channel-picker__check">\u2713</span>' : '';
    return `<div class="channel-picker__item${nested}${selected}${highlighted}" data-modal-channel-id="${ch.id}" data-channel-idx="${i}">` +
      `<span class="channel-picker__hash" style="color:${escapeHtml(ch.hashColor)};">#</span>` +
      `<span class="channel-picker__label">${escapeHtml(ch.label)}</span>${checkmark}</div>`;
  }).join('');
}

function attachModalChannelPickerEvents(searchInput, dropdown) {
  const taskId = modalChannelPickerState.taskId;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    const ctx = findTaskContext(taskId);
    if (!ctx) return;
    const filtered = getFilteredChannels(query);
    modalChannelPickerState.highlightIndex = 0;
    const list = dropdown.querySelector('.channel-picker__list');
    if (list) list.innerHTML = renderModalChannelListHTML(filtered, ctx.task.tag);
  });

  searchInput.addEventListener('keydown', e => {
    if (!modalChannelPickerState) return;
    const query = searchInput.value;
    const filtered = getFilteredChannels(query);
    const count = filtered.length;
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      modalChannelPickerState.highlightIndex = Math.min(modalChannelPickerState.highlightIndex + 1, count - 1);
      updateModalChannelHighlight(dropdown);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      modalChannelPickerState.highlightIndex = Math.max(modalChannelPickerState.highlightIndex - 1, 0);
      updateModalChannelHighlight(dropdown);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const ch = filtered[modalChannelPickerState.highlightIndex];
      if (ch) selectModalChannel(taskId, ch);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModalChannelPicker();
    }
  });
}

function updateModalChannelHighlight(dropdown) {
  const items = dropdown.querySelectorAll('.channel-picker__item');
  items.forEach((item, i) => {
    item.classList.toggle('channel-picker__item--highlighted', i === modalChannelPickerState.highlightIndex);
  });
  const highlighted = dropdown.querySelector('.channel-picker__item--highlighted');
  if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
}

function selectModalChannel(taskId, channel) {
  const ctx = findTaskContext(taskId);
  if (!ctx) { closeModalChannelPicker(); return; }

  if (channel.id === 'unassigned') {
    ctx.task.tag = null;
  } else {
    ctx.task.tag = '#' + channel.label;
  }

  closeModalChannelPicker();
  renderColumn(ctx.column);

  // Update modal channel display
  const overlay = document.querySelector('.task-modal-overlay');
  if (overlay) {
    const channelEl = overlay.querySelector('[data-modal-channel-btn]');
    if (channelEl) {
      const style = getChannelStyle(ctx.task.tag);
      const hashColor = style ? style.hashColor : (ctx.task.tag ? '#7da2ff' : '#999999');
      const word = ctx.task.tag ? ctx.task.tag.replace(/^#/, '') : 'Unassigned';
      channelEl.innerHTML =
        `<span class="task-modal__channel-hash" style="color:${hashColor};">#</span>` +
        `<span class="task-modal__channel-word">${escapeHtml(word)}</span>`;
    }
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
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

function updateCardDueDate(taskId, task) {
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (!card) return;
  const existing = card.querySelector('.task-card__due');
  if (existing) existing.remove();
  if (task.dueDate) {
    const todayISO = getTodayISO();
    const span = document.createElement('span');
    span.className = 'task-card__due' + (task.dueDate < todayISO ? ' task-card__due--overdue' : '');
    span.innerHTML = '<i data-lucide="flag"></i>' + escapeHtml(formatDateDisplay(task.dueDate));
    const firstHoverIcon = card.querySelector('.task-card__hover-icon');
    if (firstHoverIcon) firstHoverIcon.parentNode.insertBefore(span, firstHoverIcon);
    lucide.createIcons({ nodes: [span] });
  }
}

function handleDueDateAction(isoDate) {
  if (!dueDatePickerState) return;
  const taskId = dueDatePickerState.taskId;
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  ctx.task.dueDate = isoDate;
  closeDueDatePicker();
  updateCardDueDate(taskId, ctx.task);

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
  updateCardDueDate(taskId, ctx.task);

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
    const aggregate = getAggregatePlannedMinutes(task);
    if (aggregate) {
      parentMetricEl.textContent = formatMinutes(aggregate);
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
let actualPickerDateScope = null; // ISO date for which date the actual picker applies to (null = today)

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
  actualPickerDateScope = null;
  const existing = document.querySelector('[data-actual-picker]');
  if (existing) existing.remove();
}

function openActualPicker(subtaskId = null) {
  actualPickerOpen = true;
  actualPickerEditMode = false;
  actualPickerSubtaskId = subtaskId;
  renderActualPickerInModal();
}

function getActualDateLabel(column, overrideDate) {
  const todayISO = getTodayISO();
  const colDate = overrideDate || (column && column.isoDate) || todayISO;
  if (colDate === todayISO) return 'today';
  if (colDate === addDays(todayISO, -1)) return 'yesterday';
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
  const dateLabel = getActualDateLabel(ctx.column, actualPickerDateScope);

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

    // Build history section from dailyActualTime
    ensureTaskRolloverState(task);
    const historyEntries = Object.entries(task.dailyActualTime)
      .map(([date, entry]) => {
        let total = entry.ownSeconds || 0;
        if (entry.subtasks) {
          for (const stId in entry.subtasks) total += entry.subtasks[stId] || 0;
        }
        return { date, total };
      })
      .filter(e => e.total > 0)
      .sort((a, b) => b.date.localeCompare(a.date));

    const historyHtml = historyEntries.length > 0
      ? `<div class="planned-picker__divider"></div>
         <div class="planned-picker__header" style="margin-top:4px">History:</div>
         ${historyEntries.map(e => `<div class="actual-picker__history-entry">
           <span class="actual-picker__history-time">${formatMinutes(Math.floor(e.total / 60))}</span>
           <span class="actual-picker__history-date">${formatDateDisplay(e.date)}</span>
           <button class="actual-picker__history-delete" type="button" data-delete-history="${e.date}">×</button>
         </div>`).join('')}`
      : '';

    html = `
      <div class="planned-picker" data-actual-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Actual (${escapeHtml(dateLabel)}):</div>
        <button class="planned-picker__time-display" type="button" data-actual-edit-mode>${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        ${optionsHtml}
        ${clearHtml}
        ${historyHtml}
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

  const applyDateISO = actualPickerDateScope || getTodayISO();
  ensureTaskRolloverState(task);

  if (subtask) {
    const oldSeconds = subtask.actualTimeSeconds || 0;
    subtask.actualTimeSeconds = minutes * 60;
    subtask.deleteReady = false;
    const delta = subtask.actualTimeSeconds - oldSeconds;
    if (!task.dailyActualTime[applyDateISO]) task.dailyActualTime[applyDateISO] = { ownSeconds: 0, subtasks: {} };
    task.dailyActualTime[applyDateISO].subtasks[subtask.id] =
      Math.max(0, (task.dailyActualTime[applyDateISO].subtasks[subtask.id] || 0) + delta);
  } else {
    const oldOwn = task.ownActualTimeSeconds || 0;
    const subtaskActual = task.subtasks.reduce((sum, s) => sum + (s.actualTimeSeconds || 0), 0);
    task.ownActualTimeSeconds = Math.max(0, minutes * 60 - subtaskActual);
    const delta = task.ownActualTimeSeconds - oldOwn;
    if (!task.dailyActualTime[applyDateISO]) task.dailyActualTime[applyDateISO] = { ownSeconds: 0, subtasks: {} };
    task.dailyActualTime[applyDateISO].ownSeconds =
      Math.max(0, (task.dailyActualTime[applyDateISO].ownSeconds || 0) + delta);
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
  rerenderGhostColumns(task);
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
  actualPickerDateScope = null;
  const existing = document.querySelector('[data-card-picker]');
  if (existing) existing.remove();
}

function openCardPicker(taskId, type, subtaskId = null) {
  closeChannelPicker();
  // Save date scope before closeCardPicker resets it
  const savedDateScope = actualPickerDateScope;
  closeCardPicker();
  actualPickerDateScope = savedDateScope;
  cardPickerState = { taskId, type, editMode: false, subtaskId };
  renderCardPicker();
}

function renderCardPicker() {
  if (!cardPickerState) return;
  const { taskId, type, editMode, subtaskId } = cardPickerState;
  const task = findTaskById(taskId);
  if (!task) return;

  const existing = document.querySelector('[data-card-picker]');
  if (existing) existing.remove();

  // When date-scoped, find the card in the correct column (handles ghost + real card for same task)
  const cardSelector = actualPickerDateScope
    ? `.task-card[data-task-id="${taskId}"][data-column-date="${actualPickerDateScope}"]`
    : `.task-card[data-task-id="${taskId}"]`;
  let metricEl;
  if (subtaskId) {
    const attrName = type === 'actual' ? 'data-card-subtask-actual' : 'data-card-subtask-planned';
    metricEl = document.querySelector(`${cardSelector} [${attrName}="${subtaskId}"]`);
  } else {
    const btnAttr = type === 'actual' ? 'data-card-actual-picker-btn' : 'data-card-planned-picker-btn';
    metricEl = document.querySelector(`${cardSelector} [${btnAttr}]`);
  }
  if (!metricEl) return;

  const isActual = type === 'actual';
  let currentSeconds, currentMins, hasCurrentActual;
  if (subtaskId) {
    const subtask = findSubtask(task, subtaskId);
    if (!subtask) return;
    ensureSubtaskTimeState(subtask);
    if (isActual && actualPickerDateScope) {
      // Show daily subtask time for date-scoped picker
      ensureTaskRolloverState(task);
      const dayEntry = task.dailyActualTime[actualPickerDateScope];
      currentSeconds = dayEntry && dayEntry.subtasks ? (dayEntry.subtasks[subtaskId] || 0) : 0;
    } else {
      currentSeconds = subtask.actualTimeSeconds || 0;
    }
    hasCurrentActual = isActual && hasActualTime(currentSeconds);
    currentMins = isActual ? Math.floor(currentSeconds / 60) : (subtask.plannedMinutes || 0);
  } else {
    if (isActual && actualPickerDateScope) {
      // Show daily actual time for date-scoped picker
      ensureTaskRolloverState(task);
      currentSeconds = getTaskDailyActualSeconds(task, actualPickerDateScope);
    } else {
      currentSeconds = task.actualTimeSeconds || 0;
    }
    hasCurrentActual = isActual && hasActualTime(currentSeconds);
    currentMins = isActual ? Math.floor(currentSeconds / 60) : (task.timeEstimateMinutes || 0);
  }
  const currentFormatted = (isActual ? hasCurrentActual : currentMins > 0) ? formatMinutes(currentMins) : '--:--';
  const options = isActual ? ACTUAL_TIME_OPTIONS : PLANNED_TIME_OPTIONS;
  const label = isActual && actualPickerDateScope
    ? `Actual (${getActualDateLabel(null, actualPickerDateScope)})`
    : (isActual ? 'Actual' : 'Planned');
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
  const { taskId, type, subtaskId } = cardPickerState;
  const task = findTaskById(taskId);
  if (!task) return;

  const dateScope = actualPickerDateScope;

  if (subtaskId) {
    const subtask = findSubtask(task, subtaskId);
    if (!subtask) return;
    ensureSubtaskTimeState(subtask);
    if (type === 'actual') {
      if (dateScope) {
        // Date-scoped: update daily time for this subtask on that date
        ensureTaskRolloverState(task);
        const dayEntry = task.dailyActualTime[dateScope];
        const oldSubtaskDaily = dayEntry && dayEntry.subtasks ? (dayEntry.subtasks[subtaskId] || 0) : 0;
        const newSeconds = minutes * 60;
        const delta = newSeconds - oldSubtaskDaily;
        subtask.actualTimeSeconds = (subtask.actualTimeSeconds || 0) + delta;
        if (subtask.actualTimeSeconds < 0) subtask.actualTimeSeconds = 0;
        recordDailyTime(task, dateScope, delta, subtaskId);
      } else {
        subtask.actualTimeSeconds = minutes * 60;
      }
    } else {
      subtask.plannedMinutes = minutes;
    }
  } else {
    if (type === 'actual') {
      if (dateScope) {
        // Date-scoped: set daily own actual time for this date
        ensureTaskRolloverState(task);
        if (!task.dailyActualTime[dateScope]) {
          task.dailyActualTime[dateScope] = { ownSeconds: 0, subtasks: {} };
        }
        const entry = task.dailyActualTime[dateScope];
        const subtaskDailyTotal = entry.subtasks
          ? Object.values(entry.subtasks).reduce((s, v) => s + (v || 0), 0)
          : 0;
        const newOwnSeconds = Math.max(0, minutes * 60 - subtaskDailyTotal);
        const oldOwnSeconds = entry.ownSeconds || 0;
        const delta = newOwnSeconds - oldOwnSeconds;
        entry.ownSeconds = newOwnSeconds;
        // Update aggregate
        task.ownActualTimeSeconds = (task.ownActualTimeSeconds || 0) + delta;
        if (task.ownActualTimeSeconds < 0) task.ownActualTimeSeconds = 0;
      } else {
        const subtaskActual = task.subtasks.reduce((sum, s) => sum + (s.actualTimeSeconds || 0), 0);
        task.ownActualTimeSeconds = Math.max(0, minutes * 60 - subtaskActual);
      }
    } else {
      const subtaskPlanned = task.subtasks.reduce((sum, s) => sum + (s.plannedMinutes || 0), 0);
      task.ownPlannedMinutes = Math.max(0, minutes - subtaskPlanned);
    }
  }
  syncTaskAggregateTimes(task);

  // If clearing time on a past card, collapse the timer area
  if (dateScope && type === 'actual' && minutes === 0) {
    cardTimerExpanded.delete(taskId);
  }

  closeCardPicker();
  const col = state.columns.find(c => c.tasks.some(t => t.id === taskId));
  if (col) renderColumn(col);
  // Re-render ghost columns if date-scoped edit changed activity
  if (dateScope) rerenderGhostColumns(task);
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

    const tickDateISO = getTodayISO();
    if (target.type === 'subtask' && target.subtask) {
      target.subtask.actualTimeSeconds = (target.subtask.actualTimeSeconds || 0) + 1;
      recordDailyTime(task, tickDateISO, 1, target.subtask.id);
    } else {
      task.ownActualTimeSeconds = (task.ownActualTimeSeconds || 0) + 1;
      recordDailyTime(task, tickDateISO, 1, null);
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
    // Update kanban card timer if visible (show today's daily time)
    const cardTimerActual = document.querySelector(`.task-card[data-task-id="${focusState.taskId}"] [data-card-timer-actual]`);
    if (cardTimerActual) cardTimerActual.textContent = formatSeconds(getTaskDailyActualSeconds(task, tickDateISO));
    // Update kanban card time badge only when minute changes
    if (task.actualTimeSeconds % 60 === 0) {
      const todayCol = document.querySelector(`.day-column[data-iso-date="${tickDateISO}"]`);
      const cardBadge = todayCol
        ? todayCol.querySelector(`.task-card[data-task-id="${focusState.taskId}"] [data-card-time-badge]`)
        : document.querySelector(`.task-card[data-task-id="${focusState.taskId}"] [data-card-time-badge]`);
      if (cardBadge) {
        const dailyMins = Math.floor(getTaskDailyActualSeconds(task, tickDateISO) / 60);
        const planned = task.timeEstimateMinutes;
        cardBadge.textContent = planned ? `${formatMinutes(dailyMins)} / ${formatMinutes(planned)}` : `${formatMinutes(dailyMins)} / --:--`;
      }
      // Update subtask time on kanban card when minute changes
      if (focusState.subtaskId && target.type === 'subtask' && target.subtask) {
        const subtaskActualEl = document.querySelector(`.task-card[data-task-id="${focusState.taskId}"] [data-card-subtask-actual="${focusState.subtaskId}"]`);
        if (subtaskActualEl) subtaskActualEl.textContent = formatMinutes(Math.floor(target.subtask.actualTimeSeconds / 60));
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
    const focusTodaySeconds = getTaskDailyActualSeconds(task, getTodayISO());
    if (focusState.running) {
      actualVal.textContent = formatSeconds(focusTodaySeconds || 0);
      actualVal.classList.add('focus-modal__actual--running');
      actualVal.classList.remove('focus-modal__actual--placeholder');
      actualVal.classList.add('focus-modal__actual--set');
      actualMetric?.classList.add('focus-modal__metric--has-value');
    } else {
      const hasActual = focusTodaySeconds > 0;
      actualVal.textContent = hasActual ? formatMinutes(Math.floor(focusTodaySeconds / 60)) : '--:--';
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
  const todaySeconds = getTaskDailyActualSeconds(task, getTodayISO());
  const hasActual = isRunning || !!todaySeconds;
  const hasPlanned = !!task.timeEstimateMinutes;
  const plannedDisplay = hasPlanned ? formatMinutes(task.timeEstimateMinutes) : '--:--';
  const actualDisplay = isRunning
    ? formatSeconds(todaySeconds || 0)
    : (todaySeconds ? formatMinutes(Math.floor(todaySeconds / 60)) : '--:--');

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
      ensureTaskRolloverState(t);
      const todayISO = getTodayISO();
      if (subtask.done) {
        if (!t.subtaskCompletionsByDate[todayISO]) t.subtaskCompletionsByDate[todayISO] = [];
        if (!t.subtaskCompletionsByDate[todayISO].includes(subtask.id)) {
          t.subtaskCompletionsByDate[todayISO].push(subtask.id);
        }
      } else {
        for (const date in t.subtaskCompletionsByDate) {
          const arr = t.subtaskCompletionsByDate[date];
          const idx = arr.indexOf(subtask.id);
          if (idx !== -1) { arr.splice(idx, 1); if (arr.length === 0) delete t.subtaskCompletionsByDate[date]; }
        }
      }
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
      ensureTaskRolloverState(t);
      t.completedOnDate = t.complete ? getTodayISO() : null;
      if (t.complete && t.subtasks) {
        const todayISO = getTodayISO();
        t.subtasks.forEach(s => {
          if (!s.done) {
            s.done = true;
            if (!t.subtaskCompletionsByDate[todayISO]) t.subtaskCompletionsByDate[todayISO] = [];
            if (!t.subtaskCompletionsByDate[todayISO].includes(s.id)) {
              t.subtaskCompletionsByDate[todayISO].push(s.id);
            }
          }
        });
      }
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

function renderTaskCard(task, columnIsoDate, isGhost) {
  ensureTaskTimeState(task);
  const todayISO = getTodayISO();
  const isPast = columnIsoDate && columnIsoDate < todayISO;
  const card = document.createElement('div');
  card.className = 'task-card'
    + (task.complete ? ' task-card--complete' : '')
    + (isGhost ? ' task-card--ghost' : '');
  card.dataset.taskId = task.id;
  card.draggable = false;
  if (isGhost) card.dataset.ghostDate = columnIsoDate;
  if (isPast) card.dataset.isPast = 'true';
  if (columnIsoDate) card.dataset.columnDate = columnIsoDate;

  // Show scheduled pills for all timebox events on THIS column's date
  const columnEvents = columnIsoDate
    ? state.calendarEvents.filter(e => e.taskId === task.id && e.date === columnIsoDate).sort((a, b) => a.offset - b.offset)
    : [];
  let scheduledPills = '';
  if (columnEvents.length > 0) {
    const maxShow = 2;
    const shown = columnEvents.slice(0, maxShow);
    const overflow = columnEvents.length - maxShow;
    scheduledPills = '<div class="task-card__pills-row">'
      + shown.map(evt => `<span class="task-card__scheduled-pill">${escapeHtml(formatOffsetAsClock(evt.offset))}</span>`).join('')
      + (overflow > 0 ? `<span class="task-card__scheduled-pill task-card__scheduled-pill--more">+${overflow}</span>` : '')
      + '</div>';
  } else if (!columnIsoDate && task.scheduledTime) {
    scheduledPills = `<div class="task-card__pills-row"><span class="task-card__scheduled-pill">${escapeHtml(task.scheduledTime)}</span></div>`;
  }

  const isTimerRunning = focusState.running && focusState.taskId === task.id && !isPast;
  const showTimerDropdown = isTimerRunning || cardTimerExpanded.has(task.id);
  const badgeGreenClass = isTimerRunning ? ' task-card__time-badge--running' : '';

  // Use daily actual time for the badge (per-column-date), aggregate for task detail
  const dailySeconds = columnIsoDate ? getTaskDailyActualSeconds(task, columnIsoDate) : (task.actualTimeSeconds || 0);
  const actualMins = dailySeconds ? Math.floor(dailySeconds / 60) : 0;
  const showActualOnBadge = dailySeconds > 0 || isTimerRunning;

  // Use sum of timebox durations as planned if timeboxed on this date; otherwise use shared timeEstimateMinutes
  const columnTimeboxes = columnIsoDate ? getTaskTimeboxesForDate(task, columnIsoDate) : [];
  const hasColumnTimebox = columnTimeboxes.length > 0;
  const cardPlannedMins = hasColumnTimebox
    ? columnTimeboxes.reduce((sum, tb) => sum + Math.round(tb.duration * 60), 0)
    : (task.timeEstimateMinutes || 0);

  let timeBadge = '';
  if (showActualOnBadge && cardPlannedMins) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}" data-card-time-badge>${formatMinutes(actualMins)} / ${formatMinutes(cardPlannedMins)}</span>`;
  } else if (showActualOnBadge) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}" data-card-time-badge>${formatMinutes(actualMins)} / --:--</span>`;
  } else if (cardPlannedMins) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}" data-card-time-badge>${formatMinutes(cardPlannedMins)}</span>`;
  }

  // For timer section: use daily time for past cards, aggregate for current
  const timerActualDisplay = isPast
    ? (dailySeconds ? formatMinutes(actualMins) : '--:--')
    : (isTimerRunning ? formatSeconds(task.actualTimeSeconds || 0) : formatActualDisplay(task.actualTimeSeconds || 0));
  const plannedDisplay = cardPlannedMins ? formatMinutes(cardPlannedMins) : '--:--';

  // Timer play/pause button: hidden for past cards
  const timerPlayBtn = isPast ? '' : `
    <button class="task-card__timer-btn" type="button" data-card-timer-toggle>
      <i data-lucide="${isTimerRunning ? 'pause' : 'play'}"></i>
    </button>`;

  const timerSection = showTimerDropdown ? `
    <div class="task-card__timer" data-card-timer>
      ${timerPlayBtn}
      <div class="task-card__timer-metrics">
        <div class="task-card__timer-metric${isTimerRunning ? '' : ' task-card__timer-metric--clickable'}" data-card-actual-picker-btn>
          <span class="task-card__timer-label">ACTUAL</span>
          <span class="task-card__timer-value${isTimerRunning ? ' task-card__timer-value--running' : ''}" data-card-timer-actual>${timerActualDisplay}</span>
        </div>
        <div class="task-card__timer-metric${isPast && hasColumnTimebox ? '' : ' task-card__timer-metric--clickable'}"${isPast && hasColumnTimebox ? '' : ' data-card-planned-picker-btn'}>
          <span class="task-card__timer-label">PLANNED</span>
          <span class="task-card__timer-value">${plannedDisplay}</span>
        </div>
      </div>
    </div>
  ` : '';

  // Rollover badge
  const rolloverCount = columnIsoDate ? getRolloverCount(task, columnIsoDate) : 0;
  const rolloverBadge = rolloverCount > 0
    ? `<span class="task-card__rollover-badge" title="Rolled over ${rolloverCount} day${rolloverCount > 1 ? 's' : ''}">
         <span class="rollover-icon">
           <i data-lucide="rotate-cw" style="transform: rotate(105deg)"></i>
           <span class="rollover-count">${rolloverCount}</span>
         </span>
       </span>`
    : '';

  // Complete button logic for past columns
  let completeBtn;
  if (isPast) {
    if (task.completedOnDate === columnIsoDate) {
      completeBtn = `<button class="task-card__complete-btn task-card__complete-btn--past-complete" aria-label="Uncomplete and move to today" data-past-uncomplete>
        <span class="complete-circle complete-circle--done">${CHECK_SVG}</span>
      </button>`;
    } else {
      completeBtn = '';
    }
  } else {
    completeBtn = `<button class="task-card__complete-btn" aria-label="Mark complete">
      <span class="complete-circle">${CHECK_SVG}</span>
    </button>`;
  }

  // Hide hover icons for past columns
  const hoverIcons = isPast ? '' : `
    <button class="task-card__hover-icon" data-card-date-btn aria-label="Set start date" type="button">
      <i data-lucide="calendar"></i>
    </button>
    <button class="task-card__hover-icon" data-card-clock-btn aria-label="Timer" type="button">
      <i data-lucide="clock"></i>
    </button>
  `;

  card.innerHTML = `
    <div class="task-card__header">
      <div class="task-card__title-wrap">
        ${scheduledPills}
        <span class="task-card__title">${escapeHtml(task.title)}</span>
      </div>
      ${timeBadge}
    </div>
    ${renderSubtasks(task.subtasks, task.id)}
    <div class="task-card__footer">
      ${completeBtn}
      ${rolloverBadge}
      ${renderIntegrationIcon(task.integrationColor)}
      ${task.dueDate ? `<span class="task-card__due${task.dueDate < getTodayISO() ? ' task-card__due--overdue' : ''}"><i data-lucide="flag"></i>${formatDateDisplay(task.dueDate)}</span>` : ''}
      ${hoverIcons}
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
  column.tasks.forEach(task => taskList.appendChild(renderTaskCard(task, column.isoDate, false)));

  // Render ghost cards for past columns
  const todayISO = getTodayISO();
  if (column.isoDate < todayISO) {
    const ghosts = getGhostTasksForDate(column.isoDate);
    ghosts.forEach(task => taskList.appendChild(renderTaskCard(task, column.isoDate, true)));
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (dailyPlanningState.isActive) {
    renderDailyPlanningPanel();
  }
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

// Find a calendar event by ID — checks stored events first, then dynamic (dyn-) events
function findCalendarEventById(eventId) {
  const stored = state.calendarEvents.find(ev => ev.id === eventId);
  if (stored) return stored;
  // Dynamic events have ids like 'dyn-<taskId>' and aren't stored in state
  if (eventId && eventId.startsWith('dyn-')) {
    const taskId = eventId.slice(4);
    // Rebuild the dynamic event from the task's scheduledTime
    for (const col of state.columns) {
      const task = col.tasks.find(t => t.id === taskId);
      if (task && task.scheduledTime) {
        const offset = scheduledTimeToOffset(task.scheduledTime);
        const duration = (task.timeEstimateMinutes || 30) / 60;
        return {
          id: eventId,
          title: task.title,
          colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
          offset,
          duration,
          taskId: task.id,
          date: col.isoDate,
          _dynamic: true
        };
      }
    }
  }
  return null;
}

// Promote a dynamic event to a stored event in state.calendarEvents
function promoteDynamicEvent(evt) {
  if (!evt || !evt._dynamic) return evt;
  const stored = {
    id: 'evt-' + uid(),
    title: evt.title,
    colorClass: evt.colorClass,
    offset: evt.offset,
    duration: evt.duration,
    taskId: evt.taskId,
    date: evt.date,
    zOrder: ++calZCounter
  };
  state.calendarEvents.push(stored);
  return stored;
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
    const activeDate = getFirstVisibleDate();
    if (activeDate) {
      storeWorkdayOverrideForDate(activeDate);
      if (dailyPlanningState.isActive) renderDailyPlanningPanel();
    }
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
  if (dailyPlanningState.isActive) {
    renderDailyPlanningMode();
    return;
  }

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
  if (dailyPlanningState.isActive) return;
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
  if (dailyPlanningState.isActive) return false;
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
  if (dailyPlanningState.isActive) {
    dailyPlanningState.selectedDate = isoDate;
    dailyPlanningState.step = DAILY_PLANNING_STEPS.ADD_TASKS;
    dailyPlanningState.runDraft = createDailyPlanningRunDraft(isoDate);
    renderDailyPlanningMode();
    return;
  }

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

function initializeFirstColumnPosition(targetISO) {
  const container = document.getElementById('day-columns');
  if (!container) return;

  // Suppress all label updates during init
  labelUpdateSuppressed = true;
  updateTodayButtonLabel(targetISO);
  container.classList.remove('board__columns--ready');

  const snap = () => scrollToDateColumn(targetISO, { behavior: 'auto' });

  function reveal() {
    snap();
    labelUpdateSuppressed = false;
    updateTodayButtonLabel._lastCalDate = null; // force calendar re-render
    updateTodayButtonLabel(targetISO);
    container.classList.add('board__columns--ready');
  }

  // Keep snapping until scroll position stabilizes, then reveal
  let lastScrollLeft = -1;
  let stableCount = 0;
  function pollUntilStable() {
    snap();
    if (container.scrollLeft === lastScrollLeft && lastScrollLeft >= 0) {
      stableCount++;
    } else {
      stableCount = 0;
    }
    lastScrollLeft = container.scrollLeft;
    if (stableCount >= 3) {
      reveal();
    } else {
      requestAnimationFrame(pollUntilStable);
    }
  }

  snap();
  requestAnimationFrame(pollUntilStable);
}

function initializeTodayFirstColumnPosition() {
  initializeFirstColumnPosition(getTodayISO());
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

  ensureTaskRolloverState(ctx.task);
  ctx.task.startDate = targetIsoDate;

  // Moving to a past date completes the task as of that date
  const todayISO = getTodayISO();
  if (targetIsoDate < todayISO) {
    completeTaskAsOf(ctx.task, targetIsoDate);
    moveCompletedTasksToBottom(targetCol);
  }

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
    showSubtasks: false,
    startDate: column.isoDate,
    dailyActualTime: {},
    subtaskCompletionsByDate: {},
    completedOnDate: null
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
      if (dailyPlanningState.isActive) return;
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
    dragState.isGhost     = card.dataset.ghostDate ? true : false;
    dragState.ghostVisualColId = null;

    // For ghost cards, find the actual column where the task lives
    if (dragState.isGhost) {
      const ctx = findTaskContext(dragState.taskId);
      if (!ctx) return false;
      dragState.sourceColId = ctx.column.id;
      dragState.sourceIndex = ctx.index;
      dragState.ghostVisualColId = colEl.dataset.colId;
    } else {
      dragState.sourceColId = colEl.dataset.colId;
      const col = state.columns.find(c => c.id === dragState.sourceColId);
      if (!col) return false;
      dragState.sourceIndex = col.tasks.findIndex(t => t.id === dragState.taskId);
    }

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
    const visibleDate = getFirstVisibleDate();

    // Always create a new stored timebox event (supports multiple per task per day)
    state.calendarEvents.push({
      id: 'evt-' + uid(),
      title: task.title,
      colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
      offset,
      duration,
      taskId: task.id,
      date: visibleDate,
      zOrder: ++calZCounter
    });

    // Clear scheduledTime since the task now has a committed stored event
    task.scheduledTime = null;

    const homeCol = state.columns.find(c => c.tasks.some(t => t.id === task.id));

    if (homeCol) renderColumn(homeCol);
    // Re-render ghost columns — adding a calendar event may create a ghost card
    rerenderGhostColumns(task);
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
    const todayISO = getTodayISO();

    // Dropping onto a past column → move there and mark complete as of that date
    if (targetCol.isoDate < todayISO && sourceCol.isoDate >= todayISO) {
      targetCol.tasks.push(task);
      completeTaskAsOf(task, targetCol.isoDate);
      task.startDate = targetCol.isoDate;
      moveCompletedTasksToBottom(targetCol);
      cleanupTaskDropVisuals();
      renderColumn(sourceCol);
      renderColumn(targetCol);
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    // Dropping from past to current/future → uncomplete, set new startDate
    if (sourceCol.isoDate < todayISO && targetCol.isoDate >= todayISO) {
      targetCol.tasks.splice(insertIndex, 0, task);
      ensureTaskRolloverState(task);
      task.complete = false;
      task.completedOnDate = null;
      task.startDate = targetCol.isoDate;
      // Clear scheduledTime so it doesn't create a phantom timebox on the new date
      task.scheduledTime = null;
      cleanupTaskDropVisuals();
      renderColumn(sourceCol);
      renderColumn(targetCol);
      renderCalendarEvents();
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    targetCol.tasks.splice(insertIndex, 0, task);

    if (sourceCol !== targetCol) {
      ensureTaskRolloverState(task);
      task.startDate = targetCol.isoDate;
    }

    cleanupTaskDropVisuals();
    renderColumn(sourceCol);
    if (sourceCol !== targetCol) renderColumn(targetCol);
    // Re-render ghost visual column if dragging a ghost card
    if (dragState.ghostVisualColId) {
      const ghostVisualCol = state.columns.find(c => c.id === dragState.ghostVisualColId);
      if (ghostVisualCol && ghostVisualCol !== sourceCol && ghostVisualCol !== targetCol) renderColumn(ghostVisualCol);
    }
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
          ensureTaskRolloverState(task);
          task.completedOnDate = getTodayISO();
          if (task.subtasks) {
            task.subtasks.forEach(s => {
              if (!s.done) {
                s.done = true;
                if (!task.subtaskCompletionsByDate[getTodayISO()]) task.subtaskCompletionsByDate[getTodayISO()] = [];
                if (!task.subtaskCompletionsByDate[getTodayISO()].includes(s.id)) {
                  task.subtaskCompletionsByDate[getTodayISO()].push(s.id);
                }
              }
            });
          }
          // Auto-set actual time to planned time when completing without actual time
          if (!task.actualTimeSeconds && task.timeEstimateMinutes) {
            task.actualTimeSeconds = task.timeEstimateMinutes * 60;
          }
          moveCompletedTasksToBottom(col);
        } else {
          // Handle past card uncomplete
          if (btn.hasAttribute('data-past-uncomplete')) {
            task.complete = false;
            ensureTaskRolloverState(task);
            task.completedOnDate = null;
            // Clear scheduledTime so it doesn't create a phantom timebox on today
            task.scheduledTime = null;
            // Move to today
            const taskIndex = col.tasks.findIndex(t => t.id === task.id);
            if (taskIndex !== -1) {
              col.tasks.splice(taskIndex, 1);
              const todayCol = ensureColumnForDate(getTodayISO());
              todayCol.tasks.push(task);
              task.startDate = getTodayISO();
              renderColumn(col);
              renderColumn(todayCol);
              renderCalendarEvents();
            }
            break;
          }

          const taskIndex = col.tasks.findIndex(t => t.id === task.id);
          if (taskIndex === -1) break;

          task.complete = false;
          ensureTaskRolloverState(task);
          task.completedOnDate = null;
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
    ensureTaskRolloverState(ctx.task);
    const todayISO = getTodayISO();
    if (subtask.done) {
      if (!ctx.task.subtaskCompletionsByDate[todayISO]) ctx.task.subtaskCompletionsByDate[todayISO] = [];
      if (!ctx.task.subtaskCompletionsByDate[todayISO].includes(subtask.id)) {
        ctx.task.subtaskCompletionsByDate[todayISO].push(subtask.id);
      }
    } else {
      for (const date in ctx.task.subtaskCompletionsByDate) {
        const arr = ctx.task.subtaskCompletionsByDate[date];
        const idx = arr.indexOf(subtask.id);
        if (idx !== -1) { arr.splice(idx, 1); if (arr.length === 0) delete ctx.task.subtaskCompletionsByDate[date]; }
      }
    }
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

  // ── Card channel tag click (channel picker) ──
  container.addEventListener('click', e => {
    const btn = closestFromTarget(e.target, '[data-channel-btn]');
    if (!btn) return;
    e.stopImmediatePropagation();
    const card = btn.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.taskId;
    openChannelPicker(taskId);
  });

  // ── Kanban card time badge toggle ───────────
  container.addEventListener('click', e => {
    const badge = closestFromTarget(e.target, '[data-card-time-badge]');
    if (!badge) return;
    e.stopPropagation();
    const card = badge.closest('.task-card');
    if (!card) return;
    const taskId = card.dataset.taskId;

    const isPastCard = card.dataset.isPast === 'true';
    const columnDate = card.dataset.columnDate;

    if (cardTimerExpanded.has(taskId)) {
      if (cardPickerState) closeCardPicker();
      cardTimerExpanded.delete(taskId);
    } else {
      cardTimerExpanded.add(taskId);
    }
    // Re-render the column that contains this card
    const col = columnDate
      ? state.columns.find(c => c.isoDate === columnDate)
      : state.columns.find(c => c.tasks.some(t => t.id === taskId));
    if (col) renderColumn(col);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // On past cards, also open the actual time picker after expanding
    if (isPastCard && cardTimerExpanded.has(taskId) && columnDate) {
      setTimeout(() => {
        actualPickerDateScope = columnDate;
        openCardPicker(taskId, 'actual');
      }, 0);
    }
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
        // Scope actual picker to column date for past cards
        if (card.dataset.isPast === 'true' && card.dataset.columnDate) {
          actualPickerDateScope = card.dataset.columnDate;
        }
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
    // Subtask actual time picker toggle
    const subtaskActualBtn = closestFromTarget(e.target, '[data-card-subtask-actual]');
    if (subtaskActualBtn) {
      e.stopPropagation();
      const card = subtaskActualBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      const subtaskId = subtaskActualBtn.dataset.cardSubtaskActual;
      if (focusState.running && focusState.taskId === taskId && focusState.subtaskId === subtaskId) return;
      if (cardPickerState && cardPickerState.subtaskId === subtaskId && cardPickerState.type === 'actual') {
        closeCardPicker();
      } else {
        if (card.dataset.isPast === 'true' && card.dataset.columnDate) {
          actualPickerDateScope = card.dataset.columnDate;
        }
        openCardPicker(taskId, 'actual', subtaskId);
      }
      return;
    }
    // Subtask planned time picker toggle
    const subtaskPlannedBtn = closestFromTarget(e.target, '[data-card-subtask-planned]');
    if (subtaskPlannedBtn) {
      e.stopPropagation();
      const card = subtaskPlannedBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      const subtaskId = subtaskPlannedBtn.dataset.cardSubtaskPlanned;
      if (cardPickerState && cardPickerState.subtaskId === subtaskId && cardPickerState.type === 'planned') {
        closeCardPicker();
      } else {
        openCardPicker(taskId, 'planned', subtaskId);
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
    if (closestFromTarget(e.target, '[data-channel-btn]')) return;
    if (closestFromTarget(e.target, '[data-channel-picker]')) return;
    if (closestFromTarget(e.target, '[data-card-subtask-actual]')) return;
    if (closestFromTarget(e.target, '[data-card-subtask-planned]')) return;
    // Close any open card picker when clicking elsewhere
    if (cardPickerState) { closeCardPicker(); }
    if (cardDatePickerState) { closeCardDatePicker(); }
    if (channelPickerState) { closeChannelPicker(); }
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
  if (modalChannelPickerState) { closeModalChannelPicker(); return true; }
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
      ensureTaskRolloverState(ctx.task);
      const todayISO = getTodayISO();
      if (subtask.done) {
        if (!ctx.task.subtaskCompletionsByDate[todayISO]) ctx.task.subtaskCompletionsByDate[todayISO] = [];
        if (!ctx.task.subtaskCompletionsByDate[todayISO].includes(subtask.id)) {
          ctx.task.subtaskCompletionsByDate[todayISO].push(subtask.id);
        }
      } else {
        for (const date in ctx.task.subtaskCompletionsByDate) {
          const arr = ctx.task.subtaskCompletionsByDate[date];
          const idx = arr.indexOf(subtask.id);
          if (idx !== -1) { arr.splice(idx, 1); if (arr.length === 0) delete ctx.task.subtaskCompletionsByDate[date]; }
        }
      }
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
      ensureTaskRolloverState(task);
      task.completedOnDate = task.complete ? getTodayISO() : null;
      if (task.complete && task.subtasks) {
        const todayISO = getTodayISO();
        task.subtasks.forEach(s => {
          if (!s.done) {
            s.done = true;
            if (!task.subtaskCompletionsByDate[todayISO]) task.subtaskCompletionsByDate[todayISO] = [];
            if (!task.subtaskCompletionsByDate[todayISO].includes(s.id)) {
              task.subtaskCompletionsByDate[todayISO].push(s.id);
            }
          }
        });
      }
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

    // Modal channel picker toggle
    if (e.target.closest('[data-modal-channel-btn]')) {
      closeStartDatePicker();
      closeDueDatePicker();
      closePlannedPicker();
      closeActualPicker();
      if (modalChannelPickerState) {
        closeModalChannelPicker();
      } else if (openModalTaskId) {
        openModalChannelPicker(openModalTaskId);
      }
      return;
    }

    // Modal channel picker item click
    if (e.target.closest('[data-modal-channel-picker]')) {
      const item = e.target.closest('[data-modal-channel-id]');
      if (item) {
        const chId = item.dataset.modalChannelId;
        const ch = CHANNELS.find(c => c.id === chId);
        if (ch && openModalTaskId) selectModalChannel(openModalTaskId, ch);
      }
      if (e.target.closest('.channel-picker__manage')) e.preventDefault();
      return;
    }

    // Due date picker toggle (check before start btn since due btn may also have meta-start-btn class)
    if (e.target.closest('[data-due-btn]')) {
      closeStartDatePicker();
      closeModalChannelPicker();
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
      closeModalChannelPicker();
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
      const historyDeleteBtn = e.target.closest('[data-delete-history]');
      if (historyDeleteBtn) {
        const dateToDelete = historyDeleteBtn.dataset.deleteHistory;
        const ctx = findTaskContext(openModalTaskId);
        if (ctx) {
          ensureTaskRolloverState(ctx.task);
          const entry = ctx.task.dailyActualTime[dateToDelete];
          if (entry) {
            // Subtract from aggregate totals
            const subtask = actualPickerSubtaskId ? findSubtask(ctx.task, actualPickerSubtaskId) : null;
            if (!subtask) {
              ctx.task.ownActualTimeSeconds = Math.max(0, (ctx.task.ownActualTimeSeconds || 0) - (entry.ownSeconds || 0));
              ctx.task.subtasks.forEach(s => {
                if (entry.subtasks && entry.subtasks[s.id]) {
                  s.actualTimeSeconds = Math.max(0, (s.actualTimeSeconds || 0) - (entry.subtasks[s.id] || 0));
                }
              });
            }
            delete ctx.task.dailyActualTime[dateToDelete];
            syncTaskAggregateTimes(ctx.task);
          }
          renderActualPickerInModal();
          // Update the actual metric display
          const overlay = document.getElementById('task-modal-overlay');
          const parentMetricEl = overlay.querySelector('[data-actual-btn] .task-modal__metric-value');
          if (parentMetricEl) {
            if (ctx.task.actualTimeSeconds) {
              parentMetricEl.textContent = formatMinutes(Math.floor(ctx.task.actualTimeSeconds / 60));
              parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--set';
            } else {
              parentMetricEl.textContent = '--:--';
              parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--placeholder';
            }
          }
          renderColumn(ctx.column);
          rerenderGhostColumns(ctx.task);
        }
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
  if (dailyPlanningState.isActive && dailyPlanningState.selectedDate) {
    return dailyPlanningState.selectedDate;
  }
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
  if (dailyPlanningState.isActive) {
    label = getDailyPlanningDateLabel(firstDate);
  } else if (isToday) {
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
  if (updateTodayButtonLabel._lastWorkdayDate !== firstDate) {
    updateTodayButtonLabel._lastWorkdayDate = firstDate;
    applyWorkdayBoundsForDate(firstDate);
  }
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

  if (dailyPlanningState.isActive) {
    switch (action) {
      case 'go-today':
        targetIsoDate = todayISO;
        break;
      case 'go-next-day':
        targetIsoDate = addDays(getFirstVisibleDate(), 1);
        break;
      case 'select-date':
        targetIsoDate = data;
        break;
      case 'go-previous-day':
      default:
        break;
    }

    if (targetIsoDate && targetIsoDate < todayISO) {
      targetIsoDate = todayISO;
    }

    if (targetIsoDate) {
      setDailyPlanningSelectedDate(targetIsoDate, { resetStep: true });
      closeTopbarTodayPicker();
    }
    return;
  }

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
      if (dailyPlanningState.isActive) {
        setDailyPlanningSelectedDate(getTodayISO(), { resetStep: true });
      } else {
        scrollToDateColumn(getTodayISO(), { behavior: 'smooth' });
      }
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
  const homeBtn = document.querySelector('[data-sidebar-home]');
  const dailyPlanningBtn = document.querySelector('[data-sidebar-daily-planning]');
  const focusBtn = document.querySelector('[data-sidebar-focus]');

  if (homeBtn) {
    homeBtn.addEventListener('click', e => {
      e.preventDefault();
      if (dailyPlanningState.isActive) {
        exitDailyPlanningMode();
      } else {
        setSidebarActiveNav('home');
        scrollToDateColumn(getTodayISO(), { behavior: 'smooth' });
      }
    });
  }

  if (dailyPlanningBtn) {
    dailyPlanningBtn.addEventListener('click', e => {
      e.preventDefault();
      enterDailyPlanningMode();
    });
  }

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

function attachDailyPlanningEvents() {
  const panel = document.getElementById('daily-planning-panel');
  if (!panel) return;

  panel.addEventListener('click', async e => {
    if (!(e.target instanceof Element)) return;
    const draft = ensureDailyPlanningRunDraft();

    const shutdownToggle = e.target.closest('[data-dp-shutdown-toggle]');
    if (shutdownToggle) {
      e.preventDefault();
      e.stopPropagation();
      toggleDailyPlanningShutdownDropdown();
      return;
    }

    const shutdownOption = e.target.closest('[data-dp-shutdown-option]');
    if (shutdownOption) {
      e.preventDefault();
      const nextTime = shutdownOption.dataset.dpShutdownOption || DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME;
      draft.shutdownTime = nextTime;
      draft.updatedAt = new Date().toISOString();
      closeDailyPlanningShutdownDropdown();
      renderDailyPlanningPanel();
      return;
    }

    if (e.target.closest('[data-dp-prev]')) {
      e.preventDefault();
      goToPrevDailyPlanningStep();
      return;
    }

    if (e.target.closest('[data-dp-next]')) {
      e.preventDefault();
      goToNextDailyPlanningStep();
      return;
    }

    if (e.target.closest('[data-dp-finish]')) {
      e.preventDefault();
      completeDailyPlanningRun();
      return;
    }

    const copyBtn = e.target.closest('[data-dp-copy]');
    if (copyBtn) {
      e.preventDefault();
      try {
        await copyTextToClipboard(buildDailyPlanningCopyText());
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = prev || 'Copy';
        }, 1200);
      } catch (_) {
        copyBtn.textContent = 'Copy failed';
      }
      return;
    }

    if (e.target.closest('[data-dp-add-shutdown]')) {
      e.preventDefault();
      const nextTime = draft.shutdownTime || DAILY_PLANNING_DEFAULT_SHUTDOWN_TIME;
      draft.shutdownTime = nextTime;
      draft.updatedAt = new Date().toISOString();
      upsertDailyShutdownForDate(dailyPlanningState.selectedDate || getTodayISO(), draft.shutdownTime);
    }
  });

  panel.addEventListener('input', e => {
    if (!(e.target instanceof Element) || !dailyPlanningState.isActive) return;
    const draft = ensureDailyPlanningRunDraft();
    if (e.target.matches('[data-dp-share-text]')) {
      draft.shareText = e.target.value;
      draft.updatedAt = new Date().toISOString();
      return;
    }
  });
}

function attachDailyPlanningEscapeEvents() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!dailyPlanningState.isActive) return;
    if (e.defaultPrevented) return;

    const overlay = document.getElementById('task-modal-overlay');
    if (overlay && !overlay.hidden) return;
    if (document.getElementById('focus-modal')) return;
    if (topbarTodayPickerState) return;
    if (cardDatePickerState) return;
    if (channelPickerState) return;
    if (cardPickerState) return;
    if (startDatePickerState) return;
    if (dueDatePickerState) return;
    if (plannedPickerOpen) return;
    if (actualPickerOpen) return;
    if (focusPickerState) return;
    if (modalChannelPickerState) return;

    e.preventDefault();
    exitDailyPlanningMode();
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
    const evt = findCalendarEventById(eventId);
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

    let evt = findCalendarEventById(evEl.dataset.eventId);
    if (!evt) return;

    // Promote dynamic events so mutations persist
    if (evt._dynamic) {
      evt = promoteDynamicEvent(evt);
      const task = findTaskById(evt.taskId);
      if (task) task.scheduledTime = null;
      evEl.dataset.eventId = evt.id;
    }

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

    const evt = findCalendarEventById(calPointerDrag.eventId);
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

    const evt = findCalendarEventById(eventId);
    calDragLine.hidden = true;
    if (!evt) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const droppedOnTimeline = !!(target && target.closest('#time-grid'));

    if (droppedOnTimeline) {
      const offset = eventOffsetFromPointer(e.clientY, evt.duration, grabOffsetHours);
      evt.offset = offset;
      if (evt.taskId) {
        const task = findTaskById(evt.taskId);
        if (task) {
          // Only update scheduledTime if the event is on the task's home column date
          const homeCol = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
          if (homeCol && evt.date === homeCol.isoDate) {
            task.scheduledTime = offsetToScheduledTime(offset);
          }
          if (homeCol) renderColumn(homeCol);
        }
      }
    } else if (evt.taskId) {
      const task = findTaskById(evt.taskId);
      const removedEventDate = evt.date;
      state.calendarEvents = state.calendarEvents.filter(ev => ev.id !== eventId);
      if (task) {
        // Only clear scheduledTime if the removed event was on the task's home column date
        const homeCol = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
        if (homeCol && removedEventDate === homeCol.isoDate) {
          task.scheduledTime = null;
        }
        if (homeCol) renderColumn(homeCol);
        // Re-render ghost columns — removing the event may remove a ghost card
        rerenderGhostColumns(task);
      }
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
    const visibleDate = getFirstVisibleDate();

    const homeCol = state.columns.find(c => c.tasks.some(t => t.id === task.id));
    // Only set scheduledTime if the calendar is showing the task's home column date
    if (homeCol && visibleDate === homeCol.isoDate) {
      task.scheduledTime = offsetToScheduledTime(offset);
    }

    // Find existing event for this task on the visible date
    const existing = state.calendarEvents.find(ev => ev.taskId === task.id && ev.date === visibleDate);
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
        date:       visibleDate,
        zOrder:     ++calZCounter
      });
    }

    if (homeCol) renderColumn(homeCol);
    rerenderGhostColumns(task);

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
    let evt = findCalendarEventById(eventId);
    if (!evt) return;

    // If this is a dynamic event, promote it to a stored event so mutations persist
    if (evt._dynamic) {
      evt = promoteDynamicEvent(evt);
      // Clear scheduledTime since we now have a stored event
      const task = findTaskById(evt.taskId);
      if (task) task.scheduledTime = null;
      eventEl.dataset.eventId = evt.id;
    }

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
          const todayISO = getTodayISO();
          const isPastEvent = evt.date < todayISO;

          if (isPastEvent) {
            // Past timebox resize: only update the event duration (already done above).
            // The past card reads planned time from the timebox, so no need to touch ownPlannedMinutes.
            // Just re-render the past column to reflect the new duration.
            const eventCol = state.columns.find(c => c.isoDate === evt.date);
            if (eventCol) renderColumn(eventCol);
          } else {
            // Current/future event: update ownPlannedMinutes to keep card in sync
            ensureTaskTimeState(task);
            const newTotalMinutes = Math.round(evt.duration * 60);
            const subtaskPlanned = (task.subtasks || []).reduce((sum, s) => {
              ensureSubtaskTimeState(s);
              return sum + (s.plannedMinutes || 0);
            }, 0);
            task.ownPlannedMinutes = Math.max(0, newTotalMinutes - subtaskPlanned);
            syncTaskAggregateTimes(task);
            // Update scheduledTime only if event is on the task's current home column
            const homeCol = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
            if (homeCol && evt.date === homeCol.isoDate) {
              task.scheduledTime = offsetToScheduledTime(evt.offset);
            }
            if (homeCol) renderColumn(homeCol);
          }
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
      if (dayCell.disabled) return;
      topbarTodayPickerState.selectedIsoDate = dayCell.dataset.date || topbarTodayPickerState.selectedIsoDate;
      handleTopbarTodayAction('select-date', dayCell.dataset.date);
      return;
    }
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      if (actionBtn.disabled) return;
      handleTopbarTodayAction(actionBtn.dataset.action);
      return;
    }
    return;
  }

  // Toggle button click is handled by attachBoardTopbarEvents()
  if (e.target.closest('[data-view="today"]')) return;

  closeTopbarTodayPicker();
});

// Daily planning shutdown time dropdown: close on outside click
document.addEventListener('click', e => {
  if (!dailyPlanningState.isActive) return;
  if (!(e.target instanceof Element)) { closeDailyPlanningShutdownDropdown(); return; }
  if (e.target.closest('[data-dp-shutdown-select]')) return;
  closeDailyPlanningShutdownDropdown();
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

// Close channel picker on outside click
document.addEventListener('click', e => {
  if (!channelPickerState) return;
  if (e.target instanceof Element) {
    if (e.target.closest('[data-channel-picker]')) {
      // Handle click on channel item inside dropdown
      const item = e.target.closest('[data-channel-id]');
      if (item) {
        const chId = item.dataset.channelId;
        const ch = CHANNELS.find(c => c.id === chId);
        if (ch) selectChannel(channelPickerState.taskId, ch);
      }
      // Click on manage link — do nothing for now
      if (e.target.closest('.channel-picker__manage')) {
        e.preventDefault();
      }
      return;
    }
    if (e.target.closest('[data-channel-btn]')) return; // toggle handled by container
  }
  closeChannelPicker();
});

// Escape key for channel picker
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && channelPickerState) {
    e.preventDefault();
    closeChannelPicker();
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
  performRollover();
  renderAllColumns();
  initializeTodayFirstColumnPosition();
  renderCalendarEvents();
  renderWorkdayMarkers();
  attachCalendarZoomEvents();
  attachEvents();
  attachBoardTopbarEvents();
  attachSidebarEvents();
  attachDailyPlanningEvents();
  attachDailyPlanningEscapeEvents();
  attachTaskModalEvents();
  attachCalendarEvents();
  attachCalendarResizeEvents();
  attachWorkdayMarkerEvents();
  setSidebarActiveNav('home');
  requestAnimationFrame(scrollTimelineToWorkdayStart);

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});
