/* ═══════════════════════════════════════════════
   QUILL EDITOR INSTANCES (module-level)
═══════════════════════════════════════════════ */
let taskModalQuill = null;
let focusModalQuill = null;
let dpShareQuill = null;
let dsShareQuill = null;
let floatingTooltipEl = null;
let activeFloatingTooltipTarget = null;
let activeFloatingTooltipConfig = null;
let floatingTooltipShowTimer = null;

const FLOATING_TOOLTIP_DELAY_MS = 1000;

const QUILL_EDITOR_CONFIG = {
  theme: 'snow',
  modules: {
    toolbar: false,
    markdownShortcuts: {}
  }
};

const IS_MAC_PLATFORM = /Mac|iPhone|iPad/.test(navigator.platform || '');

function initQuillEditor(container, placeholder, initialHtml) {
  const quill = new Quill(container, {
    ...QUILL_EDITOR_CONFIG,
    placeholder: placeholder || 'Notes...'
  });
  configureQuillShortcutBindings(quill);
  if (initialHtml && initialHtml !== '<p><br></p>') {
    quill.clipboard.dangerouslyPasteHTML(initialHtml);
  }
  quill.blur();
  // On tab-focus (not click), place cursor at end of text
  let mouseDown = false;
  quill.root.addEventListener('mousedown', () => { mouseDown = true; });
  quill.root.addEventListener('focus', () => {
    if (!mouseDown && quill.getLength() > 1) {
      requestAnimationFrame(() => quill.setSelection(quill.getLength() - 1, 0));
    }
    mouseDown = false;
  });
  return quill;
}

function configureQuillShortcutBindings(quill) {
  if (!quill || !quill.keyboard) return;
  const bindings = [
    { key: 'b', shortKey: true, format: { bold: true } },
    { key: 'i', shortKey: true, format: { italic: true } },
    { key: 'u', shortKey: true, format: { underline: true } },
    { key: 'x', shortKey: true, shiftKey: true, format: { strike: true } }
  ];

  const toggleFormat = format => {
    const range = quill.getSelection();
    if (!range) return false;
    const active = quill.getFormat(range);
    quill.format(format, !active[format], 'user');
    return false;
  };

  bindings.forEach(binding => {
    quill.keyboard.addBinding(binding, () => toggleFormat(Object.keys(binding.format)[0]));
  });

  const clearFormatting = () => {
    const range = quill.getSelection(true);
    if (!range) return false;
    if (range.length > 0) {
      quill.removeFormat(range.index, range.length, 'user');
    } else {
      quill.formatLine(range.index, 1, {
        header: false,
        list: false,
        blockquote: false,
        'code-block': false
      }, 'user');
      quill.format('bold', false, 'user');
      quill.format('italic', false, 'user');
      quill.format('underline', false, 'user');
      quill.format('strike', false, 'user');
      quill.format('link', false, 'user');
      quill.format('code', false, 'user');
    }
    return false;
  };

  const headerBinding = (level, extra) => {
    quill.keyboard.addBinding(extra, () => {
      const range = quill.getSelection(true);
      if (!range) return false;
      const active = quill.getFormat(range);
      quill.formatLine(range.index, Math.max(range.length, 1), 'header', active.header === level ? false : level, 'user');
      return false;
    });
  };

  quill.keyboard.addBinding({ key: 'Enter' }, () => {
    const range = quill.getSelection(true);
    if (!range || range.length > 0) return true;
    const active = quill.getFormat(range);
    const isBlockquote = !!active.blockquote;
    const isCodeBlock = !!active['code-block'];
    if (!isBlockquote && !isCodeBlock) return true;

    const [line] = quill.getLine(range.index);
    const lineText = line && line.domNode ? String(line.domNode.textContent || '').trim() : '';
    if (lineText.length > 0) return true;

    const nextFormats = {};
    if (isBlockquote) nextFormats.blockquote = false;
    if (isCodeBlock) nextFormats['code-block'] = false;
    quill.formatLine(range.index, 1, nextFormats, 'user');
    return false;
  });

  if (IS_MAC_PLATFORM) {
    headerBinding(1, { key: '1', shortKey: true, ctrlKey: true });
    headerBinding(2, { key: '2', shortKey: true, ctrlKey: true });
    headerBinding(3, { key: '3', shortKey: true, ctrlKey: true });
  } else {
    headerBinding(1, { key: '1', shortKey: true, altKey: true });
    headerBinding(2, { key: '2', shortKey: true, altKey: true });
    headerBinding(3, { key: '3', shortKey: true, altKey: true });
  }

  quill.keyboard.addBinding({ key: 'k', shortKey: true }, () => {
    const range = quill.getSelection();
    if (!range || range.length === 0) return false;
    const active = quill.getFormat(range);
    const next = active.link ? '' : window.prompt('Enter link URL');
    if (next === null) return false;
    quill.format('link', next || false, 'user');
    return false;
  });

  quill.keyboard.addBinding({ key: 'z', shortKey: true }, () => {
    quill.history.undo();
    return false;
  });

  quill.keyboard.addBinding({ key: 'z', shortKey: true, shiftKey: true }, () => {
    quill.history.redo();
    return false;
  });

  quill.keyboard.addBinding({ key: '\\', shortKey: true }, clearFormatting);
  quill.keyboard.addBinding({ key: '0', shortKey: true }, clearFormatting);

  const isShortKeyEvent = e => IS_MAC_PLATFORM ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;

  quill.root.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;

    if (isShortKeyEvent(e) && e.shiftKey && String(e.key || '').toLowerCase() === 'x' && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      toggleFormat('strike');
      return;
    }

    if (e.key !== 'Enter' || e.shiftKey || e.altKey || !quill.hasFocus()) return;
    const range = quill.getSelection(true);
    if (!range || range.length > 0) return;
    const active = quill.getFormat(range);
    const isBlockquote = !!active.blockquote;
    const isCodeBlock = !!active['code-block'];
    if (!isBlockquote && !isCodeBlock) return;

    const [line] = quill.getLine(range.index);
    const lineText = line && line.domNode ? String(line.domNode.textContent || '').trim() : '';
    if (lineText.length > 0) return;

    e.preventDefault();
    e.stopPropagation();
    const nextFormats = {};
    if (isBlockquote) nextFormats.blockquote = false;
    if (isCodeBlock) nextFormats['code-block'] = false;
    quill.formatLine(range.index, 1, nextFormats, 'user');
    requestAnimationFrame(() => quill.setSelection(range.index, 0, 'silent'));
  }, true);
}

function getQuillHtml(quill) {
  if (!quill) return '';
  const html = quill.root.innerHTML.trim();
  return html === '<p><br></p>' ? '' : html;
}

function shareTextToHtml(text) {
  if (!text) return '';
  // If it already looks like HTML, return as-is
  if (text.startsWith('<')) return text;
  // Convert legacy plain-text share template to HTML
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${escapeHtml(line.slice(2))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim() === '') {
        html += '<p><br></p>';
      } else if (line.endsWith(':')) {
        html += `<h2>${escapeHtml(line)}</h2>`;
      } else {
        html += `<p>${escapeHtml(line)}</p>`;
      }
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function initTaskModalQuill(task) {
  const container = document.querySelector('[data-task-notes-editor]');
  if (!container) return;
  taskModalQuill = initQuillEditor(container, 'Notes...', task.notes || '');
  taskModalQuill.on('text-change', () => {
    task.notes = getQuillHtml(taskModalQuill);
    markTaskAsRepeatModified(task);
    persistTask(task, 500);
  });
}

/* ═══════════════════════════════════════════════
   DRAG CONTEXT (module-level)
═══════════════════════════════════════════════ */

const dragState = {
  taskId:      null,
  sourceColId: null,
  sourceIndex: null,
  fromTrash:   false,
  fromBacklog: false,
  fromArchive: false,
  sourceBacklogHorizon: null,
  sourceIsoDate: null
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
const DEFAULT_SEARCH_FILTERS = {
  hideCompleted: false,
  hideIncomplete: false,
  hidePlanningTasks: true,
  hideRepeatingTasks: false
};
const settings = {
  // General
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  timeFormat: 'device',              // 'device' | '12' | '24'
  startOfWeek: 'monday',             // 'monday' | 'sunday'
  countPlannedAsActual: true,
  taskRolloverPosition: 'top',       // 'top' | 'bottom'
  workloadThresholdHours: 8,
  autoArchiveEnabled: false,
  autoArchiveDays: 5,              // 1–14
  archiveLastViewedAt: null,
  // Display
  darkMode: 'light',                 // 'light' | 'dark'
  hideCompletedTasksInCalendar: false,
  // Timeboxing
  visualizeActualTimeOnCalendar: true,
  defaultTimeboxDurationMinutes: 30,  // 15 | 30 | 45 | 60
  // Schedule (Sun=0 through Sat=6)
  schedule: [
    { day: 0, workday: false, startMinutes: 480, endMinutes: 1020 },
    { day: 1, workday: true,  startMinutes: 480, endMinutes: 1020 },
    { day: 2, workday: true,  startMinutes: 480, endMinutes: 1020 },
    { day: 3, workday: true,  startMinutes: 480, endMinutes: 1020 },
    { day: 4, workday: true,  startMinutes: 480, endMinutes: 1020 },
    { day: 5, workday: true,  startMinutes: 480, endMinutes: 1020 },
    { day: 6, workday: false, startMinutes: 480, endMinutes: 1020 },
  ],
  // Keyboard Shortcuts
  keyboardShortcutsEnabled: true,
  // Profile
  firstName: '',
  lastName: '',
  profilePictureDataUrl: null,
  // Channels
  channelEnabled: {},
  defaultChannelId: null,
  // Search
  searchFilters: { ...DEFAULT_SEARCH_FILTERS },
  searchDateRange: 'anytime',
  searchChannelFilterId: 'all'
};

// Derive userSettings from settings for backward compatibility
const userSettings = {
  get workingDays() {
    return settings.schedule
      .filter(d => d.workday)
      .map(d => d.day);
  }
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

const rightSidebarState = {
  activePanel: 'calendar',
  collapsed: false
};

const backlogPanelState = {
  filterId: 'all',
  addHorizon: null
};

const archivePanelState = {
  daysDropdownOpen: false,
  deleteModalOpen: false
};

const searchPanelState = {
  query: '',
  dropdownOpen: null
};

const shortcutState = {
  modalOpen: false,
  searchQuery: '',
  activeTaskId: null,
  activeSource: null,
  activeColumnIso: null,
  lastFocusedEditable: null,
  suppressHoverUntilPointerMove: false,
  lastPointerPosition: null
};

const BACKLOG_HORIZONS = [
  { id: 'week', label: 'Someday in the next week', shortLabel: 'Next week', letter: 'W', color: '#74b077', shortcut: '1' },
  { id: 'month', label: 'Someday in the next month', shortLabel: 'Next month', letter: 'M', color: '#aed580', shortcut: '2' },
  { id: 'quarter', label: 'Someday in the next quarter', shortLabel: 'Next quarter', letter: 'Q', color: '#ffd451', shortcut: '3' },
  { id: 'year', label: 'Someday in the next year', shortLabel: 'Next year', letter: 'Y', color: '#ffbd4d', shortcut: '4' },
  { id: 'someday', label: 'Someday', shortLabel: 'Someday', letter: 'S', color: '#90a4ae', shortcut: '5' },
  { id: 'never', label: 'Never', shortLabel: 'Never', letter: 'N', color: '#7e7e7e', shortcut: '0' }
];

const SEARCH_DATE_OPTIONS = [
  { id: 'anytime', label: 'Anytime' },
  { id: 'last_week', label: 'Last week' },
  { id: 'last_month', label: 'Last month' }
];

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
  { id: 'unassigned', label: 'Unassigned', context: null, hashColor: '#90a4ae', eventClass: 'cal-event--blue' },
  { id: 'ch-work', label: 'work', context: null, hashColor: '#ff79a7', eventClass: 'cal-event--orange', isContext: true },
  { id: 'ch-code-reviews', label: 'code reviews', context: 'work', hashColor: '#d45d8c', eventClass: 'cal-event--purple' },
  { id: 'ch-coding', label: 'coding', context: 'work', hashColor: '#e979fc', eventClass: 'cal-event--purple' },
  { id: 'ch-debugging', label: 'debugging', context: 'work', hashColor: '#ff62be', eventClass: 'cal-event--purple' },
  { id: 'ch-growth', label: 'growth', context: 'work', hashColor: '#856cc2', eventClass: 'cal-event--purple' },
  { id: 'ch-meetings', label: 'meetings', context: 'work', hashColor: '#a382ff', eventClass: 'cal-event--purple' },
  { id: 'ch-planning', label: 'planning', context: 'work', hashColor: '#7cadff', eventClass: 'cal-event--blue' },
  { id: 'ch-product', label: 'product', context: 'work', hashColor: '#5e9fe0', eventClass: 'cal-event--blue' },
  { id: 'ch-personal', label: 'personal', context: null, hashColor: '#4fc3f7', eventClass: 'cal-event--blue', isContext: true, isPersonal: true },
  { id: 'ch-test', label: 'test', context: null, hashColor: '#4dd0e1', eventClass: 'cal-event--blue' },
];

// Build lookup map from channels
const CHANNEL_COLORS = {};
function rebuildChannelColors() {
  for (const key in CHANNEL_COLORS) delete CHANNEL_COLORS[key];
  CHANNELS.forEach(ch => {
    if (ch.id !== 'unassigned') {
      CHANNEL_COLORS['#' + ch.label] = { hashColor: ch.hashColor, eventClass: ch.eventClass };
    }
  });
}
rebuildChannelColors();

// Initialize channel enabled state
CHANNELS.forEach(ch => {
  if (settings.channelEnabled[ch.id] === undefined) settings.channelEnabled[ch.id] = true;
});

const state = {
  columns: [],

  calendarEvents: [],

  repeatSeries: [],

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
  },

  backlog: [],
  archive: [],
  trash: []
};

const repeatRuntimeState = {
  tasksById: new Map(),
  tasksByDate: new Map(),
  pinnedOccurrenceKeys: new Set()
};

const columnTimeBadgeState = {
  modeByDate: {}
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
  returnToTodayView: false,
  returnToTodayDate: null,
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

const DAILY_SHUTDOWN_STEPS = {
  REVIEW: 1,
  SHARE: 2
};

const DAILY_SHUTDOWN_STEP_ORDER = [
  DAILY_SHUTDOWN_STEPS.REVIEW,
  DAILY_SHUTDOWN_STEPS.SHARE
];

const dailyShutdownState = {
  isActive: false,
  selectedDate: null,
  returnToDate: null,
  returnToTodayView: false,
  returnToTodayDate: null,
  step: DAILY_SHUTDOWN_STEPS.REVIEW,
  runDraft: null
};

const todayViewState = {
  isActive: false,
  selectedDate: null,
  returnToHomeDate: null,
  returnSidebarCollapsed: false,
  returnRightSidebarCollapsed: false
};

const topbarTaskFilterState = {
  homeToday: 'all',
  dailyPlanning: 'all',
  dailyShutdown: 'all'
};

let topbarFilterPickerState = null; // { filterId, highlightIndex }

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */

function getTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function getDateLikeMs(value) {
  if (!value) return NaN;
  if (typeof value === 'string' || value instanceof Date) {
    return Date.parse(value);
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }
  return NaN;
}

function getNowIsoString() {
  return new Date().toISOString();
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

function formatLongDate(isoStr) {
  const d = parseISO(isoStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

const REPEAT_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const REPEAT_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const REPEAT_MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REPEAT_ORDINAL_OPTIONS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th',
  '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th',
  '21st', '22nd', '23rd', '24th', '25th', '26th', '27th', '28th', '29th', '30th', '31st', 'Last'];

function createRepeatOccurrenceTaskId(seriesId, isoDate) {
  return `repeat-${seriesId}-${isoDate}`;
}

function isRepeatRuntimeTask(task) {
  return !!(task && task.isRepeatingTask && task.repeatSeriesId && task.repeatOccurrenceDate);
}

function isDerivedRepeatTask(task) {
  return !!(task && task.__derivedRepeat === true);
}

function getRepeatSeriesById(seriesId) {
  return state.repeatSeries.find(series => series.id === seriesId) || null;
}

function getStartOfWeekIndex() {
  return settings.startOfWeek === 'sunday' ? 0 : 1;
}

function getOrderedWeekdayIndexes() {
  const start = getStartOfWeekIndex();
  return Array.from({ length: 7 }, (_, index) => (start + index) % 7);
}

function getOrderedWeekdayNames() {
  return getOrderedWeekdayIndexes().map(index => REPEAT_DAY_NAMES[index]);
}

function getMonthDifference(startISO, endISO) {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function normalizeRepeatOrdinalValue(value, fallback = '1st') {
  const normalized = String(value || '').trim();
  return REPEAT_ORDINAL_OPTIONS.includes(normalized) ? normalized : fallback;
}

function normalizeRepeatDayTypeValue(value) {
  if (value === 'day') return 'day';
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : 'day';
}

function repeatOrdinalToNumber(value) {
  if (value === 'Last') return 'last';
  const parsed = Number.parseInt(String(value || '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatOrdinalLabel(number) {
  const value = Math.max(1, Number(number) || 1);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function getMonthlyDayForOrdinal(year, monthIndex, ordinal) {
  if (ordinal === 'Last') return getDaysInMonth(year, monthIndex);
  const numeric = Math.max(1, Number(repeatOrdinalToNumber(ordinal)) || 1);
  return Math.min(numeric, getDaysInMonth(year, monthIndex));
}

function getWeekdayOrdinalInMonth(year, monthIndex, weekday, ordinal) {
  const monthDays = getDaysInMonth(year, monthIndex);
  const matches = [];
  for (let day = 1; day <= monthDays; day++) {
    const date = new Date(year, monthIndex, day, 12);
    if (date.getDay() === weekday) matches.push(day);
  }
  if (matches.length === 0) return null;
  if (ordinal === 'Last') return matches[matches.length - 1];
  const numeric = Math.max(1, Math.min(4, Number(repeatOrdinalToNumber(ordinal)) || 1));
  return matches[Math.min(matches.length - 1, numeric - 1)];
}

function normalizeRepeatRuleEntry(entry = {}, options = {}) {
  const fallbackOrdinal = options.allowLargeOrdinal ? '1st' : 'Last';
  const rule = {
    ordinal: normalizeRepeatOrdinalValue(entry.ordinal, fallbackOrdinal),
    dayType: normalizeRepeatDayTypeValue(entry.dayType),
    month: Number.isInteger(entry.month) && entry.month >= 0 && entry.month <= 11 ? entry.month : 0
  };
  if (rule.dayType !== 'day') {
    if (!['1st', '2nd', '3rd', '4th', 'Last'].includes(rule.ordinal)) {
      rule.ordinal = 'Last';
    }
  }
  return rule;
}

function getRepeatRuleFingerprint(series = {}) {
  const cadence = ['daily', 'weekly', 'monthly', 'yearly'].includes(series.cadence) ? series.cadence : 'weekly';
  const interval = Math.max(1, Number.parseInt(series.interval, 10) || 1);
  const orderedWeekdays = getOrderedWeekdayIndexes();
  const weeklyDays = Array.from(new Set((Array.isArray(series.weeklyDays) ? series.weeklyDays : [])
    .map(day => Number.parseInt(day, 10))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)))
    .sort((a, b) => orderedWeekdays.indexOf(a) - orderedWeekdays.indexOf(b));
  const monthlyRules = (Array.isArray(series.monthlyRules) && series.monthlyRules.length > 0
    ? series.monthlyRules
    : [{ ordinal: '1st', dayType: 'day' }])
    .slice(0, 31)
    .map(rule => {
      const normalized = normalizeRepeatRuleEntry(rule, { allowLargeOrdinal: true });
      return { ordinal: normalized.ordinal, dayType: normalized.dayType };
    });
  const yearlyRules = (Array.isArray(series.yearlyRules) && series.yearlyRules.length > 0
    ? series.yearlyRules
    : [{ ordinal: '1st', dayType: 'day', month: 0 }])
    .slice(0, 31)
    .map(rule => {
      const normalized = normalizeRepeatRuleEntry(rule, { allowLargeOrdinal: true });
      return { ordinal: normalized.ordinal, dayType: normalized.dayType, month: normalized.month };
    });
  return JSON.stringify({
    anchorStartDate: typeof series.anchorStartDate === 'string' ? series.anchorStartDate : getTodayISO(),
    untilDate: typeof series.untilDate === 'string' ? series.untilDate : null,
    cadence,
    interval,
    weeklyDays,
    monthlyRules,
    yearlyRules
  });
}

function normalizeSkippedOccurrences(entries, fallbackRuleFingerprint) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const normalized = [];
  entries.forEach(entry => {
    const isoDate = typeof entry?.isoDate === 'string'
      ? entry.isoDate
      : (typeof entry === 'string' ? entry : null);
    if (!isoDate) return;
    const ruleFingerprint = typeof entry?.ruleFingerprint === 'string' && entry.ruleFingerprint
      ? entry.ruleFingerprint
      : fallbackRuleFingerprint;
    if (!ruleFingerprint) return;
    const key = `${isoDate}:${ruleFingerprint}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({ isoDate, ruleFingerprint });
  });
  return normalized.sort((a, b) => {
    if (a.isoDate === b.isoDate) return a.ruleFingerprint.localeCompare(b.ruleFingerprint);
    return a.isoDate.localeCompare(b.isoDate);
  });
}

function normalizeRepeatSeries(series = {}) {
  const cadence = ['daily', 'weekly', 'monthly', 'yearly'].includes(series.cadence) ? series.cadence : 'weekly';
  const interval = Math.max(1, Number.parseInt(series.interval, 10) || 1);
  const weeklyDaysSource = Array.isArray(series.weeklyDays) ? series.weeklyDays : [];
  const orderedWeekdays = getOrderedWeekdayIndexes();
  const uniqueWeeklyDays = Array.from(new Set(weeklyDaysSource
    .map(day => Number.parseInt(day, 10))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)));
  uniqueWeeklyDays.sort((a, b) => orderedWeekdays.indexOf(a) - orderedWeekdays.indexOf(b));

  const monthlyRulesSource = Array.isArray(series.monthlyRules) && series.monthlyRules.length > 0
    ? series.monthlyRules
    : [{ ordinal: '1st', dayType: 'day' }];
  const yearlyRulesSource = Array.isArray(series.yearlyRules) && series.yearlyRules.length > 0
    ? series.yearlyRules
    : [{ ordinal: '1st', dayType: 'day', month: 0 }];
  const fallbackRuleFingerprint = getRepeatRuleFingerprint({
    anchorStartDate: typeof series.anchorStartDate === 'string' ? series.anchorStartDate : getTodayISO(),
    untilDate: typeof series.untilDate === 'string' ? series.untilDate : null,
    cadence,
    interval,
    weeklyDays: uniqueWeeklyDays.length > 0 ? uniqueWeeklyDays : [parseISO(series.anchorStartDate || getTodayISO()).getDay()],
    monthlyRules: monthlyRulesSource,
    yearlyRules: yearlyRulesSource
  });

  return {
    id: series.id || uid(),
    status: ['active', 'paused', 'stopped'].includes(series.status) ? series.status : 'active',
    timezone: series.timezone || settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    anchorStartDate: typeof series.anchorStartDate === 'string' ? series.anchorStartDate : getTodayISO(),
    untilDate: typeof series.untilDate === 'string' ? series.untilDate : null,
    cadence,
    interval,
    weeklyDays: uniqueWeeklyDays.length > 0 ? uniqueWeeklyDays : [parseISO(series.anchorStartDate || getTodayISO()).getDay()],
    monthlyRules: monthlyRulesSource.slice(0, 31).map(rule => normalizeRepeatRuleEntry(rule, { allowLargeOrdinal: true })),
    yearlyRules: yearlyRulesSource.slice(0, 31).map(rule => normalizeRepeatRuleEntry(rule, { allowLargeOrdinal: true })),
    skippedOccurrences: normalizeSkippedOccurrences(series.skippedOccurrences, fallbackRuleFingerprint),
    templateTask: {
      title: series.templateTask?.title || '',
      notes: series.templateTask?.notes || '',
      tag: series.templateTask?.tag || null,
      integrationColor: series.templateTask?.integrationColor || null,
      timeEstimateMinutes: Math.max(0, Number.parseInt(series.templateTask?.timeEstimateMinutes, 10) || 0),
      subtasks: Array.isArray(series.templateTask?.subtasks)
        ? series.templateTask.subtasks.map(subtask => ({
          id: subtask.id || uid(),
          label: subtask.label || '',
          done: !!subtask.done,
          plannedMinutes: Math.max(0, Number.parseInt(subtask.plannedMinutes, 10) || 0),
          actualTimeSeconds: Math.max(0, Number.parseInt(subtask.actualTimeSeconds, 10) || 0)
        }))
        : []
    }
  };
}

function createRepeatTemplateFromTask(task) {
  ensureTaskTimeState(task);
  return {
    title: task.title || '',
    notes: task.notes || '',
    tag: task.tag || null,
    integrationColor: task.integrationColor || null,
    timeEstimateMinutes: task.timeEstimateMinutes || 0,
    subtasks: (task.subtasks || []).map(subtask => ({
      id: subtask.id || uid(),
      label: subtask.label || '',
      done: !!subtask.done,
      plannedMinutes: subtask.plannedMinutes || 0,
      actualTimeSeconds: subtask.actualTimeSeconds || 0
    }))
  };
}

function createTaskFromRepeatSeries(series, isoDate) {
  const template = series.templateTask || {};
  const task = {
    id: createRepeatOccurrenceTaskId(series.id, isoDate),
    title: template.title || '',
    timeEstimateMinutes: template.timeEstimateMinutes || 0,
    actualTimeSeconds: 0,
    ownPlannedMinutes: template.timeEstimateMinutes || 0,
    ownActualTimeSeconds: 0,
    scheduledTime: null,
    complete: false,
    completedOnDate: null,
    completedAt: null,
    tag: template.tag || null,
    integrationColor: template.integrationColor || null,
    subtasks: (template.subtasks || []).map(subtask => ({
      id: subtask.id || uid(),
      label: subtask.label || '',
      done: !!subtask.done,
      plannedMinutes: subtask.plannedMinutes || 0,
      actualTimeSeconds: subtask.actualTimeSeconds || 0
    })),
    showSubtasks: !!(template.subtasks || []).length,
    startDate: isoDate,
    dueDate: null,
    notes: template.notes || '',
    dailyActualTime: {},
    subtaskCompletionsByDate: {},
    systemType: null,
    backlogHorizon: null,
    backlogOrder: 0,
    archivedAt: null,
    archiveSourceDate: null,
    repeatSeriesId: series.id,
    repeatOccurrenceDate: isoDate,
    repeatModified: false,
    isRepeatingTask: true,
    __derivedRepeat: true
  };
  ensureTaskTimeState(task);
  return task;
}

function getRepeatRuntimeTaskById(taskId) {
  return repeatRuntimeState.tasksById.get(taskId) || null;
}

function getRepeatTasksForDate(isoDate) {
  return repeatRuntimeState.tasksByDate.get(isoDate) || [];
}

function clearRepeatRuntimeState() {
  repeatRuntimeState.tasksById.clear();
  repeatRuntimeState.tasksByDate.clear();
}

function isRepeatOccurrenceSkipped(series, isoDate) {
  if (!series || !isoDate || !Array.isArray(series.skippedOccurrences) || series.skippedOccurrences.length === 0) return false;
  const fingerprint = getRepeatRuleFingerprint(series);
  return series.skippedOccurrences.some(entry => entry.isoDate === isoDate && entry.ruleFingerprint === fingerprint);
}

function addSkippedOccurrenceToSeries(series, isoDate, ruleFingerprint = null) {
  if (!series || !isoDate) return series;
  const fingerprint = ruleFingerprint || getRepeatRuleFingerprint(series);
  const skippedOccurrences = normalizeSkippedOccurrences([
    ...(Array.isArray(series.skippedOccurrences) ? series.skippedOccurrences : []),
    { isoDate, ruleFingerprint: fingerprint }
  ], fingerprint);
  return { ...series, skippedOccurrences };
}

function removeSkippedOccurrenceFromSeries(series, isoDate) {
  if (!series || !isoDate || !Array.isArray(series.skippedOccurrences) || series.skippedOccurrences.length === 0) return series;
  const skippedOccurrences = series.skippedOccurrences.filter(entry => entry.isoDate !== isoDate);
  if (skippedOccurrences.length === series.skippedOccurrences.length) return series;
  return { ...series, skippedOccurrences };
}

function getRepeatWeekStartIso(isoDate) {
  const date = parseISO(isoDate);
  const weekStart = getStartOfWeekIndex();
  const diff = (date.getDay() - weekStart + 7) % 7;
  date.setDate(date.getDate() - diff);
  return toISO(date);
}

function repeatSeriesMatchesDate(series, isoDate) {
  if (!series || series.status !== 'active') return false;
  if (!isoDate || isoDate < series.anchorStartDate) return false;
  if (series.untilDate && isoDate > series.untilDate) return false;
  if (isRepeatOccurrenceSkipped(series, isoDate)) return false;

  const targetDate = parseISO(isoDate);
  if (series.cadence === 'daily') {
    return daysBetween(series.anchorStartDate, isoDate) % series.interval === 0;
  }

  if (series.cadence === 'weekly') {
    const weekday = targetDate.getDay();
    if (!series.weeklyDays.includes(weekday)) return false;
    const anchorWeek = getRepeatWeekStartIso(series.anchorStartDate);
    const targetWeek = getRepeatWeekStartIso(isoDate);
    const weekDiff = Math.floor(daysBetween(anchorWeek, targetWeek) / 7);
    return weekDiff >= 0 && weekDiff % series.interval === 0;
  }

  if (series.cadence === 'monthly') {
    const monthDiff = getMonthDifference(series.anchorStartDate, isoDate);
    if (monthDiff < 0 || monthDiff % series.interval !== 0) return false;
    return series.monthlyRules.some(rule => {
      if (rule.dayType === 'day') {
        return targetDate.getDate() === getMonthlyDayForOrdinal(targetDate.getFullYear(), targetDate.getMonth(), rule.ordinal);
      }
      const day = getWeekdayOrdinalInMonth(targetDate.getFullYear(), targetDate.getMonth(), rule.dayType, rule.ordinal);
      return targetDate.getDate() === day;
    });
  }

  if (series.cadence === 'yearly') {
    const yearDiff = targetDate.getFullYear() - parseISO(series.anchorStartDate).getFullYear();
    if (yearDiff < 0 || yearDiff % series.interval !== 0) return false;
    return series.yearlyRules.some(rule => {
      if (targetDate.getMonth() !== rule.month) return false;
      if (rule.dayType === 'day') {
        return targetDate.getDate() === getMonthlyDayForOrdinal(targetDate.getFullYear(), targetDate.getMonth(), rule.ordinal);
      }
      const day = getWeekdayOrdinalInMonth(targetDate.getFullYear(), targetDate.getMonth(), rule.dayType, rule.ordinal);
      return targetDate.getDate() === day;
    });
  }

  return false;
}

function getAdjacentRepeatOccurrenceDate(series, currentIsoDate, direction) {
  if (!series || !currentIsoDate || !direction) return null;
  const delta = direction < 0 ? -1 : 1;
  let cursor = addDays(currentIsoDate, delta);
  for (let i = 0; i < 3660; i++) {
    if (repeatSeriesMatchesDate(series, cursor)) return cursor;
    cursor = addDays(cursor, delta);
  }
  return null;
}

function getKnownRepeatOccurrenceDates(seriesId) {
  const dates = new Set();
  const addTask = (task, location = 'column') => {
    if (!task || task.repeatSeriesId !== seriesId || !task.repeatOccurrenceDate) return;
    if (location !== 'trash' && shouldHideUntouchedRepeatInstance(task)) return;
    dates.add(task.repeatOccurrenceDate);
  };
  state.columns.forEach(column => column.tasks.forEach(task => addTask(task, 'column')));
  state.backlog.forEach(task => addTask(task, 'backlog'));
  state.archive.forEach(task => addTask(task, 'archive'));
  state.trash.forEach(entry => addTask(entry?.task, 'trash'));
  repeatRuntimeState.tasksById.forEach(addTask);
  return Array.from(dates).sort();
}

function getRepeatNavigationDate(series, currentIsoDate, direction) {
  if (!series || !currentIsoDate || !direction) return null;
  const knownDates = new Set(getKnownRepeatOccurrenceDates(series.id));
  const delta = direction < 0 ? -1 : 1;
  let cursor = addDays(currentIsoDate, delta);
  for (let i = 0; i < 3660; i++) {
    if (knownDates.has(cursor)) return cursor;
    if (series.status === 'active' && repeatSeriesMatchesDate(series, cursor)) return cursor;
    cursor = addDays(cursor, delta);
  }
  return null;
}

function getRepeatTaskIdForOccurrence(seriesId, isoDate) {
  if (!seriesId || !isoDate) return null;
  const findTaskId = (task, location = 'column') => {
    if (!(task && task.repeatSeriesId === seriesId && task.repeatOccurrenceDate === isoDate)) return null;
    if (location !== 'trash' && shouldHideUntouchedRepeatInstance(task)) return null;
    return task.id;
  };
  for (const column of state.columns) {
    for (const task of column.tasks) {
      const taskId = findTaskId(task, 'column');
      if (taskId) return taskId;
    }
  }
  for (const task of state.backlog) {
    const taskId = findTaskId(task, 'backlog');
    if (taskId) return taskId;
  }
  for (const task of state.archive) {
    const taskId = findTaskId(task, 'archive');
    if (taskId) return taskId;
  }
  for (const entry of state.trash) {
    const taskId = findTaskId(entry?.task, 'trash');
    if (taskId) return taskId;
  }
  const runtimeTask = (repeatRuntimeState.tasksByDate.get(isoDate) || []).find(task => task.repeatSeriesId === seriesId);
  return runtimeTask ? runtimeTask.id : createRepeatOccurrenceTaskId(seriesId, isoDate);
}

function formatRepeatDayList(dayIndexes) {
  const ordered = getOrderedWeekdayIndexes();
  const days = [...new Set(dayIndexes || [])]
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b))
    .map(day => REPEAT_DAY_NAMES[day]);
  if (days.length === 0) return '';
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} and ${days[1]}`;
  return `${days.slice(0, -1).join(', ')}, and ${days[days.length - 1]}`;
}

function formatRepeatRuleSummary(series) {
  if (!series) return 'This task repeats.';
  const untilSuffix = series.untilDate ? `, until ${formatLongDate(series.untilDate)}` : '';
  if (series.cadence === 'daily') {
    return series.interval === 1
      ? `This task repeats every day${untilSuffix}.`
      : `This task repeats every ${series.interval} days${untilSuffix}.`;
  }
  if (series.cadence === 'weekly') {
    const days = formatRepeatDayList(series.weeklyDays);
    const intervalLabel = series.interval === 1 ? 'every week' : `every ${series.interval} weeks`;
    return `This task repeats ${intervalLabel}${days ? ` on ${days}` : ''}${untilSuffix}.`;
  }
  if (series.cadence === 'monthly') {
    const rule = series.monthlyRules[0] || { ordinal: '1st', dayType: 'day' };
    const intervalLabel = series.interval === 1 ? 'every month' : `every ${series.interval} months`;
    const tail = rule.dayType === 'day'
      ? `on the ${rule.ordinal} day`
      : `on the ${rule.ordinal} ${REPEAT_DAY_NAMES[rule.dayType]}`;
    return `This task repeats ${intervalLabel} ${tail}${untilSuffix}.`;
  }
  if (series.cadence === 'yearly') {
    const rule = series.yearlyRules[0] || { ordinal: '1st', dayType: 'day', month: 0 };
    const intervalLabel = series.interval === 1 ? 'every year' : `every ${series.interval} years`;
    const tail = rule.dayType === 'day'
      ? `on the ${rule.ordinal} day in ${REPEAT_MONTH_NAMES[rule.month]}`
      : `on the ${rule.ordinal} ${REPEAT_DAY_NAMES[rule.dayType]} in ${REPEAT_MONTH_NAMES[rule.month]}`;
    return `This task repeats ${intervalLabel} ${tail}${untilSuffix}.`;
  }
  return 'This task repeats.';
}

function getPersistedRepeatInstanceMap() {
  const map = new Map();
  const addTask = task => {
    if (!isRepeatRuntimeTask(task)) return;
    map.set(`${task.repeatSeriesId}:${task.repeatOccurrenceDate}`, task);
  };
  state.columns.forEach(column => column.tasks.forEach(addTask));
  state.backlog.forEach(addTask);
  state.archive.forEach(addTask);
  state.trash.forEach(entry => {
    if (entry && entry.task) addTask(entry.task);
  });
  return map;
}

function reconcileVisibleRepeatTasks() {
  purgeExpiredTrash();
  clearRepeatRuntimeState();
  if (!state.dayWindow.startISO || !state.dayWindow.endISO) return;
  const persistedMap = getPersistedRepeatInstanceMap();
  const todayISO = getTodayISO();
  state.repeatSeries
    .filter(series => series.status === 'active')
    .forEach(series => {
      const dueDates = [];
      let cursor = state.dayWindow.startISO;
      while (cursor <= state.dayWindow.endISO) {
        if (repeatSeriesMatchesDate(series, cursor)) dueDates.push(cursor);
        cursor = addDays(cursor, 1);
      }

      const desiredDates = new Set();
      const currentAndFutureDueDates = dueDates.filter(isoDate => isoDate >= todayISO);
      const overdueDates = dueDates.filter(isoDate => isoDate < todayISO && !persistedMap.has(`${series.id}:${isoDate}`));
      if (overdueDates.length > 0 && currentAndFutureDueDates.length === 0) {
        desiredDates.add(overdueDates[overdueDates.length - 1]);
      }
      currentAndFutureDueDates.forEach(isoDate => desiredDates.add(isoDate));
      repeatRuntimeState.pinnedOccurrenceKeys.forEach(key => {
        const [seriesId, isoDate] = key.split(':');
        if (seriesId === series.id && isoDate >= state.dayWindow.startISO && isoDate <= state.dayWindow.endISO) {
          desiredDates.add(isoDate);
        }
      });

      desiredDates.forEach(isoDate => {
        const key = `${series.id}:${isoDate}`;
        if (persistedMap.has(key)) return;
        const task = createTaskFromRepeatSeries(series, isoDate);
        repeatRuntimeState.tasksById.set(task.id, task);
        const existing = repeatRuntimeState.tasksByDate.get(isoDate) || [];
        existing.push(task);
        repeatRuntimeState.tasksByDate.set(isoDate, existing);
      });
    });
}

function getColumnVisibleTasks(column) {
  const persisted = Array.isArray(column?.tasks)
    ? column.tasks.filter(task => !shouldHideUntouchedRepeatInstance(task))
    : [];
  const derived = column?.isoDate ? getRepeatTasksForDate(column.isoDate) : [];
  return persisted.concat(derived);
}

function shouldHideUntouchedRepeatInstance(task) {
  if (!task || !task.repeatSeriesId || !task.repeatOccurrenceDate) return false;
  if (task.complete || task.repeatModified) return false;
  const series = getRepeatSeriesById(task.repeatSeriesId);
  if (!series || series.status !== 'active') return false;
  return !repeatSeriesMatchesDate(series, task.repeatOccurrenceDate);
}

function materializeDerivedTask(task) {
  if (!isDerivedRepeatTask(task)) return task;
  const column = ensureColumnForDate(task.repeatOccurrenceDate || task.startDate || getTodayISO());
  const existingIndex = column.tasks.findIndex(item => item.id === task.id);
  if (existingIndex === -1) {
    column.tasks.push(task);
  } else {
    column.tasks[existingIndex] = task;
  }
  task.__derivedRepeat = false;
  repeatRuntimeState.tasksById.delete(task.id);
  const byDate = repeatRuntimeState.tasksByDate.get(column.isoDate) || [];
  repeatRuntimeState.tasksByDate.set(column.isoDate, byDate.filter(item => item.id !== task.id));
  return task;
}

function persistRepeatSeries(series, debounceMs = 0) {
  if (!_currentUserId || !series) return;
  const normalized = normalizeRepeatSeries(series);
  const existingIndex = state.repeatSeries.findIndex(item => item.id === normalized.id);
  if (existingIndex === -1) state.repeatSeries.push(normalized);
  else state.repeatSeries.splice(existingIndex, 1, normalized);
  const save = () => DB.saveRepeatSeries(_currentUserId, normalized).catch(err =>
    console.error('Failed to save repeat series:', err)
  );
  if (debounceMs > 0) setTimeout(save, debounceMs);
  else save();
}

function persistDeleteRepeatSeries(seriesId) {
  if (!_currentUserId || !seriesId) return;
  state.repeatSeries = state.repeatSeries.filter(series => series.id !== seriesId);
  DB.deleteRepeatSeries(_currentUserId, seriesId).catch(err =>
    console.error('Failed to delete repeat series:', err)
  );
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
  const rolledTasks = [];

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
      if (settings.taskRolloverPosition === 'top') {
        targetCol.tasks.unshift(task);
      } else {
        targetCol.tasks.push(task);
      }
      rolledTasks.push(task);
    }
  }

  rolledTasks.forEach(t => persistTask(t, 0));
  archiveEligibleTasks();
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

function formatHoursShortFromMinutes(mins) {
  const safeMins = Number.isFinite(mins) ? Math.max(0, mins) : 0;
  const hours = safeMins / 60;
  if (hours === 0) return '0 hr';
  const rounded = Math.round(hours * 10) / 10;
  const formatted = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${formatted} hr`;
}

function formatHoursShortFromSeconds(seconds) {
  const mins = Number.isFinite(seconds) ? seconds / 60 : 0;
  return formatHoursShortFromMinutes(mins);
}

function formatShortDurationFromSeconds(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = safeSeconds / 60;
  if (mins < 60) {
    const flooredMins = Math.floor(mins);
    return `${flooredMins} min`;
  }
  const hours = mins / 60;
  const rounded = Math.round(hours * 10) / 10;
  const formatted = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${formatted} hr`;
}

function formatShortDurationFromMinutes(mins) {
  const safeMins = Number.isFinite(mins) ? Math.max(0, mins) : 0;
  if (safeMins < 60) {
    const flooredMins = Math.floor(safeMins);
    return `${flooredMins} min`;
  }
  const hours = safeMins / 60;
  const rounded = Math.round(hours * 10) / 10;
  const formatted = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${formatted} hr`;
}

function formatActualMinutesForShare(seconds) {
  if (!seconds) return '--:--';
  return formatMinutes(Math.floor(seconds / 60));
}

function getColumnTimeBadgeMode(isoDate) {
  return columnTimeBadgeState.modeByDate[isoDate] || 'remaining';
}

function toggleColumnTimeBadgeMode(isoDate) {
  if (!isoDate) return;
  columnTimeBadgeState.modeByDate[isoDate] = getColumnTimeBadgeMode(isoDate) === 'actual-planned'
    ? 'remaining'
    : 'actual-planned';
}

function formatActualPlannedSummary(actualMinutes, plannedMinutes) {
  if (actualMinutes > 0 && plannedMinutes > 0) {
    return `${formatMinutes(actualMinutes)} / ${formatMinutes(plannedMinutes)}`;
  }
  if (actualMinutes > 0) {
    return `${formatMinutes(actualMinutes)} / --:--`;
  }
  if (plannedMinutes > 0) {
    return `--:-- / ${formatMinutes(plannedMinutes)}`;
  }
  return '';
}

function getColumnTimeSummaryMetrics(column) {
  const filterId = getActiveTaskFilterId();
  const visibleTasks = filterTasksByChannel(getColumnVisibleTasks(column), filterId);
  const todayISO = getTodayISO();
  const isPastCol = column.isoDate < todayISO;
  const isTodayCol = column.isoDate === todayISO;
  let plannedMinutes = visibleTasks.reduce((sum, task) => {
    ensureTaskTimeState(task);
    return sum + getPlannedMinutesForDate(task, column.isoDate);
  }, 0);
  let remainingPlannedMinutes = visibleTasks.reduce((sum, task) => {
    ensureTaskTimeState(task);
    if (isTodayCol && (task.complete || task.completedOnDate === column.isoDate)) return sum;
    return sum + getPlannedMinutesForDate(task, column.isoDate);
  }, 0);
  // Use daily actual time for the column's date
  const actualSeconds = visibleTasks.reduce((sum, task) => {
    return sum + getTaskDailyActualSeconds(task, column.isoDate);
  }, 0);
  // Also include ghost tasks' daily time and planned time for past columns
  let ghostActualSeconds = 0;
  if (isPastCol) {
    const ghosts = filterTasksByChannel(getGhostTasksForDate(column.isoDate), filterId);
    ghostActualSeconds = ghosts.reduce((sum, task) => sum + getTaskDailyActualSeconds(task, column.isoDate), 0);
    plannedMinutes += ghosts.reduce((sum, task) => {
      ensureTaskTimeState(task);
      return sum + getPlannedMinutesForDate(task, column.isoDate);
    }, 0);
    remainingPlannedMinutes += ghosts.reduce((sum, task) => {
      ensureTaskTimeState(task);
      return sum + getPlannedMinutesForDate(task, column.isoDate);
    }, 0);
  }
  const actualMinutes = Math.floor((actualSeconds + ghostActualSeconds) / 60);

  return {
    isPastCol,
    isTodayCol,
    plannedMinutes,
    remainingPlannedMinutes,
    actualMinutes
  };
}

function formatColumnTimeSummary(column, options = {}) {
  const metrics = getColumnTimeSummaryMetrics(column);

  if (metrics.isPastCol) {
    return formatActualPlannedSummary(metrics.actualMinutes, metrics.plannedMinutes);
  }

  if (options.mode === 'actual-planned') {
    return formatActualPlannedSummary(metrics.actualMinutes, metrics.plannedMinutes);
  }

  if (options.mode === 'remaining') {
    return metrics.remainingPlannedMinutes > 0 ? formatMinutes(metrics.remainingPlannedMinutes) : '';
  }

  return metrics.plannedMinutes > 0 ? formatMinutes(metrics.plannedMinutes) : '';
}

function getColumnTimeBadgeConfig(column) {
  const todayISO = getTodayISO();
  const isTodayCol = column.isoDate === todayISO;
  if (!isTodayCol) {
    return {
      text: formatColumnTimeSummary(column),
      tooltip: '',
      interactive: false
    };
  }

  const mode = getColumnTimeBadgeMode(column.isoDate);
  if (mode === 'actual-planned') {
    return {
      text: formatColumnTimeSummary(column, { mode: 'actual-planned' }),
      tooltip: 'Actual vs Planned',
      interactive: true
    };
  }

  return {
    text: formatColumnTimeSummary(column, { mode: 'remaining' }),
    tooltip: 'Total: time remaining',
    interactive: true
  };
}

function renderColumnTimeBadgeHtml(column) {
  const badge = getColumnTimeBadgeConfig(column);
  const attrs = [];
  if (badge.tooltip) attrs.push(`data-tooltip="${escapeHtml(badge.tooltip)}"`);
  if (badge.interactive) {
    attrs.push('data-column-time-total-toggle');
    attrs.push('role="button"');
    attrs.push('tabindex="0"');
  }
  const attrText = attrs.length ? ` ${attrs.join(' ')}` : '';
  const className = `column-time-total task-card__time-badge${badge.interactive ? ' column-time-total--interactive' : ''}`;
  return `<span class="${className}"${badge.text ? '' : ' hidden'}${attrText}>${escapeHtml(badge.text || '')}</span>`;
}

function renderAddTaskButtonHtml(options = {}) {
  const showShortcut = options.showShortcut === true;
  return `
    <button class="add-task-btn">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      <span class="add-task-btn__content">
        <span class="add-task-btn__label">Add task</span>
        <span class="add-task-btn__meta${showShortcut ? '' : ' add-task-btn__meta--hidden'}" aria-hidden="true">
          <span class="add-task-btn__separator">&middot;</span>
          <span class="add-task-btn__shortcut">A</span>
        </span>
      </span>
    </button>
  `;
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
  const visibleTasks = filterTasksByChannel(getColumnVisibleTasks(column), getActiveTaskFilterId());
  const getVisibleSubtasks = task => (Array.isArray(task.subtasks) ? task.subtasks : [])
    .filter(subtaskShouldShowOnCard);

  const total = visibleTasks.reduce((sum, task) => {
    ensureTaskTimeState(task);
    return sum + 1 + getVisibleSubtasks(task).length;
  }, 0);
  if (total === 0) return 0;
  const done = visibleTasks.reduce((sum, task) => {
    const taskDone = task.complete ? 1 : 0;
    const doneSubtasks = getVisibleSubtasks(task)
      .reduce((subtaskSum, subtask) => subtaskSum + (subtask.done ? 1 : 0), 0);
    return sum + taskDone + doneSubtasks;
  }, 0);
  return Math.round((done / total) * 100);
}

function subtaskShouldShowOnCard(subtask) {
  if (!subtask) return false;
  const hasLabel = String(subtask.label || '').trim().length > 0;
  return hasLabel
    || !!subtask.done
    || (subtask.plannedMinutes || 0) > 0
    || hasActualTime(subtask.actualTimeSeconds);
}

function getSubtaskCardLabel(subtask) {
  const label = String(subtask?.label || '').trim();
  return label || 'Untitled subtask';
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
  const backlogTask = state.backlog.find(task => task && task.id === taskId);
  if (backlogTask) {
    ensureTaskTimeState(backlogTask);
    return backlogTask;
  }
  const archiveTask = state.archive.find(task => task && task.id === taskId);
  if (archiveTask) {
    ensureTaskTimeState(archiveTask);
    return archiveTask;
  }
  const derivedTask = getRepeatRuntimeTaskById(taskId);
  if (derivedTask) {
    ensureTaskTimeState(derivedTask);
    return derivedTask;
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
  const derivedTask = getRepeatRuntimeTaskById(taskId);
  if (derivedTask) {
    ensureTaskTimeState(derivedTask);
    return {
      column: ensureColumnForDate(derivedTask.repeatOccurrenceDate || derivedTask.startDate || getTodayISO()),
      task: derivedTask,
      index: -1
    };
  }
  return null;
}

function getBacklogHorizonConfig(horizonId) {
  return BACKLOG_HORIZONS.find(horizon => horizon.id === horizonId) || BACKLOG_HORIZONS[0];
}

function isTaskBacklogged(task) {
  return !!(task && typeof task.backlogHorizon === 'string' && task.backlogHorizon);
}

function findBacklogTask(taskId) {
  const task = state.backlog.find(item => item && item.id === taskId) || null;
  if (task) ensureTaskTimeState(task);
  return task;
}

function isTaskInBacklog(taskId) {
  return !!findBacklogTask(taskId);
}

function getBacklogSourceIsoDate(task) {
  return task && task.startDate ? task.startDate : getTodayISO();
}

function normalizeBacklogOrder(task, fallbackIndex = 0) {
  if (!task) return fallbackIndex;
  if (!Number.isFinite(task.backlogOrder)) task.backlogOrder = fallbackIndex;
  return task.backlogOrder;
}

function sortBacklogTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const orderDiff = normalizeBacklogOrder(a) - normalizeBacklogOrder(b);
    if (orderDiff !== 0) return orderDiff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function normalizeBacklogOrders(horizonId) {
  const tasks = sortBacklogTasks(state.backlog.filter(task => task.backlogHorizon === horizonId));
  tasks.forEach((task, index) => {
    task.backlogOrder = index;
  });
}

function getChannelById(channelId) {
  return CHANNELS.find(ch => ch.id === channelId) || null;
}

function getContextChildChannelIds(contextLabel) {
  return CHANNELS
    .filter(ch => !ch.isContext && ch.context === contextLabel)
    .map(ch => ch.id);
}

function normalizeTaskFilterId(filterId) {
  const nextId = typeof filterId === 'string' && filterId ? filterId : 'all';
  if (nextId === 'all') return 'all';
  return getSearchChannelOptions().some(option => option.id === nextId) ? nextId : 'all';
}

function getTaskFilterScopeKey() {
  if (dailyPlanningState.isActive) return 'dailyPlanning';
  if (dailyShutdownState.isActive) return 'dailyShutdown';
  return 'homeToday';
}

function getTaskFilterIdForScope(scopeKey = getTaskFilterScopeKey()) {
  const normalized = normalizeTaskFilterId(topbarTaskFilterState[scopeKey]);
  topbarTaskFilterState[scopeKey] = normalized;
  return normalized;
}

function getActiveTaskFilterId() {
  return getTaskFilterIdForScope(getTaskFilterScopeKey());
}

function taskMatchesChannelFilterId(task, filterId = getActiveTaskFilterId()) {
  if (!task) return false;
  if (!filterId || filterId === 'all') return true;
  const channel = getChannelById(filterId);
  if (!channel) return true;
  const normalizedTaskTag = normalizeTag(task.tag);
  if (channel.id === 'unassigned') return !normalizedTaskTag;
  const exactTag = '#' + channel.label;
  if (!channel.isContext) return normalizedTaskTag === exactTag;
  if (normalizedTaskTag === exactTag) return true;
  const childChannelIds = getContextChildChannelIds(channel.label);
  return childChannelIds.some(id => {
    const child = getChannelById(id);
    return child && normalizedTaskTag === '#' + child.label;
  });
}

function filterTasksByChannel(tasks, filterId = getActiveTaskFilterId()) {
  return (Array.isArray(tasks) ? tasks : []).filter(task => taskMatchesChannelFilterId(task, filterId));
}

function getSharedHomeTodayFilterId() {
  const normalized = normalizeTaskFilterId(topbarTaskFilterState.homeToday);
  topbarTaskFilterState.homeToday = normalized;
  backlogPanelState.filterId = normalized;
  return normalized;
}

function taskMatchesBacklogFilter(task, filterId = getSharedHomeTodayFilterId()) {
  return taskMatchesChannelFilterId(task, filterId);
}

function getBacklogTasksForHorizon(horizonId, filterId = getSharedHomeTodayFilterId()) {
  return sortBacklogTasks(
    state.backlog.filter(task => task.backlogHorizon === horizonId && taskMatchesBacklogFilter(task, filterId))
  );
}

function findArchiveTask(taskId) {
  const task = state.archive.find(item => item && item.id === taskId) || null;
  if (task) ensureTaskTimeState(task);
  return task;
}

function isTaskInArchive(taskId) {
  return !!findArchiveTask(taskId);
}

function getArchiveSourceIsoDate(task) {
  return task && task.archiveSourceDate ? task.archiveSourceDate : (task && task.startDate ? task.startDate : getTodayISO());
}

function removeTaskFromArchive(taskId) {
  const index = state.archive.findIndex(task => task && task.id === taskId);
  if (index === -1) return null;
  const [task] = state.archive.splice(index, 1);
  return task || null;
}

function persistArchiveTaskOrder() {
  state.archive.forEach(task => persistTask(task, 0));
}

function prependArchiveTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return;
  state.archive = tasks.concat(state.archive);
}

function insertTaskIntoArchive(task, archiveSourceDate, archivedAt = getNowIsoString()) {
  if (!task) return null;
  ensureTaskTimeState(task);
  ensureTaskRolloverState(task);
  task.backlogHorizon = null;
  task.backlogOrder = null;
  task.archiveSourceDate = archiveSourceDate || getTodayISO();
  task.archivedAt = archivedAt;
  prependArchiveTasks([task]);
  return task;
}

function restoreArchiveTask(taskId, options = {}) {
  const task = removeTaskFromArchive(taskId);
  if (!task) return null;
  const sourceIso = getArchiveSourceIsoDate(task);
  const targetIso = options.targetIsoDate || sourceIso;
  const targetCol = ensureColumnForDate(targetIso);
  let insertIndex = 0;
  if (Number.isFinite(options.insertIndex)) {
    insertIndex = Math.max(0, Math.min(options.insertIndex, targetCol.tasks.length));
  }

  task.archivedAt = null;
  task.archiveSourceDate = null;
  targetCol.tasks.splice(insertIndex, 0, task);

  if (options.applyDropRules !== false) {
    const todayISO = getTodayISO();
    if (targetIso < todayISO && sourceIso >= todayISO) {
      completeTaskAsOf(task, targetIso);
      task.startDate = targetIso;
      moveCompletedTasksToBottom(targetCol);
    } else if (sourceIso < todayISO && targetIso >= todayISO) {
      clearTaskCompletionMetadata(task);
      task.startDate = targetIso;
      task.scheduledTime = null;
    } else {
      task.startDate = targetIso;
    }
  }

  persistColumnTaskOrder(targetCol);
  persistArchiveTaskOrder();
  return { task, column: targetCol, sourceIso, targetIso, insertIndex };
}

function findTrashEntry(taskId) {
  return state.trash.find(entry => entry.task && entry.task.id === taskId) || null;
}

function isTaskInTrash(taskId) {
  return !!findTrashEntry(taskId);
}

function getTrashSourceIsoDate(entry) {
  if (!entry) return getTodayISO();
  return entry.deletedFrom?.isoDate || entry.task?.startDate || getTodayISO();
}

function getTrashDaysRemaining(entry) {
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  if (!entry) return 0;
  const ts = getDateLikeMs(entry.deletedAt);
  if (!Number.isFinite(ts)) return 30;
  const remainingMs = maxAgeMs - (Date.now() - ts);
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

function purgeExpiredTrash() {
  const now = Date.now();
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  const expired = [];
  state.trash = state.trash.filter(entry => {
    const ts = getDateLikeMs(entry.deletedAt);
    if (!Number.isFinite(ts)) return true;
    if (now - ts > maxAgeMs) {
      expired.push(entry);
      return false;
    }
    return true;
  });
  // Permanently delete expired entries from Firestore
  let repeatSeriesChanged = false;
  for (const entry of expired) {
    const task = entry?.task;
    if (task?.repeatSeriesId && task.repeatOccurrenceDate) {
      const series = getRepeatSeriesById(task.repeatSeriesId);
      if (series) {
        const nextSeries = addSkippedOccurrenceToSeries(series, task.repeatOccurrenceDate, entry.repeatSkipFingerprint || null);
        if (JSON.stringify(nextSeries.skippedOccurrences) !== JSON.stringify(series.skippedOccurrences)) {
          persistRepeatSeries(nextSeries);
          repeatSeriesChanged = true;
        }
      }
    }
    const entryId = entry.id || (entry.task && entry.task.id);
    if (entryId) persistRemoveFromTrash(entryId);
  }
  return { expiredCount: expired.length, repeatSeriesChanged };
}

function getTaskLocation(taskId) {
  const ctx = findTaskContext(taskId);
  if (ctx) {
    return { location: 'column', column: ctx.column, task: ctx.task, index: ctx.index, entry: null };
  }
  const backlogTask = findBacklogTask(taskId);
  if (backlogTask) {
    const isoDate = getBacklogSourceIsoDate(backlogTask);
    const column = createEmptyColumnForDate(isoDate);
    return { location: 'backlog', column, task: backlogTask, index: state.backlog.findIndex(task => task.id === taskId), entry: null };
  }
  const archiveTask = findArchiveTask(taskId);
  if (archiveTask) {
    const isoDate = getArchiveSourceIsoDate(archiveTask);
    const column = createEmptyColumnForDate(isoDate);
    return { location: 'archive', column, task: archiveTask, index: state.archive.findIndex(task => task.id === taskId), entry: null };
  }
  const entry = findTrashEntry(taskId);
  if (entry) {
    ensureTaskTimeState(entry.task);
    const isoDate = getTrashSourceIsoDate(entry);
    const column = createEmptyColumnForDate(isoDate);
    return { location: 'trash', column, task: entry.task, index: -1, entry };
  }
  return null;
}

function renderTaskLocation(loc) {
  if (!loc) return;
  if (loc.location === 'column') {
    renderColumn(loc.column);
  } else if (loc.location === 'backlog') {
    renderBacklogPanel();
  } else if (loc.location === 'archive') {
    renderArchivePanel();
  } else {
    renderTrashPanel();
  }
}

function removeTaskFromBacklog(taskId) {
  const index = state.backlog.findIndex(task => task && task.id === taskId);
  if (index === -1) return null;
  const [task] = state.backlog.splice(index, 1);
  if (task && task.backlogHorizon) normalizeBacklogOrders(task.backlogHorizon);
  return task || null;
}

function insertTaskIntoBacklog(task, horizonId, insertIndex = 0) {
  if (!task) return null;
  ensureTaskTimeState(task);
  const horizon = getBacklogHorizonConfig(horizonId);
  const tasksInHorizon = sortBacklogTasks(state.backlog.filter(item => item.backlogHorizon === horizon.id));
  const clampedIndex = Math.max(0, Math.min(insertIndex, tasksInHorizon.length));
  task.backlogHorizon = horizon.id;
  task.backlogOrder = clampedIndex;
  state.backlog.push(task);
  normalizeBacklogOrders(horizon.id);
  if (clampedIndex < tasksInHorizon.length) {
    const reordered = sortBacklogTasks(state.backlog.filter(item => item.backlogHorizon === horizon.id));
    const currentIndex = reordered.findIndex(item => item.id === task.id);
    if (currentIndex !== -1 && currentIndex !== clampedIndex) {
      reordered.splice(currentIndex, 1);
      reordered.splice(clampedIndex, 0, task);
      reordered.forEach((item, index) => {
        item.backlogOrder = index;
      });
    }
  }
  return task;
}

function getSelectableTaskCards(root = document) {
  return [...root.querySelectorAll('.task-card:not(.task-card--placeholder):not(.task-card--dragging):not(.task-card--ghost)')];
}

function resolveVisibleTaskCard(taskId) {
  if (!taskId) return null;
  const matches = [...document.querySelectorAll(`.task-card[data-task-id="${taskId}"]:not(.task-card--placeholder):not(.task-card--dragging)`)];
  if (!matches.length) return null;
  if (shortcutState.activeColumnIso) {
    const matched = matches.find(card => (card.dataset.columnDate || card.dataset.ghostDate || null) === shortcutState.activeColumnIso);
    if (matched) return matched;
  }
  return matches.find(card => !card.dataset.ghostDate) || matches[0];
}

function resolveAnchoredTaskCard(taskId, anchorCard = null) {
  if (anchorCard instanceof Element && anchorCard.isConnected && anchorCard.dataset.taskId === taskId) {
    return anchorCard;
  }
  return resolveVisibleTaskCard(taskId);
}

function syncActiveTaskCardUI() {
  let hasActiveCard = false;
  if (document.body) {
    document.body.classList.remove('task-selection--keyboard-lock');
  }
  document.querySelectorAll('.task-card--active').forEach(el => el.classList.remove('task-card--active'));
  if (!shortcutState.activeTaskId) return;
  if (shortcutState.activeSource === 'hover') return;
  document.querySelectorAll(`.task-card[data-task-id="${shortcutState.activeTaskId}"]:not(.task-card--placeholder):not(.task-card--dragging):not(.task-card--ghost)`).forEach(card => {
    card.classList.add('task-card--active');
    hasActiveCard = true;
  });
  if (hasActiveCard && shortcutState.activeSource === 'keyboard' && document.body) {
    document.body.classList.add('task-selection--keyboard-lock');
  }
  if (!hasActiveCard) {
    shortcutState.activeTaskId = null;
    shortcutState.activeSource = null;
    shortcutState.activeColumnIso = null;
  }
}

function clearActiveTaskSelection() {
  shortcutState.activeTaskId = null;
  shortcutState.activeSource = null;
  shortcutState.activeColumnIso = null;
  syncActiveTaskCardUI();
}

function getPinnedShortcutTaskId() {
  if (cardDatePickerState?.taskId) return cardDatePickerState.taskId;
  if (startDatePickerState?.taskId) return startDatePickerState.taskId;
  return null;
}

function suppressTaskHoverSelectionUntilPointerMove() {
  shortcutState.suppressHoverUntilPointerMove = true;
}

function getScrollableTaskAncestor(element, axis = 'y') {
  let node = element?.parentElement || null;
  while (node) {
    const style = getComputedStyle(node);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    const canScroll = axis === 'x'
      ? node.scrollWidth > node.clientWidth
      : node.scrollHeight > node.clientHeight;
    if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') && canScroll) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function getContainerVisibleRect(container, axis = 'y') {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  if (axis !== 'x') return rect;

  let left = rect.left;
  let right = rect.right;

  const leftSidebar = document.querySelector('.sidebar');
  if (leftSidebar) {
    const sidebarRect = leftSidebar.getBoundingClientRect();
    const overlaps = sidebarRect.right > rect.left && sidebarRect.left < rect.right;
    if (overlaps) left = Math.max(left, sidebarRect.right);
  }

  const rightSidebar = document.querySelector('.right-sidebar');
  if (rightSidebar) {
    const sidebarRect = rightSidebar.getBoundingClientRect();
    const overlaps = sidebarRect.left < rect.right && sidebarRect.right > rect.left;
    if (overlaps) right = Math.min(right, sidebarRect.left);
  }

  if (right <= left) {
    left = rect.left;
    right = rect.right;
  }

  return { left, right, top: rect.top, bottom: rect.bottom };
}

function isTaskCardFullyVisible(card, containerY, containerX = null, margin = 8) {
  if (!card) return false;
  const cardRect = card.getBoundingClientRect();
  const verticalVisible = containerY
    ? (() => {
        const rect = getContainerVisibleRect(containerY, 'y');
        return cardRect.top >= (rect.top + margin) && cardRect.bottom <= (rect.bottom - margin);
      })()
    : cardRect.top >= margin && cardRect.bottom <= (window.innerHeight - margin);
  const horizontalVisible = containerX
    ? (() => {
        const rect = getContainerVisibleRect(containerX, 'x');
        return cardRect.left >= (rect.left + margin) && cardRect.right <= (rect.right - margin);
      })()
    : cardRect.left >= margin && cardRect.right <= (window.innerWidth - margin);
  return verticalVisible && horizontalVisible;
}

function scrollTaskCardIntoViewIfNeeded(card) {
  if (!card) return;
  const containerY = getScrollableTaskAncestor(card, 'y');
  const containerX = getScrollableTaskAncestor(card, 'x');
  if (isTaskCardFullyVisible(card, containerY, containerX)) return;

  const margin = 8;

  if (containerY) {
    const cardRect = card.getBoundingClientRect();
    const containerRect = containerY.getBoundingClientRect();
    if (cardRect.top < containerRect.top + margin) {
      containerY.scrollTo({
        top: containerY.scrollTop - ((containerRect.top + margin) - cardRect.top),
        behavior: 'smooth'
      });
    } else if (cardRect.bottom > containerRect.bottom - margin) {
      containerY.scrollTo({
        top: containerY.scrollTop + (cardRect.bottom - (containerRect.bottom - margin)),
        behavior: 'smooth'
      });
    }
  }

  if (containerX) {
    const horizontalTarget = card.closest('.day-column') || card;
    const targetRect = horizontalTarget.getBoundingClientRect();
    const containerRect = getContainerVisibleRect(containerX, 'x');
    if (targetRect.left < containerRect.left + margin) {
      containerX.scrollTo({
        left: containerX.scrollLeft - ((containerRect.left + margin) - targetRect.left),
        behavior: 'smooth'
      });
    } else if (targetRect.right > containerRect.right - margin) {
      containerX.scrollTo({
        left: containerX.scrollLeft + (targetRect.right - (containerRect.right - margin)),
        behavior: 'smooth'
      });
    }
  }
}

function setActiveTaskSelection(taskId, source = 'pointer', columnIso = null) {
  if (!taskId) {
    clearActiveTaskSelection();
    return;
  }
  if (source === 'keyboard') {
    suppressTaskHoverSelectionUntilPointerMove();
  }
  shortcutState.activeTaskId = taskId;
  shortcutState.activeSource = source;
  shortcutState.activeColumnIso = columnIso || (getTaskLocation(taskId)?.column?.isoDate || null);
  syncActiveTaskCardUI();
  const card = resolveVisibleTaskCard(taskId);
  if (card && source === 'keyboard') {
    scrollTaskCardIntoViewIfNeeded(card);
  }
}

function setActiveTaskSelectionFromCard(card, source = 'pointer') {
  if (!card) return;
  const taskId = card.dataset.taskId;
  const columnIso = card.dataset.columnDate || card.dataset.ghostDate || card.closest('.day-column')?.dataset.isoDate || null;
  setActiveTaskSelection(taskId, source, columnIso);
}

function getActiveTaskLocation() {
  const taskId = getPinnedShortcutTaskId() || shortcutState.activeTaskId;
  if (!taskId) return null;
  const loc = getTaskLocation(taskId);
  if (!loc) {
    clearActiveTaskSelection();
    return null;
  }
  return loc;
}

function getBoardColumnsInDomOrder() {
  return [...document.querySelectorAll('#day-columns .day-column')];
}

function getCardsForDayColumn(colEl) {
  if (!colEl) return [];
  return getSelectableTaskCards(colEl.querySelector('.task-list') || colEl);
}

function getFirstSelectableCard() {
  for (const colEl of getBoardColumnsInDomOrder()) {
    const [firstCard] = getCardsForDayColumn(colEl);
    if (firstCard) return firstCard;
  }
  return null;
}

function getFirstSelectableTodayCard() {
  const todayColumn = document.querySelector(`#day-columns .day-column[data-iso-date="${getTodayISO()}"]`)
    || document.querySelector('#day-columns .day-column--today');
  if (!todayColumn) return null;
  const [firstCard] = getCardsForDayColumn(todayColumn);
  return firstCard || null;
}

function moveActiveTaskSelection(direction) {
  if (openModalTaskId) return false;
  if (dailyPlanningState.isActive || dailyShutdownState.isActive) return false;

  const activeCard = resolveVisibleTaskCard(shortcutState.activeTaskId);
  if (!activeCard) {
    const firstCard = getFirstSelectableCard();
    if (!firstCard) return false;
    setActiveTaskSelectionFromCard(firstCard, 'keyboard');
    return true;
  }

  const currentCol = activeCard.closest('.day-column');
  if (!currentCol) {
    const firstCard = getFirstSelectableCard();
    if (!firstCard) return false;
    setActiveTaskSelectionFromCard(firstCard, 'keyboard');
    return true;
  }
  const currentCards = getCardsForDayColumn(currentCol);
  const currentIndex = currentCards.findIndex(card => card.dataset.taskId === activeCard.dataset.taskId);
  let nextCard = null;

  if (direction === 'up' && currentIndex > 0) {
    nextCard = currentCards[currentIndex - 1];
  } else if (direction === 'down' && currentIndex < currentCards.length - 1) {
    nextCard = currentCards[currentIndex + 1];
  } else if (direction === 'first' && currentCards.length > 0) {
    nextCard = currentCards[0];
  } else if (direction === 'last' && currentCards.length > 0) {
    nextCard = currentCards[currentCards.length - 1];
  } else if (direction === 'left' || direction === 'right') {
    const columns = getBoardColumnsInDomOrder();
    const columnIndex = columns.indexOf(currentCol);
    const targetCol = columns[columnIndex + (direction === 'right' ? 1 : -1)];
    const targetCards = getCardsForDayColumn(targetCol);
    if (targetCards.length > 0) nextCard = targetCards[0];
  }

  if (!nextCard) return false;
  setActiveTaskSelectionFromCard(nextCard, 'keyboard');
  return true;
}

function isEditableElement(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-shortcuts-search]')) return true;
  if (target.closest('.ql-editor')) return true;
  if (target.closest('input, textarea, select')) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  return false;
}

function isEditorShortcutTarget(target) {
  return target instanceof Element && !!target.closest('.ql-editor');
}

function getOpenArrowNavigablePicker() {
  return document.querySelector('[data-topbar-sdp]')
    || document.querySelector('[data-card-sdp]')
    || document.querySelector('[data-sdp]')
    || document.querySelector('[data-ddp]')
    || document.querySelector('[data-ellipsis-menu]')
    || document.querySelector('[data-card-picker]');
}

function getArrowNavigableItems(root) {
  if (!root) return [];
  if (root.matches('[data-card-picker]')) {
    return [...root.querySelectorAll('button:not([disabled])')];
  }
  return [...root.querySelectorAll('.sdp__menu-item:not(:disabled)')];
}

function getHighlightedPickerItem(root) {
  if (!root) return null;
  return root.querySelector('.picker-nav-highlighted');
}

function setPickerNavigationMode(root, mode) {
  if (!root) return;
  root.classList.toggle('picker-nav--keyboard', mode === 'keyboard');
  root.classList.toggle('picker-nav--pointer', mode === 'pointer');
}

function setHighlightedPickerItem(root, item) {
  if (!root) return;
  root.querySelectorAll('.picker-nav-highlighted').forEach(el => el.classList.remove('picker-nav-highlighted'));
  if (!item) return;
  item.classList.add('picker-nav-highlighted');
  if (typeof item.focus === 'function') {
    item.focus({ preventScroll: true });
  }
}

function moveOpenPickerItemFocus(direction) {
  const root = getOpenArrowNavigablePicker();
  if (!root) return false;
  const items = getArrowNavigableItems(root);
  if (!items.length) return false;

  const active = getHighlightedPickerItem(root) || (document.activeElement instanceof Element ? document.activeElement.closest('button') : null);
  const currentIndex = active ? items.indexOf(active) : -1;
  const delta = direction === 'down' ? 1 : -1;
  let nextIndex = currentIndex;

  if (currentIndex === -1) {
    nextIndex = direction === 'down' ? 0 : items.length - 1;
  } else {
    nextIndex = Math.max(0, Math.min(currentIndex + delta, items.length - 1));
  }

  const nextItem = items[nextIndex];
  if (!nextItem) return false;
  setPickerNavigationMode(root, 'keyboard');
  setHighlightedPickerItem(root, nextItem);
  if (typeof nextItem.scrollIntoView === 'function') {
    nextItem.scrollIntoView({ block: 'nearest' });
  }
  return true;
}

function handleOpenPickerArrowNavigation(e) {
  if (!e || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return false;

  const root = getOpenArrowNavigablePicker();
  if (!root) return false;

  const target = e.target instanceof Element ? e.target : null;
  if (target && target.closest('[data-backlog-filter-picker]')) {
    return false;
  }
  if (isEditableElement(target)) return false;

  return moveOpenPickerItemFocus(e.key === 'ArrowDown' ? 'down' : 'up') || true;
}

function handleOpenPickerEnterActivation(e) {
  if (!e || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key !== 'Enter') return false;

  const root = getOpenArrowNavigablePicker();
  if (!root) return false;

  const target = e.target instanceof Element ? e.target : null;
  if (isEditableElement(target)) return false;

  const item = getHighlightedPickerItem(root) || (document.activeElement instanceof Element ? document.activeElement.closest('button') : null);
  if (!item || typeof item.click !== 'function') return false;
  item.click();
  return true;
}

function handleOpenPickerPointerHover(e) {
  const root = getOpenArrowNavigablePicker();
  if (!root) return;
  if (!(e.target instanceof Element)) return;
  if (!root.contains(e.target)) return;

  const items = getArrowNavigableItems(root);
  if (!items.length) return;

  const hoveredItem = e.target.closest('button');
  if (!hoveredItem || !items.includes(hoveredItem)) return;

  const highlightedItem = getHighlightedPickerItem(root);
  if (highlightedItem === hoveredItem && root.classList.contains('picker-nav--keyboard')) return;

  setPickerNavigationMode(root, 'pointer');
  setHighlightedPickerItem(root, hoveredItem);
}

function withActiveTask(handler) {
  const loc = openModalTaskId ? getTaskLocation(openModalTaskId) : getActiveTaskLocation();
  if (!loc) return false;
  return handler(loc) !== false;
}

function getHoveredModalSubtaskId() {
  if (!openModalTaskId) return null;
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay || overlay.hidden) return null;
  const hoveredRow = overlay.querySelector('[data-modal-subtask-row]:hover');
  return hoveredRow ? (hoveredRow.getAttribute('data-modal-subtask-id') || null) : null;
}

function showAddTaskInputForShortcut() {
  if (openModalTaskId) return false;
  const activeCard = resolveVisibleTaskCard(shortcutState.activeTaskId);
  const column = activeCard?.closest('.day-column') || document.querySelector('#day-columns .day-column');
  if (!column) return false;
  showAddTaskInput(column);
  return true;
}

function refreshTaskDetailModalIfOpen(taskId) {
  if (!taskId || openModalTaskId !== taskId) return;
  openTaskDetailModal(taskId);
}

function closeTaskDetailModalForNavigation() {
  if (!openModalTaskId) return false;
  closeTaskDetailModal();
  return true;
}

function runPageNavigationShortcut(action) {
  closeTaskDetailModalForNavigation();
  return action() !== false;
}

function openChannelPickerForShortcut(taskId) {
  if (!taskId) return false;
  if (openModalTaskId === taskId) {
    closeStartDatePicker();
    closeDueDatePicker();
    closePlannedPicker();
    closeActualPicker();
    closeEllipsisMenu();
    openModalChannelPicker(taskId);
    return true;
  }
  openChannelPicker(taskId);
  return true;
}

function expandCardTimerForShortcut(taskId) {
  const card = resolveVisibleTaskCard(taskId);
  if (!card || card.dataset.backlogCard === 'true') return null;

  const timerKey = getCardTimerKeyForCard(card);
  if (!timerKey || cardTimerExpanded.has(timerKey)) {
    return { card, rerendered: false };
  }

  cardTimerExpanded.add(timerKey);

  const columnDate = card.dataset.columnDate || null;
  const column = columnDate
    ? state.columns.find(item => item.isoDate === columnDate)
    : state.columns.find(item => item.tasks.some(task => task.id === taskId));

  if (column) {
    renderColumn(column);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  return { card: resolveVisibleTaskCard(taskId), rerendered: true };
}

function openPlannedPickerForShortcut(taskId) {
  if (!taskId) return false;
  if (openModalTaskId === taskId) {
    const subtaskId = getHoveredModalSubtaskId();
    closeStartDatePicker();
    closeDueDatePicker();
    closeActualPicker();
    closeEllipsisMenu();
    openPlannedPicker(subtaskId);
    return true;
  }
  const result = expandCardTimerForShortcut(taskId);
  if (!result) return false;
  const openPicker = () => openCardPicker(taskId, 'planned');
  if (result.rerendered) {
    setTimeout(openPicker, 0);
  } else {
    openPicker();
  }
  return true;
}

function openActualPickerForShortcut(taskId) {
  if (openModalTaskId === taskId) {
    const subtaskId = getHoveredModalSubtaskId();
    if (focusState.running && focusState.taskId === taskId) {
      if (subtaskId) {
        if (focusState.subtaskId === subtaskId) return false;
      } else {
        return false;
      }
    }
    closeStartDatePicker();
    closeDueDatePicker();
    closePlannedPicker();
    closeEllipsisMenu();
    openActualPicker(subtaskId);
    return true;
  }
  const result = expandCardTimerForShortcut(taskId);
  const card = result?.card || resolveVisibleTaskCard(taskId);
  if (!card || card.dataset.backlogCard === 'true') return false;
  const openPicker = () => {
    if (card.dataset.isPast === 'true' || dailyShutdownState.isActive) {
      actualPickerDateScope = card.dataset.columnDate || null;
    }
    openCardPicker(taskId, 'actual');
  };
  if (result?.rerendered) {
    setTimeout(openPicker, 0);
  } else {
    openPicker();
  }
  return true;
}

function openStartDatePickerForShortcut(taskId) {
  if (openModalTaskId === taskId) {
    closeDueDatePicker();
    closeModalChannelPicker();
    closePlannedPicker();
    closeActualPicker();
    closeEllipsisMenu();
    openStartDatePicker(taskId);
    return true;
  }
  const card = resolveVisibleTaskCard(taskId);
  openCardDatePicker(taskId, card || null);
  return true;
}

function getFocusShortcutSource(taskId) {
  return openModalTaskId === taskId ? 'card-detail' : 'shortcut';
}

function openFocusModeForShortcut() {
  if (openModalTaskId) {
    return openFocusMode(openModalTaskId, false, getFocusShortcutSource(openModalTaskId)) !== false;
  }

  const activeLoc = getActiveTaskLocation();
  if (activeLoc?.task?.id) {
    return openFocusMode(activeLoc.task.id, false, getFocusShortcutSource(activeLoc.task.id)) !== false;
  }

  const firstTodayCard = getFirstSelectableTodayCard();
  if (!firstTodayCard) return false;
  setActiveTaskSelectionFromCard(firstTodayCard, 'keyboard');
  return openFocusMode(firstTodayCard.dataset.taskId, false, getFocusShortcutSource(firstTodayCard.dataset.taskId)) !== false;
}

function toggleFocusTimerForShortcut(taskId) {
  if (!taskId) return false;
  if (openModalTaskId === taskId) {
    const subtaskId = getHoveredModalSubtaskId();
    if (subtaskId) {
      const isSameRunning = focusState.running
        && focusState.taskId === taskId
        && focusState.subtaskId === subtaskId;
      if (isSameRunning) {
        stopFocusTimer();
        return true;
      }
      if (focusState.running) stopFocusTimer();
      openFocusMode(taskId, true, getFocusShortcutSource(taskId), subtaskId);
      return true;
    }
  }
  if (focusState.running && focusState.taskId === taskId) {
    stopFocusTimer();
    return true;
  }
  openFocusMode(taskId, true, getFocusShortcutSource(taskId));
  return true;
}

function addSubtaskForShortcut(taskId) {
  const loc = getTaskLocation(taskId);
  if (!loc || loc.location === 'trash') return false;
  const subtask = addModalSubtask(loc.task);
  renderTaskLocation(loc);
  persistTask(loc.task, 0);
  openTaskDetailModal(taskId);
  if (subtask) {
    requestAnimationFrame(() => focusModalSubtaskInput(subtask.id));
  }
  return true;
}

function toggleTaskCompletionForShortcut(taskId) {
  let loc = getTaskLocation(taskId);
  if (!loc) return false;

  if (loc.location === 'trash') {
    const restored = restoreTrashTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
    if (!restored) return false;
    renderColumn(restored.column);
    renderCalendarEvents();
    renderTrashPanel();
    persistTask(restored.task, 0);
    persistRemoveFromTrash(taskId);
    loc = getTaskLocation(taskId);
  } else if (loc.location === 'backlog') {
    const restored = restoreBacklogTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
    if (!restored) return false;
    renderColumn(restored.column);
    renderCalendarEvents();
    renderBacklogPanel();
    persistTask(restored.task, 0);
    loc = getTaskLocation(taskId);
  }

  if (!loc) return false;

  if (loc.location === 'archive') {
    if (loc.task.complete) {
      clearTaskCompletionMetadata(loc.task);
    } else {
      completeTaskAsOf(loc.task, getTodayISO());
    }
    renderArchivePanel();
    renderCalendarEvents();
    persistTask(loc.task, 0);
    refreshTaskDetailModalIfOpen(taskId);
    return true;
  }

  if (loc.location !== 'column') return false;
  if (loc.index === -1 && isDerivedRepeatTask(loc.task)) {
    materializeDerivedTask(loc.task);
    loc = getTaskLocation(taskId);
    if (!loc || loc.location !== 'column') return false;
  }

  const { column, task, index } = loc;
  const todayISO = getTodayISO();
  if (!task.complete) {
    const incompleteTasks = column.tasks.filter(t => !t.complete);
    task.previousIncompleteIndex = incompleteTasks.findIndex(t => t.id === task.id);
    completeTaskAsOf(task, todayISO);
    if (column.isoDate > todayISO) {
      column.tasks.splice(index, 1);
      const todayCol = ensureColumnForDate(todayISO);
      todayCol.tasks.push(task);
      task.startDate = todayISO;
      moveCompletedTasksToBottom(todayCol);
      renderColumn(column);
      renderColumn(todayCol);
      renderCalendarEvents();
      persistTask(task, 0);
      reconcileVisibleRepeatTasks();
      renderAllColumns();
      refreshTaskDetailModalIfOpen(task.id);
      setActiveTaskSelection(task.id, 'keyboard', todayISO);
      return true;
    }
    moveCompletedTasksToBottom(column);
  } else {
    if (column.isoDate < todayISO) {
      const taskIndex = column.tasks.findIndex(t => t.id === task.id);
      if (taskIndex !== -1) {
        column.tasks.splice(taskIndex, 1);
      }
      clearTaskCompletionMetadata(task);
      task.startDate = todayISO;
      task.scheduledTime = null;

      const todayCol = ensureColumnForDate(todayISO);
      const firstCompletedIndex = todayCol.tasks.findIndex(t => t.complete);
      const incompleteCount = firstCompletedIndex === -1 ? todayCol.tasks.length : firstCompletedIndex;
      const requestedIndex = Number.isInteger(task.previousIncompleteIndex)
        ? task.previousIncompleteIndex
        : (settings.taskRolloverPosition === 'top' ? 0 : incompleteCount);
      const insertionIndex = Math.max(0, Math.min(requestedIndex, incompleteCount));
      todayCol.tasks.splice(insertionIndex, 0, task);
      delete task.previousIncompleteIndex;

      renderColumn(column);
      renderColumn(todayCol);
      renderCalendarEvents();
      persistTask(task, 0);
      reconcileVisibleRepeatTasks();
      renderAllColumns();
      refreshTaskDetailModalIfOpen(task.id);
      setActiveTaskSelection(task.id, 'keyboard', todayISO);
      return true;
    }

    clearTaskCompletionMetadata(task);
    const taskIndex = column.tasks.findIndex(t => t.id === task.id);
    if (taskIndex !== -1) {
      const [uncompletedTask] = column.tasks.splice(taskIndex, 1);
      const firstCompletedIndex = column.tasks.findIndex(t => t.complete);
      const incompleteCount = firstCompletedIndex === -1 ? column.tasks.length : firstCompletedIndex;
      const requestedIndex = Number.isInteger(uncompletedTask.previousIncompleteIndex)
        ? uncompletedTask.previousIncompleteIndex
        : incompleteCount;
      const insertionIndex = Math.max(0, Math.min(requestedIndex, incompleteCount));
      column.tasks.splice(insertionIndex, 0, uncompletedTask);
      delete uncompletedTask.previousIncompleteIndex;
    }
  }

  renderColumn(column);
  renderCalendarEvents();
  persistTask(task, 0);
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  refreshTaskDetailModalIfOpen(task.id);
  setActiveTaskSelection(task.id, 'keyboard', column.isoDate);
  return true;
}

function moveTaskShortcutToDate(taskId, targetIsoDate) {
  const loc = getTaskLocation(taskId);
  if (!loc) return false;
  if (loc.location === 'trash') {
    const restored = restoreTrashTask(taskId, { targetIsoDate, applyDropRules: true });
    if (!restored) return false;
    renderColumn(restored.column);
    renderCalendarEvents();
    renderTrashPanel();
    persistTask(restored.task, 0);
    persistRemoveFromTrash(taskId);
    refreshTaskDetailModalIfOpen(taskId);
    setActiveTaskSelection(taskId, 'keyboard', restored.column.isoDate);
    return true;
  }
  if (loc.location === 'archive') {
    const restored = restoreArchiveTask(taskId, { targetIsoDate, applyDropRules: true });
    if (!restored) return false;
    renderColumn(restored.column);
    renderCalendarEvents();
    renderArchivePanel();
    persistTask(restored.task, 0);
    refreshTaskDetailModalIfOpen(taskId);
    setActiveTaskSelection(taskId, 'keyboard', restored.column.isoDate);
    return true;
  }
  if (loc.location === 'backlog') {
    const restored = restoreBacklogTask(taskId, { targetIsoDate, applyDropRules: true });
    if (!restored) return false;
    renderColumn(restored.column);
    renderCalendarEvents();
    renderBacklogPanel();
    persistTask(restored.task, 0);
    refreshTaskDetailModalIfOpen(taskId);
    setActiveTaskSelection(taskId, 'keyboard', restored.column.isoDate);
    return true;
  }
  moveTaskToDate(taskId, targetIsoDate);
  refreshTaskDetailModalIfOpen(taskId);
  setActiveTaskSelection(taskId, 'keyboard', targetIsoDate);
  renderCalendarEvents();
  return true;
}

function snoozeTaskForShortcut(taskId) {
  const loc = getTaskLocation(taskId);
  if (!loc) return false;
  const sourceIso = loc.column.isoDate || getTodayISO();
  const nextIso = isWorkTask(loc.task)
    ? getNextWorkingDayOnOrAfter(addDays(sourceIso, 1))
    : addDays(sourceIso, 1);
  return moveTaskShortcutToDate(taskId, nextIso);
}

function openBacklogPickerForShortcut(taskId) {
  if (openModalTaskId === taskId) {
    closeDueDatePicker();
    closeModalChannelPicker();
    closePlannedPicker();
    closeActualPicker();
    closeEllipsisMenu();
    openStartDatePicker(taskId);
    if (!startDatePickerState) return false;
    startDatePickerState.mode = 'backlog-only';
    renderStartDatePickerInModal();
    return true;
  }
  const card = resolveVisibleTaskCard(taskId);
  openCardDatePicker(taskId, card || null);
  if (!cardDatePickerState) return false;
  cardDatePickerState.mode = 'backlog-only';
  renderCardDatePicker();
  return true;
}

function moveTaskToTopOfBacklogForShortcut(taskId) {
  const moved = moveTaskToBacklog(taskId, 'week', { insertIndex: 0 });
  if (!moved) return false;
  renderBacklogPanel();
  renderCalendarEvents();
  refreshTaskDetailModalIfOpen(taskId);
  setActiveTaskSelection(taskId, 'keyboard');
  return true;
}

function reorderTaskForShortcut(taskId, mode) {
  const loc = getTaskLocation(taskId);
  if (!loc || loc.location === 'trash') return false;

  if (loc.location === 'column') {
    const list = loc.column.tasks;
    const from = list.findIndex(task => task.id === taskId);
    if (from === -1) return false;
    let to = from;
    if (mode === 'up') to = Math.max(0, from - 1);
    if (mode === 'down') to = Math.min(list.length - 1, from + 1);
    if (mode === 'top') to = 0;
    if (mode === 'bottom') to = list.length - 1;
    if (to === from) return false;
    const [task] = list.splice(from, 1);
    list.splice(to, 0, task);
    suppressTaskHoverSelectionUntilPointerMove();
    renderColumn(loc.column);
    persistColumnTaskOrder(loc.column);
    refreshTaskDetailModalIfOpen(taskId);
    setActiveTaskSelection(taskId, 'keyboard', loc.column.isoDate);
    return true;
  }

  if (loc.location === 'archive') {
    const from = state.archive.findIndex(task => task.id === taskId);
    if (from === -1) return false;
    let to = from;
    if (mode === 'up') to = Math.max(0, from - 1);
    if (mode === 'down') to = Math.min(state.archive.length - 1, from + 1);
    if (mode === 'top') to = 0;
    if (mode === 'bottom') to = state.archive.length - 1;
    if (to === from) return false;
    const [task] = state.archive.splice(from, 1);
    state.archive.splice(to, 0, task);
    renderArchivePanel();
    persistArchiveTaskOrder();
    refreshTaskDetailModalIfOpen(taskId);
    setActiveTaskSelection(taskId, 'keyboard');
    return true;
  }

  if (loc.location === 'backlog') {
    const horizonId = loc.task.backlogHorizon;
    const tasks = sortBacklogTasks(state.backlog.filter(task => task.backlogHorizon === horizonId));
    const from = tasks.findIndex(task => task.id === taskId);
    if (from === -1) return false;
    let to = from;
    if (mode === 'up') to = Math.max(0, from - 1);
    if (mode === 'down') to = Math.min(tasks.length - 1, from + 1);
    if (mode === 'top') to = 0;
    if (mode === 'bottom') to = tasks.length - 1;
    if (to === from) return false;
    const [task] = tasks.splice(from, 1);
    tasks.splice(to, 0, task);
    tasks.forEach((item, index) => {
      item.backlogOrder = index;
      persistTask(item, 0);
    });
    renderBacklogPanel();
    refreshTaskDetailModalIfOpen(taskId);
    setActiveTaskSelection(taskId, 'keyboard');
    return true;
  }

  return false;
}

function getTaskEventsOnOrAfter(taskId, startIsoDate) {
  return state.calendarEvents.filter(evt =>
    evt.taskId === taskId
    && evt.systemType !== 'actual'
    && evt.date >= startIsoDate
  );
}

function removeTaskFromCalendarForShortcut(taskId) {
  const loc = getTaskLocation(taskId);
  if (!loc) return false;
  const todayISO = getTodayISO();
  const removed = getTaskEventsOnOrAfter(taskId, todayISO);
  if (removed.length === 0 && !loc.task.scheduledTime) return true;
  state.calendarEvents = state.calendarEvents.filter(evt => !removed.includes(evt));
  removed.forEach(evt => persistDeleteCalendarEvent(evt.id));
  loc.task.scheduledTime = null;
  renderTaskLocation(loc);
  renderCalendarEvents();
  persistTask(loc.task, 0);
  refreshTaskDetailModalIfOpen(taskId);
  return true;
}

function getScheduleBoundsForDay(isoDate) {
  const day = parseISO(isoDate).getDay();
  const config = settings.schedule.find(item => item.day === day);
  if (!config || !config.workday) return null;
  return {
    startOffset: config.startMinutes / 60,
    endOffset: config.endMinutes / 60
  };
}

function getDaySchedulingEvents(isoDate, ignoreTaskId = null) {
  return getCalendarEventsForDate(isoDate)
    .filter(evt => !ignoreTaskId || evt.taskId !== ignoreTaskId)
    .filter(evt => evt.systemType !== 'actual')
    .sort((a, b) => a.offset - b.offset);
}

function findAutoScheduleSegments(task) {
  const durationMinutes = Math.max(task.timeEstimateMinutes || 0, settings.defaultTimeboxDurationMinutes);
  let remainingHours = durationMinutes / 60;
  let cursorDate = getFirstVisibleDate();
  const todayISO = getTodayISO();
  if (cursorDate < todayISO) cursorDate = todayISO;
  const segments = [];

  for (let i = 0; i < 30 && remainingHours > 0; i++) {
    const isoDate = addDays(cursorDate, i);
    const bounds = getScheduleBoundsForDay(isoDate);
    if (!bounds) continue;

    let dayStart = bounds.startOffset;
    if (isoDate === todayISO) {
      const now = new Date();
      const nowOffset = now.getHours() + (now.getMinutes() / 60);
      dayStart = Math.max(dayStart, Math.ceil(nowOffset * SNAP_STEPS_PER_HOUR) / SNAP_STEPS_PER_HOUR);
    }
    if (dayStart >= bounds.endOffset) continue;

    const events = getDaySchedulingEvents(isoDate, task.id);
    let cursorOffset = dayStart;
    for (const evt of events) {
      if (evt.offset > cursorOffset) {
        const free = evt.offset - cursorOffset;
        if (free > 0) {
          const used = Math.min(free, remainingHours);
          segments.push({ date: isoDate, offset: cursorOffset, duration: used });
          remainingHours -= used;
          cursorOffset += used;
          if (remainingHours <= 0) break;
        }
      }
      cursorOffset = Math.max(cursorOffset, evt.offset + evt.duration);
      if (cursorOffset >= bounds.endOffset) break;
    }
    if (remainingHours > 0 && cursorOffset < bounds.endOffset) {
      const free = bounds.endOffset - cursorOffset;
      const used = Math.min(free, remainingHours);
      segments.push({ date: isoDate, offset: cursorOffset, duration: used });
      remainingHours -= used;
    }
  }

  return remainingHours <= 0 ? segments : [];
}

function autoScheduleTaskForShortcut(taskId) {
  let loc = getTaskLocation(taskId);
  if (!loc || loc.location === 'trash') return false;
  if (loc.location !== 'column') {
    const anchorIso = getFirstVisibleDate() < getTodayISO() ? getTodayISO() : getFirstVisibleDate();
    if (!moveTaskShortcutToDate(taskId, anchorIso)) return false;
    loc = getTaskLocation(taskId);
    if (!loc || loc.location !== 'column') return false;
  }
  const task = loc.task;
  const segments = findAutoScheduleSegments(task);
  if (!segments.length) return false;

  const todayISO = getTodayISO();
  const removed = getTaskEventsOnOrAfter(taskId, todayISO);
  state.calendarEvents = state.calendarEvents.filter(evt => !removed.includes(evt));
  removed.forEach(evt => persistDeleteCalendarEvent(evt.id));
  segments.forEach(segment => {
    const evt = {
      id: 'evt-' + uid(),
      title: task.title,
      colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
      offset: segment.offset,
      duration: segment.duration,
      taskId: task.id,
      date: segment.date,
      zOrder: ++calZCounter
    };
    state.calendarEvents.push(evt);
    persistCalendarEvent(evt);
  });
  task.scheduledTime = null;
  renderTaskLocation(loc);
  renderCalendarEvents();
  persistTask(task, 0);
  refreshTaskDetailModalIfOpen(taskId);
  return true;
}

function jumpRelativeDayForShortcut(delta) {
  if (openModalTaskId) return false;
  const targetIsoDate = addDays(getFirstVisibleDate(), delta);
  if (dailyShutdownState.isActive) {
    setDailyShutdownSelectedDate(targetIsoDate, { resetStep: true });
    return true;
  }
  if (dailyPlanningState.isActive) {
    setDailyPlanningSelectedDate(targetIsoDate, { resetStep: true });
    return true;
  }
  if (todayViewState.isActive) {
    todayViewState.selectedDate = targetIsoDate;
    renderTodayViewMode();
    return true;
  }
  scrollToDateColumn(targetIsoDate, { behavior: 'smooth' });
  return true;
}

function jumpToTodayForShortcut() {
  if (openModalTaskId) return false;
  const todayISO = getTodayISO();
  if (dailyShutdownState.isActive) {
    setDailyShutdownSelectedDate(todayISO, { resetStep: true });
    return true;
  }
  if (dailyPlanningState.isActive) {
    setDailyPlanningSelectedDate(todayISO, { resetStep: true });
    return true;
  }
  if (todayViewState.isActive) {
    todayViewState.selectedDate = todayISO;
    renderTodayViewMode();
    return true;
  }
  scrollToDateColumn(todayISO, { behavior: 'smooth' });
  return true;
}

function openRightPanelForShortcut(panelId) {
  setRightSidebarActive(panelId);
  if (rightSidebarState.collapsed) setRightSidebarCollapsed(false);
  return true;
}

function goHomeForShortcut() {
  closeTaskDetailModalForNavigation();
  if (dailyShutdownState.isActive) {
    exitDailyShutdownMode({ preferTodayReturn: false });
    return true;
  }
  if (dailyPlanningState.isActive) {
    exitDailyPlanningMode({ preferTodayReturn: false });
    return true;
  }
  if (todayViewState.isActive) {
    exitTodayView();
    return true;
  }
  setSidebarActiveNav('home');
  scrollToDateColumn(getTodayISO(), { behavior: 'smooth' });
  return true;
}

function toggleTopbarFilterForShortcut() {
  if (openModalTaskId) return false;
  if (document.getElementById('focus-modal')) return false;
  const settingsEl = document.getElementById('settings-view');
  if (settingsEl && !settingsEl.hidden) return false;
  const shortcutsEl = document.getElementById('shortcuts-overlay');
  if (shortcutsEl && !shortcutsEl.hidden) return false;
  toggleTopbarFilterPicker();
  return true;
}

function toggleLeftSidebarForShortcut() {
  setSidebarCollapsed(!isSidebarCollapsed());
  return true;
}

function toggleRightSidebarForShortcut() {
  setRightSidebarCollapsed(!rightSidebarState.collapsed);
  return true;
}

function normalizeShortcutKey(key) {
  if (key === ' ') return 'space';
  return String(key || '').toLowerCase();
}

function matchesShortcutBinding(e, binding) {
  const key = normalizeShortcutKey(e.key);
  if (key !== binding.key) return false;
  const expectedCtrl = binding.shortKey ? !IS_MAC_PLATFORM : !!binding.ctrlKey;
  const expectedMeta = binding.shortKey ? IS_MAC_PLATFORM : !!binding.metaKey;
  const expectedShift = !!binding.shiftKey;
  const expectedAlt = !!binding.altKey;
  return e.ctrlKey === expectedCtrl
    && e.metaKey === expectedMeta
    && e.shiftKey === expectedShift
    && e.altKey === expectedAlt;
}

function shortcutLabelsForPlatform(row) {
  return IS_MAC_PLATFORM ? row.keysMac : row.keysOther;
}

function findShortcutRow(shortcutId) {
  for (const section of SHORTCUT_SECTIONS) {
    const row = section.rows.find(item => item.id === shortcutId);
    if (row) return row;
  }
  return null;
}

function renderShortcutKeyGroups(groups = [], options = {}) {
  const keyClass = options.literal ? 'shortcuts-overlay__key shortcuts-overlay__key--literal' : 'shortcuts-overlay__key';
  return groups.map((group, index) => {
    const keysHtml = group.map(key => `<span class="${keyClass}">${escapeHtml(key)}</span>`).join('');
    const joiner = index < groups.length - 1 ? '<span class="shortcuts-overlay__joiner">or</span>' : '';
    return `<span class="shortcuts-overlay__sequence">${keysHtml}</span>${joiner}`;
  }).join('');
}

function renderInlineShortcutGroups(groups = []) {
  return groups.map(group => {
    const keysHtml = group.map(key => `<span class="sdp__shortcut">${escapeHtml(key)}</span>`).join('');
    return `<span class="sdp__shortcut-group">${keysHtml}</span>`;
  }).join('');
}

function renderInlineShortcutForId(shortcutId) {
  const row = findShortcutRow(shortcutId);
  if (!row) return '';
  return renderInlineShortcutGroups(shortcutLabelsForPlatform(row));
}

const SHORTCUT_SECTIONS = [
  {
    title: 'General',
    rows: [
      {
        id: 'show-shortcuts',
        label: 'Show keyboard shortcuts',
        keysMac: [['?']],
        keysOther: [['?']],
        scope: 'global',
        enabled: true,
        searchTokens: ['keyboard shortcuts help'],
        bindings: [{ key: '?', shiftKey: true }],
        handler: () => openKeyboardShortcutsOverlay()
      }
    ]
  },
  {
    title: 'Task creation',
    rows: [
      {
        id: 'add-task',
        label: 'Add task',
        keysMac: [['A']],
        keysOther: [['A']],
        scope: 'task',
        enabled: true,
        searchTokens: ['new task create'],
        bindings: [{ key: 'a' }],
        handler: () => showAddTaskInputForShortcut()
      }
    ]
  },
  {
    title: 'Task actions',
    rows: [
      { id: 'assign-channel', label: 'Assign channel', keysMac: [['Q'], ['#']], keysOther: [['Q'], ['#']], scope: 'task', enabled: true, searchTokens: ['channel tag'], bindings: [{ key: 'q' }, { key: '#', shiftKey: true }], handler: () => withActiveTask(loc => openChannelPickerForShortcut(loc.task.id)) },
      { id: 'set-planned-time', label: 'Set planned time', keysMac: [['W'], ['~']], keysOther: [['W'], ['~']], scope: 'task', enabled: true, searchTokens: ['planned estimate'], bindings: [{ key: 'w' }, { key: '~', shiftKey: true }], handler: () => withActiveTask(loc => openPlannedPickerForShortcut(loc.task.id)) },
      { id: 'set-actual-time', label: 'Set actual time', keysMac: [['E'], ['|']], keysOther: [['E'], ['|']], scope: 'task', enabled: true, searchTokens: ['actual logged time'], bindings: [{ key: 'e' }, { key: '|', shiftKey: true }], handler: () => withActiveTask(loc => openActualPickerForShortcut(loc.task.id)) },
      { id: 'set-start-date', label: 'Set start date', keysMac: [['@']], keysOther: [['@']], scope: 'task', enabled: true, searchTokens: ['date schedule today'], bindings: [{ key: '@', shiftKey: true }], handler: () => withActiveTask(loc => openStartDatePickerForShortcut(loc.task.id)) },
      { id: 'start-stop-timer', label: 'Start or stop timer', keysMac: [['Space']], keysOther: [['Space']], scope: 'task', enabled: true, searchTokens: ['focus timer'], bindings: [{ key: 'space' }], handler: () => withActiveTask(loc => toggleFocusTimerForShortcut(loc.task.id)) },
      { id: 'add-subtask', label: 'Add subtask', keysMac: [['V']], keysOther: [['V']], scope: 'task', enabled: true, searchTokens: ['subtask child'], bindings: [{ key: 'v' }], handler: () => withActiveTask(loc => addSubtaskForShortcut(loc.task.id)) },
      { id: 'merge-task', label: 'Merge task into another task (hold before dragging)', keysMac: [['⌥', '\\']], keysOther: [['Alt', '\\']], scope: 'task', enabled: false, disabledReason: 'Coming soon', searchTokens: ['merge drag'], bindings: [], handler: null },
      { id: 'complete-task', label: 'Complete task', keysMac: [['C']], keysOther: [['C']], scope: 'task', enabled: true, searchTokens: ['done finish'], bindings: [{ key: 'c' }], handler: () => withActiveTask(loc => toggleTaskCompletionForShortcut(loc.task.id)) },
      { id: 'delete-task', label: 'Delete task', keysMac: [['⌘', 'Delete']], keysOther: [['Ctrl', 'Delete']], scope: 'task', enabled: true, searchTokens: ['trash remove'], bindings: [{ key: 'backspace', shortKey: true }, { key: 'delete', shortKey: true }], handler: () => withActiveTask(loc => handleDeleteTask(loc.task.id)) },
      { id: 'open-task', label: 'Open task', keysMac: [['⌘', 'Enter']], keysOther: [['Ctrl', 'Enter']], scope: 'task', enabled: true, searchTokens: ['details modal open'], bindings: [{ key: 'enter', shortKey: true }], handler: () => withActiveTask(loc => openTaskDetailModal(loc.task.id)) },
      { id: 'duplicate-task', label: 'Duplicate task', keysMac: [['⌘', 'D']], keysOther: [['Ctrl', 'D']], scope: 'task', enabled: true, searchTokens: ['copy clone'], bindings: [{ key: 'd', shortKey: true }], handler: () => withActiveTask(loc => handleDuplicateTask(loc.task.id)) },
      { id: 'undo-command', label: 'Undo command', keysMac: [['⌘', 'Z']], keysOther: [['Ctrl', 'Z']], scope: 'task', enabled: false, disabledReason: 'Coming soon', searchTokens: ['undo'], bindings: [], handler: null }
    ]
  },
  {
    title: 'Task scheduling',
    rows: [
      { id: 'auto-schedule', label: 'Auto-schedule task to calendar', keysMac: [['X']], keysOther: [['X']], scope: 'task', enabled: true, searchTokens: ['schedule calendar timebox split'], bindings: [{ key: 'x' }], handler: () => withActiveTask(loc => autoScheduleTaskForShortcut(loc.task.id)) },
      { id: 'remove-from-calendar', label: 'Remove task from calendar', keysMac: [['⌘', 'X']], keysOther: [['Ctrl', 'X']], scope: 'task', enabled: true, searchTokens: ['unschedule remove calendar'], bindings: [{ key: 'x', shortKey: true }], handler: () => withActiveTask(loc => removeTaskFromCalendarForShortcut(loc.task.id)) },
      { id: 'schedule-today', label: 'Schedule to today', keysMac: [['S']], keysOther: [['S']], scope: 'task', enabled: true, searchTokens: ['today start date'], bindings: [{ key: 's' }], handler: () => withActiveTask(loc => moveTaskShortcutToDate(loc.task.id, getTodayISO())) },
      { id: 'snooze-day', label: 'Snooze one day', keysMac: [['D']], keysOther: [['D']], scope: 'task', enabled: true, searchTokens: ['tomorrow next workday'], bindings: [{ key: 'd' }], handler: () => withActiveTask(loc => snoozeTaskForShortcut(loc.task.id)) },
      { id: 'move-backlog', label: 'Move to backlog', keysMac: [['Z']], keysOther: [['Z']], scope: 'task', enabled: true, searchTokens: ['backlog horizon'], bindings: [{ key: 'z' }], handler: () => withActiveTask(loc => openBacklogPickerForShortcut(loc.task.id)) },
      { id: 'move-backlog-top', label: 'Move to top of backlog', keysMac: [['⇧', 'Z']], keysOther: [['Shift', 'Z']], scope: 'task', enabled: true, searchTokens: ['backlog top'], bindings: [{ key: 'z', shiftKey: true }], handler: () => withActiveTask(loc => moveTaskToTopOfBacklogForShortcut(loc.task.id)) }
    ]
  },
  {
    title: 'Task ordering',
    rows: [
      { id: 'move-down', label: 'Move task down one position', keysMac: [['⌘', '↓']], keysOther: [['Ctrl', '↓']], scope: 'task', enabled: true, searchTokens: ['reorder down'], bindings: [{ key: 'arrowdown', shortKey: true }], handler: () => withActiveTask(loc => reorderTaskForShortcut(loc.task.id, 'down')) },
      { id: 'move-up', label: 'Move task up one position', keysMac: [['⌘', '↑']], keysOther: [['Ctrl', '↑']], scope: 'task', enabled: true, searchTokens: ['reorder up'], bindings: [{ key: 'arrowup', shortKey: true }], handler: () => withActiveTask(loc => reorderTaskForShortcut(loc.task.id, 'up')) },
      { id: 'move-bottom', label: 'Move task to bottom', keysMac: [['⌘', '⇧', '↓']], keysOther: [['Ctrl', 'Shift', '↓']], scope: 'task', enabled: true, searchTokens: ['reorder bottom'], bindings: [{ key: 'arrowdown', shortKey: true, shiftKey: true }], handler: () => withActiveTask(loc => reorderTaskForShortcut(loc.task.id, 'bottom')) },
      { id: 'move-top', label: 'Move task to top', keysMac: [['⌘', '⇧', '↑']], keysOther: [['Ctrl', 'Shift', '↑']], scope: 'task', enabled: true, searchTokens: ['reorder top'], bindings: [{ key: 'arrowup', shortKey: true, shiftKey: true }], handler: () => withActiveTask(loc => reorderTaskForShortcut(loc.task.id, 'top')) }
    ]
  },
  {
    title: 'Task navigation',
    rows: [
      { id: 'select-next', label: 'Select next task', keysMac: [['↓']], keysOther: [['↓']], scope: 'task', enabled: true, searchTokens: ['down task'], bindings: [{ key: 'arrowdown' }], handler: () => moveActiveTaskSelection('down') },
      { id: 'select-prev', label: 'Select previous task', keysMac: [['↑']], keysOther: [['↑']], scope: 'task', enabled: true, searchTokens: ['up task'], bindings: [{ key: 'arrowup' }], handler: () => moveActiveTaskSelection('up') },
      { id: 'select-last', label: 'Select last task', keysMac: [['⇧', '↓']], keysOther: [['Shift', '↓']], scope: 'task', enabled: true, searchTokens: ['last task'], bindings: [{ key: 'arrowdown', shiftKey: true }], handler: () => moveActiveTaskSelection('last') },
      { id: 'select-first', label: 'Select first task', keysMac: [['⇧', '↑']], keysOther: [['Shift', '↑']], scope: 'task', enabled: true, searchTokens: ['first task'], bindings: [{ key: 'arrowup', shiftKey: true }], handler: () => moveActiveTaskSelection('first') },
      { id: 'select-next-day', label: 'Select first task on next day', keysMac: [['→']], keysOther: [['→']], scope: 'task', enabled: true, searchTokens: ['next day'], bindings: [{ key: 'arrowright' }], handler: () => moveActiveTaskSelection('right') },
      { id: 'select-prev-day', label: 'Select first task on previous day', keysMac: [['←']], keysOther: [['←']], scope: 'task', enabled: true, searchTokens: ['previous day'], bindings: [{ key: 'arrowleft' }], handler: () => moveActiveTaskSelection('left') }
    ]
  },
  {
    title: 'Focus',
    rows: [
      { id: 'focus-mode', label: 'Enter focus mode', keysMac: [['F']], keysOther: [['F']], scope: 'task', enabled: true, searchTokens: ['focus mode timer'], bindings: [{ key: 'f' }], handler: () => openFocusModeForShortcut() }
    ]
  },
  {
    title: 'Date navigation',
    rows: [
      { id: 'jump-today', label: 'Jump to today', keysMac: [['⇧', 'Space']], keysOther: [['Shift', 'Space']], scope: 'global', enabled: true, searchTokens: ['today date'], bindings: [{ key: 'space', shiftKey: true }], handler: () => jumpToTodayForShortcut() },
      { id: 'jump-forward-day', label: 'Jump forward a day', keysMac: [['⇧', '→']], keysOther: [['Shift', '→']], scope: 'global', enabled: true, searchTokens: ['next day'], bindings: [{ key: 'arrowright', shiftKey: true }], handler: () => jumpRelativeDayForShortcut(1) },
      { id: 'jump-backward-day', label: 'Jump backward a day', keysMac: [['⇧', '←']], keysOther: [['Shift', '←']], scope: 'global', enabled: true, searchTokens: ['previous day'], bindings: [{ key: 'arrowleft', shiftKey: true }], handler: () => jumpRelativeDayForShortcut(-1) }
    ]
  },
  {
    title: 'Page navigation',
    rows: [
      { id: 'filter-tasks', label: 'Filter tasks', keysMac: [['⇧', 'F']], keysOther: [['Shift', 'F']], scope: 'global', enabled: true, searchTokens: ['filter tasks channel'], bindings: [{ key: 'f', shiftKey: true }], handler: () => toggleTopbarFilterForShortcut() },
      { id: 'go-home', label: 'Go to home', keysMac: [['H']], keysOther: [['H']], scope: 'global', enabled: true, searchTokens: ['home'], bindings: [{ key: 'h' }], handler: () => runPageNavigationShortcut(() => goHomeForShortcut()) },
      { id: 'go-daily-planning', label: 'Go to daily planning', keysMac: [['P']], keysOther: [['P']], scope: 'global', enabled: true, searchTokens: ['planning ritual'], bindings: [{ key: 'p' }], handler: () => runPageNavigationShortcut(() => { enterDailyPlanningMode(); return true; }) },
      { id: 'go-today-view', label: 'Go to daily task list', keysMac: [['T']], keysOther: [['T']], scope: 'global', enabled: true, searchTokens: ['today daily task list'], bindings: [{ key: 't' }], handler: () => runPageNavigationShortcut(() => { openTodayView(); return true; }) },
      { id: 'go-daily-shutdown', label: 'Go to daily shutdown', keysMac: [['O']], keysOther: [['O']], scope: 'global', enabled: true, searchTokens: ['shutdown ritual'], bindings: [{ key: 'o' }], handler: () => runPageNavigationShortcut(() => { enterDailyShutdownMode(); return true; }) },
      { id: 'next-step', label: 'Advance to next step', keysMac: [['→']], keysOther: [['→']], scope: 'global', enabled: true, searchTokens: ['next step daily planning shutdown'], bindings: [{ key: 'arrowright' }], handler: () => { if (!dailyPlanningState.isActive && !dailyShutdownState.isActive) return false; closeTaskDetailModalForNavigation(); if (dailyPlanningState.isActive) { advanceDailyPlanningStep(); return true; } if (dailyShutdownState.isActive) { advanceDailyShutdownStep(); return true; } return false; } },
      { id: 'previous-step', label: 'Back to previous step', keysMac: [['←']], keysOther: [['←']], scope: 'global', enabled: true, searchTokens: ['previous back step daily planning shutdown'], bindings: [{ key: 'arrowleft' }], handler: () => { if (!dailyPlanningState.isActive && !dailyShutdownState.isActive) return false; closeTaskDetailModalForNavigation(); if (dailyPlanningState.isActive) { retreatDailyPlanningStep(); return true; } if (dailyShutdownState.isActive) { retreatDailyShutdownStep(); return true; } return false; } },
      { id: 'show-calendar-panel', label: 'Show calendar in right panel', keysMac: [['⌃', 'C']], keysOther: [['Ctrl', 'C']], scope: 'global', enabled: true, searchTokens: ['calendar panel'], bindings: [{ key: 'c', ctrlKey: true }], handler: () => openRightPanelForShortcut('calendar') },
      { id: 'show-backlog-panel', label: 'Show backlog in right panel', keysMac: [['⌃', 'B']], keysOther: [['Ctrl', 'B']], scope: 'global', enabled: true, searchTokens: ['backlog panel'], bindings: [{ key: 'b', ctrlKey: true }], handler: () => openRightPanelForShortcut('backlog') },
      { id: 'show-archive-panel', label: 'Show archive in right panel', keysMac: [['⌃', 'A']], keysOther: [['Ctrl', 'A']], scope: 'global', enabled: true, searchTokens: ['archive panel'], bindings: [{ key: 'a', ctrlKey: true }], handler: () => openRightPanelForShortcut('archive') },
      { id: 'show-search-panel', label: 'Search', keysMac: [['⌃', 'F']], keysOther: [['Ctrl', 'F']], scope: 'global', enabled: true, searchTokens: ['search panel find'], bindings: [{ key: 'f', ctrlKey: true }], handler: () => openRightPanelForShortcut('search') },
      { id: 'show-trash-panel', label: 'Show trash in right panel', keysMac: [['⌃', 'X']], keysOther: [['Ctrl', 'X']], scope: 'global', enabled: true, searchTokens: ['trash panel'], bindings: [{ key: 'x', ctrlKey: true }], handler: () => openRightPanelForShortcut('trash') },
      { id: 'toggle-left-panel', label: 'Show or hide left panel', keysMac: [['<']], keysOther: [['<']], scope: 'global', enabled: true, searchTokens: ['left sidebar'], bindings: [{ key: '<', shiftKey: true }], handler: () => toggleLeftSidebarForShortcut() },
      { id: 'toggle-right-panel', label: 'Show or hide right panel', keysMac: [['>']], keysOther: [['>']], scope: 'global', enabled: true, searchTokens: ['right sidebar'], bindings: [{ key: '>', shiftKey: true }], handler: () => toggleRightSidebarForShortcut() }
    ]
  },
  {
    title: 'Editor',
    rows: [
      { id: 'editor-bold', label: 'Bold', keysMac: [['⌘', 'B']], keysOther: [['Ctrl', 'B']], scope: 'editor', enabled: true, searchTokens: ['editor bold'] },
      { id: 'editor-italic', label: 'Italic', keysMac: [['⌘', 'I']], keysOther: [['Ctrl', 'I']], scope: 'editor', enabled: true, searchTokens: ['editor italic'] },
      { id: 'editor-underline', label: 'Underline', keysMac: [['⌘', 'U']], keysOther: [['Ctrl', 'U']], scope: 'editor', enabled: true, searchTokens: ['editor underline'] },
      { id: 'editor-strike', label: 'Strikethrough', keysMac: [['⌘', '⇧', 'X']], keysOther: [['Ctrl', 'Shift', 'X']], scope: 'editor', enabled: true, searchTokens: ['editor strikethrough'] },
      { id: 'editor-h1', label: 'Large header', keysMac: [['Ctrl', '⌘', '1']], keysOther: [['Ctrl', 'Alt', '1']], scope: 'editor', enabled: true, searchTokens: ['editor header 1'] },
      { id: 'editor-h2', label: 'Medium header', keysMac: [['Ctrl', '⌘', '2']], keysOther: [['Ctrl', 'Alt', '2']], scope: 'editor', enabled: true, searchTokens: ['editor header 2'] },
      { id: 'editor-h3', label: 'Small header', keysMac: [['Ctrl', '⌘', '3']], keysOther: [['Ctrl', 'Alt', '3']], scope: 'editor', enabled: true, searchTokens: ['editor header 3'] },
      { id: 'editor-clear-formatting', label: 'Remove formatting', keysMac: [['⌘', '\\'], ['⌘', '0']], keysOther: [['Ctrl', '\\'], ['Ctrl', '0']], scope: 'editor', enabled: true, searchTokens: ['editor clear formatting paragraph'] },
      { id: 'editor-link', label: 'Turn text into link', keysMac: [['⌘', 'K']], keysOther: [['Ctrl', 'K']], scope: 'editor', enabled: true, searchTokens: ['editor link'] },
      { id: 'editor-undo', label: 'Undo', keysMac: [['⌘', 'Z']], keysOther: [['Ctrl', 'Z']], scope: 'editor', enabled: true, searchTokens: ['editor undo'] },
      { id: 'editor-redo', label: 'Redo', keysMac: [['⌘', '⇧', 'Z']], keysOther: [['Ctrl', 'Shift', 'Z']], scope: 'editor', enabled: true, searchTokens: ['editor redo'] }
    ]
  },
  {
    title: 'Markdown formatting',
    rows: [
      { id: 'md-h1', label: 'Large header', keysMac: [['#', 'Space']], keysOther: [['#', 'Space']], scope: 'editor', enabled: true, searchTokens: ['markdown header 1'] },
      { id: 'md-h2', label: 'Medium header', keysMac: [['##', 'Space']], keysOther: [['##', 'Space']], scope: 'editor', enabled: true, searchTokens: ['markdown header 2'] },
      { id: 'md-h3', label: 'Small header', keysMac: [['###', 'Space']], keysOther: [['###', 'Space']], scope: 'editor', enabled: true, searchTokens: ['markdown header 3'] },
      { id: 'md-bullets', label: 'Bulleted list', keysMac: [['-', 'Space']], keysOther: [['-', 'Space']], scope: 'editor', enabled: true, searchTokens: ['markdown bullets list'] },
      { id: 'md-numbered', label: 'Numbered list', keysMac: [['1.', 'Space']], keysOther: [['1.', 'Space']], scope: 'editor', enabled: true, searchTokens: ['markdown numbered list'] },
      { id: 'md-checklist', label: 'Check list', keysMac: [['[]', 'Space']], keysOther: [['[]', 'Space']], scope: 'editor', enabled: true, searchTokens: ['markdown checklist'] },
      { id: 'md-blockquote', label: 'Blockquote', keysMac: [['>', 'Space']], keysOther: [['>', 'Space']], scope: 'editor', enabled: true, searchTokens: ['markdown quote'] },
      { id: 'md-codeblock', label: 'Code block', keysMac: [['```']], keysOther: [['```']], scope: 'editor', enabled: true, searchTokens: ['markdown code block'] },
      { id: 'md-italic', label: 'Italic', keysMac: [['_Text_']], keysOther: [['_Text_']], scope: 'editor', enabled: true, searchTokens: ['markdown italic'] },
      { id: 'md-bold', label: 'Bold', keysMac: [['**Text**']], keysOther: [['**Text**']], scope: 'editor', enabled: true, searchTokens: ['markdown bold'] },
      { id: 'md-strike', label: 'Strikethrough', keysMac: [['~~Text~~']], keysOther: [['~~Text~~']], scope: 'editor', enabled: true, searchTokens: ['markdown strike'] },
      { id: 'md-inline-code', label: 'Inline code', keysMac: [['`Text`']], keysOther: [['`Text`']], scope: 'editor', enabled: true, searchTokens: ['markdown inline code'] }
    ]
  }
];

function getFilteredShortcutSections(query = shortcutState.searchQuery) {
  const normalized = String(query || '').trim().toLowerCase();
  return SHORTCUT_SECTIONS
    .map(section => {
      const rows = section.rows.filter(row => {
        if (!normalized) return true;
        const haystack = [section.title, row.label].concat(row.searchTokens || []).join(' ').toLowerCase();
        return haystack.includes(normalized);
      });
      return rows.length ? { ...section, rows } : null;
    })
    .filter(Boolean);
}

function renderKeyboardShortcutsOverlay() {
  const content = document.querySelector('[data-shortcuts-content]');
  const searchInput = document.querySelector('[data-shortcuts-search]');
  if (!content || !searchInput) return;
  searchInput.value = shortcutState.searchQuery;
  const sections = getFilteredShortcutSections();
  if (sections.length === 0) {
    content.innerHTML = '<div class="shortcuts-overlay__empty">No shortcuts found.</div>';
  } else {
    content.innerHTML = sections.map(section => `
      <section class="shortcuts-overlay__section">
        <h3 class="shortcuts-overlay__section-title">${escapeHtml(section.title)}</h3>
        <div class="shortcuts-overlay__list">
          ${section.rows.map(row => `
            <div class="shortcuts-overlay__row${row.enabled ? '' : ' shortcuts-overlay__row--disabled'}">
              <div class="shortcuts-overlay__label">${escapeHtml(row.label)}</div>
              <div class="shortcuts-overlay__keys">${renderShortcutKeyGroups(shortcutLabelsForPlatform(row), { literal: row.id.startsWith('md-') })}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `).join('');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openKeyboardShortcutsOverlay() {
  const overlay = document.getElementById('shortcuts-overlay');
  const searchInput = document.querySelector('[data-shortcuts-search]');
  if (!overlay || !searchInput) return false;
  closeWorkspaceMenu();
  shortcutState.modalOpen = true;
  shortcutState.lastFocusedEditable = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.hidden = false;
  shortcutState.searchQuery = '';
  renderKeyboardShortcutsOverlay();
  requestAnimationFrame(() => searchInput.focus());
  return true;
}

function closeKeyboardShortcutsOverlay() {
  const overlay = document.getElementById('shortcuts-overlay');
  if (!overlay) return false;
  overlay.hidden = true;
  shortcutState.modalOpen = false;
  shortcutState.searchQuery = '';
  const prior = shortcutState.lastFocusedEditable;
  shortcutState.lastFocusedEditable = null;
  if (prior && typeof prior.focus === 'function') {
    requestAnimationFrame(() => prior.focus());
  }
  return true;
}

function handleGlobalShortcutKeydown(e) {
  if (shortcutState.modalOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeKeyboardShortcutsOverlay();
      return;
    }
    return;
  }

  if (!settings.keyboardShortcutsEnabled) return;

  const target = e.target instanceof Element ? e.target : null;
  const isTextEntryTarget = target instanceof Element
    && !!target.closest('input, textarea, select, [contenteditable="true"], .ql-editor');

  if (handleOpenPickerArrowNavigation(e)) {
    hideFloatingTooltip();
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }

  if (handleOpenPickerEnterActivation(e)) {
    hideFloatingTooltip();
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }

  if (!isTextEntryTarget && (dailyPlanningState.isActive || dailyShutdownState.isActive)) {
    if (matchesShortcutBinding(e, { key: 'arrowright' })) {
      const handled = dailyPlanningState.isActive
        ? (closeTaskDetailModalForNavigation(), advanceDailyPlanningStep(), true)
        : (closeTaskDetailModalForNavigation(), advanceDailyShutdownStep(), true);
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
    if (matchesShortcutBinding(e, { key: 'arrowleft' })) {
      const handled = dailyPlanningState.isActive
        ? (closeTaskDetailModalForNavigation(), retreatDailyPlanningStep(), true)
        : (closeTaskDetailModalForNavigation(), retreatDailyShutdownStep(), true);
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
  }

  if (isEditableElement(target)) return;

  for (const section of SHORTCUT_SECTIONS) {
    for (const row of section.rows) {
      if (!row.enabled || !row.handler || !row.bindings || row.bindings.length === 0) continue;
      if (!row.bindings.some(binding => matchesShortcutBinding(e, binding))) continue;
      const handled = row.handler(e);
      if (handled) {
        hideFloatingTooltip();
        if (topbarTodayPickerState) {
          closeTopbarTodayPicker();
        }
        if (topbarFilterPickerState && row.id !== 'filter-tasks') {
          closeTopbarFilterPicker();
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
  }
}

function moveTaskToBacklog(taskId, horizonId, options = {}) {
  let loc = getTaskLocation(taskId);
  if (!loc || loc.location === 'trash') return null;
  if (loc.location === 'column' && loc.index === -1 && isDerivedRepeatTask(loc.task)) {
    materializeDerivedTask(loc.task);
    loc = getTaskLocation(taskId);
  }
  const horizon = getBacklogHorizonConfig(horizonId);
  const insertIndex = Number.isFinite(options.insertIndex) ? options.insertIndex : 0;
  let task = loc.task;
  const wasBacklogged = loc.location === 'backlog';

  if (loc.location === 'column') {
    loc.column.tasks.splice(loc.index, 1);
    renderColumn(loc.column);
  } else if (loc.location === 'backlog') {
    task = removeTaskFromBacklog(taskId);
  } else if (loc.location === 'archive') {
    task = removeTaskFromArchive(taskId);
  }
  if (!task) return null;

  if (!wasBacklogged) {
    task.scheduledTime = null;
    task.archivedAt = null;
    task.archiveSourceDate = null;
    const removedBacklogCalEvents = state.calendarEvents.filter(evt => evt.taskId === task.id && evt.systemType !== 'actual');
    state.calendarEvents = state.calendarEvents.filter(evt => evt.taskId !== task.id || evt.systemType === 'actual');
    removedBacklogCalEvents.forEach(ev => persistDeleteCalendarEvent(ev.id));
  }

  insertTaskIntoBacklog(task, horizon.id, insertIndex);
  if (task.repeatSeriesId) {
    markTaskAsRepeatModified(task);
    const series = getRepeatSeriesById(task.repeatSeriesId);
    if (series) persistRepeatSeries({ ...series, status: 'paused' });
  }
  if (loc.location === 'archive') persistArchiveTaskOrder();
  renderBacklogPanel();
  if (loc.location === 'archive') renderArchivePanel();
  renderCalendarEvents();
  persistTask(task, 0);
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  return { task, horizonId: horizon.id };
}

function restoreBacklogTask(taskId, options = {}) {
  const task = removeTaskFromBacklog(taskId);
  if (!task) return null;
  const sourceIso = getBacklogSourceIsoDate(task);
  const targetIso = options.targetIsoDate || sourceIso;
  const targetCol = ensureColumnForDate(targetIso);
  let insertIndex = 0;
  if (Number.isFinite(options.insertIndex)) {
    insertIndex = Math.max(0, Math.min(options.insertIndex, targetCol.tasks.length));
  }
  task.backlogHorizon = null;
  task.backlogOrder = null;
  targetCol.tasks.splice(insertIndex, 0, task);

  if (options.applyDropRules !== false) {
    const todayISO = getTodayISO();
    if (targetIso < todayISO && sourceIso >= todayISO) {
      completeTaskAsOf(task, targetIso);
      task.startDate = targetIso;
      moveCompletedTasksToBottom(targetCol);
    } else if (sourceIso < todayISO && targetIso >= todayISO) {
      clearTaskCompletionMetadata(task);
      task.startDate = targetIso;
      task.scheduledTime = null;
    } else {
      task.startDate = targetIso;
    }
  } else {
    task.startDate = targetIso;
  }

  if (task.repeatSeriesId) {
    const series = getRepeatSeriesById(task.repeatSeriesId);
    if (series) persistRepeatSeries({ ...series, status: 'active' });
  }
  reconcileVisibleRepeatTasks();

  return { task, column: targetCol, sourceIso, targetIso, insertIndex };
}

function restoreTrashTask(taskId, options = {}) {
  const entryIndex = state.trash.findIndex(entry => entry.task && entry.task.id === taskId);
  if (entryIndex === -1) return null;

  const entry = state.trash.splice(entryIndex, 1)[0];
  const task = entry.task;
  ensureTaskTimeState(task);
  ensureTaskRolloverState(task);
  task.backlogHorizon = null;
  task.backlogOrder = null;

  const todayISO = getTodayISO();
  const sourceIso = getTrashSourceIsoDate(entry);
  const targetIso = options.targetIsoDate || sourceIso;
  const targetCol = ensureColumnForDate(targetIso);

  let insertIndex = 0;
  if (Number.isFinite(options.insertIndex)) {
    insertIndex = Math.max(0, Math.min(options.insertIndex, targetCol.tasks.length));
  }
  targetCol.tasks.splice(insertIndex, 0, task);

  if (options.applyDropRules !== false) {
    if (targetIso < todayISO && sourceIso >= todayISO) {
      completeTaskAsOf(task, targetIso);
      task.startDate = targetIso;
      moveCompletedTasksToBottom(targetCol);
    } else if (sourceIso < todayISO && targetIso >= todayISO) {
      clearTaskCompletionMetadata(task);
      task.startDate = targetIso;
      task.scheduledTime = null;
    } else {
      task.startDate = targetIso;
    }
  } else {
    task.startDate = targetIso;
  }

  if (task.repeatSeriesId && task.repeatOccurrenceDate) {
    const series = getRepeatSeriesById(task.repeatSeriesId);
    if (series) {
      const nextSeries = removeSkippedOccurrenceFromSeries(series, task.repeatOccurrenceDate);
      if (nextSeries !== series) persistRepeatSeries(nextSeries);
    }
  }

  return { task, column: targetCol, sourceIso, targetIso, insertIndex };
}

function archiveEligibleTasks() {
  if (!settings.autoArchiveEnabled) return [];
  const todayISO = getTodayISO();
  const archivedAt = getNowIsoString();
  const extracted = [];

  state.columns.forEach(col => {
    const keep = [];
    col.tasks.forEach(task => {
      ensureTaskRolloverState(task);
      if (!task.complete
        && getRolloverCount(task, col.isoDate) >= settings.autoArchiveDays
        && !hasActivityOnDate(task, todayISO)) {
        task.archiveSourceDate = col.isoDate;
        task.archivedAt = archivedAt;
        extracted.push(task);
      } else {
        keep.push(task);
      }
    });
    if (keep.length !== col.tasks.length) {
      col.tasks = keep;
    }
  });

  if (extracted.length === 0) return [];

  prependArchiveTasks(extracted);
  extracted.forEach(task => persistTask(task, 0));
  persistArchiveTaskOrder();
  updateArchiveIndicator();
  renderArchivePanel();
  return extracted;
}

function reevaluateAutoArchive() {
  if (!settings.autoArchiveEnabled) return [];
  const archived = archiveEligibleTasks();
  if (archived.length > 0) {
    renderAllColumns();
    renderCalendarEvents();
  }
  return archived;
}

function releaseIneligibleArchivedTasks() {
  if (state.archive.length === 0) return [];
  const todayISO = getTodayISO();
  const keep = [];
  const released = [];

  state.archive.forEach(task => {
    ensureTaskRolloverState(task);
    if (!task.complete
      && getRolloverCount(task, todayISO) >= settings.autoArchiveDays
      && !hasActivityOnDate(task, todayISO)) {
      keep.push(task);
      return;
    }
    task.archivedAt = null;
    task.archiveSourceDate = null;
    clearTaskCompletionMetadata(task);
    released.push(task);
  });

  if (released.length === 0) return [];

  state.archive = keep;
  const todayCol = ensureColumnForDate(todayISO);
  if (settings.taskRolloverPosition === 'top') {
    for (let i = released.length - 1; i >= 0; i--) {
      todayCol.tasks.unshift(released[i]);
    }
  } else {
    released.forEach(task => todayCol.tasks.push(task));
  }

  persistArchiveTaskOrder();
  persistColumnTaskOrder(todayCol);
  released.forEach(task => persistTask(task, 0));
  updateArchiveIndicator();
  renderArchivePanel();
  return released;
}

function returnArchivedTasksToTodayColumn() {
  if (state.archive.length === 0) return [];
  const todayISO = getTodayISO();
  const todayCol = ensureColumnForDate(todayISO);
  const released = [...state.archive];
  state.archive = [];

  released.forEach(task => {
    ensureTaskRolloverState(task);
    task.archivedAt = null;
    task.archiveSourceDate = null;
    clearTaskCompletionMetadata(task);
  });

  if (settings.taskRolloverPosition === 'top') {
    for (let i = released.length - 1; i >= 0; i--) {
      todayCol.tasks.unshift(released[i]);
    }
  } else {
    released.forEach(task => todayCol.tasks.push(task));
  }

  persistColumnTaskOrder(todayCol);
  updateArchiveIndicator();
  renderArchivePanel();
  return released;
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
  if (typeof task.completedAt !== 'string' && task.completedAt !== null) task.completedAt = null;
  if (typeof task.backlogHorizon !== 'string' && task.backlogHorizon !== null) task.backlogHorizon = null;
  if (!Number.isFinite(task.backlogOrder) && task.backlogOrder !== null) task.backlogOrder = null;
  if (typeof task.archivedAt !== 'string' && task.archivedAt !== null) task.archivedAt = null;
  if (typeof task.archiveSourceDate !== 'string' && task.archiveSourceDate !== null) task.archiveSourceDate = null;
  if (typeof task.repeatSeriesId !== 'string' && task.repeatSeriesId !== null) task.repeatSeriesId = null;
  if (typeof task.repeatOccurrenceDate !== 'string' && task.repeatOccurrenceDate !== null) task.repeatOccurrenceDate = null;
  if (typeof task.repeatModified !== 'boolean') task.repeatModified = false;
  if (typeof task.isRepeatingTask !== 'boolean') task.isRepeatingTask = !!task.repeatSeriesId;
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
    entry.subtasks[subtaskId] = Math.max(0, (entry.subtasks[subtaskId] || 0) + deltaSeconds);
  } else {
    entry.ownSeconds = Math.max(0, (entry.ownSeconds || 0) + deltaSeconds);
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

function hasShutdownActivityOnDate(task, isoDate) {
  ensureTaskRolloverState(task);
  if (task.completedOnDate === isoDate) return true;
  if (task.subtaskCompletionsByDate[isoDate] && task.subtaskCompletionsByDate[isoDate].length > 0) return true;
  if (getTaskDailyActualSeconds(task, isoDate) > 0) return true;
  return false;
}

// Get all timebox events for a task on a specific date
function getTaskTimeboxesForDate(task, isoDate) {
  if (!task || !isoDate) return [];
  return state.calendarEvents.filter(e => e.taskId === task.id && e.date === isoDate && e.systemType !== 'actual');
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
    if (evt.taskId === task.id && evt.date < todayISO && evt.systemType !== 'actual') {
      totalTimeboxMinutes += Math.round(evt.duration * 60);
    }
  }
  return (task.timeEstimateMinutes || 0) + totalTimeboxMinutes;
}

function setTaskPlannedMinutesTotal(task, totalMinutes) {
  ensureTaskTimeState(task);
  const safeTotalMinutes = Math.max(0, Math.round(totalMinutes || 0));
  const subtaskPlanned = (task.subtasks || []).reduce((sum, subtask) => {
    ensureSubtaskTimeState(subtask);
    return sum + (subtask.plannedMinutes || 0);
  }, 0);
  task.ownPlannedMinutes = Math.max(0, safeTotalMinutes - subtaskPlanned);
  syncTaskAggregateTimes(task);
}

function buildTaskCompletedAtTimestamp(isoDate) {
  if (!isoDate) return new Date().toISOString();
  const todayISO = getTodayISO();
  if (isoDate === todayISO) return new Date().toISOString();

  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return new Date().toISOString();
  return new Date(year, month - 1, day, 23, 59, 0, 0).toISOString();
}

function applyTaskCompletionMetadata(task, isoDate) {
  ensureTaskRolloverState(task);
  task.complete = true;
  task.completedOnDate = isoDate;
  task.completedAt = buildTaskCompletedAtTimestamp(isoDate);
}

function clearTaskCompletionMetadata(task) {
  ensureTaskRolloverState(task);
  task.complete = false;
  task.completedOnDate = null;
  task.completedAt = null;
}

function trimFutureTimeboxesOnCompletion(task, isoDate) {
  ensureTaskTimeState(task);
  ensureTaskRolloverState(task);

  const preTrimPlannedMinutes = Math.max(0, Math.round(task.timeEstimateMinutes || 0));
  const completionOffset = timestampToOffset(task.completedAt || buildTaskCompletedAtTimestamp(isoDate));
  const removedEventIds = [];
  const retainedEventIds = new Set();
  const updatedRetainedEvents = [];
  const retainedSegments = [];

  state.calendarEvents = state.calendarEvents.filter(evt => {
    if (!evt || evt.taskId !== task.id || evt.systemType === 'actual') return true;
    if (!evt.date || evt.date < isoDate) return true;

    if (evt.date > isoDate) {
      removedEventIds.push(evt.id);
      return false;
    }

    const eventEnd = evt.offset + evt.duration;
    const retainedDuration = Math.max(0, Math.min(eventEnd, completionOffset) - evt.offset);
    if (retainedDuration <= 0) {
      removedEventIds.push(evt.id);
      return false;
    }

    retainedEventIds.add(evt.id);
    retainedSegments.push({
      eventId: evt.id,
      date: evt.date,
      offset: evt.offset,
      duration: retainedDuration
    });

    if (retainedDuration < evt.duration) {
      evt.duration = retainedDuration;
      updatedRetainedEvents.push(evt);
    }

    return true;
  });

  removedEventIds.forEach(persistDeleteCalendarEvent);

  const retainedMinutes = retainedSegments.reduce((sum, segment) => sum + Math.round(segment.duration * 60), 0);
  if (retainedMinutes > 0) {
    setTaskPlannedMinutesTotal(task, retainedMinutes);
    task.scheduledTime = null;
  } else if (removedEventIds.length > 0 || updatedRetainedEvents.length > 0) {
    setTaskPlannedMinutesTotal(task, preTrimPlannedMinutes);
    task.scheduledTime = null;
  }

  return {
    preTrimPlannedMinutes,
    retainedMinutes,
    retainedSegments,
    retainedEventIds: Array.from(retainedEventIds),
    updatedRetainedEvents,
    removedAny: removedEventIds.length > 0 || updatedRetainedEvents.length > 0,
    hasRetainedSegments: retainedSegments.length > 0
  };
}

function completeTaskAsOf(task, isoDate) {
  ensureTaskRolloverState(task);
  ensureTaskTimeState(task);
  applyTaskCompletionMetadata(task, isoDate);
  const trimResult = trimFutureTimeboxesOnCompletion(task, isoDate);
  const shouldAutoCopyPlannedAsActual = settings.countPlannedAsActual && !task.actualTimeSeconds && task.timeEstimateMinutes;

  // Auto-set actual time to planned time if no actual time exists
  if (shouldAutoCopyPlannedAsActual) {
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
    if (trimResult.hasRetainedSegments) {
      state.calendarEvents = state.calendarEvents.filter(evt => {
        if (evt.systemType === 'actual') return true;
        if (evt.taskId !== task.id) return true;
        if (!trimResult.retainedEventIds.includes(evt.id)) return true;
        persistDeleteCalendarEvent(evt.id);
        return false;
      });
      trimResult.retainedSegments.forEach(segment => {
        const evt = {
          id: 'act-' + uid(),
          title: task.title,
          colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
          offset: segment.offset,
          duration: Math.max(segment.duration, 1 / SNAP_STEPS_PER_HOUR),
          taskId: task.id,
          subtaskId: null,
          date: segment.date,
          systemType: 'actual',
          source: 'completion',
          zOrder: ++calZCounter
        };
        state.calendarEvents.push(evt);
        persistCalendarEvent(evt);
      });
      renderCalendarEvents();
    } else if (settings.visualizeActualTimeOnCalendar && isoDate === getTodayISO()) {
      syncActualTimeEventsFromDailyLog(task, isoDate, 'completion');
    } else {
      renderCalendarEvents();
    }
    focusState.lastTimerEventId = null;
    focusState.lastTimerStopTimestamp = null;
  } else {
    trimResult.updatedRetainedEvents.forEach(persistCalendarEvent);
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
    if (col.isoDate > todayISO) continue;
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

  // When subtasks have planned time, parent planned = subtask total only (own is preserved but not counted)
  // Exception: if task has a timebox, planned time reflects the timebox (handled by calendar resize)
  if (subtaskPlanned > 0) {
    const homeCol = state.columns.find(c => c.tasks.some(t => t.id === task.id));
    const homeDate = homeCol ? homeCol.isoDate : null;
    const hasTimebox = homeDate && getTaskTimeboxesForDate(task, homeDate).length > 0;
    task.timeEstimateMinutes = hasTimebox
      ? Math.max(0, (task.ownPlannedMinutes || 0) + subtaskPlanned)
      : subtaskPlanned;
  } else {
    task.timeEstimateMinutes = Math.max(0, (task.ownPlannedMinutes || 0) + subtaskPlanned);
  }
  // When subtasks have actual time, parent actual = subtask total only (own is discarded)
  if (subtaskActual > 0) {
    if (task.ownActualTimeSeconds > 0) {
      // Clear parent's own actual time and remove parent-level actual events from timeline
      task.ownActualTimeSeconds = 0;
      removeActualTimeEventsForTask(task.id, null, null);
    }
    // Also clear dailyActualTime ownSeconds across all dates so getTaskDailyActualSeconds stays consistent
    ensureTaskRolloverState(task);
    for (const dateKey in task.dailyActualTime) {
      if (task.dailyActualTime[dateKey].ownSeconds) {
        task.dailyActualTime[dateKey].ownSeconds = 0;
      }
    }
    task.actualTimeSeconds = subtaskActual;
  } else {
    task.actualTimeSeconds = Math.max(0, (task.ownActualTimeSeconds || 0));
  }
}

/* ── Actual-time calendar event helpers ── */

function taskHasSubtaskActualTime(task) {
  if (!task || !Array.isArray(task.subtasks)) return false;
  return task.subtasks.some(s => (s.actualTimeSeconds || 0) > 0);
}

function taskHasSubtaskPlannedTime(task) {
  if (!task || !Array.isArray(task.subtasks)) return false;
  return task.subtasks.some(s => (s.plannedMinutes || 0) > 0);
}

function timestampToOffset(ts) {
  const d = new Date(ts);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

function createActualTimeEvent(task, subtaskId, isoDate, offset, duration, source) {
  const subtask = subtaskId ? findSubtask(task, subtaskId) : null;
  const title = subtask ? `${task.title}: ${subtask.label}` : task.title;
  const evt = {
    id: 'act-' + uid(),
    title,
    colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
    offset,
    duration: Math.max(duration, 1 / SNAP_STEPS_PER_HOUR),
    taskId: task.id,
    subtaskId: subtaskId || null,
    date: isoDate,
    systemType: 'actual',
    source,
    zOrder: ++calZCounter
  };
  state.calendarEvents.push(evt);
  persistCalendarEvent(evt);
  renderCalendarEvents();
  return evt;
}

function getActualTimeEventsForTask(taskId, date, subtaskId) {
  return state.calendarEvents.filter(e =>
    e.systemType === 'actual' &&
    e.taskId === taskId &&
    (!date || e.date === date) &&
    (subtaskId === undefined || e.subtaskId === subtaskId)
  );
}

function removeActualTimeEventsForTask(taskId, date, subtaskId) {
  let removedSeconds = 0;
  const removedIds = [];
  state.calendarEvents = state.calendarEvents.filter(e => {
    if (e.systemType === 'actual' && e.taskId === taskId &&
        (!date || e.date === date) &&
        (subtaskId === undefined || e.subtaskId === subtaskId)) {
      removedSeconds += Math.round(e.duration * 3600);
      removedIds.push(e.id);
      return false;
    }
    return true;
  });
  removedIds.forEach(persistDeleteCalendarEvent);
  return removedSeconds;
}

function syncActualTimeEventsFromDailyLog(task, isoDate, source) {
  if (!task || !isoDate) return;
  ensureTaskRolloverState(task);

  removeActualTimeEventsForTask(task.id, isoDate);

  const dayEntry = task.dailyActualTime[isoDate];
  if (!dayEntry) {
    renderCalendarEvents();
    return;
  }

  const segments = [];
  const ownSeconds = dayEntry.ownSeconds || 0;
  if (ownSeconds > 0) {
    segments.push({ subtaskId: null, seconds: ownSeconds });
  }

  if (dayEntry.subtasks && typeof dayEntry.subtasks === 'object') {
    const orderedSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const seenSubtaskIds = new Set();

    orderedSubtasks.forEach(subtask => {
      const seconds = dayEntry.subtasks[subtask.id] || 0;
      if (seconds > 0) {
        segments.push({ subtaskId: subtask.id, seconds });
        seenSubtaskIds.add(subtask.id);
      }
    });

    Object.entries(dayEntry.subtasks).forEach(([subtaskId, seconds]) => {
      if (seenSubtaskIds.has(subtaskId) || !seconds) return;
      segments.push({ subtaskId, seconds });
    });
  }

  if (!segments.length) {
    renderCalendarEvents();
    return;
  }

  const nowOffset = timestampToOffset(Date.now());
  let endOffset = nowOffset;
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    const durationHours = segment.seconds / 3600;
    const startOffset = Math.max(0, endOffset - durationHours);
    const clampedDuration = endOffset - startOffset;
    if (clampedDuration > 0) {
      createActualTimeEvent(task, segment.subtaskId, isoDate, startOffset, clampedDuration, source);
    }
    endOffset = startOffset;
    if (endOffset <= 0) break;
  }
}

function getAllKnownTasks() {
  const tasksById = new Map();

  function addTask(task) {
    if (!task || !task.id || tasksById.has(task.id)) return;
    tasksById.set(task.id, task);
  }

  state.columns.forEach(col => {
    (col.tasks || []).forEach(addTask);
  });
  (state.backlog || []).forEach(addTask);
  (state.archive || []).forEach(addTask);

  return Array.from(tasksById.values());
}

function backfillTodayActualTimeEventsFromLogs() {
  const todayISO = getTodayISO();
  getAllKnownTasks().forEach(task => {
    ensureTaskTimeState(task);
    if (getTaskDailyActualSeconds(task, todayISO) <= 0) return;
    if (getActualTimeEventsForTask(task.id, todayISO).length > 0) return;
    syncActualTimeEventsFromDailyLog(task, todayISO, 'backfill');
  });
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

function getTopTodayTaskId() {
  const todayISO = getTodayISO();
  const topCard = document.querySelector(
    `#day-columns .day-column[data-iso-date="${todayISO}"] .task-list .task-card:not(.task-card--placeholder):not(.task-card--dragging):not(.task-card--ghost):not(.task-card--complete)`
  );
  if (topCard && topCard.dataset.taskId) return topCard.dataset.taskId;
  const todayCol = state.columns.find(col => col.isoDate === todayISO);
  const firstIncomplete = todayCol?.tasks.find(task => !task.complete);
  return firstIncomplete?.id || null;
}

function initializeTaskTimeState() {
  state.columns.forEach(col => {
    col.tasks.forEach(task => {
      ensureTaskTimeState(task);
    });
  });
  state.backlog.forEach(task => {
    ensureTaskTimeState(task);
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

function getDailyShutdownDateLabel(isoDate) {
  const todayISO = getTodayISO();
  if (isoDate === todayISO) return 'Today';
  if (isoDate === addDays(todayISO, -1)) return 'Yesterday';
  if (isSameWeek(isoDate, todayISO)) return getDayName(isoDate);
  return formatDateDisplay(isoDate);
}

function getDailyShutdownTitleLabel(isoDate) {
  const todayISO = getTodayISO();
  if (isoDate === todayISO) return 'Today in review';
  if (isoDate === addDays(todayISO, -1)) return 'Yesterday in review';
  if (isSameWeek(isoDate, todayISO)) return `Last ${getDayName(isoDate)} in review`;
  return `${formatMonthDayOrdinal(isoDate)} in review`;
}

function getDailyShutdownSentenceLabel(isoDate) {
  const todayISO = getTodayISO();
  if (isoDate === todayISO) return 'today';
  if (isoDate === addDays(todayISO, -1)) return 'yesterday';
  if (isSameWeek(isoDate, todayISO)) return `last ${getDayName(isoDate)}`;
  return formatMonthDayOrdinal(isoDate);
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

function isDailyShutdownArtifactTask(task) {
  return !!(task && task.systemType === 'daily_shutdown');
}

function isRitualTask(task) {
  return isDailyPlanningArtifactTask(task) || isDailyShutdownArtifactTask(task);
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
  const filterId = dailyPlanningState.isActive ? getTaskFilterIdForScope('dailyPlanning') : 'all';
  const tasks = filterTasksByChannel(
    (col.tasks || []).filter(task => !isDailyPlanningArtifactTask(task)),
    filterId
  );
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

/**
 * Compute per-task badge status for the planned-day column during daily planning steps 2-4.
 * Returns a Map<taskId, { status, availableMinutes }>.
 */
function getDailyPlanningBadgeStatuses(tasks, isoDate) {
  const capacityMinutes = getDailyPlanningCapacityMinutes(isoDate);
  const result = new Map();
  let runningTotal = 0;
  let overflowed = false;

  for (const task of tasks) {
    if (isDailyPlanningArtifactTask(task)) continue;
    const planned = getPlannedMinutesForDate(task, isoDate);

    if (planned === 0) {
      result.set(task.id, { status: 'unplanned', availableMinutes: 0 });
      continue;
    }

    if (overflowed) {
      result.set(task.id, { status: 'over', availableMinutes: 0 });
      runningTotal += planned;
      continue;
    }

    const prevTotal = runningTotal;
    runningTotal += planned;

    if (runningTotal > capacityMinutes) {
      const available = Math.max(0, capacityMinutes - prevTotal);
      result.set(task.id, { status: 'overflow', availableMinutes: available });
      overflowed = true;
    } else {
      result.set(task.id, { status: 'normal', availableMinutes: 0 });
    }
  }

  return result;
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
  const taskItems = tasks.length
    ? tasks.map(task => {
      const estimate = task.timeEstimateMinutes > 0 ? formatMinutes(task.timeEstimateMinutes) : '--:--';
      return `<li>${escapeHtml(task.title)} <em>(${escapeHtml(estimate)})</em></li>`;
    }).join('')
    : '<li>No tasks planned</li>';

  const label = getDailyPlanningDateLabelForSentence(isoDate);
  return `<h2>Planned for ${escapeHtml(label)}:</h2><ul>${taskItems}</ul><p><br></p><h2>Obstacles in my way:</h2><ul><li><br></li></ul>`;
}

function createDailyShutdownRunDraft(dateISO) {
  return {
    runId: 'daily-shutdown-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    dateISO,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shareText: '',
    workedOnTaskIds: []
  };
}

function ensureDailyShutdownRunDraft() {
  if (!dailyShutdownState.runDraft || dailyShutdownState.runDraft.dateISO !== dailyShutdownState.selectedDate) {
    dailyShutdownState.runDraft = createDailyShutdownRunDraft(dailyShutdownState.selectedDate || getTodayISO());
  }
  return dailyShutdownState.runDraft;
}

function getDailyShutdownWorkedOnTasks(isoDate) {
  const tasks = [];
  const seen = new Set();
  const filterId = dailyShutdownState.isActive ? getTaskFilterIdForScope('dailyShutdown') : 'all';
  for (const col of state.columns) {
    for (const task of col.tasks) {
      if (!task || seen.has(task.id)) continue;
      if (isRitualTask(task)) continue;
      if (!hasShutdownActivityOnDate(task, isoDate)) continue;
      if (!taskMatchesChannelFilterId(task, filterId)) continue;
      seen.add(task.id);
      tasks.push(task);
    }
  }
  return tasks;
}

function getDailyShutdownMissedTasks(isoDate) {
  const col = ensureColumnForDate(isoDate);
  const filterId = dailyShutdownState.isActive ? getTaskFilterIdForScope('dailyShutdown') : 'all';
  return (col.tasks || []).filter(task =>
    !isRitualTask(task)
    && !hasShutdownActivityOnDate(task, isoDate)
    && taskMatchesChannelFilterId(task, filterId)
  );
}

function getDailyShutdownTotals(isoDate) {
  const col = ensureColumnForDate(isoDate);
  const seen = new Set();
  const filterId = dailyShutdownState.isActive ? getTaskFilterIdForScope('dailyShutdown') : 'all';
  let plannedMinutes = 0;
  let actualSeconds = 0;

  function addTask(task) {
    if (!task || seen.has(task.id)) return;
    if (isRitualTask(task)) return;
    if (!taskMatchesChannelFilterId(task, filterId)) return;
    seen.add(task.id);
    ensureTaskTimeState(task);
    plannedMinutes += getPlannedMinutesForDate(task, isoDate);
    actualSeconds += getTaskDailyActualSeconds(task, isoDate);
  }

  (col.tasks || []).forEach(addTask);
  for (const otherCol of state.columns) {
    if (otherCol.isoDate === isoDate) continue;
    for (const task of otherCol.tasks) {
      if (hasActivityOnDate(task, isoDate)) addTask(task);
    }
  }

  const actualMinutes = Math.floor(actualSeconds / 60);
  return { plannedMinutes, actualMinutes, actualSeconds };
}

function getDailyShutdownChannelBreakdown(isoDate) {
  const totals = new Map();
  const seen = new Set();
  const filterId = dailyShutdownState.isActive ? getTaskFilterIdForScope('dailyShutdown') : 'all';

  for (const col of state.columns) {
    for (const task of col.tasks) {
      if (!task || seen.has(task.id)) continue;
      if (isRitualTask(task)) continue;
      if (!taskMatchesChannelFilterId(task, filterId)) continue;
      seen.add(task.id);
      const seconds = getTaskDailyActualSeconds(task, isoDate);
      if (!seconds) continue;

      const rawTag = task.tag ? String(task.tag).trim() : '';
      const label = rawTag ? rawTag.replace(/^#/, '') : 'Unassigned';
      const style = rawTag ? getChannelStyle(rawTag) : null;
      const color = style ? style.hashColor : '#b4b4b4';
      const entry = totals.get(label) || { label, color, seconds: 0 };
      entry.seconds += seconds;
      totals.set(label, entry);
    }
  }

  return Array.from(totals.values()).sort((a, b) => b.seconds - a.seconds);
}

function buildDailyShutdownShareTemplate(isoDate, tasks) {
  const taskItems = tasks.length
    ? tasks.flatMap(task => {
      const isCompleted = task.completedOnDate === isoDate || task.complete;
      const actualSeconds = getTaskDailyActualSeconds(task, isoDate);
      const items = [];
      const completedSubIds = (task.subtaskCompletionsByDate && task.subtaskCompletionsByDate[isoDate]) || [];
      // Show parent task bullet only if the parent itself is completed
      if (isCompleted) {
        const actualLabel = formatActualMinutesForShare(actualSeconds);
        const detailLabel = actualLabel !== '--:--' ? `${actualLabel} - Completed` : 'Completed';
        items.push(`<li>${escapeHtml(task.title)} <em>(${escapeHtml(detailLabel)})</em></li>`);
      } else if (completedSubIds.length === 0) {
        // Parent not completed and no subtasks completed today — show parent with time only
        const detailLabel = formatActualMinutesForShare(actualSeconds);
        items.push(`<li>${escapeHtml(task.title)} <em>(${escapeHtml(detailLabel)})</em></li>`);
      }
      // Show subtasks completed on this date
      if (Array.isArray(task.subtasks) && completedSubIds.length > 0) {
        const dailySubtasks = task.dailyActualTime && task.dailyActualTime[isoDate] && task.dailyActualTime[isoDate].subtasks || {};
        for (const sub of task.subtasks) {
          if (!completedSubIds.includes(sub.id)) continue;
          const subSeconds = dailySubtasks[sub.id] || sub.actualTimeSeconds || 0;
          const subActualLabel = formatActualMinutesForShare(subSeconds);
          const subDetail = subActualLabel !== '--:--' ? `${subActualLabel} - Completed` : 'Completed';
          items.push(`<li>${escapeHtml(sub.label)} - <em>subtask of ${escapeHtml(task.title)}</em> <em>(${escapeHtml(subDetail)})</em></li>`);
        }
      }
      return items;
    }).join('')
    : '<li>No tasks recorded</li>';

  const label = getDailyShutdownSentenceLabel(isoDate);
  return `<h2>Worked on ${escapeHtml(label)}:</h2><ul>${taskItems}</ul><p><br></p><h2>What went well?</h2><ul><li><br></li></ul><p><br></p><h2>What was hard?</h2><ul><li><br></li></ul><p><br></p><h2>Change tomorrow?</h2><ul><li><br></li></ul>`;
}

function buildDailyShutdownCopyText() {
  const selectedDate = dailyShutdownState.selectedDate || getTodayISO();
  const draft = ensureDailyShutdownRunDraft();
  const shareText = dsShareQuill
    ? dsShareQuill.getText().trim()
    : String(draft.shareText || '').trim();

  return [
    `Daily shutdown (${selectedDate})`,
    `Created at: ${formatSnapshotTimestamp(new Date().toISOString())}`,
    '',
    shareText
  ].join('\n');
}

function formatDailyShutdownSnapshotEntry(snapshot) {
  const rawShareText = String(snapshot.shareText || '').trim()
    || buildDailyShutdownShareTemplate(snapshot.dateISO, []);
  const shareHtml = rawShareText.startsWith('<') ? rawShareText : shareTextToHtml(rawShareText);

  return `<h2>Daily Shutdown</h2>`
    + `<p>Created at: ${escapeHtml(formatSnapshotTimestamp(snapshot.completedAt))}</p>`
    + `<p>Date: ${escapeHtml(snapshot.dateISO)}</p>`
    + `<p><br></p>`
    + shareHtml;
}

function getOrCreateDailyShutdownTask(isoDate) {
  const col = ensureColumnForDate(isoDate);
  let task = getDailyShutdownTaskForDate(isoDate);
  if (!task) {
    task = {
      id: uid(),
      title: 'Daily shutdown',
      timeEstimateMinutes: 5,
      actualTimeSeconds: 0,
      ownPlannedMinutes: 5,
      ownActualTimeSeconds: 0,
      scheduledTime: null,
      complete: true,
      tag: '#planning',
      integrationColor: null,
      subtasks: [],
      showSubtasks: false,
      notes: '',
      systemType: 'daily_shutdown'
    };
    col.tasks.push(task);
  }
  task.complete = true;
  task.tag = '#planning';
  task.systemType = 'daily_shutdown';
  return { task, column: col };
}

function appendDailyShutdownSnapshotToTask(snapshot) {
  const { task, column } = getOrCreateDailyShutdownTask(snapshot.dateISO);
  const entry = formatDailyShutdownSnapshotEntry(snapshot);
  const prior = String(task.notes || '').trim();
  task.notes = prior ? `${prior}<p><br></p><hr><p><br></p>${entry}` : entry;
  renderColumn(column);
}

function buildDailyShutdownSnapshot() {
  const selectedDate = dailyShutdownState.selectedDate || getTodayISO();
  const draft = ensureDailyShutdownRunDraft();
  return {
    runId: draft.runId,
    dateISO: selectedDate,
    completedAt: new Date().toISOString(),
    shareText: draft.shareText || buildDailyShutdownShareTemplate(selectedDate, getDailyShutdownWorkedOnTasks(selectedDate))
  };
}

function completeDailyShutdownRun() {
  if (!dailyShutdownState.isActive) return;
  const draft = ensureDailyShutdownRunDraft();
  if (dsShareQuill) {
    draft.shareText = getQuillHtml(dsShareQuill);
    draft.updatedAt = new Date().toISOString();
  }
  const snapshot = buildDailyShutdownSnapshot();
  appendDailyShutdownSnapshotToTask(snapshot);
  persistRituals();
  exitDailyShutdownMode({ restoreTodayFirstColumn: true });
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
  const filterId = dailyPlanningState.isActive ? getTaskFilterIdForScope('dailyPlanning') : 'all';
  return filterTasksByChannel(
    (col.tasks || []).filter(task => !isDailyPlanningArtifactTask(task)),
    filterId
  );
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
  const fmt = getEffectiveTimeFormat();
  if (fmt === '24') {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
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
  const todayNav = document.querySelector('[data-sidebar-today]');
  const dailyPlanningNav = document.querySelector('[data-sidebar-daily-planning]');
  const dailyShutdownNav = document.querySelector('[data-sidebar-daily-shutdown]');
  [homeNav, todayNav, dailyPlanningNav, dailyShutdownNav].forEach(el => {
    if (el) el.classList.remove('nav-item--active');
  });
  if (mode === 'today') {
    if (todayNav) todayNav.classList.add('nav-item--active');
    return;
  }
  if (mode === 'daily-planning') {
    if (dailyPlanningNav) dailyPlanningNav.classList.add('nav-item--active');
    return;
  }
  if (mode === 'daily-shutdown') {
    if (dailyShutdownNav) dailyShutdownNav.classList.add('nav-item--active');
    return;
  }
  if (homeNav) homeNav.classList.add('nav-item--active');
}

function isSidebarCollapsed() {
  return !!document.querySelector('.app-shell.sidebar-collapsed');
}

function getHomeContextDate() {
  if (dailyShutdownState.isActive) {
    return dailyShutdownState.returnToDate || getTodayISO();
  }
  if (dailyPlanningState.isActive) {
    return dailyPlanningState.returnToDate || getTodayISO();
  }
  if (todayViewState.isActive) {
    return todayViewState.returnToHomeDate || getTodayISO();
  }
  return getFirstVisibleDate();
}

function applyTodayViewLayout(isActive) {
  const shell = document.querySelector('.app-shell');
  const board = document.querySelector('.board');
  const container = document.getElementById('day-columns');
  const closeBtn = document.querySelector('[data-today-view-close]');
  const rightCollapseBtn = document.querySelector('[data-right-sidebar-collapse]');
  if (shell) shell.classList.toggle('app-shell--today-view', isActive);
  if (board) board.classList.toggle('board--today-view', isActive);
  if (container) container.classList.toggle('board__columns--today-view', isActive);
  if (closeBtn) closeBtn.hidden = !isActive;
  if (rightCollapseBtn) rightCollapseBtn.hidden = isActive;
}

function resetDailyPlanningModeState() {
  dailyPlanningState.isActive = false;
  dailyPlanningState.selectedDate = null;
  dailyPlanningState.returnToDate = null;
  dailyPlanningState.returnToTodayView = false;
  dailyPlanningState.returnToTodayDate = null;
  dailyPlanningState.step = DAILY_PLANNING_STEPS.ADD_TASKS;
  dailyPlanningState.runDraft = null;
}

function resetDailyShutdownModeState() {
  dailyShutdownState.isActive = false;
  dailyShutdownState.selectedDate = null;
  dailyShutdownState.returnToDate = null;
  dailyShutdownState.returnToTodayView = false;
  dailyShutdownState.returnToTodayDate = null;
  dailyShutdownState.step = DAILY_SHUTDOWN_STEPS.REVIEW;
  dailyShutdownState.runDraft = null;
}

function renderTodayViewMode() {
  const container = document.getElementById('day-columns');
  if (!container) return;

  if (!todayViewState.isActive || dailyPlanningState.isActive || dailyShutdownState.isActive) {
    applyTodayViewLayout(false);
    return;
  }

  applyTodayViewLayout(true);
  const selectedDate = todayViewState.selectedDate || getTodayISO();
  ensureDateDataLoaded(selectedDate);
  const column = ensureColumnForDate(selectedDate);
  container.classList.add('board__columns--ready');
  container.innerHTML = '';
  const colEl = createColumnElement(column);
  container.appendChild(colEl);
  renderColumn(column);
  container.scrollLeft = 0;
  updateTodayButtonLabel(selectedDate);
  syncActiveTaskCardUI();
}

function openTodayView(targetDate = getTodayISO(), options = {}) {
  const { preserveReturnContext = false } = options;
  clearActiveTaskSelection();
  if (!todayViewState.isActive && !preserveReturnContext) {
    todayViewState.returnToHomeDate = getHomeContextDate();
    todayViewState.returnSidebarCollapsed = isSidebarCollapsed();
    todayViewState.returnRightSidebarCollapsed = rightSidebarState.collapsed;
  }

  if (dailyPlanningState.isActive) {
    resetDailyPlanningModeState();
    renderDailyPlanningMode();
  }
  if (dailyShutdownState.isActive) {
    resetDailyShutdownModeState();
    renderDailyShutdownMode();
  }

  todayViewState.isActive = true;
  todayViewState.selectedDate = targetDate;
  setSidebarCollapsed(true);
  setRightSidebarCollapsed(false);
  setSidebarActiveNav('today');
  closeTopbarTodayPicker();
  closeTopbarFilterPicker();
  closeWorkspaceMenu();
  renderTodayViewMode();
}

function exitTodayView() {
  clearActiveTaskSelection();
  const returnDate = todayViewState.returnToHomeDate || getTodayISO();
  const returnSidebarCollapsed = todayViewState.returnSidebarCollapsed;
  const returnRightSidebarCollapsed = todayViewState.returnRightSidebarCollapsed;
  todayViewState.isActive = false;
  todayViewState.selectedDate = null;
  todayViewState.returnToHomeDate = null;
  todayViewState.returnSidebarCollapsed = false;
  todayViewState.returnRightSidebarCollapsed = false;
  closeTopbarTodayPicker();
  closeTopbarFilterPicker();
  renderTodayViewMode();
  setSidebarCollapsed(returnSidebarCollapsed);
  setRightSidebarCollapsed(returnRightSidebarCollapsed);
  setSidebarActiveNav('home');
  renderAllColumns();
  initializeFirstColumnPosition(returnDate);
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
      <div class="daily-planning-panel__share-editor" data-dp-share-editor></div>
      <div class="daily-planning-panel__actions daily-planning-panel__actions--final">
        <button class="daily-planning-panel__btn daily-planning-panel__btn--ghost" type="button" data-dp-prev>
          <i data-lucide="arrow-left"></i>
        </button>
        <button class="daily-planning-panel__btn daily-planning-panel__btn--icon" type="button" data-dp-copy>
          <i data-lucide="files"></i>
          <span data-copy-label>Copy</span>
        </button>
        <button class="daily-planning-panel__btn daily-planning-panel__btn--primary daily-planning-panel__btn--icon daily-planning-panel__btn--complete" type="button" data-dp-finish>
          <i data-lucide="check"></i>
          <span>Get started</span>
        </button>
      </div>
    </div>
  `;
}

function renderDailyPlanningPanel() {
  const panel = document.getElementById('daily-planning-panel');
  if (!panel) return;

  // Save Quill content before re-render destroys the instance
  if (dpShareQuill) {
    const draft = ensureDailyPlanningRunDraft();
    draft.shareText = getQuillHtml(dpShareQuill);
    dpShareQuill = null;
  }

  if (!dailyPlanningState.isActive) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.innerHTML = renderDailyPlanningPanelHtml();
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Init Quill on the SHARE step editor
  const editorContainer = panel.querySelector('[data-dp-share-editor]');
  if (editorContainer) {
    const selectedDate = dailyPlanningState.selectedDate || getTodayISO();
    const draft = ensureDailyPlanningRunDraft();
    const shareText = draft.shareText || buildDailyPlanShareTemplate(selectedDate);
    const htmlContent = shareTextToHtml(shareText);
    dpShareQuill = initQuillEditor(editorContainer, 'Your daily plan...', htmlContent);
    dpShareQuill.on('text-change', () => {
      draft.shareText = getQuillHtml(dpShareQuill);
      draft.updatedAt = new Date().toISOString();
    });
  }
}

function renderDailyShutdownDonut(segments) {
  const totalSeconds = segments.reduce((sum, seg) => sum + seg.seconds, 0);
  const radius = 38;
  const center = 60;
  const circumference = 2 * Math.PI * radius;

  if (!totalSeconds) {
    return `
      <div class="shutdown-donut shutdown-donut--empty" data-shutdown-donut>
        <div class="shutdown-donut__tooltip" hidden></div>
        <svg class="shutdown-donut__svg" viewBox="0 0 120 120" role="img" aria-label="No time tracked">
          <circle class="shutdown-donut__track" cx="${center}" cy="${center}" r="${radius}"></circle>
        </svg>
      </div>
      <div class="shutdown-donut__legend shutdown-donut__legend--empty">No time tracked yet</div>
    `;
  }

  let offset = 0;
  const slices = segments.map(seg => {
    const length = (seg.seconds / totalSeconds) * circumference;
    const dasharray = `${length} ${circumference - length}`;
    const dashoffset = -offset;
    offset += length;
    return `
      <circle
        class="shutdown-donut__slice"
        cx="${center}" cy="${center}" r="${radius}"
        stroke="${escapeHtml(seg.color)}"
        stroke-dasharray="${dasharray}"
        stroke-dashoffset="${dashoffset}"
        data-donut-slice
        data-donut-label="${escapeHtml(seg.label)}"
        data-donut-time="${escapeHtml(formatShortDurationFromSeconds(seg.seconds))}"
        data-donut-color="${escapeHtml(seg.color)}"
      ></circle>
    `;
  }).join('');

  const legend = segments.map(seg => `
    <div class="shutdown-donut__legend-item">
      <span class="shutdown-donut__legend-swatch" style="--swatch-color:${escapeHtml(seg.color)}"></span>
      <span>${escapeHtml(seg.label)}</span>
    </div>
  `).join('');

  return `
    <div class="shutdown-donut" data-shutdown-donut>
      <div class="shutdown-donut__tooltip" hidden></div>
      <svg class="shutdown-donut__svg" viewBox="0 0 120 120" role="img" aria-label="Time by channel">
        <circle class="shutdown-donut__track" cx="${center}" cy="${center}" r="${radius}"></circle>
        <g class="shutdown-donut__slices" transform="rotate(-90 ${center} ${center})">
          ${slices}
        </g>
      </svg>
    </div>
    <div class="shutdown-donut__legend">
      ${legend}
    </div>
  `;
}

function renderDailyShutdownPanelHtml() {
  if (!dailyShutdownState.isActive) return '';
  const selectedDate = dailyShutdownState.selectedDate || getTodayISO();
  const step = dailyShutdownState.step;

  if (step === DAILY_SHUTDOWN_STEPS.SHARE) {
    return `
      <div class="daily-shutdown-panel__inner">
        <h2 class="daily-shutdown-panel__title">Daily shutdown</h2>
        <p class="daily-shutdown-panel__subtitle">Document and share your shutdown for ${escapeHtml(getDailyShutdownSentenceLabel(selectedDate))}.</p>
        <div class="daily-shutdown-panel__share-editor" data-ds-share-editor></div>
        <div class="daily-shutdown-panel__actions daily-shutdown-panel__actions--final">
          <button class="daily-shutdown-panel__btn daily-shutdown-panel__btn--ghost" type="button" data-ds-prev>
            <i data-lucide="arrow-left"></i>
          </button>
          <button class="daily-shutdown-panel__btn daily-shutdown-panel__btn--icon" type="button" data-ds-copy>
            <i data-lucide="files"></i>
            <span data-copy-label>Copy</span>
          </button>
          <button class="daily-shutdown-panel__btn daily-shutdown-panel__btn--primary daily-shutdown-panel__btn--icon daily-shutdown-panel__btn--complete" type="button" data-ds-finish>
            <i data-lucide="check"></i>
            <span>Shutdown complete</span>
          </button>
        </div>
      </div>
    `;
  }

  const totals = getDailyShutdownTotals(selectedDate);
  const actualLabel = formatShortDurationFromMinutes(totals.actualMinutes);
  const plannedLabel = formatShortDurationFromMinutes(totals.plannedMinutes);
  const maxMinutes = 12 * 60;
  const actualPercent = Math.min(100, Math.max(0, (totals.actualMinutes / maxMinutes) * 100));
  const plannedPercent = Math.min(100, Math.max(0, (totals.plannedMinutes / maxMinutes) * 100));
  const channels = getDailyShutdownChannelBreakdown(selectedDate);
  const hasActual = totals.actualMinutes > 0;

  const donutSection = hasActual ? `
      <div class="daily-shutdown-panel__section">
        <h2 class="daily-shutdown-panel__title daily-shutdown-panel__title--section">How you spent your time</h2>
        ${renderDailyShutdownDonut(channels)}
      </div>
    ` : '';

  return `
    <div class="daily-shutdown-panel__inner">
      <h2 class="daily-shutdown-panel__title">${escapeHtml(getDailyShutdownTitleLabel(selectedDate))}</h2>
      <p class="daily-shutdown-panel__subtitle">How you spent your time ${escapeHtml(getDailyShutdownSentenceLabel(selectedDate))}</p>
      <div class="daily-shutdown-panel__section">
        <h3>Total time</h3>
        <div class="shutdown-progress">
          <div class="shutdown-progress__callout shutdown-progress__callout--actual" style="left:${actualPercent}%;">
            ${escapeHtml(actualLabel)}
          </div>
          <div class="shutdown-progress__track">
            <div class="shutdown-progress__fill" style="width:${actualPercent}%;"></div>
            <span class="shutdown-progress__tick" style="left:50%;"><span>6 hr</span></span>
            <span class="shutdown-progress__tick" style="left:66.666%;"><span>8 hr</span></span>
          </div>
          ${totals.plannedMinutes ? `
          <div class="shutdown-progress__callout shutdown-progress__callout--planned" style="left:${plannedPercent}%;">
            <span class="shutdown-progress__callout-value">${escapeHtml(plannedLabel)}</span>
            <span class="shutdown-progress__callout-label">planned</span>
          </div>
          ` : ''}
        </div>
      </div>
      ${donutSection}
      <div class="daily-shutdown-panel__actions daily-shutdown-panel__actions--review">
        <button class="daily-shutdown-panel__btn daily-shutdown-panel__btn--primary" type="button" data-ds-next>Next</button>
      </div>
    </div>
  `;
}

function renderDailyShutdownPanel() {
  const panel = document.getElementById('daily-shutdown-panel');
  if (!panel) return;

  if (dsShareQuill) {
    const draft = ensureDailyShutdownRunDraft();
    draft.shareText = getQuillHtml(dsShareQuill);
    dsShareQuill = null;
  }

  if (!dailyShutdownState.isActive) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.innerHTML = renderDailyShutdownPanelHtml();
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const editorContainer = panel.querySelector('[data-ds-share-editor]');
  if (editorContainer) {
    const selectedDate = dailyShutdownState.selectedDate || getTodayISO();
    const draft = ensureDailyShutdownRunDraft();
    const shareText = draft.shareText || buildDailyShutdownShareTemplate(selectedDate, getDailyShutdownWorkedOnTasks(selectedDate));
    const htmlContent = shareTextToHtml(shareText);
    dsShareQuill = initQuillEditor(editorContainer, 'Your shutdown...', htmlContent);
    dsShareQuill.on('text-change', () => {
      draft.shareText = getQuillHtml(dsShareQuill);
      draft.updatedAt = new Date().toISOString();
    });
  }

  attachDailyShutdownDonutEvents(panel);
}

function attachDailyShutdownDonutEvents(panelEl) {
  const donut = panelEl.querySelector('[data-shutdown-donut]');
  if (!donut) return;
  const tooltip = donut.querySelector('.shutdown-donut__tooltip');
  if (!tooltip) return;

  donut.querySelectorAll('[data-donut-slice]').forEach(slice => {
    slice.addEventListener('mouseenter', e => {
      const label = e.target.dataset.donutLabel || '';
      const time = e.target.dataset.donutTime || '';
      const color = e.target.dataset.donutColor || '';
      tooltip.innerHTML = '';
      if (label && time) {
        const swatch = document.createElement('span');
        swatch.className = 'shutdown-donut__tooltip-swatch';
        tooltip.style.setProperty('--swatch-color', color);

        const text = document.createElement('span');
        text.textContent = `${label}: ${time}`;

        tooltip.append(swatch, text);
        tooltip.hidden = false;
      } else {
        tooltip.hidden = true;
      }
    });
    slice.addEventListener('mousemove', e => {
      const rect = donut.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    });
    slice.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
  });
}

function ensureFloatingTooltip() {
  if (floatingTooltipEl && floatingTooltipEl.isConnected) return floatingTooltipEl;
  floatingTooltipEl = document.createElement('div');
  floatingTooltipEl.className = 'app-tooltip app-tooltip--floating';
  floatingTooltipEl.hidden = true;
  document.body.appendChild(floatingTooltipEl);
  return floatingTooltipEl;
}

function clearFloatingTooltipTimer() {
  if (!floatingTooltipShowTimer) return;
  clearTimeout(floatingTooltipShowTimer);
  floatingTooltipShowTimer = null;
}

function hideFloatingTooltip() {
  clearFloatingTooltipTimer();
  activeFloatingTooltipTarget = null;
  activeFloatingTooltipConfig = null;
  if (!floatingTooltipEl) return;
  floatingTooltipEl.hidden = true;
  floatingTooltipEl.innerHTML = '';
}

function renderFloatingTooltipShortcutHtml(label, shortcutId, shortcutGroupsOverride = null) {
  const safeLabel = escapeHtml(label || '');
  const row = shortcutId ? findShortcutRow(shortcutId) : null;
  const shortcutGroups = Array.isArray(shortcutGroupsOverride)
    ? shortcutGroupsOverride
    : (row ? shortcutLabelsForPlatform(row) : []);
  const shortcutHtml = shortcutGroups.length
    ? renderShortcutKeyGroups(shortcutGroups)
    : '';

  if (!shortcutHtml) {
    return `<span class="app-tooltip__label">${safeLabel}</span>`;
  }

  return `
    <span class="app-tooltip__label">${safeLabel}</span>
    <span class="app-tooltip__separator" aria-hidden="true">&middot;</span>
    <span class="app-tooltip__keys">${shortcutHtml}</span>
  `;
}

function resolveFloatingTooltipConfig(target) {
  if (!target) return null;

  const rolloverLabel = target.getAttribute('data-rollover-tooltip');
  if (rolloverLabel) {
    return {
      text: rolloverLabel,
      placement: 'bottom',
      anchorSelector: '.rollover-icon',
      offset: 10
    };
  }

  const richLabel = target.getAttribute('data-rich-tooltip-label');
  if (richLabel) {
    let shortcutGroupsOverride = null;
    const shortcutGroupsAttr = target.getAttribute('data-rich-tooltip-shortcut-groups');
    if (shortcutGroupsAttr) {
      try {
        const parsed = JSON.parse(shortcutGroupsAttr);
        if (Array.isArray(parsed)) shortcutGroupsOverride = parsed;
      } catch (err) {
        shortcutGroupsOverride = null;
      }
    }
    return {
      html: renderFloatingTooltipShortcutHtml(
        richLabel,
        target.getAttribute('data-rich-tooltip-shortcut-id') || '',
        shortcutGroupsOverride
      ),
      placement: target.getAttribute('data-rich-tooltip-placement') || 'top',
      anchorSelector: target.getAttribute('data-rich-tooltip-anchor') || '',
      offset: Number(target.getAttribute('data-rich-tooltip-offset')) || 10
    };
  }

  return null;
}

function getFloatingTooltipTrigger(target) {
  return target instanceof Element
    ? target.closest('[data-rollover-tooltip], [data-rich-tooltip-label]')
    : null;
}

function positionFloatingTooltip(target, config = activeFloatingTooltipConfig) {
  const tooltip = ensureFloatingTooltip();
  if (!target || !target.isConnected || tooltip.hidden || !config) {
    hideFloatingTooltip();
    return;
  }

  const anchor = config.anchorSelector
    ? (target.querySelector(config.anchorSelector) || target)
    : target;
  const rect = anchor.getBoundingClientRect();
  const spacing = typeof config.offset === 'number' ? config.offset : 10;
  const viewportPadding = 8;
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const placement = config.placement || 'top';

  if (placement === 'left' || placement === 'right') {
    const left = placement === 'left'
      ? Math.max(viewportPadding, rect.left - spacing - tooltipWidth)
      : Math.min(rect.right + spacing, window.innerWidth - viewportPadding - tooltipWidth);
    const desiredTop = rect.top + (rect.height / 2) - (tooltipHeight / 2);
    const top = Math.min(
      Math.max(viewportPadding, desiredTop),
      window.innerHeight - viewportPadding - tooltipHeight
    );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transform = 'none';
    return;
  }

  const desiredCenterX = rect.left + (rect.width / 2);
  const minCenterX = viewportPadding + (tooltipWidth / 2);
  const maxCenterX = window.innerWidth - viewportPadding - (tooltipWidth / 2);
  const centerX = Math.min(Math.max(desiredCenterX, minCenterX), maxCenterX);
  const desiredTop = placement === 'bottom'
    ? rect.bottom + spacing
    : rect.top - spacing - tooltipHeight;
  const top = placement === 'bottom'
    ? Math.min(desiredTop, window.innerHeight - viewportPadding - tooltipHeight)
    : Math.max(viewportPadding, desiredTop);

  tooltip.style.left = `${centerX}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.transform = 'translateX(-50%)';
}

function showFloatingTooltip(target) {
  const config = resolveFloatingTooltipConfig(target);
  if (!target || !config) {
    hideFloatingTooltip();
    return;
  }

  const tooltip = ensureFloatingTooltip();
  activeFloatingTooltipTarget = target;
  activeFloatingTooltipConfig = config;
  if (config.html) {
    tooltip.innerHTML = config.html;
  } else {
    tooltip.textContent = config.text || '';
  }
  tooltip.hidden = false;
  positionFloatingTooltip(target, config);
}

function scheduleFloatingTooltip(target) {
  const config = resolveFloatingTooltipConfig(target);
  if (!target || !config) {
    hideFloatingTooltip();
    return;
  }
  if (activeFloatingTooltipTarget === target && !floatingTooltipShowTimer) return;

  clearFloatingTooltipTimer();
  floatingTooltipShowTimer = setTimeout(() => {
    floatingTooltipShowTimer = null;
    showFloatingTooltip(target);
  }, FLOATING_TOOLTIP_DELAY_MS);
}

function renderDailyShutdownColumns() {
  const container = document.getElementById('day-columns');
  if (!container) return;
  const selectedDate = dailyShutdownState.selectedDate || getTodayISO();
  const workedTasks = getDailyShutdownWorkedOnTasks(selectedDate);
  const missedTasks = getDailyShutdownMissedTasks(selectedDate);
  const homeCol = ensureColumnForDate(selectedDate);

  function buildColumn(title, subtitle, tasks, options = {}) {
    const colEl = document.createElement('div');
    colEl.className = 'day-column day-column--shutdown';
    colEl.dataset.colId = homeCol.id;
    colEl.dataset.isoDate = selectedDate;
    colEl.dataset.shutdownColumn = options.key || '';

    const plannedMinutes = tasks.reduce((sum, task) => sum + getPlannedMinutesForDate(task, selectedDate), 0);
    const actualMinutes = tasks.reduce((sum, task) => sum + Math.floor(getTaskDailyActualSeconds(task, selectedDate) / 60), 0);

    let badgeText = '';
    if (options.showActualPlanned) {
      if (plannedMinutes || actualMinutes) {
        badgeText = `${formatMinutes(actualMinutes)} / ${formatMinutes(plannedMinutes)}`;
      }
    } else if (plannedMinutes) {
      badgeText = formatMinutes(plannedMinutes);
    }

    colEl.innerHTML = `
      <div class="day-column__header">
        <span class="day-name">${escapeHtml(title)}</span>
        ${subtitle ? `<span class="day-date day-date--daily-hint">${escapeHtml(subtitle)}</span>` : ''}
      </div>
      <div class="add-task-row">
        ${renderAddTaskButtonHtml()}
        <span class="column-time-total task-card__time-badge"${badgeText ? '' : ' hidden'}>${escapeHtml(badgeText)}</span>
      </div>
      <div class="add-task-input-wrap" hidden>
        <input type="text" class="add-task-input" placeholder="Task name…">
        <button class="add-task-confirm" type="button" aria-label="Add task">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
      <div class="task-list"></div>
    `;

    const taskList = colEl.querySelector('.task-list');
    tasks.forEach(task => {
      taskList.appendChild(renderTaskCard(task, selectedDate, false, null));
    });

    return colEl;
  }

  container.innerHTML = '';
  container.appendChild(buildColumn('Worked on:', '', workedTasks, { key: 'worked', showActualPlanned: true }));
  container.appendChild(buildColumn("Didn't get to:", '', missedTasks, { key: 'missed', showActualPlanned: false }));
  container.scrollLeft = 0;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderDailyShutdownMode() {
  const board = document.querySelector('.board');
  const container = document.getElementById('day-columns');
  const mainCard = document.querySelector('.main-card');
  if (!board || !container) return;
  applyTodayViewLayout(false);

  if (!dailyShutdownState.isActive) {
    board.classList.remove('board--daily-shutdown');
    board.removeAttribute('data-ds-step');
    container.classList.remove('board__columns--daily-shutdown');
    if (mainCard) mainCard.classList.remove('main-card--hide-calendar');
    if (mainCard) mainCard.classList.remove('main-card--daily-shutdown');
    renderDailyShutdownPanel();
    return;
  }

  board.classList.add('board--daily-shutdown');
  board.setAttribute('data-ds-step', String(dailyShutdownState.step));
  container.classList.add('board__columns--daily-shutdown');
  container.classList.add('board__columns--ready');
  if (mainCard) mainCard.classList.add('main-card--hide-calendar');
  if (mainCard) mainCard.classList.add('main-card--daily-shutdown');

  renderDailyShutdownPanel();
  if (dailyShutdownState.step === DAILY_SHUTDOWN_STEPS.REVIEW) {
    renderDailyShutdownColumns();
  } else {
    container.innerHTML = '';
  }
  updateTodayButtonLabel(dailyShutdownState.selectedDate || getTodayISO());
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
  applyTodayViewLayout(false);

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
  // Collapse all timer areas except tasks with an active timer
  collapseAllCardTimers();
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

function setDailyShutdownStep(nextStep) {
  if (!dailyShutdownState.isActive) return;
  if (!DAILY_SHUTDOWN_STEP_ORDER.includes(nextStep)) return;
  const draft = ensureDailyShutdownRunDraft();
  dailyShutdownState.step = nextStep;
  if (nextStep === DAILY_SHUTDOWN_STEPS.SHARE && !String(draft.shareText || '').trim()) {
    const selectedDate = dailyShutdownState.selectedDate || getTodayISO();
    const tasks = getDailyShutdownWorkedOnTasks(selectedDate);
    draft.workedOnTaskIds = tasks.map(t => t.id);
    draft.shareText = buildDailyShutdownShareTemplate(selectedDate, tasks);
  }
  draft.updatedAt = new Date().toISOString();
  renderDailyShutdownMode();
}

function goToNextDailyShutdownStep() {
  if (!dailyShutdownState.isActive) return;
  const idx = DAILY_SHUTDOWN_STEP_ORDER.indexOf(dailyShutdownState.step);
  if (idx === -1) return;
  const next = DAILY_SHUTDOWN_STEP_ORDER[idx + 1];
  if (next) setDailyShutdownStep(next);
}

function goToPrevDailyShutdownStep() {
  if (!dailyShutdownState.isActive) return;
  const idx = DAILY_SHUTDOWN_STEP_ORDER.indexOf(dailyShutdownState.step);
  if (idx <= 0) {
    exitDailyShutdownMode();
    return;
  }
  setDailyShutdownStep(DAILY_SHUTDOWN_STEP_ORDER[idx - 1]);
}

function advanceDailyPlanningStep() {
  goToNextDailyPlanningStep();
}

function retreatDailyPlanningStep() {
  goToPrevDailyPlanningStep();
}

function advanceDailyShutdownStep() {
  goToNextDailyShutdownStep();
}

function retreatDailyShutdownStep() {
  goToPrevDailyShutdownStep();
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

function setDailyShutdownSelectedDate(nextIsoDate, options = {}) {
  if (!dailyShutdownState.isActive) return;
  if (!nextIsoDate) return;
  const todayISO = getTodayISO();
  const { resetStep = true } = options;
  const clampedDate = nextIsoDate > todayISO ? todayISO : nextIsoDate;
  if (dailyShutdownState.selectedDate === clampedDate) {
    updateTodayButtonLabel(clampedDate);
    return;
  }
  dailyShutdownState.selectedDate = clampedDate;
  if (resetStep) dailyShutdownState.step = DAILY_SHUTDOWN_STEPS.REVIEW;
  dailyShutdownState.runDraft = createDailyShutdownRunDraft(clampedDate);
  renderDailyShutdownMode();
}

function getRitualReturnContext() {
  if (dailyShutdownState.isActive) {
    return {
      returnToTodayView: !!dailyShutdownState.returnToTodayView,
      returnDate: dailyShutdownState.returnToDate || getTodayISO(),
      returnToTodayDate: dailyShutdownState.returnToTodayDate || getTodayISO()
    };
  }
  if (dailyPlanningState.isActive) {
    return {
      returnToTodayView: !!dailyPlanningState.returnToTodayView,
      returnDate: dailyPlanningState.returnToDate || getTodayISO(),
      returnToTodayDate: dailyPlanningState.returnToTodayDate || getTodayISO()
    };
  }
  if (todayViewState.isActive) {
    return {
      returnToTodayView: true,
      returnDate: todayViewState.returnToHomeDate || getTodayISO(),
      returnToTodayDate: todayViewState.selectedDate || getTodayISO()
    };
  }
  return {
    returnToTodayView: false,
    returnDate: getFirstVisibleDate(),
    returnToTodayDate: null
  };
}

function enterDailyPlanningMode(targetDate) {
  clearActiveTaskSelection();
  const { returnToTodayView, returnDate, returnToTodayDate } = getRitualReturnContext();
  if (dailyShutdownState.isActive) exitDailyShutdownMode({ preferTodayReturn: false });
  const selectedDate = targetDate || getTodayISO();
  topbarTaskFilterState.homeToday = 'all';
  dailyPlanningState.isActive = true;
  dailyPlanningState.selectedDate = selectedDate;
  dailyPlanningState.returnToDate = returnDate;
  dailyPlanningState.returnToTodayView = returnToTodayView;
  dailyPlanningState.returnToTodayDate = returnToTodayView ? (returnToTodayDate || selectedDate) : null;
  dailyPlanningState.step = DAILY_PLANNING_STEPS.ADD_TASKS;
  dailyPlanningState.runDraft = createDailyPlanningRunDraft(selectedDate);
  dailyPlanningState.runDraft.shareText = '';
  topbarTaskFilterState.dailyPlanning = 'all';
  applyWorkdayBoundsForDate(selectedDate);
  setSidebarCollapsed(false);
  setSidebarActiveNav('daily-planning');
  closeTopbarTodayPicker();
  closeTopbarFilterPicker();
  renderDailyPlanningMode();
}

function enterDailyShutdownMode(targetDate) {
  clearActiveTaskSelection();
  const { returnToTodayView, returnDate, returnToTodayDate } = getRitualReturnContext();
  if (dailyPlanningState.isActive) exitDailyPlanningMode({ preferTodayReturn: false });
  // Collapse all timer areas except tasks with an active timer
  collapseAllCardTimers();
  const selectedDate = targetDate || getTodayISO();
  topbarTaskFilterState.homeToday = 'all';
  dailyShutdownState.isActive = true;
  dailyShutdownState.selectedDate = selectedDate;
  dailyShutdownState.returnToDate = returnDate;
  dailyShutdownState.returnToTodayView = returnToTodayView;
  dailyShutdownState.returnToTodayDate = returnToTodayView ? (returnToTodayDate || selectedDate) : null;
  dailyShutdownState.step = DAILY_SHUTDOWN_STEPS.REVIEW;
  dailyShutdownState.runDraft = createDailyShutdownRunDraft(selectedDate);
  topbarTaskFilterState.dailyShutdown = 'all';
  setSidebarCollapsed(false);
  setSidebarActiveNav('daily-shutdown');
  closeTopbarTodayPicker();
  closeTopbarFilterPicker();
  renderDailyShutdownMode();
}

function exitDailyPlanningMode(options = {}) {
  const { restoreTodayFirstColumn = false, preferTodayReturn = true } = options;
  clearActiveTaskSelection();
  closeTopbarFilterPicker();
  // Collapse all timer areas except tasks with an active timer
  collapseAllCardTimers();
  const returnDate = dailyPlanningState.returnToDate || getTodayISO();
  const returnToTodayView = preferTodayReturn && dailyPlanningState.returnToTodayView && todayViewState.isActive;
  const returnToTodayDate = dailyPlanningState.returnToTodayDate || getTodayISO();
  resetDailyPlanningModeState();

  renderDailyPlanningMode();
  if (returnToTodayView) {
    todayViewState.selectedDate = returnToTodayDate;
    setSidebarCollapsed(true);
    setRightSidebarCollapsed(false);
    setSidebarActiveNav('today');
    renderTodayViewMode();
    return;
  }
  setSidebarActiveNav('home');
  renderAllColumns();
  const targetDate = restoreTodayFirstColumn ? getTodayISO() : returnDate;
  initializeFirstColumnPosition(targetDate);
}

function exitDailyShutdownMode(options = {}) {
  const { restoreTodayFirstColumn = false, preferTodayReturn = true } = options;
  clearActiveTaskSelection();
  closeTopbarFilterPicker();
  // Collapse all timer areas except tasks with an active timer
  collapseAllCardTimers();
  const returnDate = dailyShutdownState.returnToDate || getTodayISO();
  const returnToTodayView = preferTodayReturn && dailyShutdownState.returnToTodayView && todayViewState.isActive;
  const returnToTodayDate = dailyShutdownState.returnToTodayDate || getTodayISO();
  resetDailyShutdownModeState();

  renderDailyShutdownMode();
  if (returnToTodayView) {
    todayViewState.selectedDate = returnToTodayDate;
    setSidebarCollapsed(true);
    setRightSidebarCollapsed(false);
    setSidebarActiveNav('today');
    renderTodayViewMode();
    return;
  }
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

function stripHtmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function normalizeSearchSettings() {
  settings.searchFilters = {
    ...DEFAULT_SEARCH_FILTERS,
    ...(settings.searchFilters || {})
  };

  const allowedDateRanges = new Set(SEARCH_DATE_OPTIONS.map(option => option.id));
  if (!allowedDateRanges.has(settings.searchDateRange)) {
    settings.searchDateRange = 'anytime';
  }

  const selectedChannelId = String(settings.searchChannelFilterId || 'all');
  settings.searchChannelFilterId = selectedChannelId === 'all' || getChannelById(selectedChannelId)
    ? selectedChannelId
    : 'all';
}

function formatDailyPlanningSnapshotEntry(snapshot) {
  const rawShareText = String(snapshot.shareText || '').trim()
    || buildDailyPlanShareTemplate(snapshot.dateISO);
  const shareHtml = rawShareText.startsWith('<') ? rawShareText : shareTextToHtml(rawShareText);

  const workloadLabel = `${formatMinutes(snapshot.plannedWorkMinutes)} / ${formatMinutes(snapshot.capacityMinutes)} (${snapshot.overcommitted ? 'Overcommitted' : 'Within capacity'})`;

  return `<h2>Daily Planning</h2>`
    + `<p>Created at: ${escapeHtml(formatSnapshotTimestamp(snapshot.completedAt))}</p>`
    + `<p>Date: ${escapeHtml(snapshot.dateISO)}</p>`
    + `<p>Workload: ${escapeHtml(workloadLabel)}</p>`
    + `<p><br></p>`
    + shareHtml;
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
  task.notes = prior ? `${prior}<p><br></p><hr><p><br></p>${entry}` : entry;
  renderColumn(column);
}

function buildDailyPlanningCopyText() {
  const selectedDate = dailyPlanningState.selectedDate || getTodayISO();
  const draft = ensureDailyPlanningRunDraft();
  const workload = getDailyPlanningWorkloadSummary(selectedDate);
  const shareText = dpShareQuill
    ? dpShareQuill.getText().trim()
    : String(draft.shareText || '').trim() || buildDailyPlanShareTemplate(selectedDate);

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
  persistRituals();
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
  const fmt = getEffectiveTimeFormat();
  if (fmt === '24') {
    return `${String(normalizedHour).padStart(2, '0')}:${String(adjM).padStart(2, '0')}`;
  }
  const period = normalizedHour < 12 ? 'AM' : 'PM';
  const h12    = normalizedHour % 12 || 12;
  return adjM === 0
    ? `${h12} ${period}`
    : `${h12}:${String(adjM).padStart(2, '0')} ${period}`;
}

function formatOffsetAsClockWithMinutes(totalHoursFromGridStart) {
  const totalH = CALENDAR_START_HOUR + totalHoursFromGridStart;
  const h = Math.floor(totalH);
  const m = Math.round((totalHoursFromGridStart % 1) * 60);
  const adjH = m === 60 ? h + 1 : h;
  const adjM = m === 60 ? 0 : m;
  const normalizedHour = ((adjH % 24) + 24) % 24;
  const fmt = getEffectiveTimeFormat();
  if (fmt === '24') {
    return `${String(normalizedHour).padStart(2, '0')}:${String(adjM).padStart(2, '0')}`;
  }
  const period = normalizedHour < 12 ? 'AM' : 'PM';
  const h12 = normalizedHour % 12 || 12;
  return `${h12}:${String(adjM).padStart(2, '0')} ${period}`;
}

function formatOffsetAsClockNoPeriod(totalHoursFromGridStart) {
  const totalH = CALENDAR_START_HOUR + totalHoursFromGridStart;
  const h = Math.floor(totalH);
  const m = Math.round((totalHoursFromGridStart % 1) * 60);
  const adjH = m === 60 ? h + 1 : h;
  const adjM = m === 60 ? 0 : m;
  const normalizedHour = ((adjH % 24) + 24) % 24;
  const fmt = getEffectiveTimeFormat();
  if (fmt === '24') {
    return `${String(normalizedHour).padStart(2, '0')}:${String(adjM).padStart(2, '0')}`;
  }
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
  dragState.fromTrash = false;
  dragState.fromBacklog = false;
  dragState.fromArchive = false;
  dragState.sourceBacklogHorizon = null;
  dragState.sourceIsoDate = null;
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

function renderSubtasks(subtasks, taskId, options = {}) {
  const isBacklog = options.isBacklog === true;
  const visibleSubtasks = subtasks.filter(subtaskShouldShowOnCard);
  if (!visibleSubtasks.length) return '';
  const items = visibleSubtasks.map(s => {
    ensureSubtaskTimeState(s);
    const isTimerActive = focusState.running && focusState.taskId === taskId && focusState.subtaskId === s.id;
    const hasAny = isBacklog
      ? s.plannedMinutes > 0
      : (hasActualTime(s.actualTimeSeconds) || s.plannedMinutes > 0 || isTimerActive);
    let timeHtml = '';
    if (hasAny) {
      const activeClass = isTimerActive ? ' subtask__time--active' : '';
      const plannedDisplay = s.plannedMinutes > 0 ? formatMinutes(s.plannedMinutes) : '--:--';
      if (isBacklog) {
        timeHtml = `<span class="subtask__time${activeClass}"><span data-card-subtask-planned="${escapeHtml(s.id)}">${plannedDisplay}</span></span>`;
      } else {
        const actualDisplay = hasActualTime(s.actualTimeSeconds) ? formatMinutes(Math.floor(s.actualTimeSeconds / 60)) : '--:--';
        timeHtml = `<span class="subtask__time${activeClass}"><span data-card-subtask-actual="${escapeHtml(s.id)}">${actualDisplay}</span> / <span data-card-subtask-planned="${escapeHtml(s.id)}">${plannedDisplay}</span></span>`;
      }
    }
    return `
    <li class="subtask ${s.done ? 'subtask--done' : ''}" data-subtask-id="${escapeHtml(s.id)}">
      <button class="subtask__check" type="button" data-card-subtask-check aria-label="Toggle subtask completion">${CHECK_SVG}</button>
      <span class="subtask__label">${escapeHtml(getSubtaskCardLabel(s))}</span>
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
  return `<span class="task-card__tag${unassignedClass}" data-channel-btn data-rich-tooltip-label="Assign channel" data-rich-tooltip-shortcut-id="assign-channel" data-rich-tooltip-shortcut-groups='[["Q"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="13">` +
    `<span class="task-card__tag-hash" style="color:${escapeHtml(hashColor)};">#</span>` +
    `<span class="task-card__tag-word">${escapeHtml(word)}</span></span>`;
}

function renderTaskDetailSubtaskRow(subtask, options = {}) {
  ensureSubtaskTimeState(subtask);
  const isBacklog = options.isBacklog === true;
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
      <button class="task-modal__subtask-action" type="button" data-modal-subtask-detach="${escapeHtml(subtask.id)}" aria-label="Convert to standalone task" data-rich-tooltip-label="Convert to task" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
        <i data-lucide="copy"></i>
      </button>
        ${isBacklog ? '' : `<button class="task-modal__subtask-action" type="button" data-modal-subtask-play="${escapeHtml(subtask.id)}" aria-label="${isRunning ? 'Pause subtask timer' : 'Start subtask timer'}" data-rich-tooltip-label="${isRunning ? 'Stop timer' : 'Start timer'}" data-rich-tooltip-shortcut-groups='[["Space"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
          <i data-lucide="${isRunning ? 'pause' : 'play'}"></i>
        </button>`}
      </div>
      ${isBacklog ? '' : `<button class="task-modal__subtask-time" type="button" data-modal-subtask-actual-btn="${escapeHtml(subtask.id)}" data-rich-tooltip-label="Set actual time" data-rich-tooltip-shortcut-groups='[["E"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
        <span class="task-modal__subtask-time-value ${isRunning ? 'task-modal__subtask-time-value--running' : (subtask.actualTimeSeconds ? 'task-modal__subtask-time-value--set' : 'task-modal__subtask-time-value--placeholder')}">${actualDisplay}</span>
      </button>`}
      <button class="task-modal__subtask-time" type="button" data-modal-subtask-planned-btn="${escapeHtml(subtask.id)}" data-rich-tooltip-label="Set planned time" data-rich-tooltip-shortcut-groups='[["W"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
        <span class="task-modal__subtask-time-value ${subtask.plannedMinutes ? 'task-modal__subtask-time-value--set' : 'task-modal__subtask-time-value--placeholder'}">${plannedDisplay}</span>
      </button>
    </div>
  `;
}

function renderTaskDetailSubtasks(task, options = {}) {
  ensureTaskTimeState(task);
  if (!task.showSubtasks && task.subtasks.length === 0) return '';

  const rows = task.subtasks.map(subtask => renderTaskDetailSubtaskRow(subtask, options)).join('');
  return `
    <div class="task-modal__subtasks" data-modal-subtasks>
      <div class="task-modal__subtask-list" data-modal-subtask-list>
        ${rows}
      </div>
      <button class="task-modal__add-subtask" type="button" data-modal-add-subtask data-rich-tooltip-label="Add subtasks" data-rich-tooltip-shortcut-id="add-subtask" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
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

function createRepeatDraftFromTask(task, column) {
  const anchorDate = task.repeatOccurrenceDate || task.startDate || column?.isoDate || getTodayISO();
  const anchorDateObj = parseISO(anchorDate);
  const existingSeries = task.repeatSeriesId ? getRepeatSeriesById(task.repeatSeriesId) : null;
  if (existingSeries) {
    return {
      cadence: existingSeries.cadence,
      interval: existingSeries.interval,
      weeklyDays: [...existingSeries.weeklyDays],
      monthlyRules: existingSeries.monthlyRules.map(rule => ({ ...rule })),
      yearlyRules: existingSeries.yearlyRules.map(rule => ({ ...rule })),
      showCadenceOptions: false
    };
  }
  return {
    cadence: 'weekly',
    interval: 1,
    weeklyDays: [anchorDateObj.getDay()],
    monthlyRules: [{ ordinal: formatOrdinalLabel(anchorDateObj.getDate()), dayType: 'day' }],
    yearlyRules: [{ ordinal: formatOrdinalLabel(anchorDateObj.getDate()), dayType: 'day', month: anchorDateObj.getMonth() }],
    showCadenceOptions: false
  };
}

function normalizeRepeatDraft(draft) {
  const cadence = ['daily', 'weekly', 'monthly', 'yearly'].includes(draft?.cadence) ? draft.cadence : 'weekly';
  const interval = Math.max(1, Number.parseInt(draft?.interval, 10) || 1);
  const weeklyDays = Array.from(new Set((draft?.weeklyDays || [])
    .map(day => Number.parseInt(day, 10))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)));
  const monthlyRules = (draft?.monthlyRules || [{ ordinal: '1st', dayType: 'day' }])
    .slice(0, 31)
    .map(rule => normalizeRepeatRuleEntry(rule, { allowLargeOrdinal: true }));
  const yearlyRules = (draft?.yearlyRules || [{ ordinal: '1st', dayType: 'day', month: 0 }])
    .slice(0, 31)
    .map(rule => normalizeRepeatRuleEntry(rule, { allowLargeOrdinal: true }));
  return {
    cadence,
    interval,
    weeklyDays: weeklyDays.length > 0 ? weeklyDays : [getStartOfWeekIndex()],
    monthlyRules,
    yearlyRules,
    showCadenceOptions: !!draft?.showCadenceOptions
  };
}

function isRepeatDraftUnchanged(task, normalizedDraft) {
  if (!task?.repeatSeriesId) return false;
  const existingSeries = getRepeatSeriesById(task.repeatSeriesId);
  if (!existingSeries) return false;
  return (
    existingSeries.cadence === normalizedDraft.cadence
    && existingSeries.interval === normalizedDraft.interval
    && JSON.stringify(existingSeries.weeklyDays || []) === JSON.stringify(normalizedDraft.weeklyDays || [])
    && JSON.stringify(existingSeries.monthlyRules || []) === JSON.stringify(normalizedDraft.monthlyRules || [])
    && JSON.stringify(existingSeries.yearlyRules || []) === JSON.stringify(normalizedDraft.yearlyRules || [])
  );
}

function renderRepeatCadenceOption(option, selectedCadence) {
  return `<button class="repeat-menu__cadence-option${selectedCadence === option.value ? ' repeat-menu__cadence-option--selected' : ''}" type="button" data-repeat-set-cadence="${option.value}">`
    + `<span class="repeat-menu__cadence-icon-wrap${selectedCadence === option.value ? ' repeat-menu__cadence-icon-wrap--selected' : ''}" aria-hidden="true">`
    + `<span class="repeat-menu__cadence-icon"></span>`
    + `</span>`
    + `<span>${escapeHtml(option.label)}</span>`
    + `</button>`;
}

function isRepeatDropdownOpen(type, rowIndex) {
  return !!(ellipsisMenuState
    && ellipsisMenuState.mode === 'repeat'
    && ellipsisMenuState.repeatOpenDropdown
    && ellipsisMenuState.repeatOpenDropdown.type === type
    && ellipsisMenuState.repeatOpenDropdown.rowIndex === rowIndex);
}

function renderRepeatSelect(type, rowIndex, selectedValue, options, label, modifierClass = '') {
  const selectedOption = options.find(option => String(option.value) === String(selectedValue)) || options[0];
  const isOpen = isRepeatDropdownOpen(type, rowIndex);
  const triggerClass = modifierClass ? ` repeat-menu__select-trigger--${modifierClass}` : '';
  const itemsHtml = options.map(option => {
    const isSelected = String(option.value) === String(selectedValue);
    const disabled = !!option.disabled;
    return `<button class="settings-view__dropdown-item repeat-menu__dropdown-item${disabled ? ' repeat-menu__dropdown-item--disabled' : ''}" type="button" data-repeat-select-option="${escapeHtml(type)}" data-repeat-select-row="${rowIndex}" data-value="${escapeHtml(String(option.value))}"${disabled ? ' disabled' : ''}>`
      + `<span>${escapeHtml(option.label)}</span>`
      + `<span class="settings-view__dropdown-check">${isSelected ? '✓' : ''}</span>`
      + `</button>`;
  }).join('');
  return `<div class="settings-view__dropdown-anchor repeat-menu__select-anchor">`
    + `<button class="settings-view__select repeat-menu__select-trigger${triggerClass}" type="button" aria-label="${escapeHtml(label)}" data-repeat-select-toggle="${escapeHtml(type)}" data-repeat-select-row="${rowIndex}">`
    + `<span>${escapeHtml(selectedOption?.label || '')}</span>`
    + `<i data-lucide="chevron-down" class="settings-view__select-icon"></i>`
    + `</button>`
    + `${isOpen ? `<div class="settings-view__dropdown repeat-menu__dropdown" data-repeat-select-dropdown><div class="settings-view__dropdown-arrow"></div><div class="settings-view__dropdown-items">${itemsHtml}</div></div>` : ''}`
    + `</div>`;
}

function getRepeatDayOptions(selectedDay, usedDays) {
  return getOrderedWeekdayIndexes().map(day => ({
    value: day,
    label: REPEAT_DAY_NAMES[day],
    disabled: usedDays.includes(day) && day !== selectedDay
  }));
}

function getRepeatOrdinalOptions(selectedOrdinal, allowLargeOrdinal) {
  return REPEAT_ORDINAL_OPTIONS
    .filter(option => allowLargeOrdinal || ['1st', '2nd', '3rd', '4th', 'Last'].includes(option))
    .map(option => ({ value: option, label: option }));
}

function getRepeatDayTypeOptions() {
  return [
    { value: 'day', label: 'day' }
  ].concat(getOrderedWeekdayIndexes().map(day => ({
    value: day,
    label: REPEAT_DAY_NAMES[day]
  })));
}

function getRepeatMonthOptions() {
  return REPEAT_MONTH_NAMES.map((month, index) => ({
    value: index,
    label: month
  }));
}

function isMonthlyRuleDuplicate(rules, rowIndex, ordinal, dayType) {
  return rules.some((rule, index) => (
    index !== rowIndex
    && rule.ordinal === ordinal
    && String(rule.dayType) === String(dayType)
  ));
}

function isYearlyRuleDuplicate(rules, rowIndex, ordinal, dayType, month) {
  return rules.some((rule, index) => (
    index !== rowIndex
    && rule.ordinal === ordinal
    && String(rule.dayType) === String(dayType)
    && Number(rule.month) === Number(month)
  ));
}

function getNextAvailableMonthlyRule(rules) {
  for (const ordinal of REPEAT_ORDINAL_OPTIONS) {
    if (!isMonthlyRuleDuplicate(rules, -1, ordinal, 'day')) {
      return { ordinal, dayType: 'day' };
    }
  }
  const weekdayOrdinals = ['1st', '2nd', '3rd', '4th', 'Last'];
  for (const day of getOrderedWeekdayIndexes()) {
    for (const ordinal of weekdayOrdinals) {
      if (!isMonthlyRuleDuplicate(rules, -1, ordinal, day)) {
        return { ordinal, dayType: day };
      }
    }
  }
  return { ordinal: '1st', dayType: 'day' };
}

function getNextAvailableYearlyRule(rules) {
  for (const month of REPEAT_MONTH_NAMES.map((_, index) => index)) {
    for (const ordinal of REPEAT_ORDINAL_OPTIONS) {
      if (!isYearlyRuleDuplicate(rules, -1, ordinal, 'day', month)) {
        return { ordinal, dayType: 'day', month };
      }
    }
    for (const day of getOrderedWeekdayIndexes()) {
      for (const ordinal of ['1st', '2nd', '3rd', '4th', 'Last']) {
        if (!isYearlyRuleDuplicate(rules, -1, ordinal, day, month)) {
          return { ordinal, dayType: day, month };
        }
      }
    }
  }
  return { ordinal: '1st', dayType: 'day', month: 0 };
}

function renderRepeatDaySelect(selectedDay, usedDays, rowIndex) {
  return renderRepeatSelect('weekly-day', rowIndex, selectedDay, getRepeatDayOptions(selectedDay, usedDays), 'Repeat weekday', 'weekday');
}

function renderRepeatOrdinalSelect(selectedOrdinal, allowLargeOrdinal, rowIndex, attr, rules) {
  const type = attr === 'data-repeat-monthly-ordinal' ? 'monthly-ordinal' : 'yearly-ordinal';
  let options = getRepeatOrdinalOptions(selectedOrdinal, allowLargeOrdinal);
  if (type === 'monthly-ordinal') {
    const dayType = rules[rowIndex]?.dayType ?? 'day';
    options = options.map(option => ({
      ...option,
      disabled: isMonthlyRuleDuplicate(rules, rowIndex, option.value, dayType)
    }));
  } else {
    const dayType = rules[rowIndex]?.dayType ?? 'day';
    const month = rules[rowIndex]?.month ?? 0;
    options = options.map(option => ({
      ...option,
      disabled: isYearlyRuleDuplicate(rules, rowIndex, option.value, dayType, month)
    }));
  }
  return renderRepeatSelect(type, rowIndex, selectedOrdinal, options, 'Repeat ordinal', 'ordinal');
}

function renderRepeatDayTypeSelect(selectedValue, rowIndex, attr, rules) {
  const type = attr === 'data-repeat-monthly-day-type' ? 'monthly-day-type' : 'yearly-day-type';
  let options = getRepeatDayTypeOptions();
  if (type === 'monthly-day-type') {
    const ordinal = rules[rowIndex]?.ordinal ?? '1st';
    options = options.map(option => ({
      ...option,
      disabled: isMonthlyRuleDuplicate(rules, rowIndex, ordinal, option.value)
    }));
  } else {
    const ordinal = rules[rowIndex]?.ordinal ?? '1st';
    const month = rules[rowIndex]?.month ?? 0;
    options = options.map(option => ({
      ...option,
      disabled: isYearlyRuleDuplicate(rules, rowIndex, ordinal, option.value, month)
    }));
  }
  return renderRepeatSelect(type, rowIndex, selectedValue, options, 'Repeat day type', 'day-type');
}

function renderRepeatMonthSelect(selectedMonth, rowIndex, rules) {
  const ordinal = rules[rowIndex]?.ordinal ?? '1st';
  const dayType = rules[rowIndex]?.dayType ?? 'day';
  const options = getRepeatMonthOptions().map(option => ({
    ...option,
    disabled: isYearlyRuleDuplicate(rules, rowIndex, ordinal, dayType, option.value)
  }));
  return renderRepeatSelect('yearly-month', rowIndex, selectedMonth, options, 'Repeat month', 'month');
}

function renderRepeatEditorHtml(task, column, draft) {
  const normalized = normalizeRepeatDraft(draft);
  const isUnchangedSeriesDraft = isRepeatDraftUnchanged(task, normalized);
  const cadenceOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' }
  ];
  const cadenceLabel = cadenceOptions.find(option => option.value === normalized.cadence)?.label || 'Weekly';

  let configHtml = '';
  if (normalized.cadence === 'daily') {
    configHtml = `<div class="repeat-menu__rule-row">Every <input class="repeat-menu__interval-input" type="text" inputmode="numeric" value="${normalized.interval}" data-repeat-interval> days</div>`;
  } else if (normalized.cadence === 'weekly') {
    configHtml = `<div class="repeat-menu__weekly-grid">` + normalized.weeklyDays.map((day, index, allDays) => {
      const canAdd = allDays.length < 7;
      const canRemove = allDays.length > 1;
      return `<div class="repeat-menu__rule-row repeat-menu__rule-row--weekly">`
        + `<div class="repeat-menu__weekly-prefix${index === 0 ? '' : ' repeat-menu__weekly-prefix--secondary'}">`
        + `${index === 0
          ? `Every <input class="repeat-menu__interval-input" type="text" inputmode="numeric" value="${normalized.interval}" data-repeat-interval> weeks on`
          : '<span class="repeat-menu__rule-prefix">and on</span>'}`
        + `</div>`
        + `${renderRepeatDaySelect(day, allDays, index)}`
        + `<div class="repeat-menu__row-actions">`
        + `${canAdd ? `<button class="repeat-menu__icon-btn" type="button" data-repeat-weekly-add="${index}">+</button>` : '<span class="repeat-menu__icon-btn-placeholder" aria-hidden="true"></span>'}`
        + `${canRemove ? `<button class="repeat-menu__icon-btn" type="button" data-repeat-weekly-remove="${index}">−</button>` : '<span class="repeat-menu__icon-btn-placeholder" aria-hidden="true"></span>'}`
        + `</div>`
        + `</div>`;
    }).join('') + `</div>`;
  } else if (normalized.cadence === 'monthly') {
    configHtml = `<div class="repeat-menu__series-grid repeat-menu__series-grid--monthly">` + normalized.monthlyRules.map((rule, index, allRules) => {
      const allowLargeOrdinal = rule.dayType === 'day';
      const canAdd = allRules.length < 31;
      const canRemove = allRules.length > 1;
      return `<div class="repeat-menu__rule-row repeat-menu__rule-row--series">`
        + `<div class="repeat-menu__series-prefix${index === 0 ? '' : ' repeat-menu__series-prefix--secondary'}">`
        + `${index === 0
          ? `Every <input class="repeat-menu__interval-input" type="text" inputmode="numeric" value="${normalized.interval}" data-repeat-interval> months on the`
          : '<span class="repeat-menu__rule-prefix">and on the</span>'}`
        + `</div>`
        + `${renderRepeatOrdinalSelect(rule.ordinal, allowLargeOrdinal, index, 'data-repeat-monthly-ordinal', normalized.monthlyRules)}`
        + `${renderRepeatDayTypeSelect(rule.dayType, index, 'data-repeat-monthly-day-type', normalized.monthlyRules)}`
        + `<div class="repeat-menu__row-actions">`
        + `${canAdd ? `<button class="repeat-menu__icon-btn" type="button" data-repeat-monthly-add="${index}">+</button>` : '<span class="repeat-menu__icon-btn-placeholder" aria-hidden="true"></span>'}`
        + `${canRemove ? `<button class="repeat-menu__icon-btn" type="button" data-repeat-monthly-remove="${index}">−</button>` : '<span class="repeat-menu__icon-btn-placeholder" aria-hidden="true"></span>'}`
        + `</div>`
        + `</div>`;
    }).join('') + `</div>`;
  } else if (normalized.cadence === 'yearly') {
    configHtml = `<div class="repeat-menu__series-grid repeat-menu__series-grid--yearly">` + normalized.yearlyRules.map((rule, index, allRules) => {
      const allowLargeOrdinal = rule.dayType === 'day';
      const canAdd = allRules.length < 31;
      const canRemove = allRules.length > 1;
      return `<div class="repeat-menu__rule-row repeat-menu__rule-row--series">`
        + `<div class="repeat-menu__series-prefix${index === 0 ? '' : ' repeat-menu__series-prefix--secondary'}">`
        + `${index === 0
          ? `Every <input class="repeat-menu__interval-input" type="text" inputmode="numeric" value="${normalized.interval}" data-repeat-interval> years on the`
          : '<span class="repeat-menu__rule-prefix">and on the</span>'}`
        + `</div>`
        + `${renderRepeatOrdinalSelect(rule.ordinal, allowLargeOrdinal, index, 'data-repeat-yearly-ordinal', normalized.yearlyRules)}`
        + `${renderRepeatDayTypeSelect(rule.dayType, index, 'data-repeat-yearly-day-type', normalized.yearlyRules)}`
        + `<div class="repeat-menu__month-group"><span class="repeat-menu__inline-text">in</span>${renderRepeatMonthSelect(rule.month, index, normalized.yearlyRules)}</div>`
        + `<div class="repeat-menu__row-actions">`
        + `${canAdd ? `<button class="repeat-menu__icon-btn" type="button" data-repeat-yearly-add="${index}">+</button>` : '<span class="repeat-menu__icon-btn-placeholder" aria-hidden="true"></span>'}`
        + `${canRemove ? `<button class="repeat-menu__icon-btn" type="button" data-repeat-yearly-remove="${index}">−</button>` : '<span class="repeat-menu__icon-btn-placeholder" aria-hidden="true"></span>'}`
        + `</div>`
        + `</div>`;
    }).join('') + `</div>`;
  }

  const footerActionLabel = isUnchangedSeriesDraft ? 'Back' : 'Save';
  const footerActionVariant = isUnchangedSeriesDraft ? ' repeat-menu__save--secondary' : '';
  const footerAction = isUnchangedSeriesDraft ? 'back' : 'save';

  return `
    <div class="ellipsis-menu repeat-menu repeat-menu--${escapeHtml(normalized.cadence)}" data-ellipsis-menu>
      <div class="sdp__arrow"></div>
      <div class="sdp__section">
        <span class="sdp__section-label">Repeats:</span>
        <div class="repeat-menu__cadence-body">
          ${normalized.showCadenceOptions
            ? `<div class="repeat-menu__cadence-list">${cadenceOptions.map(option => renderRepeatCadenceOption(option, normalized.cadence)).join('')}</div>`
            : `<button class="repeat-menu__cadence-trigger" type="button" data-repeat-toggle-cadence>
              <span>${escapeHtml(cadenceLabel)}</span>
              <i data-lucide="chevron-down" class="repeat-menu__cadence-chevron"></i>
            </button>`}
        </div>
      </div>
      <div class="sdp__divider"></div>
      <div class="sdp__section repeat-menu__rules">
        ${configHtml}
      </div>
      <div class="sdp__divider"></div>
      <div class="sdp__section repeat-menu__footer-section">
        <div class="repeat-menu__footer">
          <button class="repeat-menu__save${footerActionVariant}" type="button" data-repeat-save="${footerAction}">${footerActionLabel}</button>
        </div>
      </div>
    </div>
  `;
}

function renderRepeatSeriesActionsHtml(task) {
  const series = task.repeatSeriesId ? getRepeatSeriesById(task.repeatSeriesId) : null;
  const currentDate = task.repeatOccurrenceDate || task.startDate || series?.anchorStartDate || null;
  const nextDate = series && currentDate ? getRepeatNavigationDate(series, currentDate, 1) : null;
  const isLastSeriesInstance = !!(series && series.untilDate && !nextDate);
  const canExtendSeries = isLastSeriesInstance;
  const canStopSeries = !!(series && !isLastSeriesInstance);
  return `
    <div class="ellipsis-menu repeat-series-menu" data-ellipsis-menu>
      <div class="sdp__arrow"></div>
      <div class="sdp__section">
        <span class="sdp__section-label">Task recurrence:</span>
        ${canStopSeries ? `<button class="sdp__menu-item" type="button" data-repeat-series-action="stop">
          <span class="ellipsis-menu__item-content"><i data-lucide="hand" class="ellipsis-menu__icon"></i><span>Stop repeating</span></span>
        </button>` : ''}
        <button class="sdp__menu-item" type="button" data-repeat-series-action="change">
          <span class="ellipsis-menu__item-content"><i data-lucide="repeat" class="ellipsis-menu__icon"></i><span>Change repeat frequency</span></span>
        </button>
        <button class="sdp__menu-item" type="button" data-repeat-series-action="update-incomplete">
          <span class="ellipsis-menu__item-content"><i data-lucide="files" class="ellipsis-menu__icon"></i><span>Update all incomplete instances to match this task</span></span>
        </button>
        <button class="sdp__menu-item" type="button" data-repeat-series-action="delete-incomplete-stop">
          <span class="ellipsis-menu__item-content"><i data-lucide="trash" class="ellipsis-menu__icon"></i><span>Delete all incomplete instances and stop repeating</span></span>
        </button>
        ${canExtendSeries ? `<button class="sdp__menu-item" type="button" data-repeat-series-action="extend">
          <span class="ellipsis-menu__item-content"><i data-lucide="arrow-right" class="ellipsis-menu__icon"></i><span>Extend series</span></span>
        </button>` : ''}
      </div>
    </div>
  `;
}

function renderRepeatBannerHtml(task) {
  if (!task.isRepeatingTask || !task.repeatSeriesId) return '';
  const series = getRepeatSeriesById(task.repeatSeriesId);
  if (!series) return '';
  const isTrash = !!findTrashEntry(task.id);
  const currentDate = task.repeatOccurrenceDate || task.startDate || series.anchorStartDate;
  const prevDate = getRepeatNavigationDate(series, currentDate, -1);
  const nextDate = getRepeatNavigationDate(series, currentDate, 1);
  const boundaryText = !prevDate && !nextDate
    ? ' This is the first and last instance of this series.'
    : !prevDate
      ? ' This is the first instance of this series.'
      : !nextDate
      ? ' This is the last instance of this series.'
      : '';
  return `<div class="task-modal__trash-banner task-modal__series-banner">`
    + `<div class="task-modal__series-copy${isTrash ? ' task-modal__series-copy--trash' : ''}">`
    + `${isTrash
      ? `<div class="task-modal__series-copy-row task-modal__series-copy-row--trash">
          <span>${escapeHtml(`This task has been deleted (and will be permanently deleted in ${getTrashDaysRemaining(findTrashEntry(task.id))} days).`)}</span>
          <button class="task-modal__trash-link" type="button" data-restore-task>Restore Task</button>
        </div>`
      : ''}`
    + `<div class="task-modal__series-copy-row task-modal__series-copy-row--repeat">
        <span>${escapeHtml(formatRepeatRuleSummary(series) + boundaryText)} </span>
        <button class="task-modal__trash-link" type="button" data-repeat-series-edit>Edit task series</button>
      </div>`
    + `</div>`
    + `<div class="task-modal__series-nav">`
    + `<button class="task-modal__series-nav-btn${!prevDate ? ' task-modal__series-nav-btn--disabled' : ''}" type="button" data-repeat-nav="prev"${!prevDate ? ' disabled' : ''}><i data-lucide="chevron-left"></i><span>Previous</span></button>`
    + `<button class="task-modal__series-nav-btn${!nextDate ? ' task-modal__series-nav-btn--disabled' : ''}" type="button" data-repeat-nav="next"${!nextDate ? ' disabled' : ''}><span>Next</span><i data-lucide="chevron-right"></i></button>`
    + `</div>`
    + `</div>`;
}

function renderTaskDetailModal(task, column, options = {}) {
  ensureTaskTimeState(task);
  const isTrash = options.isTrash === true;
  const isBacklog = options.isBacklog === true;
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
  const backlogHorizon = isBacklog ? getBacklogHorizonConfig(task.backlogHorizon) : null;
  const startLabelHtml = isBacklog && backlogHorizon
    ? `<span class="task-modal__backlog-start"><span class="task-modal__backlog-start-badge" style="background:${escapeHtml(backlogHorizon.color)};">${escapeHtml(backlogHorizon.letter)}</span><span>${escapeHtml(backlogHorizon.shortLabel)}</span></span>`
    : escapeHtml(startLabel);

  const actualTime = formatActualDisplay(task.actualTimeSeconds || 0);
  const actualValueClass = hasActualTime(task.actualTimeSeconds)
    ? 'task-modal__metric-value task-modal__metric-value--set'
    : 'task-modal__metric-value task-modal__metric-value--placeholder';
  const isTaskTimerRunning = focusState.running && focusState.taskId === task.id && !focusState.subtaskId;
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

  const trashBanner = isTrash && !task.isRepeatingTask
    ? `
      <div class="task-modal__trash-banner">
        <span>This task has been deleted (and will be permanently deleted in ${getTrashDaysRemaining(findTrashEntry(task.id))} days).</span>
        <button class="task-modal__trash-link" type="button" data-restore-task>Restore Task</button>
      </div>
    `
    : '';
  const repeatBanner = task.isRepeatingTask ? renderRepeatBannerHtml(task) : '';

  return `
    <div class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <div class="task-modal__header">
        <div class="task-modal__meta-group">
          <span class="task-modal__meta-label">CHANNEL</span>
          <span class="task-modal__channel" data-modal-channel-btn data-rich-tooltip-label="Assign channel" data-rich-tooltip-shortcut-id="assign-channel" data-rich-tooltip-shortcut-groups='[["Q"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
            <span class="task-modal__channel-hash" style="color:${escapeHtml(hashColor)};">#</span>
            <span class="task-modal__channel-word">${escapeHtml(channelWord)}</span>
          </span>
        </div>
        <div class="task-modal__meta-right">
          <div class="task-modal__meta-group task-modal__meta-group--start">
            <span class="task-modal__meta-label">START</span>
            <button class="task-modal__meta-start-btn" type="button" data-rich-tooltip-label="Set start date" data-rich-tooltip-shortcut-id="set-start-date" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">${startLabelHtml}</button>
          </div>
          ${task.dueDate ? `<div class="task-modal__meta-group task-modal__due-wrap">
            <span class="task-modal__meta-label">DUE</span>
            <button class="task-modal__meta-start-btn${task.dueDate < todayISO ? ' task-modal__meta-start-btn--overdue' : ''}" type="button" data-due-btn data-rich-tooltip-label="Set due date" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">${escapeHtml(task.dueDate === todayISO ? 'Today' : formatDateDisplay(task.dueDate))}</button>
          </div>` : ''}
          <div class="task-modal__top-actions">
            ${!task.dueDate ? '<div class="task-modal__due-wrap"><button class="task-modal__top-action" type="button" data-due-btn data-rich-tooltip-label="Set due date" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10"><i data-lucide="calendar"></i><span>Due</span></button></div>' : ''}
            <button class="task-modal__top-action" type="button" data-modal-add-two-subtasks data-rich-tooltip-label="Add subtasks" data-rich-tooltip-shortcut-id="add-subtask" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10"><i data-lucide="plus"></i><span>Subtasks</span></button>
            <div class="ellipsis-menu-wrap"><button class="task-modal__top-action task-modal__top-action--icon" type="button" aria-label="More" data-ellipsis-btn data-rich-tooltip-label="Other actions" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10"><i data-lucide="ellipsis"></i></button></div>
            <button class="task-modal__top-action task-modal__top-action--icon" type="button" aria-label="Expand" data-expand-btn data-rich-tooltip-label="Enter focus mode" data-rich-tooltip-shortcut-id="focus-mode" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10"><i data-lucide="maximize-2"></i></button>
            <button class="task-modal__top-action task-modal__top-action--icon" type="button" aria-label="Close details" data-task-modal-close data-rich-tooltip-label="Close task" data-rich-tooltip-shortcut-groups='[["Esc"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10"><i data-lucide="x"></i></button>
          </div>
        </div>
      </div>

      ${trashBanner}
      ${repeatBanner}
      <div class="task-modal__body">
        <div class="task-modal__hero">
          <div class="task-modal__title-wrap">
            <button class="task-modal__check ${task.complete ? 'task-modal__check--complete' : ''}" type="button" data-modal-check data-rich-tooltip-label="Complete task" data-rich-tooltip-shortcut-id="complete-task" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">${CHECK_SVG}</button>
            <h2 class="task-modal__title" id="task-modal-title" contenteditable="true">${escapeHtml(task.title)}</h2>
          </div>
          <div class="task-modal__hero-right${isBacklog ? ' task-modal__hero-right--backlog' : ''}">
            ${isBacklog ? '' : `<button class="task-modal__start-btn${isTaskTimerRunning ? ' task-modal__start-btn--stop' : ''}" type="button" data-rich-tooltip-label="${isTaskTimerRunning ? 'Stop timer' : 'Start timer'}" data-rich-tooltip-shortcut-groups='[["Space"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
              <i data-lucide="${isTaskTimerRunning ? 'pause' : 'play'}"></i>
              <span>${isTaskTimerRunning ? 'STOP' : 'START'}</span>
            </button>`}
            ${isBacklog ? '' : `<div class="task-modal__metric task-modal__metric--actual" data-actual-btn data-rich-tooltip-label="Set actual time" data-rich-tooltip-shortcut-groups='[["E"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
              <span class="task-modal__metric-label">ACTUAL</span>
              <span class="${actualValueClass}">${actualTime}</span>
            </div>`}
            <div class="task-modal__metric task-modal__metric--planned" data-planned-btn data-rich-tooltip-label="Set planned time" data-rich-tooltip-shortcut-groups='[["W"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10">
              <span class="task-modal__metric-label">PLANNED</span>
              <span class="task-modal__metric-value ${aggregatePlanned ? 'task-modal__metric-value--set' : 'task-modal__metric-value--placeholder'}">${aggregatePlanned ? escapeHtml(plannedTime) : '--:--'}</span>
            </div>
          </div>
        </div>

        ${renderTaskDetailSubtasks(task, { isBacklog })}

        <div class="task-modal__notes-editor" data-task-notes-editor></div>

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
  const maxIsoDate = options.maxIsoDate || null;
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  // Calculate offset based on start-of-week setting
  const weekStartDay = settings.startOfWeek === 'sunday' ? 0 : settings.startOfWeek === 'saturday' ? 6 : 1;
  const dayOfWeek = firstOfMonth.getDay();
  const weekOffset = (dayOfWeek - weekStartDay + 7) % 7;
  const gridStart = new Date(viewYear, viewMonth, 1 - weekOffset, 12);

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
      const isDisabled = (minIsoDate && iso < minIsoDate) || (maxIsoDate && iso > maxIsoDate);
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
          <tr>${(() => {
            const allDays = ['S','M','T','W','T','F','S'];
            const startIdx = weekStartDay;
            return Array.from({length: 7}, (_, i) => `<th>${allDays[(startIdx + i) % 7]}</th>`).join('');
          })()}</tr>
        </thead>
        <tbody>${calendarRows.join('')}</tbody>
      </table>
    </div>
  `;
}

/* ── Start Date Picker Dropdown ─────────────── */

function renderBacklogHorizonOptions(selectedHorizon = null) {
  return BACKLOG_HORIZONS.map(horizon => `
    <button class="sdp__menu-item sdp__backlog-option${selectedHorizon === horizon.id ? ' sdp__backlog-option--selected' : ''}" data-action="select-backlog-horizon" data-backlog-horizon="${escapeHtml(horizon.id)}" type="button">
      <span class="sdp__backlog-option-main">
        <span class="sdp__backlog-badge" style="background:${escapeHtml(horizon.color)};">${escapeHtml(horizon.letter)}</span>
        <span>${escapeHtml(horizon.shortLabel)}</span>
      </span>
      ${selectedHorizon === horizon.id
        ? '<i data-lucide="check" class="sdp__backlog-check"></i>'
        : `<span class="sdp__shortcut-group"><span class="sdp__shortcut">${escapeHtml(horizon.shortcut)}</span></span>`}
    </button>
  `).join('');
}

function renderStartDateDropdown(currentIsoDate, viewYear, viewMonth, options = {}) {
  const mode = options.mode || 'default';
  const selectedBacklogHorizon = options.selectedBacklogHorizon || null;
  const calendarSelectedIsoDate = Object.prototype.hasOwnProperty.call(options, 'calendarSelectedIsoDate')
    ? options.calendarSelectedIsoDate
    : currentIsoDate;
  const backlogOptionsHtml = renderBacklogHorizonOptions(selectedBacklogHorizon);

  if (mode === 'backlog-only') {
    return `
      <div class="start-date-picker" data-sdp>
        <div class="sdp__arrow"></div>
        <div class="sdp__section">
          <span class="sdp__section-label">Move to backlog:</span>
          ${backlogOptionsHtml}
        </div>
      </div>
    `;
  }

  if (mode === 'backlog-with-calendar') {
    return `
      <div class="start-date-picker" data-sdp>
        <div class="sdp__arrow"></div>
        <div class="sdp__section">
          <span class="sdp__section-label">Move to backlog:</span>
          ${backlogOptionsHtml}
        </div>
        <div class="sdp__divider"></div>
        <div class="sdp__section">
          <span class="sdp__section-label">Start date:</span>
          ${renderCalendarGrid(calendarSelectedIsoDate, viewYear, viewMonth)}
        </div>
      </div>
    `;
  }

  return `
    <div class="start-date-picker" data-sdp>
      <div class="sdp__arrow"></div>
      <div class="sdp__section">
        <span class="sdp__section-label">Move:</span>
        <button class="sdp__menu-item" data-action="snooze-day" type="button">
          <span>Snooze one day</span>${renderInlineShortcutForId('snooze-day')}
        </button>
        <button class="sdp__menu-item" data-action="snooze-week" type="button">
          <span>Snooze one week</span>
        </button>
        <button class="sdp__menu-item" data-action="move-backlog" type="button">
          <span>Move to backlog</span>${renderInlineShortcutForId('move-backlog')}
        </button>
        <button class="sdp__menu-item" data-action="move-top-backlog" type="button">
          <span>Move to top of backlog</span>
          ${renderInlineShortcutForId('move-backlog-top')}
        </button>
      </div>
      <div class="sdp__divider"></div>
      <div class="sdp__section">
        <span class="sdp__section-label">Start date:</span>
        ${renderCalendarGrid(calendarSelectedIsoDate, viewYear, viewMonth)}
      </div>
    </div>
  `;
}

function getTaskPickerIsoDate(loc) {
  if (!loc) return getTodayISO();
  return loc.task?.repeatOccurrenceDate || loc.task?.startDate || loc.column?.isoDate || getTodayISO();
}

function getPickerViewStateFromIsoDate(isoDate) {
  const viewDate = parseISO(isoDate || getTodayISO());
  return {
    viewYear: viewDate.getFullYear(),
    viewMonth: viewDate.getMonth()
  };
}

function getBacklogHorizonFromShortcutKey(key) {
  return BACKLOG_HORIZONS.find(horizon => horizon.shortcut === key) || null;
}

function pickerShowsBacklogHorizons(state) {
  return !!state && (state.mode === 'backlog-only' || state.mode === 'backlog-with-calendar');
}

function handleBacklogHorizonPickerShortcut(e) {
  if (!e || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return false;
  const horizon = getBacklogHorizonFromShortcutKey(e.key);
  if (!horizon) return false;

  if (pickerShowsBacklogHorizons(startDatePickerState)) {
    e.preventDefault();
    e.stopPropagation();
    handleStartDateAction('select-backlog-horizon', horizon.id);
    return true;
  }

  if (pickerShowsBacklogHorizons(cardDatePickerState)) {
    e.preventDefault();
    e.stopPropagation();
    handleCardDateAction('select-backlog-horizon', horizon.id);
    return true;
  }

  return false;
}

function renderTopbarTodayDropdown(selectedIsoDate, viewYear, viewMonth) {
  const isDailyPlanning = dailyPlanningState.isActive;
  const isDailyShutdown = dailyShutdownState.isActive;
  const todayISO = getTodayISO();
  const minIsoDate = isDailyPlanning ? todayISO : null;
  const maxIsoDate = isDailyShutdown ? todayISO : null;
  const disablePrev = isDailyPlanning && selectedIsoDate <= todayISO;
  const disableNext = isDailyShutdown && selectedIsoDate === todayISO;
  return `
    <div class="start-date-picker topbar-date-picker" data-topbar-sdp>
      <div class="sdp__arrow"></div>
      <div class="sdp__section">
        <button class="sdp__menu-item" data-action="go-today" type="button">
          <span>Go to today</span>${renderInlineShortcutForId('jump-today')}
        </button>
        <button class="sdp__menu-item" data-action="go-next-day" type="button"${disableNext ? ' disabled' : ''}>
          <span>Go to next day</span>${renderInlineShortcutForId('jump-forward-day')}
        </button>
        <button class="sdp__menu-item" data-action="go-previous-day" type="button"${disablePrev ? ' disabled' : ''}>
          <span>Go to previous day</span>${renderInlineShortcutForId('jump-backward-day')}
        </button>
      </div>
      <div class="sdp__divider"></div>
      <div class="sdp__section">
        ${renderCalendarGrid(selectedIsoDate, viewYear, viewMonth, { minIsoDate, maxIsoDate })}
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
let ellipsisMenuState = null; // { taskId, mode, repeatDraft, repeatOpenDropdown }

function markTaskAsRepeatModified(task) {
  if (!task || !task.repeatSeriesId) return;
  task.repeatModified = true;
  task.isRepeatingTask = true;
}

function openEllipsisMenu(taskId, mode = 'main') {
  const loc = getTaskLocation(taskId);
  if (!loc) return;
  ellipsisMenuState = {
    taskId,
    mode,
    repeatDraft: createRepeatDraftFromTask(loc.task, loc.column),
    repeatOpenDropdown: null
  };
  renderEllipsisMenuInModal();
}

function openRepeatSeriesActionsMenu(taskId) {
  const loc = getTaskLocation(taskId);
  if (!loc) return;
  ellipsisMenuState = {
    taskId,
    mode: 'series-actions',
    repeatDraft: createRepeatDraftFromTask(loc.task, loc.column),
    repeatOpenDropdown: null
  };
  renderEllipsisMenuInModal();
}

function closeEllipsisMenu() {
  ellipsisMenuState = null;
  const existing = document.querySelector('[data-ellipsis-menu]');
  if (existing) existing.remove();
}

function updateCurrentTaskRepeatFlags(task, seriesId, occurrenceDate) {
  task.repeatSeriesId = seriesId || null;
  task.repeatOccurrenceDate = occurrenceDate || null;
  task.repeatModified = false;
  task.isRepeatingTask = !!seriesId;
}

function applyRepeatDropdownSelection(type, rowIndex, rawValue) {
  if (!ellipsisMenuState) return;
  if (type === 'weekly-day') {
    ellipsisMenuState.repeatDraft.weeklyDays[rowIndex] = Number.parseInt(rawValue, 10);
  } else if (type === 'monthly-ordinal') {
    ellipsisMenuState.repeatDraft.monthlyRules[rowIndex].ordinal = rawValue;
    if (ellipsisMenuState.repeatDraft.monthlyRules[rowIndex].dayType !== 'day'
      && !['1st', '2nd', '3rd', '4th', 'Last'].includes(rawValue)) {
      ellipsisMenuState.repeatDraft.monthlyRules[rowIndex].dayType = 'day';
    }
  } else if (type === 'monthly-day-type') {
    const value = normalizeRepeatDayTypeValue(rawValue);
    ellipsisMenuState.repeatDraft.monthlyRules[rowIndex].dayType = value;
    if (value !== 'day' && !['1st', '2nd', '3rd', '4th', 'Last'].includes(ellipsisMenuState.repeatDraft.monthlyRules[rowIndex].ordinal)) {
      ellipsisMenuState.repeatDraft.monthlyRules[rowIndex].ordinal = 'Last';
    }
  } else if (type === 'yearly-ordinal') {
    ellipsisMenuState.repeatDraft.yearlyRules[rowIndex].ordinal = rawValue;
    if (ellipsisMenuState.repeatDraft.yearlyRules[rowIndex].dayType !== 'day'
      && !['1st', '2nd', '3rd', '4th', 'Last'].includes(rawValue)) {
      ellipsisMenuState.repeatDraft.yearlyRules[rowIndex].dayType = 'day';
    }
  } else if (type === 'yearly-day-type') {
    const value = normalizeRepeatDayTypeValue(rawValue);
    ellipsisMenuState.repeatDraft.yearlyRules[rowIndex].dayType = value;
    if (value !== 'day' && !['1st', '2nd', '3rd', '4th', 'Last'].includes(ellipsisMenuState.repeatDraft.yearlyRules[rowIndex].ordinal)) {
      ellipsisMenuState.repeatDraft.yearlyRules[rowIndex].ordinal = 'Last';
    }
  } else if (type === 'yearly-month') {
    ellipsisMenuState.repeatDraft.yearlyRules[rowIndex].month = Number.parseInt(rawValue, 10);
  }
  ellipsisMenuState.repeatOpenDropdown = null;
  renderEllipsisMenuInModal();
}

function saveRepeatDraftForTask(taskId) {
  if (openModalTaskId === taskId) {
    syncOpenModalTaskEdits(taskId);
  }
  const loc = getTaskLocation(taskId);
  if (!loc || !ellipsisMenuState) return;
  const task = loc.task;
  const occurrenceDate = task.repeatOccurrenceDate || task.startDate || loc.column.isoDate || getTodayISO();
  const existingSeries = task.repeatSeriesId ? getRepeatSeriesById(task.repeatSeriesId) : null;
  const nextSeries = normalizeRepeatSeries({
    id: existingSeries?.id || uid(),
    status: 'active',
    timezone: settings.timezone,
    anchorStartDate: existingSeries?.anchorStartDate || occurrenceDate,
    untilDate: existingSeries?.untilDate || null,
    skippedOccurrences: existingSeries?.skippedOccurrences || [],
    cadence: ellipsisMenuState.repeatDraft.cadence,
    interval: ellipsisMenuState.repeatDraft.interval,
    weeklyDays: ellipsisMenuState.repeatDraft.weeklyDays,
    monthlyRules: ellipsisMenuState.repeatDraft.monthlyRules,
    yearlyRules: ellipsisMenuState.repeatDraft.yearlyRules,
    templateTask: createRepeatTemplateFromTask(task)
  });

  updateCurrentTaskRepeatFlags(task, nextSeries.id, occurrenceDate);
  persistRepeatSeries(nextSeries);
  const shouldPersistCurrentTask = !isDerivedRepeatTask(task)
    || !existingSeries
    || task.repeatModified
    || task.complete
    || repeatSeriesMatchesDate(nextSeries, occurrenceDate);
  if (shouldPersistCurrentTask) persistTask(task, 0);
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  refreshSearchPanelIfVisible();
  closeEllipsisMenu();
  rerenderOpenTaskDetailModal();
}

function stopRepeatingForTask(taskId, options = {}) {
  const loc = getTaskLocation(taskId);
  if (!loc || !loc.task.repeatSeriesId) return;
  const task = loc.task;
  const series = getRepeatSeriesById(task.repeatSeriesId);
  if (series) {
    const currentDate = task.repeatOccurrenceDate || task.startDate || loc.column?.isoDate || getTodayISO();
    persistRepeatSeries({ ...series, untilDate: currentDate, status: 'active' });
  }
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  refreshSearchPanelIfVisible();
  if (!options.skipModalRerender) rerenderOpenTaskDetailModal();
}

function extendRepeatSeriesForTask(taskId) {
  const loc = getTaskLocation(taskId);
  if (!loc || !loc.task.repeatSeriesId) return;
  const series = getRepeatSeriesById(loc.task.repeatSeriesId);
  if (!series || !series.untilDate) return;
  persistRepeatSeries({ ...series, untilDate: null, status: 'active' });
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  refreshSearchPanelIfVisible();
  rerenderOpenTaskDetailModal();
}

function updateIncompleteRepeatInstancesToMatchTask(taskId) {
  if (openModalTaskId === taskId) {
    syncOpenModalTaskEdits(taskId);
  }
  const loc = getTaskLocation(taskId);
  if (!loc || !loc.task.repeatSeriesId) return;
  const series = getRepeatSeriesById(loc.task.repeatSeriesId);
  if (!series) return;
  const templateTask = createRepeatTemplateFromTask(loc.task);
  persistRepeatSeries({ ...series, templateTask });
  const applyTemplate = task => {
    if (!task || task.complete || task.repeatSeriesId !== series.id) return;
    task.title = templateTask.title;
    task.notes = templateTask.notes;
    task.tag = templateTask.tag;
    task.integrationColor = templateTask.integrationColor;
    task.timeEstimateMinutes = templateTask.timeEstimateMinutes;
    task.subtasks = templateTask.subtasks.map(subtask => ({ ...subtask, id: subtask.id || uid() }));
    task.showSubtasks = task.subtasks.length > 0;
    syncTaskAggregateTimes(task);
    persistTask(task, 0);
  };
  state.columns.forEach(column => column.tasks.forEach(applyTemplate));
  state.backlog.forEach(applyTemplate);
  state.archive.forEach(applyTemplate);
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  renderBacklogPanel();
  renderArchivePanel();
  refreshSearchPanelIfVisible();
  rerenderOpenTaskDetailModal();
}

function deleteIncompleteRepeatInstancesAndStop(taskId) {
  const loc = getTaskLocation(taskId);
  if (!loc || !loc.task.repeatSeriesId) return;
  const seriesId = loc.task.repeatSeriesId;

  state.columns.forEach(column => {
    const removed = column.tasks.filter(task => task.repeatSeriesId === seriesId && !task.complete);
    if (removed.length > 0) {
      column.tasks = column.tasks.filter(task => !(task.repeatSeriesId === seriesId && !task.complete));
      removed.forEach(task => persistDeleteTask(task.id));
    }
  });

  state.backlog = state.backlog.filter(task => {
    const shouldRemove = task.repeatSeriesId === seriesId && !task.complete;
    if (shouldRemove) persistDeleteTask(task.id);
    return !shouldRemove;
  });

  state.archive = state.archive.filter(task => {
    const shouldRemove = task.repeatSeriesId === seriesId && !task.complete;
    if (shouldRemove) persistDeleteTask(task.id);
    return !shouldRemove;
  });

  const series = getRepeatSeriesById(seriesId);
  if (series) persistRepeatSeries({ ...series, status: 'stopped' });
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  renderBacklogPanel();
  renderArchivePanel();
  refreshSearchPanelIfVisible();
  closeEllipsisMenu();
  closeTaskDetailModal();
}

function openAdjacentRepeatOccurrence(taskId, direction) {
  const loc = getTaskLocation(taskId);
  if (!loc || !loc.task.repeatSeriesId) return;
  const series = getRepeatSeriesById(loc.task.repeatSeriesId);
  if (!series) return;
  const currentDate = loc.task.repeatOccurrenceDate || loc.task.startDate || loc.column.isoDate || getTodayISO();
  const nextDate = getRepeatNavigationDate(series, currentDate, direction);
  if (!nextDate) return;
  repeatRuntimeState.pinnedOccurrenceKeys.add(`${series.id}:${nextDate}`);
  ensureDateIsVisibleInWindow(nextDate);
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  openTaskDetailModal(getRepeatTaskIdForOccurrence(series.id, nextDate));
}

function renderEllipsisMenuInModal() {
  if (!ellipsisMenuState) return;

  const existing = document.querySelector('[data-ellipsis-menu]');
  if (existing) existing.remove();

  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return;
  const wrap = overlay.querySelector('.ellipsis-menu-wrap');
  if (!wrap) return;

  const loc = getTaskLocation(ellipsisMenuState.taskId);
  if (!loc) return;
  const isTrashed = loc.location === 'trash';
  let html = '';

  if (ellipsisMenuState.mode === 'repeat') {
    html = renderRepeatEditorHtml(loc.task, loc.column, ellipsisMenuState.repeatDraft);
  } else if (ellipsisMenuState.mode === 'series-actions' && loc.task.repeatSeriesId) {
    html = renderRepeatSeriesActionsHtml(loc.task);
  } else if (isTrashed) {
    html = `
      <div class="ellipsis-menu" data-ellipsis-menu>
        <div class="sdp__arrow"></div>
        <div class="sdp__section">
          <span class="sdp__section-label">Other actions:</span>
          <button class="sdp__menu-item" data-action="restore-task" type="button">
            <span class="ellipsis-menu__item-content">
              <i data-lucide="undo" class="ellipsis-menu__icon"></i>
              <span>Restore Task</span>
            </span>
          </button>
        </div>
      </div>
    `;
  } else {
    const repeatActionLabel = loc.task.repeatSeriesId ? 'Edit task series' : 'Repeat';
    const repeatAction = loc.task.repeatSeriesId ? 'open-repeat-series-menu' : 'open-repeat-menu';
    html = `
      <div class="ellipsis-menu" data-ellipsis-menu>
        <div class="sdp__arrow"></div>
        <div class="sdp__section">
          <span class="sdp__section-label">Other actions:</span>
          <button class="sdp__menu-item" data-action="${repeatAction}" type="button">
            <span class="ellipsis-menu__item-content">
              <i data-lucide="repeat" class="ellipsis-menu__icon"></i>
              <span>${repeatActionLabel}</span>
            </span>
          </button>
          <button class="sdp__menu-item" data-action="duplicate-task" type="button">
            <span class="ellipsis-menu__item-content">
              <i data-lucide="files" class="ellipsis-menu__icon"></i>
              <span>Duplicate</span>
            </span>
            ${renderInlineShortcutForId('duplicate-task')}
          </button>
          <button class="sdp__menu-item" data-action="delete-task" type="button">
            <span class="ellipsis-menu__item-content">
              <i data-lucide="trash" class="ellipsis-menu__icon"></i>
              <span>Delete</span>
            </span>
            ${renderInlineShortcutForId('delete-task')}
          </button>
        </div>
      </div>
    `;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const dropdown = wrapper.firstElementChild;
  wrap.appendChild(dropdown);

  if (typeof lucide !== 'undefined') lucide.createIcons();
  const intervalInput = dropdown.querySelector('[data-repeat-interval]');
  if (ellipsisMenuState.mode === 'repeat' && ellipsisMenuState.repeatDraft.cadence === 'daily' && intervalInput) {
    requestAnimationFrame(() => {
      intervalInput.focus();
      intervalInput.select();
    });
  }
}

/* ── Duplicate & Delete Handlers ─────────────── */

function handleDuplicateTask(taskId) {
  const loc = getTaskLocation(taskId);
  if (!loc || loc.location === 'trash') return;
  const task = loc.task;
  ensureTaskTimeState(task);

  const todayISO = getTodayISO();
  const newTask = {
    id: uid(),
    title: task.title,
    timeEstimateMinutes: task.timeEstimateMinutes || 0,
    actualTimeSeconds: 0,
    ownPlannedMinutes: task.ownPlannedMinutes || 0,
    ownActualTimeSeconds: 0,
    scheduledTime: null,
    complete: false,
    tag: task.tag || null,
    integrationColor: task.integrationColor || null,
    subtasks: (task.subtasks || []).map(st => ({
      id: uid(),
      label: st.label,
      done: false,
      plannedMinutes: st.plannedMinutes || 0,
      actualTimeSeconds: 0
    })),
    showSubtasks: (task.subtasks || []).length > 0,
    startDate: task.startDate || null,
    dueDate: task.dueDate || null,
    dailyActualTime: {},
    subtaskCompletionsByDate: {},
    completedOnDate: null,
    completedAt: null,
    notes: task.notes || ''
  };

  if (loc.location === 'backlog') {
    insertTaskIntoBacklog(newTask, task.backlogHorizon || 'week', 0);
    closeEllipsisMenu();
    closeTaskDetailModal();
    renderBacklogPanel();
    persistTask(newTask, 0);
    showToast('Duplicated', 'dark');
  } else {
    // Determine target column
    const startDate = newTask.startDate;
    let targetCol;
    if (!startDate || startDate <= todayISO) {
      targetCol = ensureColumnForDate(todayISO);
    } else {
      targetCol = ensureColumnForDate(startDate);
    }

    targetCol.tasks.unshift(newTask);
    closeEllipsisMenu();
    closeTaskDetailModal();
    renderColumn(targetCol);
    if (loc.column.id !== targetCol.id) {
      renderColumn(loc.column);
    }
    persistTask(newTask, 0);
    showToast('Duplicated', 'dark');
  }
}

function handleDeleteTask(taskId) {
  let loc = getTaskLocation(taskId);
  if (!loc || loc.location === 'trash') return;
  if (loc.location === 'column' && loc.index === -1 && isDerivedRepeatTask(loc.task)) {
    materializeDerivedTask(loc.task);
    loc = getTaskLocation(taskId);
    if (!loc) return;
  }

  const task = loc.task;
  const repeatSeries = task.repeatSeriesId ? getRepeatSeriesById(task.repeatSeriesId) : null;
  const sourceIsoDate = loc.location === 'backlog'
    ? getBacklogSourceIsoDate(task)
    : (loc.location === 'archive' ? getArchiveSourceIsoDate(task) : loc.column.isoDate);
  const sourceColumnId = loc.location === 'backlog'
    ? 'backlog'
    : (loc.location === 'archive' ? 'archive' : loc.column.id);

  if (loc.location === 'backlog') {
    removeTaskFromBacklog(taskId);
  } else if (loc.location === 'archive') {
    removeTaskFromArchive(taskId);
    task.archivedAt = null;
    task.archiveSourceDate = null;
  } else {
    loc.column.tasks.splice(loc.index, 1);
  }

  // Remove all associated calendar events
  const removedCalEventsForDelete = state.calendarEvents.filter(e => e.taskId === taskId);
  state.calendarEvents = state.calendarEvents.filter(e => e.taskId !== taskId);

  // Add to trash
  state.trash.push({
    task,
    deletedFrom: { columnId: sourceColumnId, isoDate: sourceIsoDate },
    repeatSkipFingerprint: repeatSeries ? getRepeatRuleFingerprint(repeatSeries) : null,
    deletedAt: new Date().toISOString()
  });

  closeEllipsisMenu();
  closeTaskDetailModal();
  if (loc.location === 'backlog') renderBacklogPanel();
  else if (loc.location === 'archive') renderArchivePanel();
  else renderColumn(loc.column);
  renderCalendarEvents();
  renderTrashPanel();
  persistDeleteTask(taskId);
  persistTrashEntry(state.trash[state.trash.length - 1]);
  removedCalEventsForDelete.forEach(ev => persistDeleteCalendarEvent(ev.id));
  reconcileVisibleRepeatTasks();
  renderAllColumns();
  showToast('Deleted', 'dark');
}

function restoreTaskFromTrash(taskId, options = {}) {
  const restored = restoreTrashTask(taskId, options);
  if (!restored) return;
  renderColumn(restored.column);
  renderCalendarEvents();
  renderTrashPanel();
  persistTask(restored.task, 0);
  persistRemoveFromTrash(taskId);
}

function openStartDatePicker(taskId) {
  closeDueDatePicker();
  const loc = getTaskLocation(taskId);
  if (!loc) return;
  const pickerIsoDate = getTaskPickerIsoDate(loc);
  const { viewYear, viewMonth } = getPickerViewStateFromIsoDate(pickerIsoDate);
  startDatePickerState = {
    taskId,
    viewYear,
    viewMonth,
    mode: loc.location === 'backlog' ? 'backlog-with-calendar' : 'default'
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
  const loc = getTaskLocation(startDatePickerState.taskId);
  if (!loc) return;

  const currentIsoDate = getTaskPickerIsoDate(loc);
  const calendarSelectedIsoDate = loc.location === 'backlog'
    ? null
    : currentIsoDate;

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
    startDatePickerState.viewMonth,
    {
      mode: startDatePickerState.mode,
      selectedBacklogHorizon: loc.location === 'backlog' ? loc.task.backlogHorizon : null,
      calendarSelectedIsoDate
    }
  );
  const dropdown = wrapper.firstElementChild;
  metaGroup.appendChild(dropdown);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function handleStartDateAction(action, data) {
  if (!startDatePickerState) return;
  const taskId = startDatePickerState.taskId;
  const loc = getTaskLocation(taskId);
  if (!loc) return;

  const currentIsoDate = getTaskPickerIsoDate(loc);
  let targetDate = null;

  switch (action) {
    case 'snooze-day':
      targetDate = addDays(currentIsoDate, 1);
      break;
    case 'snooze-week':
      targetDate = addDays(currentIsoDate, 7);
      break;
    case 'move-backlog':
      startDatePickerState.mode = 'backlog-only';
      renderStartDatePickerInModal();
      return;
    case 'move-top-backlog':
      moveTaskToBacklog(taskId, 'week', { insertIndex: 0 });
      if (openModalTaskId === taskId) openTaskDetailModal(taskId);
      closeStartDatePicker();
      return;
    case 'select-backlog-horizon':
      moveTaskToBacklog(taskId, data, { insertIndex: 0 });
      if (openModalTaskId === taskId) openTaskDetailModal(taskId);
      closeStartDatePicker();
      return;
    case 'select-date':
      targetDate = data;
      break;
    default:
      break;
  }

  if (targetDate) {
    if (loc.location === 'trash') {
      const restored = restoreTrashTask(taskId, { targetIsoDate: targetDate, applyDropRules: true });
      if (restored) {
        renderColumn(restored.column);
        renderCalendarEvents();
        renderTrashPanel();
        persistTask(restored.task, 0);
        persistRemoveFromTrash(taskId);
        openTaskDetailModal(taskId);
      }
    } else if (loc.location === 'archive') {
      const restored = restoreArchiveTask(taskId, { targetIsoDate: targetDate, applyDropRules: true });
      if (restored) {
        renderColumn(restored.column);
        renderCalendarEvents();
        renderArchivePanel();
        persistTask(restored.task, 0);
        openTaskDetailModal(taskId);
      }
    } else if (loc.location === 'backlog') {
      const restored = restoreBacklogTask(taskId, { targetIsoDate: targetDate, applyDropRules: true });
      if (restored) {
        renderColumn(restored.column);
        renderCalendarEvents();
        renderBacklogPanel();
        persistTask(restored.task, 0);
        openTaskDetailModal(taskId);
      }
    } else {
      moveTaskToDate(taskId, targetDate);
      openTaskDetailModal(taskId);
    }
  }

  closeStartDatePicker();
}

/* ── Card-Level Start Date Picker (hover icon) ─ */

let cardDatePickerState = null; // { taskId, viewYear, viewMonth, anchorCard }

function openCardDatePicker(taskId, anchorCard = null) {
  closeChannelPicker();
  closeCardDatePicker();
  const loc = getTaskLocation(taskId);
  if (!loc) return;
  const pickerIsoDate = getTaskPickerIsoDate(loc);
  const { viewYear, viewMonth } = getPickerViewStateFromIsoDate(pickerIsoDate);
  cardDatePickerState = {
    taskId,
    viewYear,
    viewMonth,
    anchorCard,
    mode: loc.location === 'backlog' ? 'backlog-with-calendar' : 'default'
  };
  // Keep hover icons visible while picker is open
  const card = (anchorCard && anchorCard.isConnected)
    ? anchorCard
    : document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (card) card.classList.add('task-card--picker-open');
  setActiveTaskSelection(taskId, 'keyboard', loc.column?.isoDate || null);
  renderCardDatePicker();
}

function closeCardDatePicker() {
  if (cardDatePickerState) {
    const card = (cardDatePickerState.anchorCard && cardDatePickerState.anchorCard.isConnected)
      ? cardDatePickerState.anchorCard
      : document.querySelector(`.task-card[data-task-id="${cardDatePickerState.taskId}"]`);
    if (card) card.classList.remove('task-card--picker-open');
  }
  cardDatePickerState = null;
  const existing = document.querySelector('[data-card-sdp]');
  if (existing) existing.remove();
}

function renderCardDatePicker() {
  if (!cardDatePickerState) return;
  const loc = getTaskLocation(cardDatePickerState.taskId);
  if (!loc) return;

  const existing = document.querySelector('[data-card-sdp]');
  if (existing) existing.remove();

  const currentIsoDate = getTaskPickerIsoDate(loc);
  const calendarSelectedIsoDate = loc.location === 'backlog'
    ? null
    : currentIsoDate;

  const card = (cardDatePickerState.anchorCard && cardDatePickerState.anchorCard.isConnected)
    ? cardDatePickerState.anchorCard
    : document.querySelector(`.task-card[data-task-id="${cardDatePickerState.taskId}"]`);
  if (!card) return;

  const dateBtn = card.querySelector('[data-card-date-btn]');
  if (!dateBtn) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderStartDateDropdown(
    currentIsoDate,
    cardDatePickerState.viewYear,
    cardDatePickerState.viewMonth,
    {
      mode: cardDatePickerState.mode,
      selectedBacklogHorizon: loc.location === 'backlog' ? loc.task.backlogHorizon : null,
      calendarSelectedIsoDate
    }
  );
  const dropdown = wrapper.firstElementChild;
  dropdown.setAttribute('data-card-sdp', '');
  const usePortal = cardUsesPortal(card);

  // Position absolutely from the footer so it overlays without pushing the timer area
  const footer = card.querySelector('.task-card__footer');
  if (!footer) return;
  const ddWidth = 240; // dropdown width from CSS

  if (usePortal) {
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '7000';
    dropdown.style.width = ddWidth + 'px';
    dropdown.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15), 0 1px 4px rgba(0, 0, 0, 0.1)';
    document.body.appendChild(dropdown);

    requestAnimationFrame(() => {
      const btnRect = dateBtn.getBoundingClientRect();
      const left = btnRect.left + (btnRect.width / 2) - (ddWidth / 2);
      const clampedLeft = Math.max(12, Math.min(left, window.innerWidth - ddWidth - 12));
      dropdown.style.left = clampedLeft + 'px';
      dropdown.style.top = (btnRect.bottom + 12) + 'px';

      const arrow = dropdown.querySelector('.sdp__arrow');
      if (arrow) {
        const ddRect = dropdown.getBoundingClientRect();
        const arrowLeft = btnRect.left + btnRect.width / 2 - ddRect.left - 6;
        arrow.style.left = Math.max(8, arrowLeft) + 'px';
      }
    });
  } else {
    footer.style.position = 'relative';

    dropdown.style.position = 'absolute';
    dropdown.style.top = '100%';
    dropdown.style.marginTop = '12px';
    dropdown.style.zIndex = '6000';
    dropdown.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15), 0 1px 4px rgba(0, 0, 0, 0.1)';

    // Center the dropdown under the card
    const cardWidth = card.offsetWidth;
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
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Scroll the column so the dropdown is fully visible
  if (!usePortal) {
    requestAnimationFrame(() => {
      const ddRect = dropdown.getBoundingClientRect();
      const scroller = getScrollableTaskAncestor(card, 'y');
      if (scroller) {
        const scrollerRect = scroller.getBoundingClientRect();
        if (ddRect.bottom > scrollerRect.bottom) {
          scroller.scrollTop += ddRect.bottom - scrollerRect.bottom + 8;
        }
      }
    });
  }
}

function handleCardDateAction(action, data) {
  if (!cardDatePickerState) return;
  const taskId = cardDatePickerState.taskId;
  const loc = getTaskLocation(taskId);
  if (!loc) return;

  const currentIsoDate = getTaskPickerIsoDate(loc);
  let targetDate = null;

  switch (action) {
    case 'snooze-day':
      targetDate = addDays(currentIsoDate, 1);
      break;
    case 'snooze-week':
      targetDate = addDays(currentIsoDate, 7);
      break;
    case 'move-backlog':
      cardDatePickerState.mode = 'backlog-only';
      renderCardDatePicker();
      return;
    case 'move-top-backlog':
      moveTaskToBacklog(taskId, 'week', { insertIndex: 0 });
      closeCardDatePicker();
      return;
    case 'select-backlog-horizon':
      moveTaskToBacklog(taskId, data, { insertIndex: 0 });
      closeCardDatePicker();
      return;
    case 'select-date':
      targetDate = data;
      break;
    default:
      break;
  }

  if (targetDate) {
    if (loc.location === 'trash') {
      const restored = restoreTrashTask(taskId, { targetIsoDate: targetDate, applyDropRules: true });
      if (restored) {
        renderColumn(restored.column);
        renderCalendarEvents();
        renderTrashPanel();
        persistTask(restored.task, 0);
        persistRemoveFromTrash(taskId);
      }
    } else if (loc.location === 'archive') {
      const restored = restoreArchiveTask(taskId, { targetIsoDate: targetDate, applyDropRules: true });
      if (restored) {
        renderColumn(restored.column);
        renderCalendarEvents();
        renderArchivePanel();
        persistTask(restored.task, 0);
      }
    } else if (loc.location === 'backlog') {
      const restored = restoreBacklogTask(taskId, { targetIsoDate: targetDate, applyDropRules: true });
      if (restored) {
        renderColumn(restored.column);
        renderCalendarEvents();
        renderBacklogPanel();
        persistTask(restored.task, 0);
      }
    } else {
      moveTaskToDate(taskId, targetDate);
    }
  }

  closeCardDatePicker();
}

/* ── Channel Picker ─────────────────────────── */

let channelPickerState = null; // { taskId, highlightIndex, anchorCard }

function cardUsesPortal(card) {
  return !!(card && (card.dataset.trashCard === 'true' || card.dataset.backlogCard === 'true' || card.dataset.archiveCard === 'true'));
}

function openChannelPicker(taskId, anchorCard = null) {
  closeCardDatePicker();
  closeCardPicker();
  if (!getTaskLocation(taskId)) return;
  if (channelPickerState && channelPickerState.taskId === taskId) {
    closeChannelPicker();
    return;
  }
  closeChannelPicker();
  const card = resolveAnchoredTaskCard(taskId, anchorCard);
  channelPickerState = { taskId, highlightIndex: 0, anchorCard: card };

  if (card) card.classList.add('task-card--picker-open');

  renderChannelPicker();
}

function closeChannelPicker() {
  if (channelPickerState) {
    document.querySelectorAll(`.task-card[data-task-id="${channelPickerState.taskId}"]`).forEach(card => {
      card.classList.remove('task-card--picker-open');
    });
  }
  channelPickerState = null;
  const existing = document.querySelector('[data-channel-picker]');
  if (existing) existing.remove();
}

function getFilteredChannels(query) {
  const enabled = CHANNELS.filter(ch => ch.id === 'unassigned' || ch.isContext || settings.channelEnabled[ch.id] !== false);
  if (!query) return enabled;
  const q = query.toLowerCase();
  return enabled.filter(ch => ch.label.toLowerCase().includes(q));
}

function getSearchChannelOptions() {
  const options = [{ id: 'all', label: 'all', hashColor: '#787878', isAll: true }];
  const enabledChannels = CHANNELS.filter(ch => ch.id === 'unassigned' || ch.isContext || settings.channelEnabled[ch.id] !== false);
  const contexts = enabledChannels.filter(ch => ch.isContext);
  const uncategorized = enabledChannels.filter(ch => !ch.isContext && !ch.context && ch.id !== 'unassigned');
  const unassigned = enabledChannels.find(ch => ch.id === 'unassigned');

  contexts.forEach(ctx => {
    options.push(ctx);
    CHANNELS
      .filter(ch => !ch.isContext && ch.context === ctx.label && settings.channelEnabled[ch.id] !== false)
      .forEach(ch => options.push(ch));
  });

  uncategorized.forEach(ch => options.push(ch));
  if (unassigned) options.push(unassigned);
  return options;
}

function renderChannelOptionListHTML(options, config = {}) {
  const {
    selectedId = null,
    highlightIndex = -1,
    itemIdAttr = 'data-channel-id',
    itemIndexAttr = 'data-channel-idx'
  } = config;

  return options.map((ch, i) => {
    const isSelected = ch.id === selectedId;
    const nested = ch.context ? ' channel-picker__item--nested' : '';
    const selected = isSelected ? ' channel-picker__item--selected' : '';
    const highlighted = highlightIndex === i ? ' channel-picker__item--highlighted' : '';
    const checkmark = isSelected ? '<span class="channel-picker__check">\u2713</span>' : '';
    return `<div class="channel-picker__item${nested}${selected}${highlighted}" ${itemIdAttr}="${escapeHtml(ch.id)}" ${itemIndexAttr}="${i}">` +
      `<span class="channel-picker__hash" style="color:${escapeHtml(ch.hashColor)};">#</span>` +
      `<span class="channel-picker__label">${escapeHtml(ch.label)}</span>${checkmark}</div>`;
  }).join('');
}

function renderChannelListHTML(filtered, currentTag) {
  const normalizedCurrent = normalizeTag(currentTag);
  const selectedOption = filtered.find(ch => (
    ch.id === 'unassigned'
      ? !currentTag
      : normalizedCurrent === '#' + ch.label
  ));
  return renderChannelOptionListHTML(filtered, {
    selectedId: selectedOption ? selectedOption.id : null,
    highlightIndex: channelPickerState ? channelPickerState.highlightIndex : -1,
    itemIdAttr: 'data-channel-id',
    itemIndexAttr: 'data-channel-idx'
  });
}

function renderChannelPicker() {
  if (!channelPickerState) return;
  const taskId = channelPickerState.taskId;
  const loc = getTaskLocation(taskId);
  if (!loc) return;

  const existing = document.querySelector('[data-channel-picker]');
  if (existing) existing.remove();

  const card = resolveAnchoredTaskCard(taskId, channelPickerState.anchorCard);
  if (!card) return;
  channelPickerState.anchorCard = card;

  const footer = card.querySelector('.task-card__footer');
  if (!footer) return;
  const usePortal = cardUsesPortal(card);

  const filtered = getFilteredChannels('');
  const listHTML = renderChannelListHTML(filtered, loc.task.tag);

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

  const tagBtn = card.querySelector('[data-channel-btn]');
  const ddWidth = 220;

  if (usePortal) {
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '7000';
    dropdown.style.width = ddWidth + 'px';
    document.body.appendChild(dropdown);

    requestAnimationFrame(() => {
      const tagRect = tagBtn ? tagBtn.getBoundingClientRect() : null;
      if (tagRect) {
        const left = tagRect.left + tagRect.width / 2 - ddWidth / 2;
        const clampedLeft = Math.max(12, Math.min(left, window.innerWidth - ddWidth - 12));
        dropdown.style.left = clampedLeft + 'px';
        dropdown.style.top = (tagRect.bottom + 12) + 'px';

        const arrow = dropdown.querySelector('.channel-picker__arrow');
        if (arrow) {
          const ddRect = dropdown.getBoundingClientRect();
          const arrowLeft = tagRect.left + tagRect.width / 2 - ddRect.left - 6;
          arrow.style.left = arrowLeft + 'px';
        }
      }
    });
  } else {
    footer.style.position = 'relative';
    footer.appendChild(dropdown);

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
      const scroller = getScrollableTaskAncestor(card, 'y');
      if (scroller) {
        const scrollerRect = scroller.getBoundingClientRect();
        if (ddRect.bottom > scrollerRect.bottom) {
          scroller.scrollTop += ddRect.bottom - scrollerRect.bottom + 8;
        }
      }
    });
  }

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
    const loc = getTaskLocation(taskId);
    if (!loc) return;
    const filtered = getFilteredChannels(query);
    channelPickerState.highlightIndex = 0;
    const list = dropdown.querySelector('.channel-picker__list');
    if (list) list.innerHTML = renderChannelListHTML(filtered, loc.task.tag);
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
  const loc = getTaskLocation(taskId);
  if (!loc) { closeChannelPicker(); return; }

  if (channel.id === 'unassigned') {
    loc.task.tag = null;
  } else {
    loc.task.tag = '#' + channel.label;
  }
  markTaskAsRepeatModified(loc.task);

  closeChannelPicker();
  renderTaskLocation(loc);
  renderCalendarEvents();
  persistTask(loc.task, 0);

  // Update modal if open for this task
  if (openModalTaskId === taskId) {
    const overlay = document.querySelector('.task-modal-overlay');
    if (overlay) {
      const channelEl = overlay.querySelector('.task-modal__channel');
      if (channelEl) {
        const style = getChannelStyle(loc.task.tag);
        const hashColor = style ? style.hashColor : '#7da2ff';
        const word = loc.task.tag ? loc.task.tag.replace(/^#/, '') : 'Unassigned';
        channelEl.innerHTML =
          `<span class="task-modal__channel-hash" style="color:${hashColor};">#</span>` +
          `<span class="task-modal__channel-word">${escapeHtml(word)}</span>`;
      }
    }
  }

  // Re-initialize icons for re-rendered card
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ── Backlog Filter Picker ──────────────────── */

let backlogFilterPickerState = null;

function closeBacklogFilterPicker() {
  backlogFilterPickerState = null;
  const existing = document.querySelector('[data-backlog-filter-picker]');
  if (existing) existing.remove();
}

function renderBacklogFilterListHTML(options, selectedId) {
  return options.map((opt, index) => {
    const isSelected = opt.id === selectedId;
    const nested = opt.context ? ' channel-picker__item--nested' : '';
    const selected = isSelected ? ' channel-picker__item--selected' : '';
    const highlighted = backlogFilterPickerState && backlogFilterPickerState.highlightIndex === index
      ? ' channel-picker__item--highlighted'
      : '';
    const checkmark = isSelected ? '<span class="channel-picker__check">\u2713</span>' : '';
    return `<div class="channel-picker__item${nested}${selected}${highlighted}" data-backlog-filter-id="${escapeHtml(opt.id)}" data-backlog-filter-idx="${index}">`
      + `<span class="channel-picker__hash" style="color:${escapeHtml(opt.hashColor)};">#</span>`
      + `<span class="channel-picker__label">${escapeHtml(opt.label)}</span>${checkmark}</div>`;
  }).join('');
}

function openBacklogFilterPicker() {
  if (backlogFilterPickerState) {
    closeBacklogFilterPicker();
    return;
  }
  backlogFilterPickerState = { filterId: getSharedHomeTodayFilterId(), highlightIndex: 0 };
  renderBacklogFilterPicker();
}

function renderBacklogFilterPicker() {
  if (!backlogFilterPickerState) return;
  closeBacklogFilterPicker();
  backlogFilterPickerState = { filterId: getSharedHomeTodayFilterId(), highlightIndex: 0 };

  const panel = document.querySelector('[data-right-panel="backlog"]');
  const button = panel ? panel.querySelector('[data-backlog-filter-btn]') : null;
  if (!panel || !button) return;

  const options = getBacklogFilterOptions('');
  const dropdown = document.createElement('div');
  dropdown.className = 'channel-picker';
  dropdown.setAttribute('data-backlog-filter-picker', '');
  dropdown.innerHTML =
    `<div class="channel-picker__arrow"></div>` +
    `<div class="channel-picker__header">Filter backlog:</div>` +
    `<input class="channel-picker__search" placeholder="Search..." type="text">` +
    `<div class="channel-picker__list">${renderBacklogFilterListHTML(options, getSharedHomeTodayFilterId())}</div>`;

  dropdown.style.position = 'absolute';
  dropdown.style.zIndex = '7000';
  dropdown.style.width = '220px';
  panel.appendChild(dropdown);

  requestAnimationFrame(() => {
    const btnRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let left = btnRect.left - panelRect.left;
    left = Math.max(8, Math.min(left, panelRect.width - 232));
    dropdown.style.left = `${left}px`;
    dropdown.style.top = `${btnRect.bottom - panelRect.top + 12}px`;

    const arrow = dropdown.querySelector('.channel-picker__arrow');
    if (arrow) {
      const ddRect = dropdown.getBoundingClientRect();
      const arrowLeft = btnRect.left + btnRect.width / 2 - ddRect.left - 6;
      arrow.style.left = `${Math.max(8, arrowLeft)}px`;
    }
  });

  const searchInput = dropdown.querySelector('.channel-picker__search');
  const list = dropdown.querySelector('.channel-picker__list');
  if (searchInput && list) {
    requestAnimationFrame(() => searchInput.focus());
    searchInput.addEventListener('input', () => {
      if (!backlogFilterPickerState) return;
        backlogFilterPickerState.highlightIndex = 0;
        list.innerHTML = renderBacklogFilterListHTML(
          getBacklogFilterOptions(searchInput.value),
          getSharedHomeTodayFilterId()
        );
      });
    searchInput.addEventListener('keydown', e => {
      if (!backlogFilterPickerState) return;
      const filtered = getBacklogFilterOptions(searchInput.value);
      const count = filtered.length;
      if (count === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        backlogFilterPickerState.highlightIndex = Math.min(backlogFilterPickerState.highlightIndex + 1, count - 1);
        updateBacklogFilterHighlight(dropdown);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        backlogFilterPickerState.highlightIndex = Math.max(backlogFilterPickerState.highlightIndex - 1, 0);
        updateBacklogFilterHighlight(dropdown);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const option = filtered[backlogFilterPickerState.highlightIndex];
        if (option) selectBacklogFilter(option.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeBacklogFilterPicker();
      }
    });
  }
}

function updateBacklogFilterHighlight(dropdown) {
  if (!backlogFilterPickerState) return;
  const items = dropdown.querySelectorAll('[data-backlog-filter-id]');
  items.forEach((item, index) => {
    item.classList.toggle('channel-picker__item--highlighted', index === backlogFilterPickerState.highlightIndex);
  });
  const highlighted = dropdown.querySelector('.channel-picker__item--highlighted');
  if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
}

function selectBacklogFilter(filterId) {
  const nextFilterId = normalizeTaskFilterId(filterId || 'all');
  topbarTaskFilterState.homeToday = nextFilterId;
  backlogPanelState.filterId = nextFilterId;
  closeBacklogFilterPicker();
  if (getTaskFilterScopeKey() === 'homeToday') {
    rerenderActiveFilteredView();
  } else {
    renderBacklogPanel();
    updateTopbarFilterButton();
  }
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
  const loc = getTaskLocation(taskId);
  if (!loc) return;

  const existing = document.querySelector('[data-modal-channel-picker]');
  if (existing) existing.remove();

  const overlay = document.querySelector('.task-modal-overlay');
  if (!overlay) return;

  const channelBtn = overlay.querySelector('[data-modal-channel-btn]');
  if (!channelBtn) return;

  const metaGroup = channelBtn.closest('.task-modal__meta-group');
  if (!metaGroup) return;

  const filtered = getFilteredChannels('');
  const listHTML = renderModalChannelListHTML(filtered, loc.task.tag);

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
    const loc = getTaskLocation(taskId);
    if (!loc) return;
    const filtered = getFilteredChannels(query);
    modalChannelPickerState.highlightIndex = 0;
    const list = dropdown.querySelector('.channel-picker__list');
    if (list) list.innerHTML = renderModalChannelListHTML(filtered, loc.task.tag);
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
      e.stopPropagation();
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
  const loc = getTaskLocation(taskId);
  if (!loc) { closeModalChannelPicker(); return; }

  if (channel.id === 'unassigned') {
    loc.task.tag = null;
  } else {
    loc.task.tag = '#' + channel.label;
  }
  markTaskAsRepeatModified(loc.task);

  closeModalChannelPicker();
  renderTaskLocation(loc);
  renderCalendarEvents();
  persistTask(loc.task, 0);

  // Update modal channel display
  const overlay = document.querySelector('.task-modal-overlay');
  if (overlay) {
    const channelEl = overlay.querySelector('[data-modal-channel-btn]');
    if (channelEl) {
      const style = getChannelStyle(loc.task.tag);
      const hashColor = style ? style.hashColor : (loc.task.tag ? '#7da2ff' : '#999999');
      const word = loc.task.tag ? loc.task.tag.replace(/^#/, '') : 'Unassigned';
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
  const loc = getTaskLocation(taskId);
  if (!loc) return;
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
  const loc = getTaskLocation(dueDatePickerState.taskId);
  if (!loc) return;

  const currentDueDate = loc.task.dueDate || null;

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
  const loc = getTaskLocation(taskId);
  if (!loc) return;

  loc.task.dueDate = isoDate;
  closeDueDatePicker();
  updateCardDueDate(taskId, loc.task);
  if (loc.location === 'trash') renderTrashPanel();
  if (loc.location === 'archive') renderArchivePanel();
  persistTask(loc.task, 0);

  // Re-render modal to update layout (DUE label + button position changes)
  openTaskDetailModal(taskId);
}

function handleRemoveDueDate() {
  if (!dueDatePickerState) return;
  const taskId = dueDatePickerState.taskId;
  const loc = getTaskLocation(taskId);
  if (!loc) return;

  loc.task.dueDate = null;
  closeDueDatePicker();
  updateCardDueDate(taskId, loc.task);
  if (loc.location === 'trash') renderTrashPanel();
  if (loc.location === 'archive') renderArchivePanel();
  persistTask(loc.task, 0);

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
  const loc = getTaskLocation(openModalTaskId);
  if (!loc) return;
  const task = loc.task;
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
  const dateLabel = getPlannedDateLabel(loc.column);

  // Check if parent planned is locked out by subtask planned time
  // Exception: if task has a timebox on the calendar, parent planned reflects the timebox
  const hasTimebox = loc.column && getTaskTimeboxesForDate(task, loc.column.isoDate).length > 0;
  const parentPlannedLocked = !subtask && !hasTimebox && taskHasSubtaskPlannedTime(task);

  let html;
  if (parentPlannedLocked) {
    html = `
      <div class="planned-picker" data-planned-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Planned (${escapeHtml(dateLabel)}):</div>
        <button class="planned-picker__time-display" type="button" style="cursor:default">${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        <div class="planned-picker__calculated-hint">Calculated from subtasks. To update, edit subtasks.</div>
      </div>
    `;
  } else if (plannedPickerEditMode) {
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
  const loc = getTaskLocation(openModalTaskId);
  if (!loc) return;
  const task = loc.task;
  const subtask = plannedPickerSubtaskId ? findSubtask(task, plannedPickerSubtaskId) : null;

  // Guard: parent-level planned time is read-only when subtasks have planned time (unless timeboxed)
  const hasPlannedTimebox = loc.column && getTaskTimeboxesForDate(task, loc.column.isoDate).length > 0;
  if (!subtask && !hasPlannedTimebox && taskHasSubtaskPlannedTime(task)) return;

  if (subtask) {
    subtask.plannedMinutes = minutes;
    subtask.deleteReady = false;
  } else {
    const subtaskPlanned = task.subtasks.reduce((sum, s) => sum + (s.plannedMinutes || 0), 0);
    task.ownPlannedMinutes = Math.max(0, minutes - subtaskPlanned);
  }
  markTaskAsRepeatModified(task);
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

  renderTaskLocation(loc);
  persistTask(task, 0);
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
  const loc = getTaskLocation(openModalTaskId);
  if (!loc) return;
  const task = loc.task;
  const subtask = actualPickerSubtaskId ? findSubtask(task, actualPickerSubtaskId) : null;

  const existing = document.querySelector('[data-actual-picker]');
  if (existing) existing.remove();

  const overlay = document.getElementById('task-modal-overlay');
  const metricEl = subtask
    ? overlay.querySelector(`[data-modal-subtask-actual-btn="${actualPickerSubtaskId}"]`)
    : overlay.querySelector('[data-actual-btn]');
  if (!metricEl) return;

  const effectiveDate = actualPickerDateScope || getTodayISO();
  let currentSeconds = 0;
  if (subtask) {
    ensureTaskRolloverState(task);
    const dayEntry = task.dailyActualTime[effectiveDate];
    currentSeconds = dayEntry && dayEntry.subtasks ? (dayEntry.subtasks[subtask.id] || 0) : 0;
  } else {
    currentSeconds = getTaskDailyActualSeconds(task, effectiveDate);
  }
  const currentMins = currentSeconds ? Math.floor(currentSeconds / 60) : 0;
  const hasCurrentActual = hasActualTime(currentSeconds);
  const currentFormatted = hasCurrentActual ? formatMinutes(currentMins) : '--:--';
  const dateLabel = getActualDateLabel(null, effectiveDate);

  let html;
  // Parent-level lock-out: when subtasks have actual time, parent is read-only
  if (!subtask && taskHasSubtaskActualTime(task)) {
    html = `
      <div class="planned-picker" data-actual-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Actual (${escapeHtml(dateLabel)}):</div>
        <button class="planned-picker__time-display" type="button" style="cursor:default">${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        <div class="planned-picker__calculated-hint">Calculated from subtasks. To update, edit subtasks.</div>
      </div>
    `;
  } else if (actualPickerEditMode) {
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
    const allDailyEntries = Object.entries(task.dailyActualTime)
      .map(([date, entry]) => {
        let total = entry.ownSeconds || 0;
        if (entry.subtasks) {
          for (const stId in entry.subtasks) total += entry.subtasks[stId] || 0;
        }
        return { date, total };
      })
      .filter(e => e.total > 0)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Only show history if there are entries on dates other than the current effective date
    const hasOtherDates = allDailyEntries.some(e => e.date !== effectiveDate);
    const historyEntries = hasOtherDates ? allDailyEntries : [];

    const historyHtml = historyEntries.length > 0
      ? `<div class="planned-picker__header" style="margin-top:8px">History:</div>
         ${historyEntries.map(e => `<div class="actual-picker__history-entry">
           <span class="actual-picker__history-time">${formatMinutes(Math.floor(e.total / 60))}</span>
           <span class="actual-picker__history-date">${formatDateDisplay(e.date)}</span>
           <button class="actual-picker__history-delete" type="button" data-delete-history="${e.date}">×</button>
         </div>`).join('')}
         <div class="planned-picker__divider"></div>`
      : '';

    html = `
      <div class="planned-picker" data-actual-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">Actual (${escapeHtml(dateLabel)}):</div>
        <button class="planned-picker__time-display" type="button" data-actual-edit-mode>${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        ${historyHtml}
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
  let loc = getTaskLocation(openModalTaskId);
  if (!loc) return;
  let task = loc.task;
  const subtask = actualPickerSubtaskId ? findSubtask(task, actualPickerSubtaskId) : null;
  const restoredFromTrash = loc.location === 'trash' && minutes > 0;
  const restoredFromArchive = loc.location === 'archive' && minutes > 0;

  if (restoredFromTrash) {
    const restored = restoreTrashTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
    if (!restored) return;
    renderTrashPanel();
    renderCalendarEvents();
    loc = { location: 'column', column: restored.column, task: restored.task, index: restored.insertIndex, entry: null };
    task = loc.task;
  } else if (restoredFromArchive) {
    const restored = restoreArchiveTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: false });
    if (!restored) return;
    renderArchivePanel();
    renderCalendarEvents();
    loc = { location: 'column', column: restored.column, task: restored.task, index: restored.insertIndex, entry: null };
    task = loc.task;
  }

  // Guard: parent-level actual time is read-only when subtasks have actual time
  if (!subtask && taskHasSubtaskActualTime(task)) return;

  const applyDateISO = (restoredFromTrash || restoredFromArchive) ? getTodayISO() : (actualPickerDateScope || getTodayISO());
  ensureTaskRolloverState(task);

  if (subtask) {
    subtask.deleteReady = false;
    if (!task.dailyActualTime[applyDateISO]) task.dailyActualTime[applyDateISO] = { ownSeconds: 0, subtasks: {} };
    if (!task.dailyActualTime[applyDateISO].subtasks) task.dailyActualTime[applyDateISO].subtasks = {};
    task.dailyActualTime[applyDateISO].subtasks[subtask.id] = minutes * 60;
    // Recompute subtask aggregate from all daily entries
    let totalSubtaskSeconds = 0;
    for (const dateKey in task.dailyActualTime) {
      const de = task.dailyActualTime[dateKey];
      if (de.subtasks && de.subtasks[subtask.id]) totalSubtaskSeconds += de.subtasks[subtask.id];
    }
    subtask.actualTimeSeconds = totalSubtaskSeconds;
  } else {
    if (!task.dailyActualTime[applyDateISO]) task.dailyActualTime[applyDateISO] = { ownSeconds: 0, subtasks: {} };
    const entry = task.dailyActualTime[applyDateISO];
    const subtaskDailyTotal = entry.subtasks
      ? Object.values(entry.subtasks).reduce((s, v) => s + (v || 0), 0)
      : 0;
    entry.ownSeconds = Math.max(0, minutes * 60 - subtaskDailyTotal);
    // Recompute own aggregate from all daily entries
    let totalOwnSeconds = 0;
    for (const dateKey in task.dailyActualTime) {
      totalOwnSeconds += task.dailyActualTime[dateKey].ownSeconds || 0;
    }
    task.ownActualTimeSeconds = totalOwnSeconds;
  }
  markTaskAsRepeatModified(task);
  syncTaskAggregateTimes(task);

  // Actual-time calendar events: create/remove for today only
  const todayForPicker = getTodayISO();
  if (applyDateISO === todayForPicker) {
    const pickSubId = actualPickerSubtaskId || null;
    removeActualTimeEventsForTask(task.id, todayForPicker, pickSubId);
    if (minutes > 0) {
      const nowOffset = timestampToOffset(Date.now());
      const durationHours = minutes / 60;
      const startOffset = Math.max(0, nowOffset - durationHours);
      createActualTimeEvent(task, pickSubId, todayForPicker, startOffset, nowOffset - startOffset, 'picker');
    } else {
      renderCalendarEvents();
    }
    // Reset timer merge state since manual edit replaces timer events
    focusState.lastTimerEventId = null;
    focusState.lastTimerStopTimestamp = null;
  }

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
  if (loc.location === 'column') {
    renderColumn(loc.column);
  } else if (loc.location === 'archive') {
    renderArchivePanel();
  } else if (loc.location === 'backlog') {
    renderBacklogPanel();
  } else {
    renderTrashPanel();
  }
  rerenderGhostColumns(task);
  persistTask(task, 0);
  if (restoredFromTrash) {
    persistRemoveFromTrash(openModalTaskId);
    openTaskDetailModal(openModalTaskId);
  } else if (restoredFromArchive) {
    openTaskDetailModal(openModalTaskId);
  }
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
let focusState = { taskId: null, subtaskId: null, running: false, intervalId: null, enteredFrom: null, timerStartTimestamp: null, lastTimerStopTimestamp: null, lastTimerEventId: null };
let cardTimerExpanded = new Set(); // keys for expanded timer dropdowns on kanban cards
const cardTimerAutoCollapseTimers = new Map(); // key -> timeout id
function getCardTimerKey(taskId, columnIsoDate) {
  if (!taskId) return '';
  return columnIsoDate ? `${taskId}::${columnIsoDate}` : taskId;
}

function getCardTimerKeyForTask(taskId) {
  const ctx = findTaskContext(taskId);
  const colDate = ctx && ctx.column ? ctx.column.isoDate : null;
  return getCardTimerKey(taskId, colDate);
}

function getCardTimerKeyForCard(card) {
  if (!card) return '';
  const taskId = card.dataset.taskId;
  const colDate = card.dataset.columnDate || card.dataset.ghostDate || null;
  return getCardTimerKey(taskId, colDate);
}

function clearCardTimerAutoCollapse(taskId, columnIsoDate) {
  const key = getCardTimerKey(taskId, columnIsoDate);
  const timeoutId = cardTimerAutoCollapseTimers.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    cardTimerAutoCollapseTimers.delete(key);
  }
}

function scheduleCardTimerAutoCollapse(taskId, columnIsoDate) {
  const key = getCardTimerKey(taskId, columnIsoDate);
  if (!key) return;
  if (cardPickerState && cardPickerState.taskId === taskId) return;
  clearCardTimerAutoCollapse(taskId, columnIsoDate);
  const timeoutId = setTimeout(() => {
    cardTimerAutoCollapseTimers.delete(key);
    if (!cardTimerExpanded.has(key)) return;
    if (focusState.running && focusState.taskId === taskId) return;
    if (cardPickerState && cardPickerState.taskId === taskId) return;
    if (cardDatePickerState && cardDatePickerState.taskId === taskId) return;

    const selector = columnIsoDate
      ? `.task-card[data-task-id="${taskId}"][data-column-date="${columnIsoDate}"]`
      : `.task-card[data-task-id="${taskId}"]`;
    const card = document.querySelector(selector);
    if (card && card.matches(':hover')) return;

    cardTimerExpanded.delete(key);
    const col = columnIsoDate
      ? state.columns.find(c => c.isoDate === columnIsoDate)
      : state.columns.find(c => c.tasks.some(t => t.id === taskId));
    if (col) {
      renderColumn(col);
      if (cardPickerState) {
        requestAnimationFrame(() => {
          if (cardPickerState) renderCardPicker();
        });
      }
    }
  }, 2000);
  cardTimerAutoCollapseTimers.set(key, timeoutId);
}

function collapseAllCardTimers() {
  if (focusState.running && focusState.taskId) {
    const activeId = focusState.taskId;
    cardTimerExpanded.clear();
    const key = getCardTimerKeyForTask(activeId);
    if (key) cardTimerExpanded.add(key);
  } else {
    cardTimerExpanded.clear();
  }
}
let cardPickerState = null; // { taskId, type: 'actual'|'planned', editMode: false, subtaskId: string|null, anchorCard: Element|null }
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
  // Save Quill content before re-render destroys the instance
  if (focusModalQuill) {
    task.notes = getQuillHtml(focusModalQuill);
    focusModalQuill = null;
  }
  renderFocusModal(task, focusState.running);
  if (focusSubtaskId) {
    requestAnimationFrame(() => focusSubtaskTitleInput(focusSubtaskId));
  }
}

function closeCardPicker() {
  const previousState = cardPickerState;
  const anchorCard = previousState && previousState.anchorCard ? previousState.anchorCard : null;
  if (anchorCard) {
    anchorCard.classList.remove('task-card--time-picker-open');
  }
  cardPickerState = null;
  actualPickerDateScope = null;
  const existing = document.querySelector('[data-card-picker]');
  if (existing) existing.remove();

  if (!anchorCard) return;
  const taskId = anchorCard.dataset.taskId;
  const columnDate = anchorCard.dataset.columnDate || anchorCard.dataset.ghostDate || null;
  const key = getCardTimerKey(taskId, columnDate);
  if (!taskId || !cardTimerExpanded.has(key)) return;
  if (focusState.running && focusState.taskId === taskId) return;
  if (cardDatePickerState && cardDatePickerState.taskId === taskId) return;
  if (anchorCard.matches(':hover')) return;
  scheduleCardTimerAutoCollapse(taskId, columnDate);
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
  const loc = getTaskLocation(taskId);
  if (!loc) return;
  const task = loc.task;

  const existing = document.querySelector('[data-card-picker]');
  if (existing) existing.remove();

  // When date-scoped, find the card in the correct column (handles ghost + real card for same task)
  const useDateScopedCard = type === 'actual' && !!actualPickerDateScope;
  const cardSelector = useDateScopedCard
    ? `.task-card[data-task-id="${taskId}"][data-column-date="${actualPickerDateScope}"]`
    : `.task-card[data-task-id="${taskId}"]`;
  let metricEl;
  if (subtaskId) {
    const attrName = type === 'actual' ? 'data-card-subtask-actual' : 'data-card-subtask-planned';
    metricEl = document.querySelector(`${cardSelector} [${attrName}="${subtaskId}"]`);
  } else {
    const btnAttr = type === 'actual' ? 'data-card-actual-picker-btn' : 'data-card-planned-picker-btn';
    metricEl = document.querySelector(`${cardSelector} [${btnAttr}]`);
    if (!metricEl && type === 'planned') {
      metricEl = document.querySelector(`${cardSelector} [data-card-time-badge]`);
    }
  }
  if (!metricEl) return;
  const card = metricEl.closest('.task-card');
  const usePortal = cardUsesPortal(card);
  if (card) {
    if (cardPickerState.anchorCard && cardPickerState.anchorCard !== card) {
      cardPickerState.anchorCard.classList.remove('task-card--time-picker-open');
    }
    cardPickerState.anchorCard = card;
    card.classList.add('task-card--time-picker-open');
  }

  const isActual = type === 'actual';
  const effectiveActualDate = isActual ? (actualPickerDateScope || getTodayISO()) : null;
  let currentSeconds, currentMins, hasCurrentActual;
  if (subtaskId) {
    const subtask = findSubtask(task, subtaskId);
    if (!subtask) return;
    ensureSubtaskTimeState(subtask);
    if (isActual) {
      // Show daily subtask time for the effective date (scope or today)
      ensureTaskRolloverState(task);
      const dayEntry = task.dailyActualTime[effectiveActualDate];
      currentSeconds = dayEntry && dayEntry.subtasks ? (dayEntry.subtasks[subtaskId] || 0) : 0;
    } else {
      currentSeconds = subtask.actualTimeSeconds || 0;
    }
    hasCurrentActual = isActual && hasActualTime(currentSeconds);
    currentMins = isActual ? Math.floor(currentSeconds / 60) : (subtask.plannedMinutes || 0);
  } else {
    if (isActual) {
      // Show daily actual time for the effective date (scope or today)
      ensureTaskRolloverState(task);
      currentSeconds = getTaskDailyActualSeconds(task, effectiveActualDate);
    } else {
      currentSeconds = task.actualTimeSeconds || 0;
    }
    hasCurrentActual = isActual && hasActualTime(currentSeconds);
    currentMins = isActual ? Math.floor(currentSeconds / 60) : (task.timeEstimateMinutes || 0);
  }
  const currentFormatted = (isActual ? hasCurrentActual : currentMins > 0) ? formatMinutes(currentMins) : '--:--';
  const options = isActual ? ACTUAL_TIME_OPTIONS : PLANNED_TIME_OPTIONS;
  const label = isActual
    ? `Actual (${getActualDateLabel(null, effectiveActualDate)})`
    : 'Planned';
  const clearLabel = isActual ? 'Clear actual' : 'Clear planned';

  let html;
  // Parent-level lock-out for card picker (actual or planned)
  const cardColDate = actualPickerDateScope
    || (metricEl.closest('.day-column') || {}).dataset?.isoDate
    || (card ? card.dataset.columnDate : null);
  const cardHasTimebox = cardColDate && getTaskTimeboxesForDate(task, cardColDate).length > 0;
  const cardParentLocked = !subtaskId && (
    (isActual && taskHasSubtaskActualTime(task)) ||
    (!isActual && !cardHasTimebox && taskHasSubtaskPlannedTime(task))
  );
  if (cardParentLocked) {
    html = `
      <div class="planned-picker" data-card-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">${label}:</div>
        <button class="planned-picker__time-display" type="button" style="cursor:default">${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        <div class="planned-picker__calculated-hint">Calculated from subtasks. To update, edit subtasks.</div>
      </div>
    `;
  } else if (editMode) {
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
  if (usePortal) {
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '7000';
    dropdown.dataset.cardPickerPortal = 'true';
    document.body.appendChild(dropdown);
    requestAnimationFrame(() => {
      const metricRect = metricEl.getBoundingClientRect();
      const ddRect = dropdown.getBoundingClientRect();
      let left = metricRect.left + metricRect.width / 2 - ddRect.width / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - ddRect.width - 12));
      dropdown.style.left = left + 'px';
      dropdown.style.top = (metricRect.bottom + 8) + 'px';
      const arrow = dropdown.querySelector('.planned-picker__arrow');
      if (arrow) {
        const updatedRect = dropdown.getBoundingClientRect();
        const arrowLeft = metricRect.left + metricRect.width / 2 - updatedRect.left - 6;
        arrow.style.left = Math.max(8, arrowLeft) + 'px';
      }
    });
  } else {
    metricEl.style.position = 'relative';
    metricEl.appendChild(dropdown);
  }

  if (editMode) {
    attachPickerInputColorListeners(dropdown);
    const hoursInput = dropdown.querySelector('[data-card-picker-hours]');
    if (hoursInput) { hoursInput.focus(); hoursInput.select(); }
  }

  // Scroll column so the picker is fully visible
  if (!usePortal) {
    requestAnimationFrame(() => {
      const ddRect = dropdown.getBoundingClientRect();
      const scroller = getScrollableTaskAncestor(metricEl, 'y');
      if (scroller) {
        const scrollerRect = scroller.getBoundingClientRect();
        if (ddRect.bottom > scrollerRect.bottom) {
          scroller.scrollTop += ddRect.bottom - scrollerRect.bottom + 8;
        }
      }
    });
  }
}

function applyCardPickerTime(minutes) {
  if (!cardPickerState) return;
  const { taskId, type, subtaskId } = cardPickerState;
  let loc = getTaskLocation(taskId);
  if (!loc) return;
  let task = loc.task;
  const restoredFromTrash = loc.location === 'trash' && type === 'actual' && minutes > 0;
  const restoredFromArchive = loc.location === 'archive' && type === 'actual' && minutes > 0;

  if (restoredFromTrash) {
    const restored = restoreTrashTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
    if (!restored) return;
    renderTrashPanel();
    renderCalendarEvents();
    loc = { location: 'column', column: restored.column, task: restored.task, index: restored.insertIndex, entry: null };
    task = loc.task;
  } else if (restoredFromArchive) {
    const restored = restoreArchiveTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: false });
    if (!restored) return;
    renderArchivePanel();
    renderCalendarEvents();
    loc = { location: 'column', column: restored.column, task: restored.task, index: restored.insertIndex, entry: null };
    task = loc.task;
  }

  // Guard: parent-level time is read-only when subtasks have time
  if (type === 'actual' && !subtaskId && taskHasSubtaskActualTime(task)) return;
  if (type === 'planned' && !subtaskId && taskHasSubtaskPlannedTime(task)) {
    // Exception: allow if task has a timebox
    const guardCol = state.columns.find(c => c.tasks.some(t => t.id === taskId));
    const guardDate = guardCol ? guardCol.isoDate : null;
    if (!guardDate || getTaskTimeboxesForDate(task, guardDate).length === 0) return;
  }

  const dateScope = actualPickerDateScope;
  const applyDateScope = type === 'actual'
    ? ((restoredFromTrash || restoredFromArchive) ? getTodayISO() : (dateScope || getTodayISO()))
    : dateScope;

  if (subtaskId) {
    const subtask = findSubtask(task, subtaskId);
    if (!subtask) return;
    ensureSubtaskTimeState(subtask);
    if (type === 'actual') {
      if (applyDateScope) {
        // Date-scoped: update daily time for this subtask on that date
        ensureTaskRolloverState(task);
        const dayEntry = task.dailyActualTime[applyDateScope];
        const oldSubtaskDaily = dayEntry && dayEntry.subtasks ? (dayEntry.subtasks[subtaskId] || 0) : 0;
        const newSeconds = minutes * 60;
        const delta = newSeconds - oldSubtaskDaily;
        subtask.actualTimeSeconds = (subtask.actualTimeSeconds || 0) + delta;
        if (subtask.actualTimeSeconds < 0) subtask.actualTimeSeconds = 0;
        recordDailyTime(task, applyDateScope, delta, subtaskId);
      } else {
        subtask.actualTimeSeconds = minutes * 60;
      }
    } else {
      subtask.plannedMinutes = minutes;
    }
  } else {
    if (type === 'actual') {
      if (applyDateScope) {
        // Date-scoped: set daily own actual time for this date
        ensureTaskRolloverState(task);
        if (!task.dailyActualTime[applyDateScope]) {
          task.dailyActualTime[applyDateScope] = { ownSeconds: 0, subtasks: {} };
        }
        const entry = task.dailyActualTime[applyDateScope];
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
  markTaskAsRepeatModified(task);
  syncTaskAggregateTimes(task);

  // Actual-time calendar events: create/remove for today only
  if (type === 'actual') {
    const todayForCardPicker = getTodayISO();
    const effectiveDate = applyDateScope || todayForCardPicker;
    if (effectiveDate === todayForCardPicker) {
      const cardPickSubId = subtaskId || null;
      removeActualTimeEventsForTask(taskId, todayForCardPicker, cardPickSubId);
      if (minutes > 0) {
        const nowOffset = timestampToOffset(Date.now());
        const durationHours = minutes / 60;
        const startOffset = Math.max(0, nowOffset - durationHours);
        createActualTimeEvent(task, cardPickSubId, todayForCardPicker, startOffset, nowOffset - startOffset, 'picker');
      } else {
        renderCalendarEvents();
      }
      focusState.lastTimerEventId = null;
      focusState.lastTimerStopTimestamp = null;
    }
  }

  // If clearing time on a past card, collapse the timer area
  if (applyDateScope && type === 'actual' && minutes === 0) {
    const key = getCardTimerKey(taskId, applyDateScope);
    cardTimerExpanded.delete(key);
  }

  // Collapse timer area after selecting/clearing planned time (unless timer is running)
  if (type === 'planned' && !(focusState.running && focusState.taskId === taskId)) {
    const key = getCardTimerKeyForTask(taskId);
    cardTimerExpanded.delete(key);
  }
  // Collapse timer area after selecting actual time (unless timer is running)
  if (type === 'actual' && !(focusState.running && focusState.taskId === taskId)) {
    const key = applyDateScope ? getCardTimerKey(taskId, applyDateScope) : getCardTimerKeyForTask(taskId);
    cardTimerExpanded.delete(key);
  }

  closeCardPicker();
  if (loc.location === 'column') {
    renderColumn(loc.column);
  } else if (loc.location === 'archive') {
    renderArchivePanel();
  } else if (loc.location === 'backlog') {
    renderBacklogPanel();
  } else {
    renderTrashPanel();
  }
  // Re-render ghost columns if date-scoped edit changed activity
  if (applyDateScope && type === 'actual') rerenderGhostColumns(task);
  persistTask(task, 0);
  if (restoredFromTrash) persistRemoveFromTrash(taskId);
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

function showToast(message, variant) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast' + (variant === 'dark' ? ' toast--dark' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  toast.addEventListener('animationend', () => toast.remove());
}

function openFocusMode(taskId, autoStart, from, subtaskId = null) {
  if (isTaskInTrash(taskId) || isTaskInBacklog(taskId)) {
    showToast('Must focus on today');
    return;
  }
  const derivedTask = getRepeatRuntimeTaskById(taskId);
  if (derivedTask) {
    materializeDerivedTask(derivedTask);
  }
  if (isTaskInArchive(taskId)) {
    const restored = restoreArchiveTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: false });
    if (!restored) {
      showToast('Must focus on today');
      return;
    }
    renderArchivePanel();
    renderColumn(restored.column);
  }
  const ctx = findTaskContext(taskId);
  if (!ctx) return;

  const todayISO = getTodayISO();
  const isInToday = state.columns.some(col => col.isoDate === todayISO && col.tasks.some(t => t.id === taskId));
  if (!isInToday) {
    showToast('Must focus on today');
    return;
  }

  focusState.taskId = taskId;
  // Route parent START to last active subtask when subtasks have actual time
  if (!subtaskId && taskHasSubtaskActualTime(ctx.task)) {
    const lastActiveSubtask = [...(ctx.task.subtasks || [])].reverse().find(s => (s.actualTimeSeconds || 0) > 0);
    focusState.subtaskId = lastActiveSubtask ? lastActiveSubtask.id : null;
  } else {
    focusState.subtaskId = subtaskId;
  }
  focusState.enteredFrom = from || (todayViewState.isActive ? 'today' : 'kanban');
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
      initTaskModalQuill(ctx.task);
      if (focusState.running) {
        updateCardDetailTimerState();
      }
    }
  } else if (todayViewState.isActive) {
    if (taskId && focusState.running) {
      const key = getCardTimerKeyForTask(taskId);
      if (key) cardTimerExpanded.add(key);
    }
    renderTodayViewMode();
  } else if (taskId && focusState.running) {
    // Return to kanban with timer running — show timer on card
    const key = getCardTimerKeyForTask(taskId);
    if (key) cardTimerExpanded.add(key);
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
  focusState.timerStartTimestamp = Date.now();

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
    persistTask(task, 2000);

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

  // Create actual-time calendar event for this timer session (today only)
  const now = Date.now();
  const todayISO = getTodayISO();
  if (focusState.timerStartTimestamp && focusState.taskId) {
    const timerTask = findTaskById(focusState.taskId);
    if (timerTask) {
      const startDateISO = new Date(focusState.timerStartTimestamp).toISOString().slice(0, 10);
      // Clamp start to midnight if timer started before today
      const startOffset = startDateISO === todayISO
        ? timestampToOffset(focusState.timerStartTimestamp)
        : 0;
      const endOffset = timestampToOffset(now);
      const duration = Math.max(endOffset - startOffset, 1 / SNAP_STEPS_PER_HOUR);

      // Same-minute merge: if restarted within 60s of last stop, extend previous event
      const shouldMerge = focusState.lastTimerStopTimestamp
        && (now - focusState.lastTimerStopTimestamp) < 60000
        && focusState.lastTimerEventId
        && focusState.subtaskId === (state.calendarEvents.find(e => e.id === focusState.lastTimerEventId) || {}).subtaskId;

      if (shouldMerge) {
        const prevEvt = state.calendarEvents.find(e => e.id === focusState.lastTimerEventId);
        if (prevEvt) {
          prevEvt.duration = endOffset - prevEvt.offset;
          persistCalendarEvent(prevEvt);
          renderCalendarEvents();
        } else {
          const evt = createActualTimeEvent(timerTask, focusState.subtaskId, todayISO, startOffset, duration, 'timer');
          focusState.lastTimerEventId = evt.id;
        }
      } else {
        const evt = createActualTimeEvent(timerTask, focusState.subtaskId, todayISO, startOffset, duration, 'timer');
        focusState.lastTimerEventId = evt.id;
      }
      focusState.lastTimerStopTimestamp = now;
    }
  }
  focusState.timerStartTimestamp = null;
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
      startBtn.setAttribute('data-rich-tooltip-label', 'Stop timer');
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
      startBtn.setAttribute('data-rich-tooltip-label', 'Start timer');
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
      btn.setAttribute('data-rich-tooltip-label', isRunningSubtask ? 'Stop timer' : 'Start timer');
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
  if (focusModalQuill) {
    task.notes = getQuillHtml(focusModalQuill);
    focusModalQuill = null;
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
  persistTask(task, 0);
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
  // Parent-level lock-out for focus picker (actual or planned)
  const focusParentLocked = !subtask && (
    (isActual && taskHasSubtaskActualTime(task)) ||
    (!isActual && taskHasSubtaskPlannedTime(task))
  );
  if (focusParentLocked) {
    html = `
      <div class="planned-picker" data-focus-picker>
        <div class="planned-picker__arrow"></div>
        <div class="planned-picker__header">${label}:</div>
        <button class="planned-picker__time-display" type="button" style="cursor:default">${currentFormatted}</button>
        <div class="planned-picker__divider"></div>
        <div class="planned-picker__calculated-hint">Calculated from subtasks. To update, edit subtasks.</div>
      </div>
    `;
  } else if (editMode) {
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

  // Guard: parent-level time is read-only when subtasks have time
  if (type === 'actual' && !subtask && taskHasSubtaskActualTime(task)) return;
  if (type === 'planned' && !subtask && taskHasSubtaskPlannedTime(task)) return;

  const focusApplyDateISO = getTodayISO();
  if (subtask) {
    if (type === 'actual') {
      ensureTaskRolloverState(task);
      if (!task.dailyActualTime[focusApplyDateISO]) task.dailyActualTime[focusApplyDateISO] = { ownSeconds: 0, subtasks: {} };
      if (!task.dailyActualTime[focusApplyDateISO].subtasks) task.dailyActualTime[focusApplyDateISO].subtasks = {};
      task.dailyActualTime[focusApplyDateISO].subtasks[subtask.id] = minutes * 60;
      // Recompute subtask aggregate from all daily entries
      let totalSubtaskSeconds = 0;
      for (const dateKey in task.dailyActualTime) {
        const de = task.dailyActualTime[dateKey];
        if (de.subtasks && de.subtasks[subtask.id]) totalSubtaskSeconds += de.subtasks[subtask.id];
      }
      subtask.actualTimeSeconds = totalSubtaskSeconds;
    } else {
      subtask.plannedMinutes = Math.max(0, minutes);
    }
  } else if (type === 'actual') {
    ensureTaskRolloverState(task);
    if (!task.dailyActualTime[focusApplyDateISO]) task.dailyActualTime[focusApplyDateISO] = { ownSeconds: 0, subtasks: {} };
    const entry = task.dailyActualTime[focusApplyDateISO];
    const subtaskDailyTotal = entry.subtasks
      ? Object.values(entry.subtasks).reduce((s, v) => s + (v || 0), 0)
      : 0;
    entry.ownSeconds = Math.max(0, minutes * 60 - subtaskDailyTotal);
    // Recompute own aggregate from all daily entries
    let totalOwnSeconds = 0;
    for (const dateKey in task.dailyActualTime) {
      totalOwnSeconds += task.dailyActualTime[dateKey].ownSeconds || 0;
    }
    task.ownActualTimeSeconds = totalOwnSeconds;
  } else {
    const subtaskPlanned = task.subtasks.reduce((sum, s) => sum + (s.plannedMinutes || 0), 0);
    task.ownPlannedMinutes = Math.max(0, minutes - subtaskPlanned);
  }
  syncTaskAggregateTimes(task);

  // Actual-time calendar events: create/remove for today only
  if (type === 'actual') {
    const todayForFocusPicker = getTodayISO();
    const focusPickSubId = subtaskId || null;
    removeActualTimeEventsForTask(task.id, todayForFocusPicker, focusPickSubId);
    if (minutes > 0) {
      const nowOffset = timestampToOffset(Date.now());
      const durationHours = minutes / 60;
      const startOffset = Math.max(0, nowOffset - durationHours);
      createActualTimeEvent(task, focusPickSubId, todayForFocusPicker, startOffset, nowOffset - startOffset, 'picker');
    } else {
      renderCalendarEvents();
    }
    focusState.lastTimerEventId = null;
    focusState.lastTimerStopTimestamp = null;
  }

  closeFocusPicker();
  updateFocusModalValues(task);
  updateCardDetailTimerState();
  // Update kanban card
  const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
  if (col) renderColumn(col);
  persistTask(task, 0);
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
  el.className = 'focus-modal focus-modal--sidebar-collapsed';
  el.innerHTML = `
    <div class="focus-modal__topbar">
      <button class="focus-modal__sidebar-expand" type="button" aria-label="Expand sidebar" data-focus-sidebar-expand><i data-lucide="chevrons-right"></i></button>
      <button class="focus-modal__tab" type="button">
        <i data-lucide="timer"></i>
        <span>Focus</span>
      </button>
      <button class="task-modal__top-action task-modal__top-action--icon focus-modal__close" type="button" aria-label="Close focus" data-focus-close><i data-lucide="x"></i></button>
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
        <div class="focus-modal__notes-editor" data-focus-notes-editor></div>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Init Quill editor for focus modal notes
  const focusNotesContainer = el.querySelector('[data-focus-notes-editor]');
  if (focusNotesContainer) {
    focusModalQuill = initQuillEditor(focusNotesContainer, 'Notes...', task.notes || '');
    focusModalQuill.on('text-change', () => {
      task.notes = getQuillHtml(focusModalQuill);
      persistTask(task, 500);
    });
  }

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
    if (e.target.closest('[data-focus-sidebar-expand]')) {
      setSidebarCollapsed(false);
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
      persistTask(t, 0);
      return;
    }
    if (e.target.closest('[data-focus-check]')) {
      closeFocusPicker();
      const t = findTaskById(focusState.taskId);
      if (!t) return;
      if (!t.complete) {
        completeTaskAsOf(t, getTodayISO());
      } else {
        clearTaskCompletionMetadata(t);
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
      renderCalendarEvents();
      persistTask(t, 0);
      if (t.complete) {
        if (focusState.running) stopFocusTimer();
        const nextTaskId = getTopTodayTaskId();
        if (nextTaskId) {
          openFocusMode(nextTaskId, false, 'focus-complete');
        } else {
          closeFocusMode();
        }
      }
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
    // Notes are now handled by Quill editor — skip old contenteditable cleanup

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
      persistTask(t, 0);
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
    persistTask(t, 0);
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
      e.stopImmediatePropagation();
      handleFocusPickerTimeEntry();
      return;
    }
    if (e.key === 'Escape' && document.getElementById('focus-modal')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (focusPickerState) { closeFocusPicker(); return; }
      closeFocusMode();
    }
  };
  document.addEventListener('keydown', focusEscKeyHandler);
}

let openModalTaskId = null;
let openModalIsTrash = false;
let openModalIsBacklog = false;
let openModalIsArchive = false;

function openTaskDetailModal(taskId) {
  let context = findTaskContext(taskId);
  let isTrash = false;
  let isBacklog = false;
  let isArchive = false;
  if (!context) {
    const backlogTask = findBacklogTask(taskId);
    if (backlogTask) {
      isBacklog = true;
      const isoDate = getBacklogSourceIsoDate(backlogTask);
      const column = createEmptyColumnForDate(isoDate);
      context = { task: backlogTask, column, index: -1 };
    } else {
      const archiveTask = findArchiveTask(taskId);
      if (archiveTask) {
        isArchive = true;
        const isoDate = getArchiveSourceIsoDate(archiveTask);
        const column = createEmptyColumnForDate(isoDate);
        context = { task: archiveTask, column, index: -1 };
      } else {
        const trashEntry = findTrashEntry(taskId);
        if (!trashEntry) return;
        isTrash = true;
        const isoDate = getTrashSourceIsoDate(trashEntry);
        const column = createEmptyColumnForDate(isoDate);
        context = { task: trashEntry.task, column, index: -1 };
      }
    }
  }

  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return;

  openModalTaskId = taskId;
  openModalIsTrash = isTrash;
  openModalIsBacklog = isBacklog;
  openModalIsArchive = isArchive;
  overlay.innerHTML = renderTaskDetailModal(context.task, context.column, { isTrash, isBacklog, isArchive });
  overlay.hidden = false;
  document.body.classList.add('modal-open');

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  initTaskModalQuill(context.task);

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
      let changed = false;
      if (titleEl) {
        const newTitle = titleEl.textContent.trim();
        if (newTitle && newTitle !== ctx.task.title) {
          ctx.task.title = newTitle;
          markTaskAsRepeatModified(ctx.task);
          changed = true;
        }
      }
      if (taskModalQuill) {
        const nextNotes = getQuillHtml(taskModalQuill);
        if (nextNotes !== ctx.task.notes) {
          ctx.task.notes = nextNotes;
          markTaskAsRepeatModified(ctx.task);
          changed = true;
        }
        taskModalQuill = null;
      }
      syncTaskAggregateTimes(ctx.task);
      // If timer is running for this task, show timer on kanban card
      if (focusState.running && focusState.taskId === openModalTaskId) {
        const key = getCardTimerKeyForTask(openModalTaskId);
        if (key) cardTimerExpanded.add(key);
      }
      renderColumn(ctx.column);
      if (!isDerivedRepeatTask(ctx.task) || changed) {
        persistTask(ctx.task, 0);
      }
    }
    if (!ctx && openModalIsBacklog) {
      const task = findBacklogTask(openModalTaskId);
      if (task) {
        const titleEl = overlay.querySelector('.task-modal__title');
        if (titleEl) {
          const newTitle = titleEl.textContent.trim();
          if (newTitle) {
            task.title = newTitle;
          }
        }
        if (taskModalQuill) {
          task.notes = getQuillHtml(taskModalQuill);
          taskModalQuill = null;
        }
        renderBacklogPanel();
        persistTask(task, 0);
      }
    }
    if (!ctx && openModalIsArchive) {
      const task = findArchiveTask(openModalTaskId);
      if (task) {
        const titleEl = overlay.querySelector('.task-modal__title');
        if (titleEl) {
          const newTitle = titleEl.textContent.trim();
          if (newTitle) task.title = newTitle;
        }
        if (taskModalQuill) {
          task.notes = getQuillHtml(taskModalQuill);
          taskModalQuill = null;
        }
        renderArchivePanel();
        persistTask(task, 0);
      }
    }
    if (!ctx && openModalIsTrash) {
      const entry = findTrashEntry(openModalTaskId);
      if (entry) {
        const titleEl = overlay.querySelector('.task-modal__title');
        if (titleEl) {
          const newTitle = titleEl.textContent.trim();
          if (newTitle) {
            entry.task.title = newTitle;
          }
        }
        if (taskModalQuill) {
          entry.task.notes = getQuillHtml(taskModalQuill);
          taskModalQuill = null;
        }
        renderTrashPanel();
      }
    }
    openModalTaskId = null;
    openModalIsTrash = false;
    openModalIsBacklog = false;
    openModalIsArchive = false;
  }

  repeatRuntimeState.pinnedOccurrenceKeys.clear();
  reconcileVisibleRepeatTasks();
  overlay.hidden = true;
  overlay.innerHTML = '';
  document.body.classList.remove('modal-open');
}

function renderTaskCard(task, columnIsoDate, isGhost, dpBadgeStatus, options = {}) {
  ensureTaskTimeState(task);
  const isBacklog = options.isBacklog === true;
  const isArchive = options.isArchive === true;
  const todayISO = getTodayISO();
  const isPast = !isBacklog && !isArchive && columnIsoDate && columnIsoDate < todayISO;
  const isFuture = !isBacklog && !isArchive && columnIsoDate && columnIsoDate > todayISO;
  const card = document.createElement('div');
  card.className = 'task-card'
    + (task.complete ? ' task-card--complete' : '')
    + (isGhost ? ' task-card--ghost' : '')
    + (isGhost && columnIsoDate === todayISO ? ' task-card--ghost-today' : '');
  card.dataset.taskId = task.id;
  card.draggable = false;
  if (isGhost) card.dataset.ghostDate = columnIsoDate;
  if (isPast) card.dataset.isPast = 'true';
  if (columnIsoDate) card.dataset.columnDate = columnIsoDate;
  if (isBacklog) card.dataset.backlogCard = 'true';
  if (isArchive) card.dataset.archiveCard = 'true';
  if (isDerivedRepeatTask(task)) card.dataset.repeatDerived = 'true';

  // Show scheduled pills for all timebox events on THIS column's date
  const columnEvents = !isBacklog && columnIsoDate
    ? state.calendarEvents.filter(e => e.taskId === task.id && e.date === columnIsoDate && e.systemType !== 'actual').sort((a, b) => a.offset - b.offset)
    : [];
  let scheduledPills = '';
  if (columnEvents.length > 0) {
    const maxShow = 2;
    const shown = columnEvents.slice(0, maxShow);
    const overflow = columnEvents.length - maxShow;
    const pillChannelStyle = getChannelStyle(task.tag);
    scheduledPills = '<div class="task-card__pills-row">'
      + shown.map(evt => {
        const pillColorClass = evt.colorClass || getTaskEventColorClass(task, 'cal-event--blue');
        const pillInline = pillChannelStyle ? ` style="background-color:${escapeHtml(pillChannelStyle.hashColor)}"` : '';
        return `<span class="task-card__scheduled-pill ${pillColorClass}"${pillInline}>${escapeHtml(formatOffsetAsClockWithMinutes(evt.offset))}</span>`;
      }).join('')
      + (overflow > 0 ? `<span class="task-card__scheduled-pill task-card__scheduled-pill--more">+${overflow}</span>` : '')
      + '</div>';
  } else if (!isBacklog && !columnIsoDate && task.scheduledTime) {
    scheduledPills = `<div class="task-card__pills-row"><span class="task-card__scheduled-pill">${escapeHtml(task.scheduledTime)}</span></div>`;
  }

  const isTimerRunning = !isBacklog && focusState.running && focusState.taskId === task.id && !isPast;
  const timerKey = getCardTimerKey(task.id, columnIsoDate);
  const showTimerDropdown = !isBacklog && (isTimerRunning || cardTimerExpanded.has(timerKey));
  const badgeGreenClass = isTimerRunning ? ' task-card__time-badge--running' : '';
  if (showTimerDropdown) card.classList.add('task-card--timer-open');

  // Use daily actual time for the badge (per-column-date), aggregate for task detail
  const dailySeconds = columnIsoDate ? getTaskDailyActualSeconds(task, columnIsoDate) : (task.actualTimeSeconds || 0);
  const actualMins = dailySeconds ? Math.floor(dailySeconds / 60) : 0;
  const showActualOnBadge = !isBacklog && (dailySeconds > 0 || isTimerRunning);

  // Use sum of timebox durations as planned if timeboxed on this date; otherwise use shared timeEstimateMinutes
  const columnTimeboxes = (!isBacklog && columnIsoDate) ? getTaskTimeboxesForDate(task, columnIsoDate) : [];
  const hasColumnTimebox = columnTimeboxes.length > 0;
  const cardPlannedMins = hasColumnTimebox
    ? columnTimeboxes.reduce((sum, tb) => sum + Math.round(tb.duration * 60), 0)
    : (task.timeEstimateMinutes || 0);

  // Determine daily-planning badge modifier class, icon, and tooltip
  let dpBadgeClass = '';
  let dpBadgeIcon = '';
  let dpBadgeTooltip = '';
  if (dpBadgeStatus) {
    const st = dpBadgeStatus.status;
    if (st === 'unplanned' || st === 'overflow') {
      dpBadgeClass = ' task-card__time-badge--dp-warning';
      dpBadgeIcon = '<i data-lucide="triangle-alert" class="task-card__time-badge-icon"></i>';
      dpBadgeTooltip = st === 'unplanned'
        ? ' data-tooltip="Missing planned time"'
        : ` data-tooltip="Only ${formatMinutes(dpBadgeStatus.availableMinutes)} available"`;
    } else if (st === 'over') {
      dpBadgeClass = ' task-card__time-badge--dp-over';
      dpBadgeIcon = '<i data-lucide="triangle-alert" class="task-card__time-badge-icon"></i>';
      dpBadgeTooltip = ' data-tooltip="No time available"';
    }
  }

  let timeBadge = '';
  if (dpBadgeStatus && dpBadgeStatus.status === 'unplanned' && !showActualOnBadge && !isBacklog) {
    // Force a badge for unplanned tasks during daily planning
    timeBadge = `<span class="task-card__time-badge${dpBadgeClass}"${dpBadgeTooltip} data-card-time-badge>--:--${dpBadgeIcon}</span>`;
  } else if (showActualOnBadge && cardPlannedMins) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}${dpBadgeClass}"${dpBadgeTooltip} data-card-time-badge>${formatMinutes(actualMins)} / ${formatMinutes(cardPlannedMins)}${dpBadgeIcon}</span>`;
  } else if (showActualOnBadge) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}${dpBadgeClass}"${dpBadgeTooltip} data-card-time-badge>${formatMinutes(actualMins)} / --:--${dpBadgeIcon}</span>`;
  } else if (cardPlannedMins) {
    timeBadge = `<span class="task-card__time-badge${badgeGreenClass}${dpBadgeClass}"${dpBadgeTooltip} data-card-time-badge>${formatMinutes(cardPlannedMins)}${dpBadgeIcon}</span>`;
  }

  // For timer section: use daily time for past cards, aggregate for current
  const timerActualDisplay = isPast
    ? (dailySeconds ? formatMinutes(actualMins) : '--:--')
    : (isTimerRunning ? formatSeconds(task.actualTimeSeconds || 0) : formatActualDisplay(task.actualTimeSeconds || 0));
  const plannedDisplay = cardPlannedMins ? formatMinutes(cardPlannedMins) : '--:--';

  // Timer play/pause button: hidden for past and future cards
  const timerPlayBtn = (isPast || isFuture || isBacklog) ? '' : `
    <button class="task-card__timer-btn" type="button" data-card-timer-toggle data-rich-tooltip-label="${isTimerRunning ? 'Stop timer' : 'Start timer'}" data-rich-tooltip-shortcut-groups='[["Space"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="13">
      <i data-lucide="${isTimerRunning ? 'pause' : 'play'}"></i>
    </button>`;

  const actualMetric = (isFuture || isBacklog) ? '' : `
        <div class="task-card__timer-metric${isTimerRunning ? '' : ' task-card__timer-metric--clickable'}" data-card-actual-picker-btn data-rich-tooltip-label="Set actual time" data-rich-tooltip-shortcut-groups='[["E"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="13">
          <span class="task-card__timer-label">ACTUAL</span>
          <span class="task-card__timer-value${isTimerRunning ? ' task-card__timer-value--running' : ''}" data-card-timer-actual>${timerActualDisplay}</span>
        </div>
  `;

  const timerSection = showTimerDropdown ? `
    <div class="task-card__timer" data-card-timer>
      ${timerPlayBtn}
      <div class="task-card__timer-metrics">
        ${actualMetric}
        <div class="task-card__timer-metric${isPast && hasColumnTimebox ? '' : ' task-card__timer-metric--clickable'}"${isPast && hasColumnTimebox ? '' : ' data-card-planned-picker-btn'} data-rich-tooltip-label="Set planned time" data-rich-tooltip-shortcut-groups='[["W"]]' data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="13">
          <span class="task-card__timer-label">PLANNED</span>
          <span class="task-card__timer-value">${plannedDisplay}</span>
        </div>
      </div>
    </div>
  ` : '';

  // Rollover badge
  const rolloverCount = isBacklog ? 0 : (columnIsoDate ? getRolloverCount(task, columnIsoDate) : 0);
  const rolloverBadge = rolloverCount > 0
    ? `<span class="task-card__rollover-badge" data-rollover-tooltip="Rolled over ${rolloverCount} day${rolloverCount > 1 ? 's' : ''}">
         <span class="rollover-icon">
           <i data-lucide="rotate-cw" style="transform: rotate(105deg)"></i>
           <span class="rollover-count">${rolloverCount}</span>
         </span>
       </span>`
    : '';

  // Complete button logic for past columns
  let completeBtn;
  if (isBacklog) {
    completeBtn = '';
  } else if (isPast) {
    if (task.completedOnDate === columnIsoDate) {
      completeBtn = `<button class="task-card__complete-btn task-card__complete-btn--past-complete" aria-label="Uncomplete and move to today" data-past-uncomplete>
        <span class="complete-circle complete-circle--done">${CHECK_SVG}</span>
      </button>`;
    } else {
      completeBtn = '';
    }
  } else {
    completeBtn = `<button class="task-card__complete-btn" data-rich-tooltip-label="Complete task" data-rich-tooltip-shortcut-id="complete-task" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="10" aria-label="Mark complete">
      <span class="complete-circle">${CHECK_SVG}</span>
    </button>`;
  }

  // Hide hover icons for past columns
  const hoverIcons = isPast ? '' : `
    <button class="task-card__hover-icon" data-card-date-btn data-rich-tooltip-label="Set start date" data-rich-tooltip-shortcut-id="set-start-date" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="13" aria-label="Set start date" type="button">
      <i data-lucide="calendar"></i>
    </button>
    ${isBacklog ? '' : `<button class="task-card__hover-icon" data-card-clock-btn data-rich-tooltip-label="Set planned/actual time" data-rich-tooltip-placement="bottom" data-rich-tooltip-offset="13" aria-label="Timer" type="button">
      <i data-lucide="clock"></i>
    </button>`}
  `;

  card.innerHTML = `
    <div class="task-card__header">
      <div class="task-card__title-wrap">
        ${scheduledPills}
        <span class="task-card__title">${escapeHtml(task.title)}</span>
      </div>
      ${timeBadge}
    </div>
    ${renderSubtasks(task.subtasks, task.id, { isBacklog })}
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
  if (dailyShutdownState.isActive) {
    renderDailyShutdownMode();
    return;
  }
  const colEl = document.querySelector(`.day-column[data-col-id="${column.id}"]`);
  if (!colEl) return;

  moveCompletedTasksToBottom(column);
  column.tasks.forEach(ensureTaskTimeState);
  const filterId = getActiveTaskFilterId();
  const visibleTasks = filterTasksByChannel(getColumnVisibleTasks(column), filterId);

  const progress = computeProgress(column);
  const progressFill = colEl.querySelector('.progress-bar__fill');
  if (progressFill) progressFill.style.width = progress + '%';

  const colTotalEl = colEl.querySelector('.column-time-total');
  if (colTotalEl) {
    const badge = getColumnTimeBadgeConfig(column);
    colTotalEl.textContent = badge.text;
    colTotalEl.hidden = !badge.text;
    colTotalEl.classList.toggle('column-time-total--interactive', badge.interactive);
    if (badge.tooltip) {
      colTotalEl.setAttribute('data-tooltip', badge.tooltip);
    } else {
      colTotalEl.removeAttribute('data-tooltip');
    }
    if (badge.interactive) {
      colTotalEl.setAttribute('data-column-time-total-toggle', '');
      colTotalEl.setAttribute('role', 'button');
      colTotalEl.setAttribute('tabindex', '0');
    } else {
      colTotalEl.removeAttribute('data-column-time-total-toggle');
      colTotalEl.removeAttribute('role');
      colTotalEl.removeAttribute('tabindex');
    }
  }

  const taskList = colEl.querySelector('.task-list');
  taskList.innerHTML = '';

  // Compute daily-planning badge statuses for the planned-day column (steps 2-4)
  const dpBadgeMap = dailyPlanningState.isActive
    && dailyPlanningState.step >= DAILY_PLANNING_STEPS.WORKLOAD
    && column.isoDate === dailyPlanningState.selectedDate
    ? getDailyPlanningBadgeStatuses(visibleTasks, column.isoDate)
    : null;

  visibleTasks.forEach(task => {
    const dpStatus = dpBadgeMap ? dpBadgeMap.get(task.id) || null : null;
    taskList.appendChild(renderTaskCard(task, column.isoDate, false, dpStatus));
  });

  // Render ghost cards for past columns
  const todayISO = getTodayISO();
  if (column.isoDate <= todayISO) {
    const ghosts = filterTasksByChannel(getGhostTasksForDate(column.isoDate), filterId);
    ghosts.forEach(task => taskList.appendChild(renderTaskCard(task, column.isoDate, true)));
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (dailyPlanningState.isActive) {
    renderDailyPlanningPanel();
  }
  syncActiveTaskCardUI();
  refreshSearchPanelIfVisible();
}

function renderTrashPanel() {
  const panel = document.querySelector('[data-right-panel="trash"]');
  if (!panel) return;
  const listEl = panel.querySelector('[data-trash-list]');
  if (!listEl) return;

  const purgeResult = purgeExpiredTrash();
  if (purgeResult.expiredCount > 0) {
    reconcileVisibleRepeatTasks();
    renderAllColumns();
    if (openModalTaskId) {
      if (getTaskLocation(openModalTaskId)) rerenderOpenTaskDetailModal();
      else closeTaskDetailModal();
    }
  }
  const now = Date.now();
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  const visibleEntries = state.trash.filter(entry => {
    const ts = getDateLikeMs(entry.deletedAt);
    if (!Number.isFinite(ts)) return true;
    return now - ts <= maxAgeMs;
  }).sort((a, b) => {
    const aTs = getDateLikeMs(a.deletedAt);
    const bTs = getDateLikeMs(b.deletedAt);
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });

  listEl.innerHTML = '';
  if (visibleEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'trash-panel__empty';
    empty.textContent = 'Empty';
    listEl.appendChild(empty);
  } else {
    visibleEntries.forEach(entry => {
      const isoDate = getTrashSourceIsoDate(entry);
      const card = renderTaskCard(entry.task, isoDate, false, null);
      card.dataset.trashCard = 'true';
      listEl.appendChild(card);
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  syncActiveTaskCardUI();
  refreshSearchPanelIfVisible();
}

function hasUnreadArchiveTasks() {
  if (state.archive.length === 0) return false;
  const viewedMs = getDateLikeMs(settings.archiveLastViewedAt);
  return state.archive.some(task => {
    const archivedMs = getDateLikeMs(task.archivedAt);
    if (!Number.isFinite(archivedMs)) return !Number.isFinite(viewedMs);
    if (!Number.isFinite(viewedMs)) return true;
    return archivedMs > viewedMs;
  });
}

function updateArchiveIndicator() {
  const dot = document.querySelector('[data-archive-indicator]');
  if (!dot) return;
  dot.hidden = !hasUnreadArchiveTasks();
}

function closeArchiveDaysDropdown() {
  archivePanelState.daysDropdownOpen = false;
  const existing = document.querySelector('[data-archive-days-dropdown]');
  if (existing) existing.remove();
}

function openArchiveDaysDropdown() {
  closeArchiveDaysDropdown();
  closeCardDatePicker();
  closeStartDatePicker();
  const panel = document.querySelector('[data-right-panel="archive"]');
  const trigger = panel ? panel.querySelector('[data-archive-days-btn]') : null;
  if (!panel || !trigger) return;

  const options = getSettingsDropdownOptions('autoArchiveDays');
  const currentValue = settings.autoArchiveDays;
  let html = '<div class="settings-view__dropdown archive-panel__days-dropdown" data-archive-days-dropdown>';
  html += '<div class="settings-view__dropdown-arrow"></div>';
  html += '<div class="settings-view__dropdown-items">';
  for (const opt of options) {
    const selected = String(opt.value) === String(currentValue);
    html += `<button class="settings-view__dropdown-item" type="button" data-archive-days-option="${escapeHtml(String(opt.value))}">`
      + `<span>${escapeHtml(opt.label)}</span>`
      + `<span class="settings-view__dropdown-check">${selected ? '✓' : ''}</span>`
      + '</button>';
  }
  html += '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
  const dropdown = document.querySelector('[data-archive-days-dropdown]');
  if (!dropdown) return;
  dropdown.style.position = 'fixed';
  dropdown.style.zIndex = '7000';
  dropdown.style.right = 'auto';

  requestAnimationFrame(() => {
    const triggerRect = trigger.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const margin = 8;
    const top = triggerRect.bottom + 10;
    let left = triggerRect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - dropdownRect.width - margin));
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;

    const arrow = dropdown.querySelector('.settings-view__dropdown-arrow');
    if (arrow) {
      const arrowLeft = triggerRect.left + (triggerRect.width / 2) - left - 6;
      const maxArrowLeft = Math.max(12, dropdownRect.width - 24);
      arrow.style.left = `${Math.max(12, Math.min(arrowLeft, maxArrowLeft))}px`;
      arrow.style.right = 'auto';
    }

    const selectedItem = dropdown.querySelector('.settings-view__dropdown-items .settings-view__dropdown-item:has(.settings-view__dropdown-check:not(:empty))');
    if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
  });
  archivePanelState.daysDropdownOpen = true;
}

function closeArchiveDeleteModal() {
  archivePanelState.deleteModalOpen = false;
  const overlay = document.querySelector('[data-archive-delete-overlay]');
  if (overlay) overlay.remove();
  document.body.classList.remove('modal-open');
}

function openArchiveDeleteModal() {
  closeArchiveDaysDropdown();
  closeArchiveDeleteModal();
  archivePanelState.deleteModalOpen = true;
  const overlay = document.createElement('div');
  overlay.className = 'archive-delete-overlay';
  overlay.setAttribute('data-archive-delete-overlay', '');
  overlay.innerHTML = `
    <div class="archive-delete-modal" role="dialog" aria-modal="true" aria-labelledby="archive-delete-title">
      <h2 class="archive-delete-modal__title" id="archive-delete-title">Delete all archived tasks?</h2>
      <p class="archive-delete-modal__desc">You can always re-create or re-import tasks later if needed.</p>
      <div class="archive-delete-modal__actions">
        <button class="archive-delete-modal__btn" type="button" data-archive-delete-cancel>Back</button>
        <button class="archive-delete-modal__btn archive-delete-modal__btn--danger" type="button" data-archive-delete-confirm>Delete archived tasks</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
}

function moveAllArchiveTasksToTrash() {
  if (state.archive.length === 0) return;
  const tasks = [...state.archive];
  state.archive = [];
  tasks.forEach(task => {
    ensureTaskRolloverState(task);
    task.archivedAt = null;
    const deletedFromIsoDate = task.archiveSourceDate || task.startDate || getTodayISO();
    task.archiveSourceDate = null;
    state.trash.push({
      id: task.id,
      task,
      deletedAt: getNowIsoString(),
      deletedFrom: { isoDate: deletedFromIsoDate }
    });
    persistTrashEntry(state.trash[state.trash.length - 1]);
    persistDeleteTask(task.id);
  });
  renderTrashPanel();
  renderArchivePanel();
  updateArchiveIndicator();
}

function renderArchivePanel() {
  const panel = document.querySelector('[data-right-panel="archive"]');
  if (!panel) return;
  const titleEl = panel.querySelector('[data-archive-panel-title]');
  const toggleEl = panel.querySelector('[data-archive-toggle]');
  const enabledView = panel.querySelector('[data-archive-enabled-view]');
  const disabledView = panel.querySelector('[data-archive-disabled-view]');
  const deleteAllBtn = panel.querySelector('[data-archive-delete-all]');
  const daysLabel = panel.querySelector('[data-archive-days-label]');
  const listEl = panel.querySelector('[data-archive-list]');
  if (!titleEl || !toggleEl || !enabledView || !disabledView || !deleteAllBtn || !daysLabel || !listEl) return;
  const visibleArchiveTasks = filterTasksByChannel(state.archive, getActiveTaskFilterId());

  titleEl.textContent = 'Auto-archive';
  toggleEl.classList.toggle('settings-toggle--on', !!settings.autoArchiveEnabled);
  enabledView.hidden = !settings.autoArchiveEnabled;
  disabledView.hidden = !!settings.autoArchiveEnabled;
  deleteAllBtn.hidden = visibleArchiveTasks.length === 0;
  daysLabel.textContent = getSettingsDisplayLabel('autoArchiveDays', settings.autoArchiveDays);

  listEl.innerHTML = '';
  if (settings.autoArchiveEnabled) {
    if (visibleArchiveTasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'archive-panel__empty';
      empty.textContent = 'Empty';
      listEl.appendChild(empty);
    } else {
      visibleArchiveTasks.forEach(task => {
        const card = renderTaskCard(task, getArchiveSourceIsoDate(task), false, null, { isArchive: true });
        card.dataset.archiveCard = 'true';
        listEl.appendChild(card);
      });
    }
  }

  updateArchiveIndicator();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  syncActiveTaskCardUI();
  refreshSearchPanelIfVisible();
}

function getBacklogFilterLabel(filterId = getSharedHomeTodayFilterId()) {
  if (!filterId || filterId === 'all') return '#all';
  const channel = getChannelById(filterId);
  return channel ? `#${channel.label}` : '#all';
}

function renderBacklogFilterLabelHtml(filterId = getSharedHomeTodayFilterId()) {
  const label = getBacklogFilterLabel(filterId);
  const word = label.startsWith('#') ? label.slice(1) : label;
  const option = filterId === 'all'
    ? { hashColor: '#787878' }
    : (getChannelById(filterId) || { hashColor: '#787878' });
  return `<span class="backlog-panel__filter-hash" style="color:${escapeHtml(option.hashColor || '#787878')};">#</span>`
    + `<span class="backlog-panel__filter-name">${escapeHtml(word)}</span>`;
}

function getBacklogFilterOptions(query = '') {
  const filtered = getFilteredChannels(query);
  return [
    { id: 'all', label: 'all', hashColor: '#787878', isAll: true }
  ].concat(filtered.filter(ch => ch.id !== 'unassigned'));
}

function renderBacklogPanel() {
  const panel = document.querySelector('[data-right-panel="backlog"]');
  if (!panel) return;
  const listEl = panel.querySelector('[data-backlog-list]');
  const filterText = panel.querySelector('.backlog-panel__filter-text');
  if (!listEl || !filterText) return;

  const currentFilterId = getSharedHomeTodayFilterId();
  filterText.innerHTML = renderBacklogFilterLabelHtml(currentFilterId);
  listEl.innerHTML = '';

  BACKLOG_HORIZONS.forEach(horizon => {
    const section = document.createElement('section');
    section.className = 'backlog-section';
    section.dataset.backlogSection = horizon.id;
    section.innerHTML = `
      <div class="backlog-section__header">
        <span class="backlog-section__badge" style="background:${escapeHtml(horizon.color)};">${escapeHtml(horizon.letter)}</span>
        <span class="backlog-section__title">${escapeHtml(horizon.label)}</span>
        <button class="backlog-section__add-btn" type="button" aria-label="Add task" data-backlog-add-btn="${escapeHtml(horizon.id)}">
          <i data-lucide="plus"></i>
        </button>
      </div>
      <div class="backlog-section__list" data-backlog-horizon="${escapeHtml(horizon.id)}"></div>
    `;

    const sectionList = section.querySelector('[data-backlog-horizon]');
    if (!sectionList) {
      listEl.appendChild(section);
      return;
    }

    if (backlogPanelState.addHorizon === horizon.id) {
      const composer = document.createElement('div');
      composer.innerHTML = `
        <div class="add-task-input-wrap">
          <input class="add-task-input" type="text" placeholder="Task name..." data-backlog-add-input>
          <button class="add-task-confirm" type="button" aria-label="Add task" data-backlog-add-confirm>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      `;
      sectionList.appendChild(composer);
    }

    getBacklogTasksForHorizon(horizon.id, currentFilterId).forEach(task => {
      const card = renderTaskCard(task, getBacklogSourceIsoDate(task), false, null, { isBacklog: true });
      card.dataset.backlogCard = 'true';
      card.dataset.backlogHorizon = horizon.id;
      sectionList.appendChild(card);
    });

    listEl.appendChild(section);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();

  if (backlogPanelState.addHorizon) {
    requestAnimationFrame(() => {
      const input = panel.querySelector('[data-backlog-add-input]');
      if (input) input.focus();
    });
  }
  syncActiveTaskCardUI();
  refreshSearchPanelIfVisible();
}

function getSearchDateRangeLabel(rangeId = settings.searchDateRange) {
  const option = SEARCH_DATE_OPTIONS.find(item => item.id === rangeId);
  return option ? option.label : 'Anytime';
}

function hasActiveSearchFilters() {
  const filters = settings.searchFilters || DEFAULT_SEARCH_FILTERS;
  return !!(filters.hideCompleted || filters.hideIncomplete || filters.hidePlanningTasks || filters.hideRepeatingTasks);
}

function getSearchChannelControlLabel() {
  const channelId = settings.searchChannelFilterId || 'all';
  if (channelId === 'all') return 'Channel: all';
  const channel = getChannelById(channelId);
  if (!channel) return 'Channel: all';
  if (channel.id === 'unassigned') return 'Unassigned';
  return '#' + channel.label;
}

function getSearchResultSourceIsoDate(task, location, columnIsoDate = null) {
  if (!task) return getTodayISO();
  if (location === 'backlog') return getBacklogSourceIsoDate(task);
  if (location === 'archive') return getArchiveSourceIsoDate(task);
  return task.startDate || columnIsoDate || getTodayISO();
}

function getSearchSourceTasks() {
  const sources = [];
  state.columns.forEach(column => {
    getColumnVisibleTasks(column).forEach(task => {
      sources.push({
        task,
        location: 'column',
        sourceIsoDate: getSearchResultSourceIsoDate(task, 'column', column.isoDate)
      });
    });
  });
  state.backlog.forEach(task => {
    sources.push({
      task,
      location: 'backlog',
      sourceIsoDate: getSearchResultSourceIsoDate(task, 'backlog')
    });
  });
  state.archive.forEach(task => {
    sources.push({
      task,
      location: 'archive',
      sourceIsoDate: getSearchResultSourceIsoDate(task, 'archive')
    });
  });
  return sources;
}

function taskMatchesChannelFilter(task, filterId = settings.searchChannelFilterId) {
  return taskMatchesChannelFilterId(task, filterId);
}

function taskMatchesSearchDateRange(task, sourceIsoDate, rangeId = settings.searchDateRange) {
  if (!rangeId || rangeId === 'anytime') return true;
  const isoDate = task && task.startDate ? task.startDate : sourceIsoDate;
  if (!isoDate) return false;
  const todayISO = getTodayISO();
  const boundary = rangeId === 'last_week'
    ? addDays(todayISO, -7)
    : addDays(todayISO, -30);
  return isoDate >= boundary && isoDate <= todayISO;
}

function taskMatchesSearchFilters(task) {
  if (!task) return false;
  const filters = settings.searchFilters || DEFAULT_SEARCH_FILTERS;
  if (filters.hideCompleted && task.complete) return false;
  if (filters.hideIncomplete && !task.complete) return false;
  if (filters.hidePlanningTasks && (task.systemType === 'daily_planning' || task.systemType === 'daily_shutdown')) return false;
  if (filters.hideRepeatingTasks && task.isRepeatingTask) return false;
  return true;
}

function getTaskSearchMatchScore(task, query) {
  if (!task) return 0;
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const title = String(task.title || '').toLowerCase();
  const notes = stripHtmlToText(task.notes || '').toLowerCase();
  const subtasks = (task.subtasks || []).map(subtask => String(subtask.label || '').toLowerCase());

  let score = 0;
  if (title.includes(normalizedQuery)) score += title.startsWith(normalizedQuery) ? 120 : 100;
  if (notes.includes(normalizedQuery)) score += 45;
  subtasks.forEach(label => {
    if (label.includes(normalizedQuery)) score += 30;
  });
  return score;
}

function getSearchResultItems(query = searchPanelState.query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return [];

  return getSearchSourceTasks()
    .map(item => ({
      ...item,
      matchScore: getTaskSearchMatchScore(item.task, normalizedQuery)
    }))
    .filter(item => item.matchScore > 0)
    .filter(item => taskMatchesSearchFilters(item.task))
    .filter(item => taskMatchesSearchDateRange(item.task, item.sourceIsoDate))
    .filter(item => taskMatchesChannelFilter(item.task))
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const aDate = a.task.startDate || a.sourceIsoDate || '';
      const bDate = b.task.startDate || b.sourceIsoDate || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return String(a.task.title || '').localeCompare(String(b.task.title || ''));
    });
}

function renderSearchChannelMeta(task) {
  if (!task || !task.tag) return '';
  const style = getChannelStyle(task.tag);
  const hashColor = style ? style.hashColor : '#7da2ff';
  return `<span class="search-result-card__channel">`
    + `<span class="search-result-card__channel-hash" style="color:${escapeHtml(hashColor)};">#</span>`
    + `<span class="search-result-card__channel-label">${escapeHtml(task.tag.replace(/^#/, ''))}</span>`
    + `</span>`;
}

function renderSearchLocationMeta(location) {
  if (location === 'archive') {
    return `<span class="search-result-card__status"><i data-lucide="moon-star"></i><span>Archived</span></span>`;
  }
  if (location === 'backlog') {
    return `<span class="search-result-card__status"><i data-lucide="archive"></i><span>Backlog</span></span>`;
  }
  return '';
}

function renderSearchResultCard(item) {
  const task = item.task;
  const sourceIsoDate = task.startDate || item.sourceIsoDate || getTodayISO();
  const startDateClass = task.complete
    ? ' search-result-card__date--complete'
    : '';

  const card = document.createElement('button');
  card.className = 'search-result-card';
  card.type = 'button';
  card.dataset.taskId = task.id;
  card.innerHTML = `
    <div class="search-result-card__title">${escapeHtml(task.title || 'Untitled')}</div>
    <div class="search-result-card__meta">
      <div class="search-result-card__meta-left">
        ${renderSearchChannelMeta(task)}
        ${renderSearchLocationMeta(item.location)}
      </div>
      <div class="search-result-card__date${startDateClass}">${escapeHtml(formatDateDisplay(sourceIsoDate))}</div>
    </div>
  `;
  return card;
}

function closeSearchDropdown() {
  searchPanelState.dropdownOpen = null;
  const existing = document.querySelector('[data-search-dropdown]');
  if (existing) existing.remove();
}

function renderSearchFilterDropdownHTML() {
  const filters = settings.searchFilters || DEFAULT_SEARCH_FILTERS;
  const options = [
    { id: 'hideCompleted', label: 'Hide completed tasks' },
    { id: 'hideIncomplete', label: 'Hide incomplete tasks' },
    { id: 'hidePlanningTasks', label: 'Hide planning tasks' },
    { id: 'hideRepeatingTasks', label: 'Hide repeating tasks' }
  ];

  let html = '<div class="settings-view__dropdown search-panel__dropdown search-panel__dropdown--filter" data-search-dropdown="filter">';
  html += '<div class="settings-view__dropdown-arrow"></div>';
  html += '<div class="search-panel__dropdown-header">Filter tasks by:</div>';
  html += '<div class="settings-view__dropdown-items">';
  options.forEach(option => {
    html += `<button class="settings-view__dropdown-item search-panel__dropdown-item" type="button" data-search-filter-option="${option.id}">`
      + `<span>${escapeHtml(option.label)}</span>`
      + `<span class="settings-view__dropdown-check"${filters[option.id] ? '' : ' hidden'}>\u2713</span>`
      + `</button>`;
  });
  html += '</div></div>';
  return html;
}

function renderSearchDateDropdownHTML() {
  let html = '<div class="settings-view__dropdown search-panel__dropdown search-panel__dropdown--date" data-search-dropdown="date">';
  html += '<div class="settings-view__dropdown-arrow"></div>';
  html += '<div class="search-panel__dropdown-header">Show only tasks starting:</div>';
  html += '<div class="settings-view__dropdown-items">';
  SEARCH_DATE_OPTIONS.forEach(option => {
    const isSelected = option.id === settings.searchDateRange;
    html += `<button class="settings-view__dropdown-item search-panel__dropdown-item" type="button" data-search-date-option="${option.id}">`
      + `<span>${escapeHtml(option.label)}</span>`
      + `<span class="settings-view__dropdown-check"${isSelected ? '' : ' hidden'}>\u2713</span>`
      + `</button>`;
  });
  html += '</div></div>';
  return html;
}

function renderSearchChannelDropdownHTML() {
  const selectedId = settings.searchChannelFilterId || 'all';
  const options = getSearchChannelOptions();

  let html = '<div class="settings-view__dropdown search-panel__dropdown search-panel__dropdown--channel" data-search-dropdown="channel">';
  html += '<div class="settings-view__dropdown-arrow"></div>';
  html += '<div class="search-panel__dropdown-header">Show only tasks in channel:</div>';
  html += '<div class="settings-view__dropdown-items">';
  options.forEach(option => {
    const isSelected = option.id === selectedId;
    const nestedClass = option.context ? ' search-panel__dropdown-item--nested' : '';
    const label = option.isAll ? 'all' : option.label;
    html += `<button class="settings-view__dropdown-item search-panel__dropdown-item${nestedClass}" type="button" data-search-channel-option="${escapeHtml(option.id)}">`
      + `<span class="search-panel__dropdown-channel">`
      + `<span class="search-panel__dropdown-hash" style="color:${escapeHtml(option.hashColor || '#787878')};">#</span>`
      + `<span>${escapeHtml(label)}</span>`
      + `</span>`
      + `<span class="settings-view__dropdown-check"${isSelected ? '' : ' hidden'}>\u2713</span>`
      + `</button>`;
  });
  html += '</div></div>';
  return html;
}

function openSearchDropdown(type) {
  const panel = document.querySelector('[data-right-panel="search"]');
  if (!panel) return;

  if (searchPanelState.dropdownOpen === type) {
    closeSearchDropdown();
    return;
  }

  closeSearchDropdown();
  searchPanelState.dropdownOpen = type;

  const trigger = panel.querySelector(`[data-search-${type}-btn]`);
  if (!trigger) return;

  let html = '';
  if (type === 'filter') html = renderSearchFilterDropdownHTML();
  if (type === 'date') html = renderSearchDateDropdownHTML();
  if (type === 'channel') html = renderSearchChannelDropdownHTML();
  if (!html) return;

  panel.insertAdjacentHTML('beforeend', html);

  requestAnimationFrame(() => {
    const dropdown = panel.querySelector(`[data-search-dropdown="${type}"]`);
    if (!dropdown) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const panelPadding = 10;
    let left = triggerRect.left - panelRect.left;
    left = Math.max(panelPadding, Math.min(left, panelRect.width - dropdownRect.width - panelPadding));
    dropdown.style.left = `${left}px`;
    dropdown.style.top = `${triggerRect.bottom - panelRect.top + 10}px`;

    const arrow = dropdown.querySelector('.settings-view__dropdown-arrow');
    if (arrow) {
      const arrowLeft = triggerRect.left + (triggerRect.width / 2) - panelRect.left - left - 6;
      arrow.style.left = `${Math.max(10, Math.min(arrowLeft, dropdownRect.width - 22))}px`;
      arrow.style.right = 'auto';
    }
  });
}

function renderSearchPanel() {
  normalizeSearchSettings();

  const panel = document.querySelector('[data-right-panel="search"]');
  if (!panel) return;

  const input = panel.querySelector('[data-search-input]');
  const resetBtn = panel.querySelector('[data-search-reset]');
  const searchIcon = panel.querySelector('.search-panel__search-icon');
  const searchField = panel.querySelector('.search-panel__search-field');
  const resultsEl = panel.querySelector('[data-search-results]');
  const emptyEl = panel.querySelector('[data-search-empty]');
  const filterLabel = panel.querySelector('[data-search-filter-label]');
  const dateLabel = panel.querySelector('[data-search-date-label]');
  const channelLabel = panel.querySelector('[data-search-channel-label]');
  const filterBtn = panel.querySelector('[data-search-filter-btn]');
  const dateBtn = panel.querySelector('[data-search-date-btn]');
  const channelBtn = panel.querySelector('[data-search-channel-btn]');
  if (!input || !resetBtn || !searchIcon || !searchField || !resultsEl || !emptyEl || !filterLabel || !dateLabel || !channelLabel || !filterBtn || !dateBtn || !channelBtn) return;

  input.value = searchPanelState.query;
  const trimmedQuery = String(searchPanelState.query || '').trim();
  resetBtn.hidden = trimmedQuery.length === 0;
  searchIcon.classList.toggle('search-panel__search-icon--active', trimmedQuery.length > 0);
  searchField.classList.toggle('search-panel__search-field--active', trimmedQuery.length > 0);

  const filtersActive = hasActiveSearchFilters();
  filterBtn.classList.toggle('search-panel__control--active', filtersActive);
  filterBtn.classList.toggle('search-panel__control--inactive', !filtersActive);
  filterLabel.textContent = 'Filter';

  const dateActive = settings.searchDateRange && settings.searchDateRange !== 'anytime';
  dateBtn.classList.toggle('search-panel__control--active', dateActive);
  dateBtn.classList.toggle('search-panel__control--inactive', !dateActive);
  dateLabel.textContent = dateActive
    ? getSearchDateRangeLabel()
    : 'Date: Anytime';

  const channelActive = settings.searchChannelFilterId && settings.searchChannelFilterId !== 'all';
  channelBtn.classList.toggle('search-panel__control--active', channelActive);
  channelBtn.classList.toggle('search-panel__control--inactive', !channelActive);
  channelLabel.textContent = channelActive
    ? getSearchChannelControlLabel()
    : 'Channel: all';

  resultsEl.innerHTML = '';
  resultsEl.hidden = false;
  emptyEl.hidden = true;

  if (!trimmedQuery) {
    resultsEl.hidden = true;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const items = getSearchResultItems(trimmedQuery);
  if (items.length === 0) {
    resultsEl.hidden = true;
    emptyEl.hidden = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  items.forEach(item => {
    resultsEl.appendChild(renderSearchResultCard(item));
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function refreshSearchPanelIfVisible() {
  if (rightSidebarState.activePanel === 'search') {
    renderSearchPanel();
  }
}

function getCalendarEventsForDate(isoDate) {
  const filterId = getActiveTaskFilterId();
  // 1. Get stored calendar events for this date
  const stored = state.calendarEvents.filter(evt => {
    if (evt.date !== isoDate) return false;
    if (evt.systemType === 'actual' && !settings.visualizeActualTimeOnCalendar) return false;
    if (!evt.taskId) return true;
    const task = findTaskById(evt.taskId);
    return taskMatchesChannelFilterId(task, filterId);
  });
  const taskIdsInStored = new Set(stored.filter(e => e.taskId).map(e => e.taskId));

  // 2. Find tasks with scheduledTime in the matching column that don't already have a stored event
  const col = state.columns.find(c => c.isoDate === isoDate);
  const dynamic = [];
  if (col) {
    for (const task of col.tasks) {
      if (task.scheduledTime && !taskIdsInStored.has(task.id) && taskMatchesChannelFilterId(task, filterId)) {
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

function getTaskCompletionOffset(task) {
  ensureTaskRolloverState(task);
  if (!task.completedAt) return null;
  const completedAt = new Date(task.completedAt);
  if (Number.isNaN(completedAt.getTime())) return null;
  return completedAt.getHours()
    + (completedAt.getMinutes() / 60)
    + (completedAt.getSeconds() / 3600)
    + (completedAt.getMilliseconds() / 3600000);
}

function getCalendarCompletionMarkersForDate(isoDate) {
  const filterId = getActiveTaskFilterId();
  return getAllKnownTasks()
    .filter(task => {
      ensureTaskRolloverState(task);
      return task.completedOnDate === isoDate
        && !!task.completedAt
        && taskMatchesChannelFilterId(task, filterId);
    })
    .map(task => ({
      taskId: task.id,
      title: task.title || 'Task',
      offset: getTaskCompletionOffset(task)
    }))
    .filter(marker => Number.isFinite(marker.offset))
    .sort((a, b) => a.offset - b.offset || a.taskId.localeCompare(b.taskId));
}

function renderCalendarCompletionMarkers(timeGrid, visibleDate, anchorEl) {
  timeGrid.querySelectorAll('.cal-completion-marker').forEach(el => el.remove());
  if (settings.hideCompletedTasksInCalendar) return;

  const markers = getCalendarCompletionMarkersForDate(visibleDate);
  if (!markers.length) return;

  const hourHeight = getHourHeightPx(timeGrid);
  const overlapThresholdPx = 8;
  const horizontalStepPx = 4;
  let previousTopPx = null;
  let clusterIndex = 0;

  markers.forEach(marker => {
    const clampedOffset = clampCalendarOffset(marker.offset, 0, timeGrid);
    const topPx = clampedOffset * hourHeight;
    if (previousTopPx !== null && Math.abs(topPx - previousTopPx) <= overlapThresholdPx) {
      clusterIndex += 1;
    } else {
      clusterIndex = 0;
    }
    previousTopPx = topPx;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cal-completion-marker';
    button.dataset.taskId = marker.taskId;
    button.setAttribute('aria-label', `Open completed task: ${marker.title}`);
    button.setAttribute('data-rollover-tooltip', marker.title);
    button.style.setProperty('--offset', String(clampedOffset));
    button.style.setProperty('--marker-shift', `${clusterIndex * horizontalStepPx}px`);
    button.innerHTML = `<span class="complete-circle complete-circle--done complete-circle--tiny">${CHECK_SVG}</span>`;
    timeGrid.insertBefore(button, anchorEl);
  });
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
  timeGrid.querySelectorAll('.cal-completion-marker').forEach(el => el.remove());

  eventsForDate.forEach(evt => {
    if (!Number.isFinite(evt.zOrder)) {
      evt.zOrder = ++calZCounter;
    }

    const linkedTask = evt.taskId ? findTaskById(evt.taskId) : null;
    const eventColorClass = linkedTask
      ? getTaskEventColorClass(linkedTask, evt.colorClass || 'cal-event--blue')
      : (evt.colorClass || 'cal-event--blue');
    evt.colorClass = eventColorClass;

    // Resolve the channel's actual hashColor for inline styling
    const channelStyle = linkedTask ? getChannelStyle(linkedTask.tag) : null;

    const el = document.createElement('div');
    el.className = `cal-event ${eventColorClass}`;
    if (channelStyle) {
      el.style.backgroundColor = channelStyle.hashColor;
    }
    if (evt.systemType === 'actual') el.classList.add('cal-event--actual');
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

  renderCalendarCompletionMarkers(timeGrid, visibleDate, ghost);
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

const CURRENT_TIME_UPDATE_INTERVAL_MS = 60 * 1000;
let currentTimeLineInterval = null;
let currentTimeLineTimeout = null;

function updateCurrentTimeLine() {
  const timeGrid = document.getElementById('time-grid');
  const line = document.getElementById('current-time-line');
  if (!timeGrid || !line) return;

  const visibleDate = getFirstVisibleDate();
  const todayISO = getTodayISO();
  const shouldShow = visibleDate === todayISO;
  line.hidden = !shouldShow;
  if (!shouldShow) return;

  const now = new Date();
  const offset = (now.getHours() - CALENDAR_START_HOUR) + (now.getMinutes() / 60);
  const clamped = clampCalendarOffset(offset, 0, timeGrid);
  line.style.setProperty('--offset', String(clamped));
}

function scheduleCurrentTimeLineUpdates() {
  if (currentTimeLineTimeout) clearTimeout(currentTimeLineTimeout);
  if (currentTimeLineInterval) clearInterval(currentTimeLineInterval);

  const now = new Date();
  const msToNextMinute = Math.max(0, (60 - now.getSeconds()) * 1000 - now.getMilliseconds());

  updateCurrentTimeLine();
  currentTimeLineTimeout = setTimeout(() => {
    updateCurrentTimeLine();
    currentTimeLineInterval = setInterval(updateCurrentTimeLine, CURRENT_TIME_UPDATE_INTERVAL_MS);
  }, msToNextMinute || CURRENT_TIME_UPDATE_INTERVAL_MS);
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
  const isAfterShutdownSwitch = isToday && new Date().getHours() >= 15;
  let planLabel = 'Plan';
  let planMode = 'plan';
  if (isPast) {
    planLabel = 'Reflect';
    planMode = 'shutdown';
  } else if (isAfterShutdownSwitch) {
    planLabel = 'Shutdown';
    planMode = 'shutdown';
  }
  const colEl = document.createElement('div');
  colEl.className = 'day-column' + (isToday ? ' day-column--today' : '') + (isPast ? ' day-column--past' : '');
  colEl.dataset.colId = column.id;
  colEl.dataset.isoDate = column.isoDate;

  colEl.innerHTML = `
    <div class="day-column__header">
      <a href="#" class="day-name day-name--link" data-day-header-link>${escapeHtml(column.dayName)}</a>
      <span class="day-date">${escapeHtml(column.date)}</span>
      <button class="day-column__plan-btn" type="button" data-plan-btn data-plan-mode="${planMode}">${planLabel}</button>
    </div>
    <div class="progress-bar${isToday ? '' : ' progress-bar--hidden'}">
      <div class="progress-bar__fill" style="width:0%"></div>
    </div>
    <div class="add-task-row">
      ${renderAddTaskButtonHtml({ showShortcut: isToday })}
      ${renderColumnTimeBadgeHtml(column)}
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
  if (dailyShutdownState.isActive) {
    renderDailyShutdownMode();
    return;
  }
  if (dailyPlanningState.isActive) {
    renderDailyPlanningMode();
    return;
  }
  if (todayViewState.isActive) {
    renderTodayViewMode();
    return;
  }

  const container = document.getElementById('day-columns');
  const { startISO, endISO } = state.dayWindow;
  if (!startISO || !endISO) return;
  reconcileVisibleRepeatTasks();
  ensureColumnsForWindow(startISO, endISO);
  const visibleCols = getColumnsInWindow(startISO, endISO);
  container.innerHTML = '';
  visibleCols.forEach(col => {
    const colEl = createColumnElement(col);
    container.appendChild(colEl);
    renderColumn(col);
  });
  syncActiveTaskCardUI();
  refreshSearchPanelIfVisible();
  updateTopbarFilterButton();
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

  // Lazy-load tasks for newly visible dates from Firestore
  if (_currentUserId) {
    const unloadedDates = [];
    for (const col of state.columns) {
      if (!_loadedDateRanges.has(col.isoDate)) unloadedDates.push(col.isoDate);
    }
    if (unloadedDates.length > 0) {
      const rangeStart = unloadedDates[0];
      const rangeEnd = unloadedDates[unloadedDates.length - 1];
      DB.loadTasksForDateRange(_currentUserId, rangeStart, rangeEnd).then(docs => {
        populateColumnsFromTasks(docs);
        unloadedDates.forEach(d => _loadedDateRanges.add(d));
        initializeTaskTimeState();
        renderAllColumns();
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }).catch(err => console.error('Failed to lazy-load tasks:', err));
    }
  }
}

function recycleDayWindowIfNeeded() {
  if (dailyPlanningState.isActive) return;
  if (dailyShutdownState.isActive) return;
  if (todayViewState.isActive) return;
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
  if (todayViewState.isActive) return false;
  if (!state.dayWindow.startISO || !state.dayWindow.endISO) initializeDayWindow();
  if (isIsoInRange(isoDate, state.dayWindow.startISO, state.dayWindow.endISO)) return false;

  state.dayWindow.startISO = addDays(isoDate, -DAY_WINDOW_RADIUS);
  state.dayWindow.endISO = addDays(isoDate, DAY_WINDOW_RADIUS);
  ensureColumnsForWindow(state.dayWindow.startISO, state.dayWindow.endISO);
  pruneFarEmptyColumns();
  renderAllColumns();

  // Lazy-load tasks for newly visible dates
  if (_currentUserId) {
    const unloadedDates = state.columns
      .map(c => c.isoDate)
      .filter(d => !_loadedDateRanges.has(d));
    if (unloadedDates.length > 0) {
      DB.loadTasksForDateRange(_currentUserId, unloadedDates[0], unloadedDates[unloadedDates.length - 1])
        .then(docs => {
          populateColumnsFromTasks(docs);
          unloadedDates.forEach(d => _loadedDateRanges.add(d));
          initializeTaskTimeState();
          renderAllColumns();
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }).catch(err => console.error('Failed to lazy-load tasks:', err));
    }
  }
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
  if (todayViewState.isActive) {
    todayViewState.selectedDate = isoDate;
    renderTodayViewMode();
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
  container.classList.add('board__columns--instant-hide');

  const snap = () => scrollToDateColumn(targetISO, { behavior: 'auto' });

  function reveal() {
    snap();
    labelUpdateSuppressed = false;
    updateTodayButtonLabel._lastCalDate = null; // force calendar re-render
    updateTodayButtonLabel(targetISO);
    container.classList.remove('board__columns--instant-hide');
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
    if (stableCount >= 2) {
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
  let ctx = findTaskContext(taskId);
  if (!ctx) return;
  if (ctx.index === -1 && isDerivedRepeatTask(ctx.task)) {
    materializeDerivedTask(ctx.task);
    ctx = findTaskContext(taskId);
    if (!ctx) return;
  }

  const sourceCol = ctx.column;
  const targetCol = findOrCreateColumn(targetIsoDate);

  if (sourceCol.id === targetCol.id) {
    ensureTaskRolloverState(ctx.task);
    if (ctx.task.startDate === targetIsoDate) return;
    ctx.task.startDate = targetIsoDate;
    markTaskAsRepeatModified(ctx.task);
    renderColumn(sourceCol);
    renderCalendarEvents();
    persistTask(ctx.task, 0);
    return;
  }

  sourceCol.tasks.splice(ctx.index, 1);
  targetCol.tasks.push(ctx.task);

  ensureTaskRolloverState(ctx.task);
  ctx.task.startDate = targetIsoDate;
  markTaskAsRepeatModified(ctx.task);

  // Moving to a past date completes the task as of that date
  const todayISO = getTodayISO();
  if (targetIsoDate < todayISO) {
    completeTaskAsOf(ctx.task, targetIsoDate);
    moveCompletedTasksToBottom(targetCol);
  }

  renderColumn(sourceCol);
  renderColumn(targetCol);
  renderCalendarEvents();
  persistTask(ctx.task, 0);
}

function getBacklogNewTaskTag() {
  const filterId = backlogPanelState.filterId;
  if (filterId && filterId !== 'all') {
    const channel = getChannelById(filterId);
    if (channel && channel.id !== 'unassigned') return '#' + channel.label;
    if (channel && channel.id === 'unassigned') return null;
  }
  if (!settings.defaultChannelId) return null;
  const defaultChannel = getChannelById(settings.defaultChannelId);
  return defaultChannel ? `#${defaultChannel.label}` : null;
}

function showBacklogAddTaskInput(horizonId) {
  backlogPanelState.addHorizon = horizonId;
  renderBacklogPanel();
}

function hideBacklogAddTaskInput() {
  if (!backlogPanelState.addHorizon) return;
  backlogPanelState.addHorizon = null;
  renderBacklogPanel();
}

function commitBacklogAddTask(horizonId, title) {
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) {
    hideBacklogAddTaskInput();
    return null;
  }

  const task = {
    id: uid(),
    title: trimmedTitle,
    timeEstimateMinutes: 0,
    actualTimeSeconds: 0,
    ownPlannedMinutes: 0,
    ownActualTimeSeconds: 0,
    scheduledTime: null,
    complete: false,
    tag: getBacklogNewTaskTag(),
    integrationColor: null,
    subtasks: [],
    showSubtasks: false,
    startDate: getTodayISO(),
    dailyActualTime: {},
    subtaskCompletionsByDate: {},
    completedOnDate: null,
    completedAt: null,
    backlogHorizon: horizonId,
    backlogOrder: null
  };

  insertTaskIntoBacklog(task, horizonId, 0);
  backlogPanelState.addHorizon = null;
  renderBacklogPanel();
  persistTask(task, 0);
  return task;
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
  const todayISO = getTodayISO();

  column.tasks.unshift({
    id: uid(),
    title,
    timeEstimateMinutes: 0,
    actualTimeSeconds: 0,
    ownPlannedMinutes: 0,
    ownActualTimeSeconds: 0,
    scheduledTime: null,
    complete: false,
    tag: settings.defaultChannelId ? (CHANNELS.find(c => c.id === settings.defaultChannelId) || {}).label || null : null,
    integrationColor: null,
    subtasks: [],
    showSubtasks: false,
    startDate: column.isoDate,
    dailyActualTime: {},
    subtaskCompletionsByDate: {},
    completedOnDate: null,
    completedAt: null
  });

  const newTask = column.tasks[0];
  if (column.isoDate < todayISO) {
    completeTaskAsOf(newTask, column.isoDate);
    moveCompletedTasksToBottom(column);
  }
  hideAddTaskInput(colEl);
  renderColumn(column);
  persistTask(newTask, 0);
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
    const backlogList = closestFromTarget(target, '[data-backlog-horizon]');
    if (backlogList) return backlogList;
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
      if (todayViewState.isActive) return;
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
    const isTrashCard = card.dataset.trashCard === 'true';
    const isBacklogCard = card.dataset.backlogCard === 'true';
    const isArchiveCard = card.dataset.archiveCard === 'true';
    const colEl = card.closest('.day-column');
    if (!colEl && !isTrashCard && !isBacklogCard && !isArchiveCard) return false;

    if (cardDatePickerState && cardDatePickerState.taskId === card.dataset.taskId) closeCardDatePicker();

    // Recover from any prior interrupted drag that left a card hidden.
    clearTaskDraggingClass();

    // Forcibly clear any stale cal-event drag state before task drag begins.
    clearCalendarDragState();

    dragState.taskId      = card.dataset.taskId;
    dragState.isGhost     = card.dataset.ghostDate ? true : false;
    dragState.ghostVisualColId = null;
    dragState.fromTrash   = isTrashCard;
    dragState.fromBacklog = isBacklogCard;
    dragState.fromArchive = isArchiveCard;

    if (isTrashCard) {
      const entry = findTrashEntry(dragState.taskId);
      if (!entry) return false;
      dragState.sourceColId = null;
      dragState.sourceIndex = null;
      dragState.sourceBacklogHorizon = null;
      dragState.sourceIsoDate = getTrashSourceIsoDate(entry);

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

      setActiveDrag('task', dragState.taskId);
      clearPendingDrag();
      document.body.classList.add('is-task-reordering');
      scheduleTaskDragClass(card);
      return true;
    }

    if (isBacklogCard) {
      const task = findBacklogTask(dragState.taskId);
      if (!task) return false;
      dragState.sourceColId = null;
      dragState.sourceIndex = null;
      dragState.sourceBacklogHorizon = task.backlogHorizon || null;
      dragState.sourceIsoDate = getBacklogSourceIsoDate(task);

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

      setActiveDrag('task', dragState.taskId);
      clearPendingDrag();
      document.body.classList.add('is-task-reordering');
      scheduleTaskDragClass(card);
      return true;
    }

    if (isArchiveCard) {
      const task = findArchiveTask(dragState.taskId);
      if (!task) return false;
      dragState.sourceColId = null;
      dragState.sourceIndex = null;
      dragState.sourceBacklogHorizon = null;
      dragState.sourceIsoDate = getArchiveSourceIsoDate(task);

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

      setActiveDrag('task', dragState.taskId);
      clearPendingDrag();
      document.body.classList.add('is-task-reordering');
      scheduleTaskDragClass(card);
      return true;
    }

    if (card.dataset.repeatDerived === 'true') {
      const derivedTask = getRepeatRuntimeTaskById(dragState.taskId);
      if (derivedTask) {
        materializeDerivedTask(derivedTask);
      }
    }

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
    const sourceCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!sourceCard) return false;
    return beginTaskDragFromCard(sourceCard);
  }

  function cleanupTaskDropVisuals() {
    clearTaskDraggingClass();
    if (taskDropPlaceholder && taskDropPlaceholder.parentElement) taskDropPlaceholder.remove();
    taskDropPlaceholder = null;
    document.querySelectorAll('.task-list.drag-over, .backlog-section__list.drag-over').forEach(el => {
      el.classList.remove('drag-over');
      delete el.dataset.dropIndex;
    });
    document.querySelectorAll('.task-list, .backlog-section__list').forEach(el => {
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
      : settings.defaultTimeboxDurationMinutes / 60;
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
      : settings.defaultTimeboxDurationMinutes / 60;
    const offset = yToOffset(clientY, timeGrid, duration);
    const visibleDate = getFirstVisibleDate();

    // Always create a new stored timebox event (supports multiple per task per day)
    const newTimeboxEvt = {
      id: 'evt-' + uid(),
      title: task.title,
      colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
      offset,
      duration,
      taskId: task.id,
      date: visibleDate,
      zOrder: ++calZCounter
    };
    state.calendarEvents.push(newTimeboxEvt);

    // Clear scheduledTime since the task now has a committed stored event
    task.scheduledTime = null;

    const homeCol = state.columns.find(c => c.tasks.some(t => t.id === task.id));

    if (homeCol) renderColumn(homeCol);
    // Re-render ghost columns — adding a calendar event may create a ghost card
    rerenderGhostColumns(task);
    renderCalendarEvents();
    persistTask(task, 0);
    persistCalendarEvent(newTimeboxEvt);
    return true;
  }

  function dropTaskIntoList(taskList) {
    if (!taskList || !dragState.taskId) return false;
    const targetHorizon = taskList.dataset.backlogHorizon || null;
    if (targetHorizon) {
      const cards = [...taskList.querySelectorAll('.task-card:not(.task-card--dragging):not(.task-card--placeholder)')];
      let insertIndex = cards.length;
      if (taskList.dataset.dropIndex !== undefined) {
        const parsed = Number.parseInt(taskList.dataset.dropIndex, 10);
        if (Number.isFinite(parsed)) insertIndex = Math.max(0, Math.min(parsed, cards.length));
      }

      if (dragState.fromBacklog) {
        const task = removeTaskFromBacklog(dragState.taskId);
        if (!task) return false;
        insertTaskIntoBacklog(task, targetHorizon, insertIndex);

        cleanupTaskDropVisuals();
        renderBacklogPanel();
        persistTask(task, 0);
        setTimeout(finalizeTaskDragState, 0);
        return true;
      }

      if (dragState.fromTrash || dragState.fromArchive) return false;

      const sourceCol = state.columns.find(c => c.id === dragState.sourceColId);
      if (!sourceCol) return false;
      const taskIndex = sourceCol.tasks.findIndex(t => t.id === dragState.taskId);
      if (taskIndex === -1) return false;
      const [task] = sourceCol.tasks.splice(taskIndex, 1);
      task.scheduledTime = null;
      const removedCalEvents = state.calendarEvents.filter(evt => evt.taskId === task.id && evt.systemType !== 'actual');
      state.calendarEvents = state.calendarEvents.filter(evt => evt.taskId !== task.id || evt.systemType === 'actual');
      insertTaskIntoBacklog(task, targetHorizon, insertIndex);

      cleanupTaskDropVisuals();
      renderColumn(sourceCol);
      renderBacklogPanel();
      renderCalendarEvents();
      persistTask(task, 0);
      removedCalEvents.forEach(ev => persistDeleteCalendarEvent(ev.id));
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    const targetColEl = taskList.closest('.day-column');
    if (!targetColEl) return false;
    const targetColId = targetColEl.dataset.colId;

    const cards = [...taskList.querySelectorAll('.task-card:not(.task-card--dragging):not(.task-card--placeholder)')];
    let insertIndex = cards.length;
    if (taskList.dataset.dropIndex !== undefined) {
      const parsed = Number.parseInt(taskList.dataset.dropIndex, 10);
      if (Number.isFinite(parsed)) insertIndex = Math.max(0, Math.min(parsed, cards.length));
    }

    const targetCol = state.columns.find(c => c.id === targetColId);
    if (!targetCol) return false;

    if (dragState.fromTrash) {
      const entry = findTrashEntry(dragState.taskId);
      if (!entry) return false;
      const task = entry.task;
      ensureTaskTimeState(task);
      ensureTaskRolloverState(task);

      // Remove from trash
      state.trash = state.trash.filter(item => item.task.id !== dragState.taskId);

      const todayISO = getTodayISO();
      const sourceIso = dragState.sourceIsoDate || getTrashSourceIsoDate(entry);

      targetCol.tasks.splice(insertIndex, 0, task);

      if (targetCol.isoDate < todayISO && sourceIso >= todayISO) {
        completeTaskAsOf(task, targetCol.isoDate);
        task.startDate = targetCol.isoDate;
        moveCompletedTasksToBottom(targetCol);
      } else if (sourceIso < todayISO && targetCol.isoDate >= todayISO) {
        clearTaskCompletionMetadata(task);
        task.startDate = targetCol.isoDate;
        task.scheduledTime = null;
      } else {
        task.startDate = targetCol.isoDate;
      }

      cleanupTaskDropVisuals();
      renderColumn(targetCol);
      renderCalendarEvents();
      renderTrashPanel();
      persistTask(task, 0);
      persistRemoveFromTrash(dragState.taskId);
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    if (dragState.fromBacklog) {
      const restored = restoreBacklogTask(dragState.taskId, { targetIsoDate: targetCol.isoDate, insertIndex, applyDropRules: true });
      if (!restored) return false;

      cleanupTaskDropVisuals();
      renderColumn(restored.column);
      renderCalendarEvents();
      renderBacklogPanel();
      persistTask(restored.task, 0);
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    if (dragState.fromArchive) {
      const restored = restoreArchiveTask(dragState.taskId, { targetIsoDate: targetCol.isoDate, insertIndex, applyDropRules: true });
      if (!restored) return false;

      cleanupTaskDropVisuals();
      renderColumn(restored.column);
      renderCalendarEvents();
      renderArchivePanel();
      persistTask(restored.task, 0);
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    const sourceCol = state.columns.find(c => c.id === dragState.sourceColId);
    if (!sourceCol) return false;
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
      renderCalendarEvents();
      persistTask(task, 0);
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    // Dropping within the past → keep complete, but move the completion marker
    // to the new day so untimed/unused tasks behave like a move instead of a duplicate.
    if (sourceCol.isoDate < todayISO && targetCol.isoDate < todayISO) {
      targetCol.tasks.splice(insertIndex, 0, task);
      applyTaskCompletionMetadata(task, targetCol.isoDate);
      task.startDate = targetCol.isoDate;
      moveCompletedTasksToBottom(targetCol);
      cleanupTaskDropVisuals();
      renderColumn(sourceCol);
      renderColumn(targetCol);
      renderCalendarEvents();
      persistTask(task, 0);
      setTimeout(finalizeTaskDragState, 0);
      return true;
    }

    // Dropping from past to current/future → uncomplete, set new startDate
    if (sourceCol.isoDate < todayISO && targetCol.isoDate >= todayISO) {
      targetCol.tasks.splice(insertIndex, 0, task);
      clearTaskCompletionMetadata(task);
      task.startDate = targetCol.isoDate;
      // Clear scheduledTime so it doesn't create a phantom timebox on the new date
      task.scheduledTime = null;
      cleanupTaskDropVisuals();
      renderColumn(sourceCol);
      renderColumn(targetCol);
      renderCalendarEvents();
      persistTask(task, 0);
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
    persistTask(task, 0);
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
    toggleTaskCompletionForShortcut(taskId);
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
    markTaskAsRepeatModified(ctx.task);
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
    persistTask(ctx.task, 0);
  });

  // ── Show add-task input ─────────────────────
  container.addEventListener('click', e => {
    const badge = closestFromTarget(e.target, '[data-column-time-total-toggle]');
    if (!badge) return;
    e.preventDefault();
    e.stopPropagation();
    const colEl = badge.closest('.day-column');
    if (!colEl) return;
    const isoDate = colEl.dataset.isoDate;
    if (!isoDate || isoDate !== getTodayISO()) return;
    const column = state.columns.find(c => c.id === colEl.dataset.colId);
    if (!column) return;
    toggleColumnTimeBadgeMode(isoDate);
    renderColumn(column);
  });

  container.addEventListener('keydown', e => {
    const badge = closestFromTarget(e.target, '[data-column-time-total-toggle]');
    if (!badge) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const colEl = badge.closest('.day-column');
    if (!colEl) return;
    const isoDate = colEl.dataset.isoDate;
    if (!isoDate || isoDate !== getTodayISO()) return;
    const column = state.columns.find(c => c.id === colEl.dataset.colId);
    if (!column) return;
    toggleColumnTimeBadgeMode(isoDate);
    renderColumn(column);
  });

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

  // ── Plan button: enter daily planning for column date ──
  container.addEventListener('click', e => {
    const planBtn = closestFromTarget(e.target, '[data-plan-btn]');
    if (!planBtn) return;
    e.stopPropagation();
    const colEl = planBtn.closest('.day-column');
    if (!colEl) return;
    const isoDate = colEl.dataset.isoDate;
    const mode = planBtn.dataset.planMode || 'plan';
    if (!isoDate) return;
    if (mode === 'shutdown') {
      enterDailyShutdownMode(isoDate);
      return;
    }
    enterDailyPlanningMode(isoDate);
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
      openCardDatePicker(taskId, card);
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
    const columnDate = card.dataset.columnDate || card.dataset.ghostDate || null;

    // If timer area is not showing, expand it
    const timerKey = getCardTimerKeyForCard(card);
    if (!cardTimerExpanded.has(timerKey) && !(focusState.running && focusState.taskId === taskId)) {
      if (timerKey) cardTimerExpanded.add(timerKey);
      const col = columnDate
        ? state.columns.find(c => c.isoDate === columnDate)
        : state.columns.find(c => c.tasks.some(t => t.id === taskId));
      if (col) renderColumn(col);

      // If no planned time, also open the planned time picker
      if (!task.timeEstimateMinutes) {
        setTimeout(() => openCardPicker(taskId, 'planned'), 0);
      }

      // Scroll card into view if timer area extends below column
      requestAnimationFrame(() => {
        const cardSelector = columnDate
          ? `.task-card[data-task-id="${taskId}"][data-column-date="${columnDate}"]`
          : `.task-card[data-task-id="${taskId}"]`;
        const updatedCard = document.querySelector(cardSelector);
        if (updatedCard) {
          const scroller = getScrollableTaskAncestor(updatedCard, 'y');
          if (scroller) {
            const cardRect = updatedCard.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            if (cardRect.bottom > scrollerRect.bottom) {
              scroller.scrollTop += cardRect.bottom - scrollerRect.bottom + 8;
            }
          }
        }
      });
    } else {
      // Timer area already visible — collapse it
      if (cardPickerState) closeCardPicker();
      const key = getCardTimerKeyForCard(card);
      if (key) cardTimerExpanded.delete(key);
      const col = columnDate
        ? state.columns.find(c => c.isoDate === columnDate)
        : state.columns.find(c => c.tasks.some(t => t.id === taskId));
      if (col) renderColumn(col);
    }
  });

  // ── Card hover: auto-collapse timer after leave ──
  container.addEventListener('mouseover', e => {
    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    const related = e.relatedTarget;
    if (related && card.contains(related)) return;
    const taskId = card.dataset.taskId;
    const columnDate = card.dataset.columnDate || card.dataset.ghostDate || null;
    clearCardTimerAutoCollapse(taskId, columnDate);
  });

  container.addEventListener('mouseout', e => {
    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    const related = e.relatedTarget;
    if (related && card.contains(related)) return;
    const taskId = card.dataset.taskId;
    const columnDate = card.dataset.columnDate || card.dataset.ghostDate || null;
    const key = getCardTimerKey(taskId, columnDate);
    if (!cardTimerExpanded.has(key)) return;
    if (focusState.running && focusState.taskId === taskId) return;
    if (cardPickerState && cardPickerState.taskId === taskId) return;
    if (cardDatePickerState && cardDatePickerState.taskId === taskId) return;
    scheduleCardTimerAutoCollapse(taskId, columnDate);
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
    const isShutdownCard = dailyShutdownState.isActive && !!columnDate;

    const timerKey = getCardTimerKeyForCard(card);
    if (cardTimerExpanded.has(timerKey)) {
      if (cardPickerState) closeCardPicker();
      cardTimerExpanded.delete(timerKey);
    } else {
      cardTimerExpanded.add(timerKey);
    }
    // Re-render the column that contains this card
    const col = columnDate
      ? state.columns.find(c => c.isoDate === columnDate)
      : state.columns.find(c => c.tasks.some(t => t.id === taskId));
    if (col) renderColumn(col);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // On past cards, also open the actual time picker after expanding
    if ((isPastCard || isShutdownCard) && cardTimerExpanded.has(timerKey) && columnDate) {
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
      const key = getCardTimerKeyForCard(card);
      if (key) cardTimerExpanded.delete(key);
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
        if ((card.dataset.isPast === 'true' || dailyShutdownState.isActive) && card.dataset.columnDate) {
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
        if ((card.dataset.isPast === 'true' || dailyShutdownState.isActive) && card.dataset.columnDate) {
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
      document.querySelectorAll('.task-list.drag-over, .backlog-section__list.drag-over').forEach(el => {
        el.classList.remove('drag-over');
        delete el.dataset.dropIndex;
      });
      document.querySelectorAll('.task-list, .backlog-section__list').forEach(el => {
        delete el.dataset.dropIndex;
      });
      if (taskDropPlaceholder && taskDropPlaceholder.parentElement) {
        taskDropPlaceholder.remove();
      }
    }

    const overTimeline = !!(target && closestFromTarget(target, '#time-grid'));
    if (overTimeline && !dragState.fromTrash && !dragState.fromBacklog) {
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
    if (overTimeline && !dragState.fromTrash && !dragState.fromBacklog) {
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
    if (nextTarget && closestFromTarget(nextTarget, '[data-backlog-horizon]') === taskList) return;
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

function attachTrashEvents() {
  const list = document.querySelector('[data-trash-list]');
  if (!list) return;

  function closestFromTarget(target, selector) {
    if (target instanceof Element) return target.closest(selector);
    if (target instanceof Node && target.parentElement) return target.parentElement.closest(selector);
    return null;
  }

  list.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (activeDragType || dragState.taskId || taskPointerDrag || calPointerDrag) return;
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

  list.addEventListener('click', e => {
    const completeBtn = closestFromTarget(e.target, '.task-card__complete-btn');
    if (completeBtn) {
      e.stopImmediatePropagation();
      closeCardPicker();
      closeCardDatePicker();
      closeChannelPicker();
      const card = completeBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      const restored = restoreTrashTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
      if (!restored) return;
      completeTaskAsOf(restored.task, getTodayISO());
      restored.task.startDate = getTodayISO();
      moveCompletedTasksToBottom(restored.column);
      renderColumn(restored.column);
      renderCalendarEvents();
      renderTrashPanel();
      persistTask(restored.task, 0);
      persistRemoveFromTrash(taskId);
      return;
    }

    const subtaskBtn = closestFromTarget(e.target, '[data-card-subtask-check]');
    if (subtaskBtn) {
      e.stopImmediatePropagation();
      closeCardPicker();
      closeCardDatePicker();
      closeChannelPicker();
      const subtaskEl = subtaskBtn.closest('.subtask');
      const card = subtaskBtn.closest('.task-card');
      if (!subtaskEl || !card) return;
      const taskId = card.dataset.taskId;
      const subtaskId = subtaskEl.dataset.subtaskId;
      if (!subtaskId) return;
      const restored = restoreTrashTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
      if (!restored) return;
      const subtask = findSubtask(restored.task, subtaskId);
      if (!subtask) return;
      subtask.done = !subtask.done;
      subtask.deleteReady = false;
      ensureTaskRolloverState(restored.task);
      const todayISO = getTodayISO();
      if (subtask.done) {
        if (!restored.task.subtaskCompletionsByDate[todayISO]) restored.task.subtaskCompletionsByDate[todayISO] = [];
        if (!restored.task.subtaskCompletionsByDate[todayISO].includes(subtask.id)) {
          restored.task.subtaskCompletionsByDate[todayISO].push(subtask.id);
        }
      } else {
        for (const date in restored.task.subtaskCompletionsByDate) {
          const arr = restored.task.subtaskCompletionsByDate[date];
          const idx = arr.indexOf(subtask.id);
          if (idx !== -1) { arr.splice(idx, 1); if (arr.length === 0) delete restored.task.subtaskCompletionsByDate[date]; }
        }
      }
      renderColumn(restored.column);
      renderCalendarEvents();
      renderTrashPanel();
      persistTask(restored.task, 0);
      persistRemoveFromTrash(taskId);
      return;
    }

    const badge = closestFromTarget(e.target, '[data-card-time-badge]');
    if (badge) {
      e.stopImmediatePropagation();
      const card = badge.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;

      const isPastCard = card.dataset.isPast === 'true';
      const columnDate = card.dataset.columnDate;
      const isShutdownCard = dailyShutdownState.isActive && !!columnDate;

      const timerKey = getCardTimerKeyForCard(card);
      if (cardTimerExpanded.has(timerKey)) {
        if (cardPickerState) closeCardPicker();
        cardTimerExpanded.delete(timerKey);
      } else {
        cardTimerExpanded.add(timerKey);
      }
      renderTrashPanel();
      if (typeof lucide !== 'undefined') lucide.createIcons();

      if ((isPastCard || isShutdownCard) && cardTimerExpanded.has(timerKey) && columnDate) {
        setTimeout(() => {
          actualPickerDateScope = columnDate;
          openCardPicker(taskId, 'actual');
        }, 0);
      }
      return;
    }

    const timerBtn = closestFromTarget(e.target, '[data-card-timer-toggle]');
    if (timerBtn) {
      e.stopImmediatePropagation();
      const card = timerBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (focusState.running && focusState.taskId === taskId) {
        stopFocusTimer();
        const ctx = findTaskContext(taskId);
        if (ctx) renderColumn(ctx.column);
        else renderTrashPanel();
        return;
      }
      const restored = restoreTrashTask(taskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
      if (!restored) return;
      renderColumn(restored.column);
      renderCalendarEvents();
      renderTrashPanel();
      persistTask(restored.task, 0);
      persistRemoveFromTrash(taskId);
      openFocusMode(taskId, true);
      return;
    }

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

    const actualBtn = closestFromTarget(e.target, '[data-card-actual-picker-btn]');
    if (actualBtn) {
      e.stopImmediatePropagation();
      const card = actualBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (focusState.running && focusState.taskId === taskId) return;
      if (cardPickerState && cardPickerState.taskId === taskId && cardPickerState.type === 'actual') {
        closeCardPicker();
      } else {
        if ((card.dataset.isPast === 'true' || dailyShutdownState.isActive) && card.dataset.columnDate) {
          actualPickerDateScope = card.dataset.columnDate;
        }
        openCardPicker(taskId, 'actual');
      }
      return;
    }

    const plannedBtn = closestFromTarget(e.target, '[data-card-planned-picker-btn]');
    if (plannedBtn) {
      e.stopImmediatePropagation();
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

    const subtaskActualBtn = closestFromTarget(e.target, '[data-card-subtask-actual]');
    if (subtaskActualBtn) {
      e.stopImmediatePropagation();
      const card = subtaskActualBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      const subtaskId = subtaskActualBtn.dataset.cardSubtaskActual;
      if (focusState.running && focusState.taskId === taskId && focusState.subtaskId === subtaskId) return;
      if (cardPickerState && cardPickerState.subtaskId === subtaskId && cardPickerState.type === 'actual') {
        closeCardPicker();
      } else {
        if ((card.dataset.isPast === 'true' || dailyShutdownState.isActive) && card.dataset.columnDate) {
          actualPickerDateScope = card.dataset.columnDate;
        }
        openCardPicker(taskId, 'actual', subtaskId);
      }
      return;
    }

    const subtaskPlannedBtn = closestFromTarget(e.target, '[data-card-subtask-planned]');
    if (subtaskPlannedBtn) {
      e.stopImmediatePropagation();
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

    const dateBtn = closestFromTarget(e.target, '[data-card-date-btn]');
    if (dateBtn) {
      e.stopImmediatePropagation();
      if (cardPickerState) closeCardPicker();
      const card = dateBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (cardDatePickerState && cardDatePickerState.taskId === taskId) {
        closeCardDatePicker();
      } else {
        openCardDatePicker(taskId, card);
      }
      return;
    }

    const clockBtn = closestFromTarget(e.target, '[data-card-clock-btn]');
    if (clockBtn) {
      e.stopImmediatePropagation();
      if (cardDatePickerState) closeCardDatePicker();
      const card = clockBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      const loc = getTaskLocation(taskId);
      if (!loc) return;
      const task = loc.task;
      const columnDate = card.dataset.columnDate || card.dataset.ghostDate || null;

      const timerKey = getCardTimerKeyForCard(card);
      if (!cardTimerExpanded.has(timerKey) && !(focusState.running && focusState.taskId === taskId)) {
        if (timerKey) cardTimerExpanded.add(timerKey);
        if (loc.location === 'trash') {
          renderTrashPanel();
        } else {
          const col = columnDate
            ? state.columns.find(c => c.isoDate === columnDate)
            : state.columns.find(c => c.tasks.some(t => t.id === taskId));
          if (col) renderColumn(col);
        }

        if (!task.timeEstimateMinutes) {
          setTimeout(() => openCardPicker(taskId, 'planned'), 0);
        }
      } else {
        if (cardPickerState) closeCardPicker();
        const key = getCardTimerKeyForCard(card);
        if (key) cardTimerExpanded.delete(key);
        if (loc.location === 'trash') {
          renderTrashPanel();
        } else {
          const col = columnDate
            ? state.columns.find(c => c.isoDate === columnDate)
            : state.columns.find(c => c.tasks.some(t => t.id === taskId));
          if (col) renderColumn(col);
        }
      }
      return;
    }

    const channelBtn = closestFromTarget(e.target, '[data-channel-btn]');
    if (channelBtn) {
      e.stopImmediatePropagation();
      const card = channelBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      openChannelPicker(taskId);
      return;
    }
  });

  list.addEventListener('click', e => {
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
    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    openTaskDetailModal(card.dataset.taskId);
  });
}

function attachArchiveEvents() {
  const panel = document.querySelector('[data-right-panel="archive"]');
  const list = panel ? panel.querySelector('[data-archive-list]') : null;
  if (!panel || !list) return;

  function closestFromTarget(target, selector) {
    if (target instanceof Element) return target.closest(selector);
    if (target instanceof Node && target.parentElement) return target.parentElement.closest(selector);
    return null;
  }

  panel.addEventListener('click', e => {
    const toggle = closestFromTarget(e.target, '[data-archive-toggle]');
    if (toggle) {
      e.preventDefault();
      setAutoArchiveEnabled(!settings.autoArchiveEnabled);
      return;
    }

    if (closestFromTarget(e.target, '[data-archive-enable-btn]')) {
      e.preventDefault();
      setAutoArchiveEnabled(true);
      return;
    }

    const daysBtn = closestFromTarget(e.target, '[data-archive-days-btn]');
    if (daysBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (archivePanelState.daysDropdownOpen) closeArchiveDaysDropdown();
      else openArchiveDaysDropdown();
      return;
    }

    const dayOpt = closestFromTarget(e.target, '[data-archive-days-option]');
    if (dayOpt) {
      e.preventDefault();
      setAutoArchiveDays(parseInt(dayOpt.getAttribute('data-archive-days-option'), 10) || settings.autoArchiveDays);
      closeArchiveDaysDropdown();
      return;
    }

    if (closestFromTarget(e.target, '[data-archive-delete-all]')) {
      e.preventDefault();
      openArchiveDeleteModal();
      return;
    }
  });

  list.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (activeDragType || dragState.taskId || taskPointerDrag || calPointerDrag) return;
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

  list.addEventListener('click', e => {
    if (suppressTaskCardClick) {
      suppressTaskCardClick = false;
      return;
    }

    const completeBtn = closestFromTarget(e.target, '.task-card__complete-btn');
    if (completeBtn) {
      e.stopImmediatePropagation();
      const card = completeBtn.closest('.task-card');
      const task = card ? findArchiveTask(card.dataset.taskId) : null;
      if (!task) return;
      if (task.complete) {
        clearTaskCompletionMetadata(task);
      } else {
        completeTaskAsOf(task, getTodayISO());
      }
      renderArchivePanel();
      renderCalendarEvents();
      persistTask(task, 0);
      return;
    }

    const subtaskBtn = closestFromTarget(e.target, '[data-card-subtask-check]');
    if (subtaskBtn) {
      e.stopImmediatePropagation();
      const subtaskEl = subtaskBtn.closest('.subtask');
      const card = subtaskBtn.closest('.task-card');
      const task = card ? findArchiveTask(card.dataset.taskId) : null;
      const subtask = task && subtaskEl ? findSubtask(task, subtaskEl.dataset.subtaskId) : null;
      if (!task || !subtask) return;
      subtask.done = !subtask.done;
      subtask.deleteReady = false;
      ensureTaskRolloverState(task);
      const todayISO = getTodayISO();
      if (subtask.done) {
        if (!task.subtaskCompletionsByDate[todayISO]) task.subtaskCompletionsByDate[todayISO] = [];
        if (!task.subtaskCompletionsByDate[todayISO].includes(subtask.id)) task.subtaskCompletionsByDate[todayISO].push(subtask.id);
      } else {
        for (const date in task.subtaskCompletionsByDate) {
          const arr = task.subtaskCompletionsByDate[date];
          const idx = arr.indexOf(subtask.id);
          if (idx !== -1) {
            arr.splice(idx, 1);
            if (arr.length === 0) delete task.subtaskCompletionsByDate[date];
          }
        }
      }
      renderArchivePanel();
      persistTask(task, 0);
      return;
    }

    const badge = closestFromTarget(e.target, '[data-card-time-badge]');
    if (badge) {
      e.stopImmediatePropagation();
      const card = badge.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      const timerKey = getCardTimerKeyForCard(card);
      if (cardTimerExpanded.has(timerKey)) {
        if (cardPickerState) closeCardPicker();
        cardTimerExpanded.delete(timerKey);
      } else {
        cardTimerExpanded.add(timerKey);
      }
      renderArchivePanel();
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    const timerBtn = closestFromTarget(e.target, '[data-card-timer-toggle]');
    if (timerBtn) {
      e.stopImmediatePropagation();
      const card = timerBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (focusState.running && focusState.taskId === taskId) {
        stopFocusTimer();
      } else {
        openFocusMode(taskId, true);
      }
      renderArchivePanel();
      return;
    }

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

    const actualBtn = closestFromTarget(e.target, '[data-card-actual-picker-btn]');
    if (actualBtn) {
      e.stopImmediatePropagation();
      const card = actualBtn.closest('.task-card');
      if (!card) return;
      openCardPicker(card.dataset.taskId, 'actual');
      return;
    }

    const plannedBtn = closestFromTarget(e.target, '[data-card-planned-picker-btn]');
    if (plannedBtn) {
      e.stopImmediatePropagation();
      const card = plannedBtn.closest('.task-card');
      if (!card) return;
      openCardPicker(card.dataset.taskId, 'planned');
      return;
    }

    const subtaskActualBtn = closestFromTarget(e.target, '[data-card-subtask-actual]');
    if (subtaskActualBtn) {
      e.stopImmediatePropagation();
      const card = subtaskActualBtn.closest('.task-card');
      if (!card) return;
      openCardPicker(card.dataset.taskId, 'actual', subtaskActualBtn.dataset.cardSubtaskActual);
      return;
    }

    const subtaskPlannedBtn = closestFromTarget(e.target, '[data-card-subtask-planned]');
    if (subtaskPlannedBtn) {
      e.stopImmediatePropagation();
      const card = subtaskPlannedBtn.closest('.task-card');
      if (!card) return;
      openCardPicker(card.dataset.taskId, 'planned', subtaskPlannedBtn.dataset.cardSubtaskPlanned);
      return;
    }

    const dateBtn = closestFromTarget(e.target, '[data-card-date-btn]');
    if (dateBtn) {
      e.stopImmediatePropagation();
      const card = dateBtn.closest('.task-card');
      if (!card) return;
      if (cardDatePickerState && cardDatePickerState.taskId === card.dataset.taskId) closeCardDatePicker();
      else openCardDatePicker(card.dataset.taskId, card);
      return;
    }

    const clockBtn = closestFromTarget(e.target, '[data-card-clock-btn]');
    if (clockBtn) {
      e.stopImmediatePropagation();
      const card = clockBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      const timerKey = getCardTimerKeyForCard(card);
      if (!cardTimerExpanded.has(timerKey) && !(focusState.running && focusState.taskId === taskId)) {
        if (timerKey) cardTimerExpanded.add(timerKey);
        renderArchivePanel();
        const task = findArchiveTask(taskId);
        if (task && !task.timeEstimateMinutes) {
          setTimeout(() => openCardPicker(taskId, 'planned'), 0);
        }
      } else {
        if (cardPickerState) closeCardPicker();
        if (timerKey) cardTimerExpanded.delete(timerKey);
        renderArchivePanel();
      }
      return;
    }

    const channelBtn = closestFromTarget(e.target, '[data-channel-btn]');
    if (channelBtn) {
      e.stopImmediatePropagation();
      const card = channelBtn.closest('.task-card');
      if (!card) return;
      openChannelPicker(card.dataset.taskId);
      return;
    }

    if (closestFromTarget(e.target, '[data-card-sdp]')) return;
    if (closestFromTarget(e.target, '[data-channel-picker]')) return;

    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    if (cardPickerState) closeCardPicker();
    if (cardDatePickerState) closeCardDatePicker();
    if (channelPickerState) closeChannelPicker();
    openTaskDetailModal(card.dataset.taskId);
  });

  document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) {
      closeArchiveDaysDropdown();
      return;
    }

    const dayOpt = closestFromTarget(e.target, '[data-archive-days-option]');
    if (dayOpt) {
      e.preventDefault();
      setAutoArchiveDays(parseInt(dayOpt.getAttribute('data-archive-days-option'), 10) || settings.autoArchiveDays);
      closeArchiveDaysDropdown();
      return;
    }

    if (archivePanelState.daysDropdownOpen) {
      if (!e.target.closest('[data-archive-days-dropdown]') && !e.target.closest('[data-archive-days-btn]')) {
        closeArchiveDaysDropdown();
      }
    }

    if (archivePanelState.deleteModalOpen) {
      if (e.target.closest('[data-archive-delete-cancel]')) {
        closeArchiveDeleteModal();
        return;
      }
      if (e.target.closest('[data-archive-delete-confirm]')) {
        moveAllArchiveTasksToTrash();
        closeArchiveDeleteModal();
        return;
      }
      const overlay = e.target.closest('[data-archive-delete-overlay]');
      if (overlay && e.target === overlay) {
        closeArchiveDeleteModal();
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && archivePanelState.daysDropdownOpen) {
      e.preventDefault();
      closeArchiveDaysDropdown();
      return;
    }
    if (e.key === 'Escape' && archivePanelState.deleteModalOpen) {
      e.preventDefault();
      closeArchiveDeleteModal();
    }
  });
}

function attachBacklogEvents() {
  const panel = document.querySelector('[data-right-panel="backlog"]');
  const list = panel ? panel.querySelector('[data-backlog-list]') : null;
  if (!panel || !list) return;

  function closestFromTarget(target, selector) {
    if (target instanceof Element) return target.closest(selector);
    if (target instanceof Node && target.parentElement) return target.parentElement.closest(selector);
    return null;
  }

  panel.addEventListener('click', e => {
    const filterBtn = closestFromTarget(e.target, '[data-backlog-filter-btn]');
    if (filterBtn) {
      e.preventDefault();
      e.stopPropagation();
      openBacklogFilterPicker();
      return;
    }

    const addBtn = closestFromTarget(e.target, '[data-backlog-add-btn]');
    if (addBtn) {
      e.preventDefault();
      e.stopPropagation();
      showBacklogAddTaskInput(addBtn.getAttribute('data-backlog-add-btn'));
      return;
    }

    const confirmBtn = closestFromTarget(e.target, '[data-backlog-add-confirm]');
    if (confirmBtn) {
      e.preventDefault();
      e.stopPropagation();
      const section = confirmBtn.closest('[data-backlog-horizon]');
      const input = section ? section.querySelector('[data-backlog-add-input]') : null;
      if (!section || !input) return;
      commitBacklogAddTask(section.getAttribute('data-backlog-horizon'), input.value);
      return;
    }

    const filterItem = closestFromTarget(e.target, '[data-backlog-filter-id]');
    if (filterItem) {
      e.preventDefault();
      selectBacklogFilter(filterItem.getAttribute('data-backlog-filter-id') || 'all');
      return;
    }
  });

  panel.addEventListener('keydown', e => {
    const input = closestFromTarget(e.target, '[data-backlog-add-input]');
    if (!input) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const section = input.closest('[data-backlog-horizon]');
      if (!section) return;
      commitBacklogAddTask(section.getAttribute('data-backlog-horizon'), input.value);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideBacklogAddTaskInput();
    }
  });

  panel.addEventListener('focusout', e => {
    const input = closestFromTarget(e.target, '[data-backlog-add-input]');
    if (!input) return;
    requestAnimationFrame(() => {
      if (document.activeElement === input) return;
      if (panel.contains(document.activeElement) && closestFromTarget(document.activeElement, '[data-backlog-add-input]')) return;
      commitBacklogAddTask(backlogPanelState.addHorizon, input.value);
    });
  });

  list.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (activeDragType || dragState.taskId || taskPointerDrag || calPointerDrag) return;
    if (closestFromTarget(e.target, '[data-backlog-add-input]')) return;
    if (closestFromTarget(e.target, '.task-card__complete-btn')) return;
    if (closestFromTarget(e.target, '[data-card-subtask-check]')) return;
    if (closestFromTarget(e.target, '[data-card-time-badge]')) return;
    if (closestFromTarget(e.target, '[data-card-picker]')) return;
    if (closestFromTarget(e.target, '[data-card-date-btn]')) return;
    if (closestFromTarget(e.target, '[data-card-sdp]')) return;
    if (closestFromTarget(e.target, '[data-channel-btn]')) return;
    if (closestFromTarget(e.target, '[data-channel-picker]')) return;
    if (closestFromTarget(e.target, '[data-card-subtask-planned]')) return;
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

  list.addEventListener('click', e => {
    if (suppressTaskCardClick) {
      suppressTaskCardClick = false;
      return;
    }
    const subtaskBtn = closestFromTarget(e.target, '[data-card-subtask-check]');
    if (subtaskBtn) {
      e.stopImmediatePropagation();
      const subtaskEl = subtaskBtn.closest('.subtask');
      const card = subtaskBtn.closest('.task-card');
      if (!subtaskEl || !card) return;
      const task = findBacklogTask(card.dataset.taskId);
      const subtask = task ? findSubtask(task, subtaskEl.dataset.subtaskId) : null;
      if (!task || !subtask) return;
      subtask.done = !subtask.done;
      subtask.deleteReady = false;
      ensureTaskRolloverState(task);
      const todayISO = getTodayISO();
      if (subtask.done) {
        if (!task.subtaskCompletionsByDate[todayISO]) task.subtaskCompletionsByDate[todayISO] = [];
        if (!task.subtaskCompletionsByDate[todayISO].includes(subtask.id)) task.subtaskCompletionsByDate[todayISO].push(subtask.id);
      } else {
        for (const date in task.subtaskCompletionsByDate) {
          const arr = task.subtaskCompletionsByDate[date];
          const idx = arr.indexOf(subtask.id);
          if (idx !== -1) {
            arr.splice(idx, 1);
            if (arr.length === 0) delete task.subtaskCompletionsByDate[date];
          }
        }
      }
      renderBacklogPanel();
      persistTask(task, 0);
      return;
    }

    const badge = closestFromTarget(e.target, '[data-card-time-badge]');
    if (badge) {
      e.stopImmediatePropagation();
      const card = badge.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (cardPickerState && cardPickerState.taskId === taskId && cardPickerState.type === 'planned') {
        closeCardPicker();
      } else {
        openCardPicker(taskId, 'planned');
      }
      return;
    }

    const dateBtn = closestFromTarget(e.target, '[data-card-date-btn]');
    if (dateBtn) {
      e.stopImmediatePropagation();
      const card = dateBtn.closest('.task-card');
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (cardDatePickerState && cardDatePickerState.taskId === taskId) closeCardDatePicker();
      else openCardDatePicker(taskId, card);
      return;
    }

    const channelBtn = closestFromTarget(e.target, '[data-channel-btn]');
    if (channelBtn) {
      e.stopImmediatePropagation();
      const card = channelBtn.closest('.task-card');
      if (!card) return;
      openChannelPicker(card.dataset.taskId);
      return;
    }

    if (closestFromTarget(e.target, '[data-card-picker]')) return;
    if (closestFromTarget(e.target, '[data-card-sdp]')) return;
    if (closestFromTarget(e.target, '[data-channel-picker]')) return;

    const card = closestFromTarget(e.target, '.task-card');
    if (!card) return;
    if (cardPickerState) closeCardPicker();
    if (cardDatePickerState) closeCardDatePicker();
    if (channelPickerState) closeChannelPicker();
    openTaskDetailModal(card.dataset.taskId);
  });
}

function attachSearchPanelEvents() {
  const panel = document.querySelector('[data-right-panel="search"]');
  const input = panel ? panel.querySelector('[data-search-input]') : null;
  if (!panel || !input) return;

  function closestFromTarget(target, selector) {
    if (target instanceof Element) return target.closest(selector);
    if (target instanceof Node && target.parentElement) return target.parentElement.closest(selector);
    return null;
  }

  input.addEventListener('input', e => {
    searchPanelState.query = e.target.value || '';
    renderSearchPanel();
  });

  panel.addEventListener('click', e => {
    const resetBtn = closestFromTarget(e.target, '[data-search-reset]');
    if (resetBtn) {
      e.preventDefault();
      e.stopPropagation();
      searchPanelState.query = '';
      settings.searchDateRange = 'anytime';
      settings.searchChannelFilterId = 'all';
      closeSearchDropdown();
      renderSearchPanel();
      persistSettings();
      requestAnimationFrame(() => {
        const nextInput = panel.querySelector('[data-search-input]');
        if (nextInput) nextInput.focus();
      });
      return;
    }

    const filterBtn = closestFromTarget(e.target, '[data-search-filter-btn]');
    if (filterBtn) {
      e.preventDefault();
      e.stopPropagation();
      openSearchDropdown('filter');
      return;
    }

    const dateBtn = closestFromTarget(e.target, '[data-search-date-btn]');
    if (dateBtn) {
      e.preventDefault();
      e.stopPropagation();
      openSearchDropdown('date');
      return;
    }

    const channelBtn = closestFromTarget(e.target, '[data-search-channel-btn]');
    if (channelBtn) {
      e.preventDefault();
      e.stopPropagation();
      openSearchDropdown('channel');
      return;
    }

    const filterOption = closestFromTarget(e.target, '[data-search-filter-option]');
    if (filterOption) {
      e.preventDefault();
      e.stopPropagation();
      const key = filterOption.getAttribute('data-search-filter-option');
      if (!key || !(key in settings.searchFilters)) return;
      settings.searchFilters[key] = !settings.searchFilters[key];
      closeSearchDropdown();
      renderSearchPanel();
      persistSettings();
      openSearchDropdown('filter');
      return;
    }

    const dateOption = closestFromTarget(e.target, '[data-search-date-option]');
    if (dateOption) {
      e.preventDefault();
      e.stopPropagation();
      settings.searchDateRange = dateOption.getAttribute('data-search-date-option') || 'anytime';
      closeSearchDropdown();
      renderSearchPanel();
      persistSettings();
      return;
    }

    const channelOption = closestFromTarget(e.target, '[data-search-channel-option]');
    if (channelOption) {
      e.preventDefault();
      e.stopPropagation();
      settings.searchChannelFilterId = channelOption.getAttribute('data-search-channel-option') || 'all';
      closeSearchDropdown();
      renderSearchPanel();
      persistSettings();
      return;
    }

    const resultCard = closestFromTarget(e.target, '.search-result-card');
    if (resultCard) {
      e.preventDefault();
      openTaskDetailModal(resultCard.dataset.taskId);
    }
  });

  document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) {
      closeSearchDropdown();
      return;
    }
    if (!searchPanelState.dropdownOpen) return;
    if (!e.target.closest('[data-search-dropdown]') && !e.target.closest('[data-search-filter-btn]') && !e.target.closest('[data-search-date-btn]') && !e.target.closest('[data-search-channel-btn]')) {
      closeSearchDropdown();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && searchPanelState.dropdownOpen) {
      e.preventDefault();
      closeSearchDropdown();
    }
  });
}

function closeAnyPicker() {
  if (actualPickerOpen) { closeActualPicker(); return true; }
  if (plannedPickerOpen) { closePlannedPicker(); return true; }
  if (startDatePickerState) { closeStartDatePicker(); return true; }
  if (dueDatePickerState) { closeDueDatePicker(); return true; }
  if (focusPickerState) { closeFocusPicker(); return true; }
  if (modalChannelPickerState) { closeModalChannelPicker(); return true; }
  if (ellipsisMenuState && ellipsisMenuState.repeatOpenDropdown) {
    ellipsisMenuState.repeatOpenDropdown = null;
    renderEllipsisMenuInModal();
    return true;
  }
  if (ellipsisMenuState) { closeEllipsisMenu(); return true; }
  if (searchPanelState.dropdownOpen) { closeSearchDropdown(); return true; }
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

function syncOpenModalTaskEdits(taskId = openModalTaskId, options = {}) {
  if (!taskId) return { changed: false, loc: null };
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return { changed: false, loc: null };
  const loc = getTaskLocation(taskId);
  if (!loc) return { changed: false, loc: null };

  let changed = false;
  const titleEl = overlay.querySelector('.task-modal__title');
  if (titleEl) {
    const newTitle = titleEl.textContent.trim();
    if (newTitle && newTitle !== loc.task.title) {
      loc.task.title = newTitle;
      markTaskAsRepeatModified(loc.task);
      changed = true;
    }
  }

  if (taskModalQuill) {
    const nextNotes = getQuillHtml(taskModalQuill);
    if (nextNotes !== loc.task.notes) {
      loc.task.notes = nextNotes;
      markTaskAsRepeatModified(loc.task);
      changed = true;
    }
    if (options.releaseQuill) taskModalQuill = null;
  }

  syncTaskAggregateTimes(loc.task);
  return { changed, loc };
}

function rerenderOpenTaskDetailModal(focusSubtaskId = null) {
  if (!openModalTaskId) return;
  const loc = getTaskLocation(openModalTaskId);
  if (!loc) return;
  const overlay = document.getElementById('task-modal-overlay');
  if (!overlay) return;

  // Save Quill content before re-render destroys the instance
  syncOpenModalTaskEdits(openModalTaskId, { releaseQuill: true });

  overlay.innerHTML = renderTaskDetailModal(loc.task, loc.column, {
    isTrash: loc.location === 'trash',
    isBacklog: loc.location === 'backlog',
    isArchive: loc.location === 'archive'
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
  initTaskModalQuill(loc.task);
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
  markTaskAsRepeatModified(task);
  syncTaskAggregateTimes(task);
  return subtask;
}

function removeModalSubtask(task, subtaskId) {
  ensureTaskTimeState(task);
  const index = task.subtasks.findIndex(s => s.id === subtaskId);
  if (index === -1) return null;
  const [removed] = task.subtasks.splice(index, 1);
  if (task.subtasks.length === 0) task.showSubtasks = false;
  markTaskAsRepeatModified(task);
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

function detachModalSubtaskToBacklogTask(task, subtaskId) {
  const removed = removeModalSubtask(task, subtaskId);
  if (!removed) return null;

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
    notes: '',
    startDate: task.startDate || getTodayISO(),
    dailyActualTime: {},
    subtaskCompletionsByDate: {},
    completedOnDate: null,
    completedAt: null,
    backlogHorizon: task.backlogHorizon || 'week',
    backlogOrder: null
  };

  ensureTaskTimeState(newTask);
  insertTaskIntoBacklog(newTask, newTask.backlogHorizon, (task.backlogOrder || 0) + 1);
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

    // Restore banner action for trashed tasks
    if (e.target.closest('[data-restore-task]')) {
      if (!openModalTaskId) return;
      restoreTaskFromTrash(openModalTaskId);
      closeTaskDetailModal();
      showToast('Restored', 'dark');
      return;
    }

    // "+ Subtasks" top action: create one row initially and focus label
    if (e.target.closest('[data-modal-add-two-subtasks]')) {
      if (!openModalTaskId) return;
      const loc = getTaskLocation(openModalTaskId);
      if (!loc) return;
      const { task } = loc;

      task.showSubtasks = true;
      let focusSubtaskId;
      if (task.subtasks.length === 0) {
        focusSubtaskId = addModalSubtask(task).id;
      } else {
        const emptyExisting = task.subtasks.find(st => !String(st.label || '').trim());
        focusSubtaskId = emptyExisting ? emptyExisting.id : addModalSubtask(task).id;
      }

      renderTaskLocation(loc);
      rerenderOpenTaskDetailModal(focusSubtaskId);
      return;
    }

    // Ellipsis menu toggle
    if (e.target.closest('[data-ellipsis-btn]')) {
      closeStartDatePicker();
      closeDueDatePicker();
      closeModalChannelPicker();
      closePlannedPicker();
      closeActualPicker();
      if (ellipsisMenuState) {
        closeEllipsisMenu();
      } else if (openModalTaskId) {
        openEllipsisMenu(openModalTaskId);
      }
      return;
    }

    if (e.target.closest('[data-repeat-series-edit]')) {
      if (!openModalTaskId) return;
      openRepeatSeriesActionsMenu(openModalTaskId);
      return;
    }

    const repeatNavBtn = e.target.closest('[data-repeat-nav]');
    if (repeatNavBtn) {
      if (!openModalTaskId) return;
      openAdjacentRepeatOccurrence(openModalTaskId, repeatNavBtn.getAttribute('data-repeat-nav') === 'prev' ? -1 : 1);
      return;
    }

    // Inside ellipsis menu
    const ellMenu = e.target.closest('[data-ellipsis-menu]');
    if (ellMenu) {
      const repeatSelectToggle = e.target.closest('[data-repeat-select-toggle]');
      if (repeatSelectToggle && ellipsisMenuState) {
        const type = repeatSelectToggle.getAttribute('data-repeat-select-toggle');
        const rowIndex = Number.parseInt(repeatSelectToggle.getAttribute('data-repeat-select-row'), 10);
        const isOpen = ellipsisMenuState.repeatOpenDropdown
          && ellipsisMenuState.repeatOpenDropdown.type === type
          && ellipsisMenuState.repeatOpenDropdown.rowIndex === rowIndex;
        ellipsisMenuState.repeatOpenDropdown = isOpen ? null : { type, rowIndex };
        renderEllipsisMenuInModal();
        return;
      }
      const repeatSelectOption = e.target.closest('[data-repeat-select-option]');
      if (repeatSelectOption && ellipsisMenuState) {
        if (repeatSelectOption.hasAttribute('disabled')) return;
        const type = repeatSelectOption.getAttribute('data-repeat-select-option');
        const rowIndex = Number.parseInt(repeatSelectOption.getAttribute('data-repeat-select-row'), 10);
        const value = repeatSelectOption.getAttribute('data-value');
        applyRepeatDropdownSelection(type, rowIndex, value);
        return;
      }
      if (e.target.closest('[data-repeat-toggle-cadence]') && ellipsisMenuState) {
        ellipsisMenuState.repeatDraft.showCadenceOptions = !ellipsisMenuState.repeatDraft.showCadenceOptions;
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      const cadenceOption = e.target.closest('[data-repeat-set-cadence]');
      if (cadenceOption && ellipsisMenuState) {
        ellipsisMenuState.repeatDraft = normalizeRepeatDraft({
          ...ellipsisMenuState.repeatDraft,
          cadence: cadenceOption.getAttribute('data-repeat-set-cadence'),
          showCadenceOptions: false
        });
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      const repeatSaveBtn = e.target.closest('[data-repeat-save]');
      if (repeatSaveBtn && openModalTaskId) {
        const action = repeatSaveBtn.getAttribute('data-repeat-save');
        if (action === 'back') {
          ellipsisMenuState.mode = 'series-actions';
          ellipsisMenuState.repeatOpenDropdown = null;
          renderEllipsisMenuInModal();
        } else {
          saveRepeatDraftForTask(openModalTaskId);
        }
        return;
      }
      if (e.target.closest('[data-repeat-cancel]')) {
        closeEllipsisMenu();
        return;
      }
      if (e.target.closest('[data-repeat-weekly-add]') && ellipsisMenuState) {
        const addBtn = e.target.closest('[data-repeat-weekly-add]');
        const index = Number.parseInt(addBtn.getAttribute('data-repeat-weekly-add'), 10);
        const used = new Set(ellipsisMenuState.repeatDraft.weeklyDays);
        const nextDay = getOrderedWeekdayIndexes().find(day => !used.has(day));
        if (nextDay !== undefined) ellipsisMenuState.repeatDraft.weeklyDays.splice(index + 1, 0, nextDay);
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      const weeklyRemoveBtn = e.target.closest('[data-repeat-weekly-remove]');
      if (weeklyRemoveBtn && ellipsisMenuState) {
        const index = Number.parseInt(weeklyRemoveBtn.getAttribute('data-repeat-weekly-remove'), 10);
        if (ellipsisMenuState.repeatDraft.weeklyDays.length > 1) {
          ellipsisMenuState.repeatDraft.weeklyDays.splice(index, 1);
        }
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      if (e.target.closest('[data-repeat-monthly-add]') && ellipsisMenuState) {
        const addBtn = e.target.closest('[data-repeat-monthly-add]');
        const index = Number.parseInt(addBtn.getAttribute('data-repeat-monthly-add'), 10);
        if (ellipsisMenuState.repeatDraft.monthlyRules.length < 31) {
          ellipsisMenuState.repeatDraft.monthlyRules.splice(index + 1, 0, getNextAvailableMonthlyRule(ellipsisMenuState.repeatDraft.monthlyRules));
        }
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      const monthlyRemoveBtn = e.target.closest('[data-repeat-monthly-remove]');
      if (monthlyRemoveBtn && ellipsisMenuState) {
        const index = Number.parseInt(monthlyRemoveBtn.getAttribute('data-repeat-monthly-remove'), 10);
        if (ellipsisMenuState.repeatDraft.monthlyRules.length > 1) {
          ellipsisMenuState.repeatDraft.monthlyRules.splice(index, 1);
        }
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      if (e.target.closest('[data-repeat-yearly-add]') && ellipsisMenuState) {
        const addBtn = e.target.closest('[data-repeat-yearly-add]');
        const index = Number.parseInt(addBtn.getAttribute('data-repeat-yearly-add'), 10);
        if (ellipsisMenuState.repeatDraft.yearlyRules.length < 31) {
          ellipsisMenuState.repeatDraft.yearlyRules.splice(index + 1, 0, getNextAvailableYearlyRule(ellipsisMenuState.repeatDraft.yearlyRules));
        }
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      const yearlyRemoveBtn = e.target.closest('[data-repeat-yearly-remove]');
      if (yearlyRemoveBtn && ellipsisMenuState) {
        const index = Number.parseInt(yearlyRemoveBtn.getAttribute('data-repeat-yearly-remove'), 10);
        if (ellipsisMenuState.repeatDraft.yearlyRules.length > 1) {
          ellipsisMenuState.repeatDraft.yearlyRules.splice(index, 1);
        }
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
        return;
      }
      const seriesActionBtn = e.target.closest('[data-repeat-series-action]');
      if (seriesActionBtn && openModalTaskId) {
        const action = seriesActionBtn.getAttribute('data-repeat-series-action');
        if (action === 'stop') {
          stopRepeatingForTask(openModalTaskId, { skipModalRerender: true });
          closeEllipsisMenu();
          rerenderOpenTaskDetailModal();
        } else if (action === 'extend') {
          extendRepeatSeriesForTask(openModalTaskId);
          closeEllipsisMenu();
        } else if (action === 'change') {
          ellipsisMenuState.mode = 'repeat';
          renderEllipsisMenuInModal();
        } else if (action === 'update-incomplete') {
          updateIncompleteRepeatInstancesToMatchTask(openModalTaskId);
          closeEllipsisMenu();
        } else if (action === 'delete-incomplete-stop') {
          deleteIncompleteRepeatInstancesAndStop(openModalTaskId);
        }
        return;
      }
      const menuItem = e.target.closest('.sdp__menu-item');
      if (menuItem && menuItem.dataset.action && openModalTaskId) {
        const action = menuItem.dataset.action;
        if (action === 'open-repeat-menu') {
          ellipsisMenuState.mode = 'repeat';
          ellipsisMenuState.repeatOpenDropdown = null;
          renderEllipsisMenuInModal();
        } else if (action === 'open-repeat-series-menu') {
          ellipsisMenuState.mode = 'series-actions';
          ellipsisMenuState.repeatOpenDropdown = null;
          renderEllipsisMenuInModal();
        } else if (action === 'duplicate-task') {
          handleDuplicateTask(openModalTaskId);
        } else if (action === 'delete-task') {
          handleDeleteTask(openModalTaskId);
        } else if (action === 'restore-task') {
          restoreTaskFromTrash(openModalTaskId);
          closeTaskDetailModal();
          showToast('Restored', 'dark');
        }
      }
      if (ellipsisMenuState && ellipsisMenuState.repeatOpenDropdown) {
        ellipsisMenuState.repeatOpenDropdown = null;
        renderEllipsisMenuInModal();
      }
      return;
    }

    // Add subtask row button
    if (e.target.closest('[data-modal-add-subtask]')) {
      if (!openModalTaskId) return;
      const loc = getTaskLocation(openModalTaskId);
      if (!loc) return;
      const subtask = addModalSubtask(loc.task);
      renderTaskLocation(loc);
      rerenderOpenTaskDetailModal(subtask.id);
      persistTask(loc.task, 0);
      return;
    }

    // Subtask checkbox toggle
    const subtaskCheckBtn = e.target.closest('[data-modal-subtask-check]');
    if (subtaskCheckBtn) {
      if (!openModalTaskId) return;
      let loc = getTaskLocation(openModalTaskId);
      if (!loc) return;
      const restoredFromTrash = loc.location === 'trash';
      if (restoredFromTrash) {
        const restored = restoreTrashTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
        if (!restored) return;
        renderTrashPanel();
        renderCalendarEvents();
        loc = { location: 'column', column: restored.column, task: restored.task, index: restored.insertIndex, entry: null };
      }
      const subtaskId = subtaskCheckBtn.getAttribute('data-modal-subtask-check');
      const subtask = findSubtask(loc.task, subtaskId);
      if (!subtask) return;
      subtask.done = !subtask.done;
      subtask.deleteReady = false;
      markTaskAsRepeatModified(loc.task);
      ensureTaskRolloverState(loc.task);
      const todayISO = getTodayISO();
      if (subtask.done) {
        if (!loc.task.subtaskCompletionsByDate[todayISO]) loc.task.subtaskCompletionsByDate[todayISO] = [];
        if (!loc.task.subtaskCompletionsByDate[todayISO].includes(subtask.id)) {
          loc.task.subtaskCompletionsByDate[todayISO].push(subtask.id);
        }
      } else {
        for (const date in loc.task.subtaskCompletionsByDate) {
          const arr = loc.task.subtaskCompletionsByDate[date];
          const idx = arr.indexOf(subtask.id);
          if (idx !== -1) { arr.splice(idx, 1); if (arr.length === 0) delete loc.task.subtaskCompletionsByDate[date]; }
        }
      }
      if (!restoredFromTrash) {
        subtaskCheckBtn.classList.toggle('task-modal__check--complete', subtask.done);
      }
      renderTaskLocation(loc);
      persistTask(loc.task, 0);
      if (restoredFromTrash) {
        persistRemoveFromTrash(openModalTaskId);
        openTaskDetailModal(openModalTaskId);
      }
      return;
    }

    // Convert subtask into standalone task (time moves with it and parent recalculates)
    const detachBtn = e.target.closest('[data-modal-subtask-detach]');
    if (detachBtn) {
      if (!openModalTaskId) return;
      let loc = getTaskLocation(openModalTaskId);
      if (!loc) return;
      if (loc.location === 'trash') {
        const restored = restoreTrashTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
        if (!restored) return;
        renderTrashPanel();
        renderCalendarEvents();
        persistRemoveFromTrash(openModalTaskId);
        loc = { location: 'column', column: restored.column, task: restored.task, index: restored.insertIndex, entry: null };
        openTaskDetailModal(openModalTaskId);
      }
      const subtaskId = detachBtn.getAttribute('data-modal-subtask-detach');

      if (focusState.running && focusState.taskId === openModalTaskId && focusState.subtaskId === subtaskId) {
        stopFocusTimer();
      }

      if (loc.location === 'backlog') {
        const detachedBacklogTask = detachModalSubtaskToBacklogTask(loc.task, subtaskId);
        renderBacklogPanel();
        persistTask(loc.task, 0);
        if (detachedBacklogTask) persistTask(detachedBacklogTask, 0);
      } else {
        const detachedNewTask = detachModalSubtaskToTask(loc.task, loc.column, subtaskId);
        renderColumn(loc.column);
        persistTask(loc.task, 0);
        if (detachedNewTask) persistTask(detachedNewTask, 0);
      }
      rerenderOpenTaskDetailModal();
      return;
    }

    // Subtask play/pause
    const subtaskPlayBtn = e.target.closest('[data-modal-subtask-play]');
    if (subtaskPlayBtn) {
      if (!openModalTaskId) return;
      const subtaskId = subtaskPlayBtn.getAttribute('data-modal-subtask-play');
      if (!subtaskId) return;
      if (openModalIsTrash) {
        const restored = restoreTrashTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
        if (!restored) return;
        renderColumn(restored.column);
        renderCalendarEvents();
        renderTrashPanel();
        persistTask(restored.task, 0);
        persistRemoveFromTrash(openModalTaskId);
        openTaskDetailModal(openModalTaskId);
      }

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
      if (openModalIsTrash) {
        const restored = restoreTrashTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
        if (!restored) return;
        renderColumn(restored.column);
        renderCalendarEvents();
        renderTrashPanel();
        persistTask(restored.task, 0);
        persistRemoveFromTrash(openModalTaskId);
        openTaskDetailModal(openModalTaskId);
      }
      if (focusState.running && focusState.taskId === openModalTaskId) {
        // Timer is running — stop it
        stopFocusTimer();
      } else {
        // Open focus mode and auto-start timer
        openFocusMode(openModalTaskId, true, 'card-detail');
      }
      return;
    }

    // Expand button → handled by mousedown above; skip here
    if (e.target.closest('[data-expand-btn]')) {
      return;
    }

    // Modal checkmark toggle
    if (e.target.closest('[data-modal-check]')) {
      if (!openModalTaskId) return;
      if (openModalIsTrash) {
        const restored = restoreTrashTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
        if (!restored) return;
        completeTaskAsOf(restored.task, getTodayISO());
        restored.task.startDate = getTodayISO();
        moveCompletedTasksToBottom(restored.column);
        renderColumn(restored.column);
        renderCalendarEvents();
        renderTrashPanel();
        persistTask(restored.task, 0);
        persistRemoveFromTrash(openModalTaskId);
        openTaskDetailModal(openModalTaskId);
        return;
      }
      if (openModalIsBacklog) {
        const restored = restoreBacklogTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
        if (!restored) return;
        completeTaskAsOf(restored.task, getTodayISO());
        restored.task.startDate = getTodayISO();
        moveCompletedTasksToBottom(restored.column);
        renderColumn(restored.column);
        renderCalendarEvents();
        persistTask(restored.task, 0);
        renderBacklogPanel();
        openTaskDetailModal(openModalTaskId);
        return;
      }
      if (openModalIsArchive) {
        const task = findArchiveTask(openModalTaskId);
        if (!task) return;
        if (task.complete) {
          clearTaskCompletionMetadata(task);
        } else {
          completeTaskAsOf(task, getTodayISO());
        }
        renderArchivePanel();
        renderCalendarEvents();
        persistTask(task, 0);
        openTaskDetailModal(openModalTaskId);
        return;
      }
      toggleTaskCompletionForShortcut(openModalTaskId);
      rerenderOpenTaskDetailModal();
      return;
    }

    // Modal channel picker toggle
    if (e.target.closest('[data-modal-channel-btn]')) {
      closeStartDatePicker();
      closeDueDatePicker();
      closePlannedPicker();
      closeActualPicker();
      closeEllipsisMenu();
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
      if (e.target.closest('.channel-picker__manage')) {
        e.preventDefault();
        closeModalChannelPicker();
        closeTaskDetailModal();
        openSettingsView();
        setTimeout(() => {
          const section = document.getElementById('settings-section-channels');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setSettingsActiveNav('channels');
        }, 50);
        return;
      }
      return;
    }

    // Due date picker toggle (check before start btn since due btn may also have meta-start-btn class)
    if (e.target.closest('[data-due-btn]')) {
      closeStartDatePicker();
      closeModalChannelPicker();
      closePlannedPicker();
      closeActualPicker();
      closeEllipsisMenu();
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
      closeEllipsisMenu();
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
        handleStartDateAction(menuItem.dataset.action, menuItem.dataset.backlogHorizon);
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
      closeEllipsisMenu();
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
        let loc = getTaskLocation(openModalTaskId);
        if (loc) {
          const restoredFromTrash = loc.location === 'trash';
          if (restoredFromTrash) {
            const restored = restoreTrashTask(openModalTaskId, { targetIsoDate: getTodayISO(), applyDropRules: true });
            if (!restored) return;
            renderTrashPanel();
            renderCalendarEvents();
            loc = { location: 'column', column: restored.column, task: restored.task, index: restored.insertIndex, entry: null };
          }
          ensureTaskRolloverState(loc.task);
          const entry = loc.task.dailyActualTime[dateToDelete];
          if (entry) {
            // Subtract from aggregate totals
            const subtask = actualPickerSubtaskId ? findSubtask(loc.task, actualPickerSubtaskId) : null;
            if (!subtask) {
              loc.task.ownActualTimeSeconds = Math.max(0, (loc.task.ownActualTimeSeconds || 0) - (entry.ownSeconds || 0));
              loc.task.subtasks.forEach(s => {
                if (entry.subtasks && entry.subtasks[s.id]) {
                  s.actualTimeSeconds = Math.max(0, (s.actualTimeSeconds || 0) - (entry.subtasks[s.id] || 0));
                }
              });
            }
            delete loc.task.dailyActualTime[dateToDelete];
            syncTaskAggregateTimes(loc.task);
          }
          renderActualPickerInModal();
          // Update the actual metric display
          const overlay = document.getElementById('task-modal-overlay');
          const parentMetricEl = overlay.querySelector('[data-actual-btn] .task-modal__metric-value');
          if (parentMetricEl) {
            if (loc.task.actualTimeSeconds) {
              parentMetricEl.textContent = formatMinutes(Math.floor(loc.task.actualTimeSeconds / 60));
              parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--set';
            } else {
              parentMetricEl.textContent = '--:--';
              parentMetricEl.className = 'task-modal__metric-value task-modal__metric-value--placeholder';
            }
          }
          renderColumn(loc.column);
          rerenderGhostColumns(loc.task);
          persistTask(loc.task, 0);
          if (restoredFromTrash) {
            persistRemoveFromTrash(openModalTaskId);
            openTaskDetailModal(openModalTaskId);
          }
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
      closeEllipsisMenu();
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
    if (targetEl.matches('[data-repeat-interval]') && ellipsisMenuState) {
      targetEl.value = targetEl.value.replace(/[^\d]/g, '');
      ellipsisMenuState.repeatDraft.interval = Math.max(1, Number.parseInt(targetEl.value, 10) || 1);
      return;
    }
    // Notes are now handled by Quill editor — skip old contenteditable cleanup
    const labelEl = targetEl.closest('[data-modal-subtask-label]');
    if (!labelEl) return;
    if (!openModalTaskId) return;
    const loc = getTaskLocation(openModalTaskId);
    if (!loc) return;

    const subtaskId = labelEl.getAttribute('data-modal-subtask-label');
    const subtask = findSubtask(loc.task, subtaskId);
    if (!subtask) return;

    const cleanText = labelEl.textContent.replace(/\n/g, '').trim();
    if (!cleanText && labelEl.innerHTML !== '') {
      labelEl.textContent = '';
    }
    subtask.label = cleanText;
    subtask.deleteReady = false;
    markTaskAsRepeatModified(loc.task);
    labelEl.classList.toggle('task-modal__subtask-text--filled', !!cleanText);
  });

  overlay.addEventListener('change', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    if (!(targetEl instanceof Element) || !ellipsisMenuState) return;
    const weeklyDaySelect = targetEl.closest('[data-repeat-weekly-day]');
    if (weeklyDaySelect) {
      const index = Number.parseInt(weeklyDaySelect.getAttribute('data-repeat-weekly-day'), 10);
      ellipsisMenuState.repeatDraft.weeklyDays[index] = Number.parseInt(weeklyDaySelect.value, 10);
      renderEllipsisMenuInModal();
      return;
    }
    const monthlyOrdinal = targetEl.closest('[data-repeat-monthly-ordinal]');
    if (monthlyOrdinal) {
      const index = Number.parseInt(monthlyOrdinal.getAttribute('data-repeat-monthly-ordinal'), 10);
      ellipsisMenuState.repeatDraft.monthlyRules[index].ordinal = monthlyOrdinal.value;
      if (ellipsisMenuState.repeatDraft.monthlyRules[index].dayType !== 'day'
        && !['1st', '2nd', '3rd', '4th', 'Last'].includes(monthlyOrdinal.value)) {
        ellipsisMenuState.repeatDraft.monthlyRules[index].dayType = 'day';
      }
      renderEllipsisMenuInModal();
      return;
    }
    const monthlyDayType = targetEl.closest('[data-repeat-monthly-day-type]');
    if (monthlyDayType) {
      const index = Number.parseInt(monthlyDayType.getAttribute('data-repeat-monthly-day-type'), 10);
      const value = normalizeRepeatDayTypeValue(monthlyDayType.value);
      ellipsisMenuState.repeatDraft.monthlyRules[index].dayType = value;
      if (value !== 'day' && !['1st', '2nd', '3rd', '4th', 'Last'].includes(ellipsisMenuState.repeatDraft.monthlyRules[index].ordinal)) {
        ellipsisMenuState.repeatDraft.monthlyRules[index].ordinal = 'Last';
      }
      renderEllipsisMenuInModal();
      return;
    }
    const yearlyOrdinal = targetEl.closest('[data-repeat-yearly-ordinal]');
    if (yearlyOrdinal) {
      const index = Number.parseInt(yearlyOrdinal.getAttribute('data-repeat-yearly-ordinal'), 10);
      ellipsisMenuState.repeatDraft.yearlyRules[index].ordinal = yearlyOrdinal.value;
      if (ellipsisMenuState.repeatDraft.yearlyRules[index].dayType !== 'day'
        && !['1st', '2nd', '3rd', '4th', 'Last'].includes(yearlyOrdinal.value)) {
        ellipsisMenuState.repeatDraft.yearlyRules[index].dayType = 'day';
      }
      renderEllipsisMenuInModal();
      return;
    }
    const yearlyDayType = targetEl.closest('[data-repeat-yearly-day-type]');
    if (yearlyDayType) {
      const index = Number.parseInt(yearlyDayType.getAttribute('data-repeat-yearly-day-type'), 10);
      const value = normalizeRepeatDayTypeValue(yearlyDayType.value);
      ellipsisMenuState.repeatDraft.yearlyRules[index].dayType = value;
      if (value !== 'day' && !['1st', '2nd', '3rd', '4th', 'Last'].includes(ellipsisMenuState.repeatDraft.yearlyRules[index].ordinal)) {
        ellipsisMenuState.repeatDraft.yearlyRules[index].ordinal = 'Last';
      }
      renderEllipsisMenuInModal();
      return;
    }
    const yearlyMonth = targetEl.closest('[data-repeat-yearly-month]');
    if (yearlyMonth) {
      const index = Number.parseInt(yearlyMonth.getAttribute('data-repeat-yearly-month'), 10);
      ellipsisMenuState.repeatDraft.yearlyRules[index].month = Number.parseInt(yearlyMonth.value, 10);
      renderEllipsisMenuInModal();
    }
  });

  overlay.addEventListener('focusout', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    if (!(targetEl instanceof Element)) return;
    const labelEl = targetEl.closest('[data-modal-subtask-label]');
    if (!labelEl) return;
    if (!openModalTaskId) return;
    const loc = getTaskLocation(openModalTaskId);
    if (!loc) return;

    const subtaskId = labelEl.getAttribute('data-modal-subtask-label');
    const subtask = findSubtask(loc.task, subtaskId);
    if (!subtask) return;

    const cleanText = labelEl.textContent.replace(/\n/g, '').trim();
    subtask.label = cleanText;
    subtask.deleteReady = false;
    labelEl.classList.toggle('task-modal__subtask-text--filled', !!cleanText);
    if (!cleanText) {
      labelEl.textContent = '';
    }

    // Reflect subtask title changes on the kanban card as soon as field focus leaves.
    renderTaskLocation(loc);
  });

  overlay.addEventListener('keydown', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    if (!(targetEl instanceof Element)) return;
    const labelEl = targetEl.closest('[data-modal-subtask-label]');
    if (!labelEl) return;
    if (!openModalTaskId) return;
    const loc = getTaskLocation(openModalTaskId);
    if (!loc) return;

    const subtaskId = labelEl.getAttribute('data-modal-subtask-label');
    const task = loc.task;
    const index = task.subtasks.findIndex(s => s.id === subtaskId);
    if (index === -1) return;
    const subtask = task.subtasks[index];

    if (e.key === 'Enter') {
      e.preventDefault();
      const inserted = addModalSubtask(task, index + 1);
      renderTaskLocation(loc);
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
      renderTaskLocation(loc);
      rerenderOpenTaskDetailModal(nextFocusId);
      persistTask(task, 0);
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

    const loc = getTaskLocation(openModalTaskId);
    if (!loc) {
      suppressSubtaskHoverUntilPointerMove();
      return;
    }

    const list = loc.task.subtasks;
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

    renderTaskLocation(loc);
    rerenderOpenTaskDetailModal(drag.draggedId);
    persistTask(loc.task, 0);
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
    if (handleBacklogHorizonPickerShortcut(e)) return;
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

function getTaskFilterHashColor(option) {
  if (!option) return '#787878';
  if (option.id === 'all') return '#787878';
  if (option.id === 'unassigned') return option.hashColor || '#90a4ae';
  return option.hashColor || '#787878';
}

function getTaskFilterOptionById(filterId = getActiveTaskFilterId()) {
  const normalized = normalizeTaskFilterId(filterId);
  return getSearchChannelOptions().find(option => option.id === normalized) || getSearchChannelOptions()[0];
}

function getTopbarTaskFilterOptions(query = '') {
  const options = getSearchChannelOptions();
  if (!query) return options;
  const normalized = String(query || '').trim().toLowerCase();
  return options.filter(option => option.label.toLowerCase().includes(normalized));
}

function renderTopbarTaskFilterListHTML(options, selectedId = getActiveTaskFilterId()) {
  const normalizedOptions = options.map(option => ({
    ...option,
    hashColor: getTaskFilterHashColor(option)
  }));
  return renderChannelOptionListHTML(normalizedOptions, {
    selectedId,
    highlightIndex: topbarFilterPickerState ? topbarFilterPickerState.highlightIndex : -1,
    itemIdAttr: 'data-topbar-filter-id',
    itemIndexAttr: 'data-topbar-filter-idx'
  });
}

function renderTopbarTaskFilterDropdown() {
  const selectedId = getActiveTaskFilterId();
  const options = getTopbarTaskFilterOptions('');
  return `<div class="channel-picker" data-topbar-filter-picker>`
    + '<div class="channel-picker__arrow"></div>'
    + '<div class="channel-picker__header">Filter tasks by channel:</div>'
    + '<input class="channel-picker__search" placeholder="Search..." type="text">'
    + `<div class="channel-picker__list">${renderTopbarTaskFilterListHTML(options, selectedId)}</div>`
    + '<div class="channel-picker__divider"></div>'
    + '<a class="channel-picker__manage" href="#">Manage channels</a>'
    + '</div>';
}

function rerenderActiveFilteredView() {
  if (dailyPlanningState.isActive) {
    renderDailyPlanningMode();
    renderCalendarEvents();
    if (rightSidebarState.activePanel === 'backlog') renderBacklogPanel();
    if (rightSidebarState.activePanel === 'archive') renderArchivePanel();
    return true;
  }
  if (dailyShutdownState.isActive) {
    renderDailyShutdownMode();
    renderCalendarEvents();
    if (rightSidebarState.activePanel === 'backlog') renderBacklogPanel();
    if (rightSidebarState.activePanel === 'archive') renderArchivePanel();
    return true;
  }
  if (todayViewState.isActive) {
    renderTodayViewMode();
    renderCalendarEvents();
    if (rightSidebarState.activePanel === 'backlog') renderBacklogPanel();
    if (rightSidebarState.activePanel === 'archive') renderArchivePanel();
    return true;
  }
  renderAllColumns();
  renderCalendarEvents();
  if (rightSidebarState.activePanel === 'backlog') renderBacklogPanel();
  if (rightSidebarState.activePanel === 'archive') renderArchivePanel();
  updateTopbarFilterButton();
  return true;
}

function setTaskFilterForScope(scopeKey, filterId) {
  if (!scopeKey || !(scopeKey in topbarTaskFilterState)) return;
  const normalized = normalizeTaskFilterId(filterId);
  topbarTaskFilterState[scopeKey] = normalized;
  if (scopeKey === 'homeToday') {
    backlogPanelState.filterId = normalized;
  }
}

function setActiveTaskFilter(filterId) {
  setTaskFilterForScope(getTaskFilterScopeKey(), filterId);
  rerenderActiveFilteredView();
}

function clearActiveTaskFilter() {
  if (getActiveTaskFilterId() === 'all') return;
  setActiveTaskFilter('all');
}

function updateTopbarFilterButton() {
  const btn = document.querySelector('[data-view-filter]');
  if (!btn) return;

  const filterId = getActiveTaskFilterId();
  const option = getTaskFilterOptionById(filterId);
  const isActive = filterId !== 'all';
  btn.classList.toggle('view-btn--filter-active', isActive);
  btn.setAttribute('aria-expanded', String(!!topbarFilterPickerState));
  btn.setAttribute('aria-label', isActive ? `Filter tasks: ${option ? option.label : 'filter active'}` : 'Filter tasks');

  if (!isActive) {
    btn.innerHTML = '<i data-lucide="list-filter" class="view-icon"></i><span class="view-btn__label">Filter</span>';
  } else {
    const hashColor = getTaskFilterHashColor(option);
    btn.innerHTML = `<span class="view-btn__filter-hash" style="color:${escapeHtml(hashColor)};">#</span>`
      + `<span class="view-btn__filter-label">${escapeHtml(option.label)}</span>`
      + '<span class="view-btn__close" data-filter-close><i data-lucide="x"></i></span>';
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (topbarFilterPickerState && !document.querySelector('[data-topbar-filter-picker]')) {
    renderTopbarFilterPicker();
  }
}

function closeTopbarFilterPicker() {
  topbarFilterPickerState = null;
  const existing = document.querySelector('[data-topbar-filter-picker]');
  if (existing) existing.remove();
  updateTopbarFilterButton();
}

function updateTopbarTaskFilterHighlight(dropdown) {
  if (!topbarFilterPickerState || !dropdown) return;
  const items = dropdown.querySelectorAll('[data-topbar-filter-id]');
  items.forEach((item, index) => {
    item.classList.toggle('channel-picker__item--highlighted', index === topbarFilterPickerState.highlightIndex);
  });
  const highlighted = dropdown.querySelector('.channel-picker__item--highlighted');
  if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
}

function selectTopbarTaskFilter(filterId) {
  closeTopbarFilterPicker();
  setActiveTaskFilter(filterId || 'all');
}

function attachTopbarTaskFilterEvents(searchInput, dropdown) {
  searchInput.addEventListener('input', () => {
    if (!topbarFilterPickerState) return;
    topbarFilterPickerState.highlightIndex = 0;
    const list = dropdown.querySelector('.channel-picker__list');
    if (!list) return;
    list.innerHTML = renderTopbarTaskFilterListHTML(
      getTopbarTaskFilterOptions(searchInput.value),
      getActiveTaskFilterId()
    );
  });

  searchInput.addEventListener('keydown', e => {
    if (!topbarFilterPickerState) return;
    const options = getTopbarTaskFilterOptions(searchInput.value);
    if (options.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      topbarFilterPickerState.highlightIndex = Math.min(topbarFilterPickerState.highlightIndex + 1, options.length - 1);
      updateTopbarTaskFilterHighlight(dropdown);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      topbarFilterPickerState.highlightIndex = Math.max(topbarFilterPickerState.highlightIndex - 1, 0);
      updateTopbarTaskFilterHighlight(dropdown);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[topbarFilterPickerState.highlightIndex];
      if (option) selectTopbarTaskFilter(option.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeTopbarFilterPicker();
    }
  });
}

function renderTopbarFilterPicker() {
  if (!topbarFilterPickerState) return;
  const filterBtn = document.querySelector('[data-view-filter]');
  if (!filterBtn) return;

  const existing = document.querySelector('[data-topbar-filter-picker]');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderTopbarTaskFilterDropdown();
  const dropdown = wrapper.firstElementChild;
  const ddWidth = 220;
  dropdown.style.position = 'fixed';
  dropdown.style.zIndex = '7000';
  dropdown.style.width = ddWidth + 'px';
  document.body.appendChild(dropdown);

  requestAnimationFrame(() => {
    const btnRect = filterBtn.getBoundingClientRect();
    const left = btnRect.left;
    const clampedLeft = Math.max(12, Math.min(left, window.innerWidth - ddWidth - 12));
    dropdown.style.left = clampedLeft + 'px';
    dropdown.style.top = (btnRect.bottom + 12) + 'px';

    const arrow = dropdown.querySelector('.channel-picker__arrow');
    if (arrow) {
      const ddRect = dropdown.getBoundingClientRect();
      const arrowLeft = btnRect.left + btnRect.width / 2 - ddRect.left - 6;
      arrow.style.left = Math.max(8, arrowLeft) + 'px';
    }
  });

  const searchInput = dropdown.querySelector('.channel-picker__search');
  if (searchInput) {
    requestAnimationFrame(() => searchInput.focus());
    attachTopbarTaskFilterEvents(searchInput, dropdown);
  }
}

function openTopbarFilterPicker() {
  const filterId = getActiveTaskFilterId();
  const options = getTopbarTaskFilterOptions('');
  const selectedIndex = Math.max(0, options.findIndex(option => option.id === filterId));
  topbarFilterPickerState = {
    filterId,
    highlightIndex: selectedIndex
  };
  closeTopbarTodayPicker();
  updateTopbarFilterButton();
}

function toggleTopbarFilterPicker() {
  if (topbarFilterPickerState) {
    closeTopbarFilterPicker();
  } else {
    openTopbarFilterPicker();
  }
}

function getFirstVisibleDate() {
  if (dailyShutdownState.isActive && dailyShutdownState.selectedDate) {
    return dailyShutdownState.selectedDate;
  }
  if (dailyPlanningState.isActive && dailyPlanningState.selectedDate) {
    return dailyPlanningState.selectedDate;
  }
  if (todayViewState.isActive && todayViewState.selectedDate) {
    return todayViewState.selectedDate;
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
  if (!btn) {
    updateTopbarFilterButton();
    return;
  }
  const firstDate = overrideDate || getFirstVisibleDate();
  ensureDateDataLoaded(firstDate);
  const todayISO = getTodayISO();
  const isToday = firstDate === todayISO;
  let label;
  if (dailyShutdownState.isActive) {
    label = getDailyShutdownDateLabel(firstDate);
  } else if (dailyPlanningState.isActive) {
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

  updateCurrentTimeLine();
  updateTopbarFilterButton();
}

function updateCalendarDayHeader(isoDate) {
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const d = parseISO(isoDate);
  const infoEl = document.querySelector('.calendar-day-info');
  const nameEl = document.querySelector('.calendar-day-name');
  const numEl = document.querySelector('.calendar-day-number');
  const panelEl = document.querySelector('.calendar-panel');
  const isPast = isoDate < getTodayISO();
  if (nameEl) nameEl.textContent = dayNames[d.getDay()];
  if (numEl) numEl.textContent = d.getDate();
  if (infoEl) {
    infoEl.classList.add('calendar-day-info--ready');
    infoEl.classList.toggle('calendar-day-info--past', isPast);
  }
  if (panelEl) panelEl.classList.toggle('calendar-panel--past', isPast);
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
      case 'go-previous-day':
        targetIsoDate = addDays(getFirstVisibleDate(), -1);
        break;
      case 'select-date':
        targetIsoDate = data;
        break;
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

  if (dailyShutdownState.isActive) {
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

    if (targetIsoDate && targetIsoDate > todayISO) {
      targetIsoDate = todayISO;
    }

    if (targetIsoDate) {
      setDailyShutdownSelectedDate(targetIsoDate, { resetStep: true });
      closeTopbarTodayPicker();
    }
    return;
  }

  if (todayViewState.isActive) {
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
      todayViewState.selectedDate = targetIsoDate;
      renderTodayViewMode();
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
  const filterBtn = document.querySelector('[data-view-filter]');
  const closeBtn = document.querySelector('[data-today-view-close]');
  if (!todayBtn) return;

  todayBtn.addEventListener('click', e => {
    // Ignore clicks inside the picker dropdown — handled by document listener
    if (e.target.closest('[data-topbar-sdp]')) return;
    // Close button — go back to today
    if (e.target.closest('[data-today-close]')) {
      e.preventDefault();
      e.stopPropagation();
      closeTopbarTodayPicker();
      if (dailyShutdownState.isActive) {
        setDailyShutdownSelectedDate(getTodayISO(), { resetStep: true });
      } else if (dailyPlanningState.isActive) {
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
      closeTopbarFilterPicker();
      openTopbarTodayPicker();
    }
  });

  if (filterBtn) {
    filterBtn.addEventListener('click', e => {
      if (e.target.closest('[data-topbar-filter-picker]')) return;
      if (e.target.closest('[data-filter-close]')) {
        e.preventDefault();
        e.stopPropagation();
        closeTopbarFilterPicker();
        clearActiveTaskFilter();
        return;
      }
      e.preventDefault();
      closeTopbarTodayPicker();
      toggleTopbarFilterPicker();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', e => {
      e.preventDefault();
      if (!todayViewState.isActive) return;
      exitTodayView();
    });
  }
}

function setSidebarCollapsed(isCollapsed) {
  const shell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.sidebar');
  if (!shell || !sidebar) return;
  shell.classList.toggle('sidebar-collapsed', isCollapsed);
  sidebar.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
  const collapseBtn = document.querySelector('[data-sidebar-collapse]');
  if (collapseBtn) {
    collapseBtn.setAttribute('aria-label', 'Collapse navigation panel');
    collapseBtn.setAttribute('data-rich-tooltip-label', 'Collapse navigation panel');
  }
  const expandBtn = document.querySelector('[data-sidebar-expand]');
  if (expandBtn) {
    expandBtn.setAttribute('aria-label', 'Expand navigation panel');
    expandBtn.setAttribute('data-rich-tooltip-label', 'Expand navigation panel');
  }
  const focusModal = document.getElementById('focus-modal');
  if (focusModal) focusModal.classList.toggle('focus-modal--sidebar-collapsed', isCollapsed);
}

function setRightSidebarCollapsed(isCollapsed) {
  if (todayViewState.isActive && isCollapsed) {
    isCollapsed = false;
  }
  const shell = document.querySelector('.app-shell');
  if (!shell) return;
  rightSidebarState.collapsed = isCollapsed;
  shell.classList.toggle('right-sidebar-collapsed', isCollapsed);
  const collapseBtn = document.querySelector('[data-right-sidebar-collapse]');
  if (collapseBtn) {
    const label = isCollapsed ? 'Expand right panel' : 'Collapse right panel';
    collapseBtn.setAttribute('aria-label', label);
    collapseBtn.setAttribute('data-rich-tooltip-label', label);
  }
}

function setRightSidebarActive(panelId) {
  if (!panelId) return;
  rightSidebarState.activePanel = panelId;
  if (panelId !== 'search') {
    closeSearchDropdown();
  }
  document.querySelectorAll('[data-right-panel]').forEach(panel => {
    panel.hidden = panel.dataset.rightPanel !== panelId;
  });
  document.querySelectorAll('[data-right-panel-btn]').forEach(btn => {
    btn.classList.toggle('right-rail__btn--active', btn.dataset.rightPanelBtn === panelId);
  });
  if (panelId === 'calendar') {
    updateCurrentTimeLine();
  }
  if (panelId === 'backlog') {
    renderBacklogPanel();
  }
  if (panelId === 'archive') {
    settings.archiveLastViewedAt = getNowIsoString();
    persistSettings();
    renderArchivePanel();
    updateArchiveIndicator();
  }
  if (panelId === 'search') {
    renderSearchPanel();
  }
  if (panelId === 'trash') {
    renderTrashPanel();
  }
}

function closeWorkspaceMenu() {
  const menu = document.querySelector('[data-workspace-menu]');
  if (menu) menu.hidden = true;
  const toggle = document.querySelector('[data-workspace-menu-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function toggleWorkspaceMenu() {
  const menu = document.querySelector('[data-workspace-menu]');
  if (!menu) return;
  const nextOpen = menu.hidden;
  menu.hidden = !nextOpen;
  const toggle = document.querySelector('[data-workspace-menu-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', String(nextOpen));
}

function attachSidebarToggleEvents() {
  const collapseBtn = document.querySelector('[data-sidebar-collapse]');
  const expandBtn = document.querySelector('[data-sidebar-expand]');

  if (collapseBtn) {
    collapseBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      setSidebarCollapsed(true);
    });
  }

  if (expandBtn) {
    expandBtn.addEventListener('click', e => {
      e.preventDefault();
      setSidebarCollapsed(false);
    });
  }
}

function attachRightSidebarEvents() {
  const collapseBtn = document.querySelector('[data-right-sidebar-collapse]');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      setRightSidebarCollapsed(!rightSidebarState.collapsed);
    });
  }

  document.querySelectorAll('[data-right-panel-btn]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const panelId = btn.dataset.rightPanelBtn;
      if (!panelId) return;
      setRightSidebarActive(panelId);
      if (rightSidebarState.collapsed) {
        setRightSidebarCollapsed(false);
      }
    });
  });

  setRightSidebarActive(rightSidebarState.activePanel);
}

function attachSidebarEvents() {
  const homeBtn = document.querySelector('[data-sidebar-home]');
  const todayBtn = document.querySelector('[data-sidebar-today]');
  const dailyPlanningBtn = document.querySelector('[data-sidebar-daily-planning]');
  const dailyShutdownBtn = document.querySelector('[data-sidebar-daily-shutdown]');
  const focusBtn = document.querySelector('[data-sidebar-focus]');

  if (homeBtn) {
    homeBtn.addEventListener('click', e => {
      e.preventDefault();
      if (dailyShutdownState.isActive) {
        exitDailyShutdownMode({ preferTodayReturn: false });
      } else if (dailyPlanningState.isActive) {
        exitDailyPlanningMode({ preferTodayReturn: false });
      } else if (todayViewState.isActive) {
        exitTodayView();
      } else {
        setSidebarActiveNav('home');
        scrollToDateColumn(getTodayISO(), { behavior: 'smooth' });
      }
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', e => {
      e.preventDefault();
      openTodayView(getTodayISO());
    });
  }

  if (dailyPlanningBtn) {
    dailyPlanningBtn.addEventListener('click', e => {
      e.preventDefault();
      enterDailyPlanningMode();
    });
  }

  if (dailyShutdownBtn) {
    dailyShutdownBtn.addEventListener('click', e => {
      e.preventDefault();
      enterDailyShutdownMode();
    });
  }

  if (!focusBtn) return;

  focusBtn.addEventListener('click', e => {
    e.preventDefault();
    const firstTaskId = getTopTodayTaskId();
    if (firstTaskId) openFocusMode(firstTaskId, false, 'sidebar');
  });
}

function attachWorkspaceMenuEvents() {
  const toggle = document.querySelector('[data-workspace-menu-toggle]');
  const menu = document.querySelector('[data-workspace-menu]');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleWorkspaceMenu();
  });

  menu.addEventListener('click', e => {
    const item = e.target.closest('.sdp__menu-item');
    if (!item) return;
    closeWorkspaceMenu();
    if (item.hasAttribute('data-settings-open')) {
      openSettingsView();
      return;
    }
    if (item.hasAttribute('data-shortcuts-open')) {
      openKeyboardShortcutsOverlay();
      return;
    }
    if (item.hasAttribute('data-logout')) {
      AppAuth.logout();
    }
  });

  document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) { closeWorkspaceMenu(); return; }
    if (e.target.closest('[data-workspace-menu]')) return;
    if (e.target.closest('[data-workspace-menu-toggle]')) return;
    closeWorkspaceMenu();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menu.hidden) return;
    e.preventDefault();
    closeWorkspaceMenu();
  });
}

function attachShortcutEvents() {
  document.addEventListener('keydown', handleGlobalShortcutKeydown, true);
  document.addEventListener('mouseover', handleOpenPickerPointerHover, true);

  document.addEventListener('mouseover', e => {
    const trigger = getFloatingTooltipTrigger(e.target);
    if (!trigger) {
      hideFloatingTooltip();
      return;
    }
    const previousTrigger = getFloatingTooltipTrigger(e.relatedTarget);
    if (previousTrigger === trigger) return;
    scheduleFloatingTooltip(trigger);
  }, true);

  document.addEventListener('mouseout', e => {
    const trigger = getFloatingTooltipTrigger(e.target);
    if (!trigger) return;
    const nextTrigger = getFloatingTooltipTrigger(e.relatedTarget);
    if (nextTrigger === trigger) return;
    hideFloatingTooltip();
  }, true);

  document.addEventListener('mousemove', e => {
    if (!activeFloatingTooltipTarget) return;
    positionFloatingTooltip(activeFloatingTooltipTarget);
  }, true);

  document.addEventListener('scroll', () => {
    if (!activeFloatingTooltipTarget) return;
    positionFloatingTooltip(activeFloatingTooltipTarget);
  }, true);

  window.addEventListener('resize', () => {
    if (!activeFloatingTooltipTarget) return;
    positionFloatingTooltip(activeFloatingTooltipTarget);
  });

  document.addEventListener('mouseover', e => {
    if (shortcutState.suppressHoverUntilPointerMove) return;
    if (cardDatePickerState) return;
    const card = e.target instanceof Element ? e.target.closest('.task-card') : null;
    if (!card || card.dataset.ghostDate) return;
    const previousCard = e.relatedTarget instanceof Element ? e.relatedTarget.closest('.task-card') : null;
    if (previousCard === card) return;
    setActiveTaskSelectionFromCard(card, 'hover');
  });

  document.addEventListener('mouseout', e => {
    if (cardDatePickerState) return;
    if (shortcutState.activeSource !== 'hover') return;
    const currentCard = e.target instanceof Element ? e.target.closest('.task-card') : null;
    if (!currentCard || currentCard.dataset.ghostDate) return;
    const activeCard = resolveVisibleTaskCard(shortcutState.activeTaskId);
    if (activeCard !== currentCard) return;
    const nextCard = e.relatedTarget instanceof Element ? e.relatedTarget.closest('.task-card') : null;
    if (nextCard === currentCard) return;
    if (nextCard) return;
    clearActiveTaskSelection();
  });

  document.addEventListener('click', e => {
    const card = e.target instanceof Element ? e.target.closest('.task-card') : null;
    if (activeFloatingTooltipTarget) {
      hideFloatingTooltip();
    }
    if (!card || card.dataset.ghostDate) return;
    shortcutState.suppressHoverUntilPointerMove = false;
    setActiveTaskSelectionFromCard(card, 'click');
  }, true);

  document.addEventListener('mousemove', e => {
    const previous = shortcutState.lastPointerPosition;
    const moved = !previous || previous.x !== e.clientX || previous.y !== e.clientY;
    shortcutState.lastPointerPosition = { x: e.clientX, y: e.clientY };
    if (moved && shortcutState.suppressHoverUntilPointerMove) {
      shortcutState.suppressHoverUntilPointerMove = false;
    }
  }, true);

  const overlay = document.getElementById('shortcuts-overlay');
  const searchInput = document.querySelector('[data-shortcuts-search]');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        closeKeyboardShortcutsOverlay();
      }
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      shortcutState.searchQuery = e.target.value;
      renderKeyboardShortcutsOverlay();
    });
  }
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
      const labelEl = copyBtn.querySelector('[data-copy-label]');
      try {
        await copyTextToClipboard(buildDailyPlanningCopyText());
        const prev = labelEl ? labelEl.textContent : copyBtn.textContent;
        if (labelEl) {
          labelEl.textContent = 'Copied';
        } else {
          copyBtn.textContent = 'Copied';
        }
        setTimeout(() => {
          if (labelEl) {
            labelEl.textContent = prev || 'Copy';
          } else {
            copyBtn.textContent = prev || 'Copy';
          }
        }, 1200);
      } catch (_) {
        if (labelEl) {
          labelEl.textContent = 'Copy failed';
        } else {
          copyBtn.textContent = 'Copy failed';
        }
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

  // Share text input is now handled by Quill editor's text-change event
}

function attachDailyShutdownEvents() {
  const panel = document.getElementById('daily-shutdown-panel');
  if (!panel) return;

  panel.addEventListener('click', async e => {
    if (!(e.target instanceof Element)) return;

    if (e.target.closest('[data-ds-prev]')) {
      e.preventDefault();
      goToPrevDailyShutdownStep();
      return;
    }

    if (e.target.closest('[data-ds-next]')) {
      e.preventDefault();
      goToNextDailyShutdownStep();
      return;
    }

    if (e.target.closest('[data-ds-finish]')) {
      e.preventDefault();
      completeDailyShutdownRun();
      return;
    }

    const copyBtn = e.target.closest('[data-ds-copy]');
    if (copyBtn) {
      e.preventDefault();
      const labelEl = copyBtn.querySelector('[data-copy-label]');
      try {
        await copyTextToClipboard(buildDailyShutdownCopyText());
        const prev = labelEl ? labelEl.textContent : copyBtn.textContent;
        if (labelEl) {
          labelEl.textContent = 'Copied';
        } else {
          copyBtn.textContent = 'Copied';
        }
        setTimeout(() => {
          if (labelEl) {
            labelEl.textContent = prev || 'Copy';
          } else {
            copyBtn.textContent = prev || 'Copy';
          }
        }, 1200);
      } catch (_) {
        if (labelEl) {
          labelEl.textContent = 'Copy failed';
        } else {
          copyBtn.textContent = 'Copy failed';
        }
      }
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
    if (topbarFilterPickerState) return;
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

function attachDailyShutdownEscapeEvents() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!dailyShutdownState.isActive) return;
    if (e.defaultPrevented) return;

    const overlay = document.getElementById('task-modal-overlay');
    if (overlay && !overlay.hidden) return;
    if (document.getElementById('focus-modal')) return;
    if (topbarTodayPickerState) return;
    if (topbarFilterPickerState) return;
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
    exitDailyShutdownMode();
  });
}

function attachTodayViewEscapeEvents() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!todayViewState.isActive) return;
    if (e.defaultPrevented) return;

    const overlay = document.getElementById('task-modal-overlay');
    if (overlay && !overlay.hidden) return;
    if (document.getElementById('focus-modal')) return;
    if (topbarTodayPickerState) return;
    if (topbarFilterPickerState) return;
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
    exitTodayView();
  });
}

/* ═══════════════════════════════════════════════
   CALENDAR DRAG-AND-DROP
═══════════════════════════════════════════════ */

function attachCalendarEvents() {
  const timeGrid    = document.getElementById('time-grid');
  const ghost       = document.getElementById('cal-event-ghost');
  const calDragLine = document.getElementById('cal-drag-line');

  timeGrid.addEventListener('click', e => {
    const marker = e.target.closest('.cal-completion-marker');
    if (!marker) return;
    e.preventDefault();
    e.stopPropagation();
    const taskId = marker.getAttribute('data-task-id');
    if (taskId) openTaskDetailModal(taskId);
  });

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
      if (evt.taskId && evt.systemType !== 'actual') {
        const task = findTaskById(evt.taskId);
        if (task) {
          // Only update scheduledTime if the event is on the task's home column date
          const homeCol = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
          const eventCol = state.columns.find(c => c.isoDate === evt.date);
          if (homeCol && evt.date === homeCol.isoDate) {
            task.scheduledTime = offsetToScheduledTime(offset);
          }
          if (homeCol) renderColumn(homeCol);
          if (eventCol && eventCol !== homeCol) renderColumn(eventCol);
          persistTask(task, 0);
        }
      }
      persistCalendarEvent(evt);
    } else if (evt.systemType === 'actual' && evt.taskId) {
      // Drag actual event off timeline: delete event and subtract actual time
      const task = findTaskById(evt.taskId);
      const durationSeconds = Math.round(evt.duration * 3600);
      state.calendarEvents = state.calendarEvents.filter(ev => ev.id !== eventId);
      if (task) {
        if (evt.subtaskId) {
          const dragSubtask = findSubtask(task, evt.subtaskId);
          if (dragSubtask) {
            dragSubtask.actualTimeSeconds = Math.max(0, (dragSubtask.actualTimeSeconds || 0) - durationSeconds);
            recordDailyTime(task, evt.date, -durationSeconds, evt.subtaskId);
          }
        } else {
          task.ownActualTimeSeconds = Math.max(0, (task.ownActualTimeSeconds || 0) - durationSeconds);
          recordDailyTime(task, evt.date, -durationSeconds, null);
        }
        syncTaskAggregateTimes(task);
        const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
        if (col) renderColumn(col);
        updateFocusModalValues(task);
        updateCardDetailTimerState();
        persistTask(task, 0);
      }
      persistDeleteCalendarEvent(eventId);
    } else if (evt.taskId) {
      const task = findTaskById(evt.taskId);
      const removedEventDate = evt.date;
      state.calendarEvents = state.calendarEvents.filter(ev => ev.id !== eventId);
      if (task) {
        // Only clear scheduledTime if the removed event was on the task's home column date
        const homeCol = state.columns.find(c => c.tasks.some(t => t.id === evt.taskId));
        const eventCol = state.columns.find(c => c.isoDate === removedEventDate);
        if (homeCol && removedEventDate === homeCol.isoDate) {
          task.scheduledTime = null;
        }
        if (homeCol) renderColumn(homeCol);
        if (eventCol && eventCol !== homeCol) renderColumn(eventCol);
        // Re-render ghost columns — removing the event may remove a ghost card
        rerenderGhostColumns(task);
        persistTask(task, 0);
      }
      persistDeleteCalendarEvent(eventId);
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
      : settings.defaultTimeboxDurationMinutes / 60;
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
      : settings.defaultTimeboxDurationMinutes / 60;
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
      persistCalendarEvent(existing);
    } else {
      const newCalEvt = {
        id:         'evt-' + uid(),
        title:      task.title,
        colorClass: getTaskEventColorClass(task, 'cal-event--blue'),
        offset,
        duration,
        taskId:     task.id,
        date:       visibleDate,
        zOrder:     ++calZCounter
      };
      state.calendarEvents.push(newCalEvt);
      persistCalendarEvent(newCalEvt);
    }

    persistTask(task, 0);
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

      // Keep linked task data in sync with resized calendar duration.
      if (evt.taskId) {
        const task = findTaskById(evt.taskId);
        if (task) {
          if (evt.systemType === 'actual') {
            // Actual-time event resize: adjust actual time by the duration delta
            const durationDeltaSeconds = Math.round((evt.duration - startDuration) * 3600);
            if (evt.subtaskId) {
              const resizeSubtask = findSubtask(task, evt.subtaskId);
              if (resizeSubtask) {
                resizeSubtask.actualTimeSeconds = Math.max(0, (resizeSubtask.actualTimeSeconds || 0) + durationDeltaSeconds);
                recordDailyTime(task, evt.date, durationDeltaSeconds, evt.subtaskId);
              }
            } else {
              task.ownActualTimeSeconds = Math.max(0, (task.ownActualTimeSeconds || 0) + durationDeltaSeconds);
              recordDailyTime(task, evt.date, durationDeltaSeconds, null);
            }
            syncTaskAggregateTimes(task);
            const col = state.columns.find(c => c.tasks.some(t => t.id === task.id));
            if (col) renderColumn(col);
            updateFocusModalValues(task);
            updateCardDetailTimerState();
          } else {
            const todayISO = getTodayISO();
            const isPastEvent = evt.date < todayISO;

            if (isPastEvent) {
              // Past timebox resize: only update the event duration (already done above).
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
          persistTask(task, 0);
        }
      }
      persistCalendarEvent(evt);

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

document.addEventListener('click', e => {
  if (!topbarFilterPickerState) return;
  if (!(e.target instanceof Element)) {
    closeTopbarFilterPicker();
    return;
  }

  const picker = e.target.closest('[data-topbar-filter-picker]');
  if (picker) {
    e.stopImmediatePropagation();
    const item = e.target.closest('[data-topbar-filter-id]');
    if (item) {
      selectTopbarTaskFilter(item.dataset.topbarFilterId || 'all');
      return;
    }
    if (e.target.closest('.channel-picker__manage')) {
      e.preventDefault();
      closeTopbarFilterPicker();
      openSettingsView();
      setTimeout(() => {
        const section = document.getElementById('settings-section-channels');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setSettingsActiveNav('channels');
      }, 50);
    }
    return;
  }

  if (e.target.closest('[data-view-filter]')) return;
  closeTopbarFilterPicker();
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

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && topbarFilterPickerState) {
    e.preventDefault();
    closeTopbarFilterPicker();
  }
});

// Close card picker on outside click
document.addEventListener('click', e => {
  if (!cardPickerState) return;
  if (e.target instanceof Element) {
    const portalPicker = e.target.closest('[data-card-picker-portal]');
    if (portalPicker) {
      e.stopImmediatePropagation();
      const optBtn = e.target.closest('[data-card-picker-minutes]');
      if (optBtn) { applyCardPickerTime(parseInt(optBtn.dataset.cardPickerMinutes, 10)); return; }
      if (e.target.closest('[data-card-picker-edit]')) {
        if (cardPickerState) { cardPickerState.editMode = true; renderCardPicker(); }
        return;
      }
      if (e.target.closest('[data-card-picker-clear]')) { applyCardPickerTime(0); return; }
      return;
    }
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
    if (actionBtn) { handleCardDateAction(actionBtn.dataset.action, actionBtn.dataset.backlogHorizon); return; }
    return;
  }

  // Outside click — close
  closeCardDatePicker();
});

// Escape key for card date picker
document.addEventListener('keydown', e => {
  if (handleBacklogHorizonPickerShortcut(e)) return;
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
      if (e.target.closest('.channel-picker__manage')) {
        e.preventDefault();
        closeChannelPicker();
        openSettingsView();
        setTimeout(() => {
          const section = document.getElementById('settings-section-channels');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setSettingsActiveNav('channels');
        }, 50);
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

// Close backlog filter picker on outside click
document.addEventListener('click', e => {
  if (!backlogFilterPickerState) return;
  if (e.target instanceof Element) {
    if (e.target.closest('[data-backlog-filter-picker]')) return;
    if (e.target.closest('[data-backlog-filter-btn]')) return;
  }
  closeBacklogFilterPicker();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && backlogFilterPickerState) {
    e.preventDefault();
    closeBacklogFilterPicker();
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

/* ═══════════════════════════════════════════════
   SETTINGS VIEW
═══════════════════════════════════════════════ */

let settingsScrollSpyObserver = null;
let settingsScrollSpySuppressed = false;
let settingsScrollSpyTimer = null;
let settingsDropdownOpen = null; // { key, el }
let settingsChannelModalState = null; // { mode: 'create-context'|'edit-context'|'create-channel'|'edit-channel', data }

const SETTINGS_COLOR_PALETTE = [
  '#ff79a7','#d45d8c','#e979fc','#ff62be','#856cc2','#a382ff',
  '#7cadff','#5e9fe0','#90a4ae','#4fc3f7','#4dd0e1','#4db6c1',
  '#4db6ac','#4da197','#74b077','#82c785','#95bc74','#aed580',
  '#ffd451','#ffbd4d','#ffb74d','#f8a34d','#ff8964','#ee805e',
  '#ff8686','#e06d6d','#a1887f','#8e7973',
];

function getDeviceTimeFormat() {
  const f = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
  const parts = f.formatToParts(new Date(2000, 0, 1, 13));
  return parts.some(p => p.type === 'dayPeriod') ? '12' : '24';
}

function getEffectiveTimeFormat() {
  if (settings.timeFormat === 'device') return getDeviceTimeFormat();
  return settings.timeFormat;
}

function minutesToTimeLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const fmt = getEffectiveTimeFormat();
  if (fmt === '24') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function generateTimeOptions() {
  const options = [];
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    options.push({ value: mins, label: minutesToTimeLabel(mins) });
  }
  return options;
}

function formatTimezoneLabel(tz) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    const offset = offsetPart ? offsetPart.value : '';
    return `(${offset}) ${tz.replace(/_/g, ' ')}`;
  } catch { return tz; }
}

function getAllTimezones() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
            'America/Anchorage','Pacific/Honolulu','Europe/London','Europe/Paris',
            'Europe/Berlin','Asia/Tokyo','Asia/Shanghai','Asia/Kolkata',
            'Australia/Sydney','Pacific/Auckland','UTC'];
  }
}

function openSettingsView() {
  const settingsEl = document.getElementById('settings-view');
  const appShell = document.querySelector('.app-shell');
  if (!settingsEl || !appShell) return;

  renderSettingsContent();
  settingsEl.hidden = false;
  appShell.style.display = 'none';

  // Reset scroll and active nav to top
  const contentEl = document.getElementById('settings-content');
  if (contentEl) contentEl.scrollTop = 0;
  setSettingsActiveNav('general');

  if (typeof lucide !== 'undefined') lucide.createIcons();
  initSettingsScrollSpy();
}

function closeSettingsView() {
  const settingsEl = document.getElementById('settings-view');
  const appShell = document.querySelector('.app-shell');
  if (!settingsEl || !appShell) return;

  settingsEl.hidden = true;
  appShell.style.display = '';
  cleanupSettingsScrollSpy();
  closeSettingsDropdown();
  applySettingsToApp();
}

function applySettingsToApp() {
  // Sync workload threshold
  dailyPlanningState.capacityConfig.defaultMinutes = settings.workloadThresholdHours * 60;

  // Sync workday schedule for today
  const todayDow = new Date().getDay();
  const todaySchedule = settings.schedule.find(s => s.day === todayDow);
  if (todaySchedule) {
    state.workday.startOffset = todaySchedule.startMinutes / 60;
    state.workday.endOffset = todaySchedule.endMinutes / 60;
    state.workdayDefault.startOffset = todaySchedule.startMinutes / 60;
    state.workdayDefault.endOffset = todaySchedule.endMinutes / 60;
  }

  // Update time grid labels
  updateTimeGridLabels();

  // Re-render affected UI
  renderWorkdayMarkers();
  renderCalendarEvents();
  renderArchivePanel();
  updateArchiveIndicator();
}

function updateTimeGridLabels() {
  const labels = document.querySelectorAll('.time-grid__label');
  labels.forEach((label, i) => {
    const hour = i;
    const fmt = getEffectiveTimeFormat();
    if (fmt === '24') {
      label.textContent = `${String(hour).padStart(2, '0')}:00`;
    } else {
      const period = hour < 12 ? 'AM' : 'PM';
      const h12 = hour % 12 || 12;
      label.textContent = `${h12} ${period}`;
    }
  });
}

// ── Render helpers ──

function settingsToggleHTML(key, value) {
  return `<button class="settings-toggle${value ? ' settings-toggle--on' : ''}" type="button" data-settings-toggle="${key}">
    <span class="settings-toggle__knob"></span>
  </button>`;
}

function settingsSelectHTML(key, currentLabel) {
  return `<div class="settings-view__dropdown-anchor">
    <button class="settings-view__select" type="button" data-settings-select="${key}">
      <span>${escapeHtml(currentLabel)}</span>
      <i data-lucide="chevron-down" class="settings-view__select-icon"></i>
    </button>
  </div>`;
}

function settingsRowHTML(label, desc, controlHTML) {
  return `<div class="settings-view__row">
    <div class="settings-view__row-info">
      <div class="settings-view__row-label">${escapeHtml(label)}</div>
      ${desc ? `<div class="settings-view__row-desc">${escapeHtml(desc)}</div>` : ''}
    </div>
    ${controlHTML}
  </div>`;
}

// ── Section renderers ──

function renderSettingsGeneral() {
  const tzLabel = formatTimezoneLabel(settings.timezone);
  const timeFormatLabels = { device: 'Use device region', '12': '12 hour', '24': '24 hour' };
  const startOfWeekLabels = { monday: 'Monday', sunday: 'Sunday' };
  const rolloverLabels = { top: 'Top', bottom: 'Bottom' };
  const workloadLabel = `${settings.workloadThresholdHours} hours`;

  return `<section class="settings-view__section" id="settings-section-general">
    <h2 class="settings-view__section-title">General</h2>
    ${settingsRowHTML('Time zone', "What's your time zone", settingsSelectHTML('timezone', tzLabel))}
    ${settingsRowHTML('Time format', 'How should times be displayed in Sunsama?', settingsSelectHTML('timeFormat', timeFormatLabels[settings.timeFormat]))}
    ${settingsRowHTML('Start of week', 'What day does the week start', settingsSelectHTML('startOfWeek', startOfWeekLabels[settings.startOfWeek]))}
    ${settingsRowHTML('Count planned time as actual time', 'When you complete a task that has no "actual time", use the time you planned to spend on it as the time you actually spent on it.', settingsToggleHTML('countPlannedAsActual', settings.countPlannedAsActual))}
    ${settingsRowHTML('Task rollover position', 'When tasks rollover, should they roll to the top or bottom of the next day?', settingsSelectHTML('taskRolloverPosition', rolloverLabels[settings.taskRolloverPosition]))}
    ${settingsRowHTML('Workload threshold', 'How many hours per day do you prefer to work', settingsSelectHTML('workloadThresholdHours', workloadLabel))}
    ${renderArchiveSettingRow()}
  </section>`;
}

function renderArchiveSettingRow() {
  const archiveDaysLabel = `${settings.autoArchiveDays} day${settings.autoArchiveDays > 1 ? 's' : ''}`;
  const dropdownHTML = settings.autoArchiveEnabled
    ? `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;width:100%;margin-top:8px;">
         <span class="settings-view__row-label" style="font-weight:500;font-size:13px;">Archive after:</span>${settingsSelectHTML('autoArchiveDays', archiveDaysLabel)}
       </div>`
    : '';
  return `<div class="settings-view__row" style="flex-wrap:wrap;">
    <div class="settings-view__row-info">
      <div class="settings-view__row-label">Archive</div>
      <div class="settings-view__row-desc">Auto-archive tasks that keep rolling over to de-clutter your day.</div>
    </div>
    ${settingsToggleHTML('autoArchiveEnabled', settings.autoArchiveEnabled)}
    ${dropdownHTML}
  </div>`;
}

function rerenderSettingsGeneralSection() {
  const generalSection = document.getElementById('settings-section-general');
  if (!generalSection) return;
  generalSection.outerHTML = renderSettingsGeneral();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function syncArchiveUi() {
  renderArchivePanel();
  updateArchiveIndicator();
  if (rightSidebarState.activePanel === 'archive') {
    renderArchivePanel();
  }
}

function setAutoArchiveEnabled(enabled, options = {}) {
  closeArchiveDaysDropdown();
  const nextValue = !!enabled;
  if (settings.autoArchiveEnabled === nextValue) {
    if (options.rerender !== false) {
      rerenderSettingsGeneralSection();
      syncArchiveUi();
    }
    return;
  }

  settings.autoArchiveEnabled = nextValue;
  persistSettings();

  if (nextValue) {
    archiveEligibleTasks();
    renderAllColumns();
    renderCalendarEvents();
  } else {
    returnArchivedTasksToTodayColumn();
    renderAllColumns();
    renderCalendarEvents();
  }

  rerenderSettingsGeneralSection();
  syncArchiveUi();
}

function setAutoArchiveDays(days) {
  closeArchiveDaysDropdown();
  const nextValue = Math.max(1, Math.min(14, parseInt(days, 10) || settings.autoArchiveDays));
  if (settings.autoArchiveDays === nextValue) {
    rerenderSettingsGeneralSection();
    syncArchiveUi();
    return;
  }

  settings.autoArchiveDays = nextValue;
  persistSettings();

  if (settings.autoArchiveEnabled) {
    releaseIneligibleArchivedTasks();
    archiveEligibleTasks();
    renderAllColumns();
    renderCalendarEvents();
  }

  rerenderSettingsGeneralSection();
  syncArchiveUi();
}

function renderSettingsDisplay() {
  const darkModeLabels = { light: 'Light', dark: 'Dark' };
  return `<section class="settings-view__section" id="settings-section-display">
    <h2 class="settings-view__section-title">Display</h2>
    ${settingsRowHTML('Hide completed tasks in calendar', "Don't show checkmarks in the calendar for completed tasks", settingsToggleHTML('hideCompletedTasksInCalendar', settings.hideCompletedTasksInCalendar))}
    ${settingsRowHTML('Dark mode', 'Show interface in dark mode', settingsSelectHTML('darkMode', darkModeLabels[settings.darkMode]))}
  </section>`;
}

function renderSettingsTimeboxing() {
  const label = `${settings.defaultTimeboxDurationMinutes} min`;
  return `<section class="settings-view__section" id="settings-section-timeboxing">
    <h2 class="settings-view__section-title">Timeboxing</h2>
    ${settingsRowHTML('Visualize actual time for tasks on calendar', "Show when you've tracked actually working on a task on your calendar.", settingsToggleHTML('visualizeActualTimeOnCalendar', settings.visualizeActualTimeOnCalendar))}
    ${settingsRowHTML('Default duration when scheduling tasks', 'When you drag a task onto your calendar, how much time to block off', settingsSelectHTML('defaultTimeboxDurationMinutes', label))}
  </section>`;
}

function renderSettingsSchedule() {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const s = settings.schedule[i];
    const startLabel = minutesToTimeLabel(s.startMinutes);
    const endLabel = minutesToTimeLabel(s.endMinutes);
    const disabledClass = s.workday ? '' : ' settings-schedule__times--disabled';
    rows += `<div class="settings-schedule__row">
      <span class="settings-schedule__day">${dayNames[i]}</span>
      <div class="settings-schedule__times${disabledClass}">
        <div class="settings-view__dropdown-anchor">
          <button class="settings-schedule__select" type="button" data-settings-select="schedule-${i}-start">
            <span>${escapeHtml(startLabel)}</span>
          </button>
        </div>
        <span class="settings-schedule__dash">-</span>
        <div class="settings-view__dropdown-anchor">
          <button class="settings-schedule__select" type="button" data-settings-select="schedule-${i}-end">
            <span>${escapeHtml(endLabel)}</span>
          </button>
        </div>
      </div>
      <div class="settings-schedule__workday">
        <button class="settings-toggle${s.workday ? ' settings-toggle--on' : ''}" type="button" data-settings-schedule-workday="${i}" aria-label="Workday toggle for ${dayNames[i]}">
          <span class="settings-toggle__knob"></span>
        </button>
      </div>
    </div>`;
  }
  return `<section class="settings-view__section" id="settings-section-schedule">
    <h2 class="settings-view__section-title">Schedule</h2>
    <div class="settings-view__row-desc" style="margin-bottom:8px">Controls default start of day and end of timing.</div>
    <div class="settings-schedule__header">
      <h3 style="font-size:16px;font-weight:600;color:#413f39;margin:0">Default schedule</h3>
      <span class="settings-schedule__workday-heading">Workday</span>
    </div>
    ${rows}
  </section>`;
}

function renderSettingsShortcuts() {
  return `<section class="settings-view__section" id="settings-section-shortcuts">
    <h2 class="settings-view__section-title">Keyboard shortcuts</h2>
    ${settingsRowHTML('Keyboard shortcuts', 'Enable keyboard shortcuts', settingsToggleHTML('keyboardShortcutsEnabled', settings.keyboardShortcutsEnabled))}
  </section>`;
}

function renderSettingsProfile() {
  const initials = ((settings.firstName || '').charAt(0) + (settings.lastName || '').charAt(0)).toUpperCase() || '';
  const avatarSrc = settings.profilePictureDataUrl;
  const avatarContent = avatarSrc
    ? `<img src="${avatarSrc}" alt="Profile">`
    : initials;

  return `<section class="settings-view__section" id="settings-section-profile">
    <h2 class="settings-view__section-title">Profile</h2>
    <div class="settings-profile__layout">
      <div class="settings-profile__fields">
        <div class="settings-profile__input-group">
          <label class="settings-profile__input-label">Name</label>
          <input class="settings-profile__input" type="text" placeholder="First" value="${escapeHtml(settings.firstName)}" data-settings-input="firstName">
        </div>
        <div class="settings-profile__input-group">
          <label class="settings-profile__input-label">&nbsp;</label>
          <input class="settings-profile__input" type="text" placeholder="Last" value="${escapeHtml(settings.lastName)}" data-settings-input="lastName">
        </div>
      </div>
      <div class="settings-profile__avatar-area">
        <div class="settings-profile__avatar" id="settings-avatar">${avatarContent}</div>
        <button class="settings-profile__upload-btn" type="button" data-settings-upload>Upload a new picture</button>
        <input type="file" accept="image/*" id="settings-avatar-file" hidden>
      </div>
    </div>
  </section>`;
}

function renderSettingsAccountMgmt() {
  return `<section class="settings-view__section" id="settings-section-account-mgmt">
    <h2 class="settings-view__section-title">Account Management</h2>
    <div class="settings-acct__row">
      <div class="settings-acct__label">Change password</div>
      <div class="settings-acct__desc">Enter a new password to login to Sunsama</div>
    </div>
    <div class="settings-acct__row">
      <div class="settings-acct__label">Change primary email</div>
      <div class="settings-acct__desc">Choose a different email address to use to log into your account</div>
    </div>
  </section>`;
}

function renderSettingsChannels() {
  // Group channels by context
  const contexts = CHANNELS.filter(ch => ch.isContext);
  const uncategorized = CHANNELS.filter(ch => !ch.isContext && !ch.context && ch.id !== 'unassigned');
  const unassigned = CHANNELS.find(ch => ch.id === 'unassigned');

  let html = `<section class="settings-view__section" id="settings-section-channels">
    <h2 class="settings-view__section-title">Contexts & Channels</h2>
    <div class="settings-channels__actions">
      <button class="settings-channels__btn" type="button" data-create-context>Create Context</button>
      <button class="settings-channels__btn" type="button" data-create-channel>Create Channel</button>
    </div>
    <div class="settings-channels__table">
      <div class="settings-channels__table-header">
        <span>CONTEXT/CHANNEL</span>
        <span>ENABLE</span>
      </div>`;

  // Render each context and its children
  for (const ctx of contexts) {
    const children = CHANNELS.filter(ch => ch.context === ctx.label && !ch.isContext);
    html += `<div class="settings-channels__context-row" data-channel-edit="${ctx.id}">
      <span class="settings-channels__context-hash" style="color:${ctx.hashColor}">#</span>
      <span>${escapeHtml(ctx.label)}</span>
    </div>`;
    for (const ch of children) {
      const enabled = settings.channelEnabled[ch.id] !== false;
      html += `<div class="settings-channels__channel-row" data-channel-edit="${ch.id}">
        <div class="settings-channels__channel-info">
          <span class="settings-channels__channel-hash" style="color:${ch.hashColor}">#</span>
          <span class="settings-channels__channel-name">${escapeHtml(ch.label)}</span>
        </div>
        ${settingsToggleHTML('channel-' + ch.id, enabled)}
      </div>`;
    }
    html += `<button class="settings-channels__create-link" type="button" data-create-channel-in="${ctx.label}">
      + Create channel in ${escapeHtml(ctx.label)}
    </button>`;
  }

  // Uncategorized channels
  if (uncategorized.length > 0) {
    html += `<div class="settings-channels__context-row">
      <span class="settings-channels__context-hash" style="color:#787878">#</span>
      <span>uncategorized</span>
    </div>`;
    for (const ch of uncategorized) {
      const enabled = settings.channelEnabled[ch.id] !== false;
      html += `<div class="settings-channels__channel-row" data-channel-edit="${ch.id}">
        <div class="settings-channels__channel-info">
          <span class="settings-channels__channel-hash" style="color:${ch.hashColor}">#</span>
          <span class="settings-channels__channel-name">${escapeHtml(ch.label)}</span>
        </div>
        ${settingsToggleHTML('channel-' + ch.id, enabled)}
      </div>`;
    }
    html += `<button class="settings-channels__create-link" type="button" data-create-channel-in="uncategorized">
      + Create channel in uncategorized
    </button>`;
  }

  html += '</div></section>';
  return html;
}

function renderSettingsContent() {
  const contentEl = document.getElementById('settings-content');
  if (!contentEl) return;
  contentEl.innerHTML = `<div class="settings-view__content-inner">
    ${renderSettingsGeneral()}
    ${renderSettingsDisplay()}
    ${renderSettingsTimeboxing()}
    ${renderSettingsSchedule()}
    ${renderSettingsChannels()}
    ${renderSettingsShortcuts()}
    ${renderSettingsProfile()}
    ${renderSettingsAccountMgmt()}
  </div>`;
}

// ── Scroll Spy ──

function initSettingsScrollSpy() {
  cleanupSettingsScrollSpy();
  const contentEl = document.getElementById('settings-content');
  if (!contentEl) return;

  const sections = contentEl.querySelectorAll('.settings-view__section');
  if (!sections.length) return;

  settingsScrollSpyObserver = new IntersectionObserver(entries => {
    if (settingsScrollSpySuppressed) return;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const sectionId = entry.target.id.replace('settings-section-', '');
        setSettingsActiveNav(sectionId);
      }
    }
  }, {
    root: contentEl,
    threshold: 0,
    rootMargin: '-10% 0px -80% 0px'
  });

  sections.forEach(s => settingsScrollSpyObserver.observe(s));
}

function cleanupSettingsScrollSpy() {
  if (settingsScrollSpyObserver) {
    settingsScrollSpyObserver.disconnect();
    settingsScrollSpyObserver = null;
  }
}

function setSettingsActiveNav(sectionId) {
  const navItems = document.querySelectorAll('[data-settings-nav]');
  navItems.forEach(item => {
    item.classList.toggle('settings-view__nav-item--active', item.dataset.settingsNav === sectionId);
  });
}

// ── Dropdown handling ──

function openSettingsDropdown(key, triggerEl) {
  closeSettingsDropdown();
  const anchor = triggerEl.closest('.settings-view__dropdown-anchor') || triggerEl.parentElement;
  const options = getSettingsDropdownOptions(key);
  const currentValue = getSettingsValue(key);

  let html = '<div class="settings-view__dropdown' + (key === 'timezone' ? ' settings-view__dropdown--wide' : '') + '" data-settings-dropdown>';
  html += '<div class="settings-view__dropdown-arrow"></div>';
  html += '<div class="settings-view__dropdown-items">';
  for (const opt of options) {
    const selected = String(opt.value) === String(currentValue);
    html += `<button class="settings-view__dropdown-item" type="button" data-settings-dropdown-item data-key="${escapeHtml(key)}" data-value="${escapeHtml(String(opt.value))}">
      <span>${escapeHtml(opt.label)}</span>
      <span class="settings-view__dropdown-check">${selected ? '✓' : ''}</span>
    </button>`;
  }
  html += '</div></div>';

  anchor.insertAdjacentHTML('beforeend', html);
  settingsDropdownOpen = { key, el: anchor.querySelector('[data-settings-dropdown]') };

  // Scroll to selected item
  const selectedItem = settingsDropdownOpen.el.querySelector('.settings-view__dropdown-items .settings-view__dropdown-item:has(.settings-view__dropdown-check:not(:empty))');
  if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
}

function closeSettingsDropdown() {
  if (settingsDropdownOpen) {
    settingsDropdownOpen.el.remove();
    settingsDropdownOpen = null;
  }
  // Also remove any stray dropdowns
  document.querySelectorAll('.settings-view__dropdown').forEach(d => d.remove());
}

function getSettingsValue(key) {
  if (key.startsWith('schedule-')) {
    const parts = key.split('-');
    const dayIdx = parseInt(parts[1]);
    const field = parts[2]; // 'start' or 'end'
    return settings.schedule[dayIdx][field === 'start' ? 'startMinutes' : 'endMinutes'];
  }
  return settings[key];
}

function setSettingsValue(key, value) {
  if (key === 'autoArchiveEnabled') {
    setAutoArchiveEnabled(value === true || value === 'true', { rerender: false });
    return;
  }
  if (key === 'autoArchiveDays') {
    setAutoArchiveDays(value);
    return;
  }
  if (key.startsWith('schedule-')) {
    const parts = key.split('-');
    const dayIdx = parseInt(parts[1]);
    const field = parts[2];
    settings.schedule[dayIdx][field === 'start' ? 'startMinutes' : 'endMinutes'] = parseInt(value);
    persistSettings();
    return;
  }
  if (key.startsWith('channel-')) {
    const chId = key.replace('channel-', '');
    settings.channelEnabled[chId] = value;
    persistSettings();
    return;
  }

  // Type conversion
  if (key === 'workloadThresholdHours' || key === 'defaultTimeboxDurationMinutes' || key === 'autoArchiveDays') {
    settings[key] = parseInt(value);
  } else if (typeof settings[key] === 'boolean') {
    settings[key] = value === true || value === 'true';
  } else {
    settings[key] = value;
  }
  persistSettings();
}

function getSettingsDropdownOptions(key) {
  switch (key) {
    case 'timezone':
      return getAllTimezones().map(tz => ({ value: tz, label: formatTimezoneLabel(tz) }));
    case 'timeFormat':
      return [
        { value: 'device', label: 'Use device region' },
        { value: '12', label: '12 hour' },
        { value: '24', label: '24 hour' },
      ];
    case 'startOfWeek':
      return [
        { value: 'monday', label: 'Monday' },
        { value: 'sunday', label: 'Sunday' },
      ];
    case 'taskRolloverPosition':
      return [
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
      ];
    case 'workloadThresholdHours':
      return [6,7,8,9,10].map(h => ({ value: h, label: `${h} hours` }));
    case 'darkMode':
      return [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ];
    case 'defaultTimeboxDurationMinutes':
      return [15,30,45,60].map(m => ({ value: m, label: `${m} min` }));
    case 'autoArchiveDays':
      return Array.from({ length: 14 }, (_, i) => ({
        value: i + 1,
        label: `${i + 1} day${i + 1 > 1 ? 's' : ''}`
      }));
    default:
      if (key.startsWith('schedule-')) {
        return generateTimeOptions();
      }
      return [];
  }
}

function getSettingsDisplayLabel(key, value) {
  const options = getSettingsDropdownOptions(key);
  const opt = options.find(o => String(o.value) === String(value));
  return opt ? opt.label : String(value);
}

// ── Channel Modal ──

function openChannelModal(mode, data) {
  settingsChannelModalState = { mode, data: data || {} };
  renderChannelModal();
}

function closeChannelModal() {
  settingsChannelModalState = null;
  const overlay = document.getElementById('settings-channel-overlay');
  if (overlay) overlay.remove();
}

function renderChannelModal() {
  if (!settingsChannelModalState) return;
  const { mode, data } = settingsChannelModalState;

  // Remove existing
  const existing = document.getElementById('settings-channel-overlay');
  if (existing) existing.remove();

  const isEdit = mode.startsWith('edit-');
  const isContext = mode.includes('context');
  const title = isEdit ? (isContext ? 'Edit context' : 'Edit channel') : (isContext ? 'Create context' : 'Create channel');

  const name = data.label || '';
  const color = data.hashColor || '#4a90d9';
  const context = data.context || '';

  // Get available contexts for channel creation
  const contextOptions = CHANNELS.filter(ch => ch.isContext).map(ch => ch.label);

  let fieldsHTML = '';

  // Name
  fieldsHTML += `<div class="settings-channel-modal__field">
    <div class="settings-channel-modal__field-label">Name</div>
    <input class="settings-channel-modal__input" type="text" placeholder="Name..." value="${escapeHtml(name)}" data-channel-name>
  </div>`;

  // Context selector (only for channels, not contexts)
  if (!isContext) {
    fieldsHTML += `<div class="settings-channel-modal__field">
      <div class="settings-channel-modal__field-row">
        <div>
          <div class="settings-channel-modal__field-label">Context</div>
          <div class="settings-channel-modal__field-desc">Select a context for this channel.</div>
        </div>
        <div class="settings-view__dropdown-anchor">
          <button class="settings-view__select" type="button" data-channel-context-select>
            <span>${context ? escapeHtml(context) : 'Select'}</span>
            <i data-lucide="chevron-down" class="settings-view__select-icon"></i>
          </button>
        </div>
      </div>
    </div>`;
  }

  // Personal context toggle (only for contexts)
  if (isContext) {
    const isPersonal = data.isPersonal || false;
    fieldsHTML += `<div class="settings-channel-modal__field">
      <div class="settings-channel-modal__field-row">
        <div>
          <div class="settings-channel-modal__field-label">Personal context</div>
          <div class="settings-channel-modal__field-desc">Categorize tasks in this context as personal.</div>
        </div>
        ${settingsToggleHTML('channel-personal', isPersonal)}
      </div>
    </div>`;
  }

  // Default channel toggle
  const isDefaultChannel = isEdit && data.id === settings.defaultChannelId;
  fieldsHTML += `<div class="settings-channel-modal__field">
    <div class="settings-channel-modal__field-row">
      <div>
        <div class="settings-channel-modal__field-label">Default channel</div>
        <div class="settings-channel-modal__field-desc">Assign new tasks to this ${isContext ? 'context' : 'channel'} by default.</div>
      </div>
      ${settingsToggleHTML('channel-default', isDefaultChannel)}
    </div>
  </div>`;

  // Color picker
  let colorSwatches = '';
  for (const c of SETTINGS_COLOR_PALETTE) {
    const selected = c === color ? ' settings-channel-modal__color-swatch--selected' : '';
    colorSwatches += `<button class="settings-channel-modal__color-swatch${selected}" type="button" data-channel-color="${c}" style="background:${c}"><i data-lucide="check"></i></button>`;
  }
  fieldsHTML += `<div class="settings-channel-modal__field">
    <div class="settings-channel-modal__field-label">Color</div>
    <div class="settings-channel-modal__color-grid">${colorSwatches}</div>
  </div>`;

  // Action buttons
  const deleteBtn = isEdit ? `<button class="settings-channel-modal__btn settings-channel-modal__btn--danger" type="button" data-channel-delete>Delete</button>` : '';
  const saveLabel = isEdit ? 'Save' : 'Create';
  const discardLabel = 'Discard';

  const overlay = document.createElement('div');
  overlay.id = 'settings-channel-overlay';
  overlay.className = 'settings-channel-overlay';
  overlay.innerHTML = `<div class="settings-channel-modal">
    <div class="settings-channel-modal__header">
      <h2 class="settings-channel-modal__title">${escapeHtml(title)}</h2>
      <div class="settings-channel-modal__header-actions">
        ${deleteBtn}
        <button class="settings-channel-modal__btn" type="button" data-channel-modal-close>${escapeHtml(discardLabel)}</button>
        <button class="settings-channel-modal__btn settings-channel-modal__btn--primary" type="button" data-channel-save>${escapeHtml(saveLabel)}</button>
      </div>
    </div>
    <div class="settings-channel-modal__body">${fieldsHTML}</div>
  </div>`;

  document.getElementById('settings-view').appendChild(overlay);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Attach channel modal events
  overlay.addEventListener('click', e => {
    // Close
    if (e.target.closest('[data-channel-modal-close]')) {
      closeChannelModal();
      return;
    }
    // Click outside modal
    if (e.target === overlay) {
      closeChannelModal();
      return;
    }
    // Save
    if (e.target.closest('[data-channel-save]')) {
      handleChannelSave();
      return;
    }
    // Delete (two-click confirm)
    const deleteBtn = e.target.closest('[data-channel-delete]');
    if (deleteBtn) {
      if (deleteBtn.classList.contains('settings-channel-modal__btn--danger-confirm')) {
        handleChannelDelete();
      } else {
        const isContext = settingsChannelModalState && settingsChannelModalState.mode.includes('context');
        deleteBtn.classList.add('settings-channel-modal__btn--danger-confirm');
        deleteBtn.textContent = isContext ? 'Delete context' : 'Delete channel';
      }
      return;
    }
    // Color swatch
    const swatch = e.target.closest('[data-channel-color]');
    if (swatch) {
      overlay.querySelectorAll('.settings-channel-modal__color-swatch').forEach(s => s.classList.remove('settings-channel-modal__color-swatch--selected'));
      swatch.classList.add('settings-channel-modal__color-swatch--selected');
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }
    // Close context dropdown if clicking outside it
    const openDD = overlay.querySelector('.settings-view__dropdown');
    if (openDD && !e.target.closest('[data-channel-context-select]') && !e.target.closest('[data-context-option]')) {
      openDD.remove();
    }

    // Context selector
    if (e.target.closest('[data-channel-context-select]')) {
      const btn = e.target.closest('[data-channel-context-select]');
      const anchor = btn.closest('.settings-view__dropdown-anchor');
      // Toggle dropdown
      const existing = anchor.querySelector('.settings-view__dropdown');
      if (existing) { existing.remove(); return; }
      let ddHTML = '<div class="settings-view__dropdown" data-settings-dropdown>';
      ddHTML += '<div class="settings-view__dropdown-arrow"></div>';
      ddHTML += '<div class="settings-view__dropdown-items">';
      for (const ctx of contextOptions) {
        ddHTML += `<button class="settings-view__dropdown-item" type="button" data-context-option="${escapeHtml(ctx)}"><span>${escapeHtml(ctx)}</span></button>`;
      }
      ddHTML += '</div></div>';
      anchor.insertAdjacentHTML('beforeend', ddHTML);
      return;
    }
    // Context option click
    const ctxOpt = e.target.closest('[data-context-option]');
    if (ctxOpt) {
      const ctx = ctxOpt.dataset.contextOption;
      const btn = overlay.querySelector('[data-channel-context-select]');
      if (btn) {
        const span = btn.querySelector('span');
        if (span) span.textContent = ctx;
      }
      ctxOpt.closest('.settings-view__dropdown').remove();
      return;
    }
    // Toggle in modal (stop propagation to prevent settings-level handler double-toggling)
    const toggle = e.target.closest('.settings-toggle');
    if (toggle) {
      e.stopPropagation();
      toggle.classList.toggle('settings-toggle--on');
      return;
    }
  });

  function handleModalKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      const currentOverlay = document.getElementById('settings-channel-overlay');
      if (!currentOverlay) { document.removeEventListener('keydown', handleModalKeydown, true); return; }
      const openDD = currentOverlay.querySelector('.settings-view__dropdown');
      if (openDD) {
        openDD.remove();
        return;
      }
      closeChannelModal();
      document.removeEventListener('keydown', handleModalKeydown, true);
    }
  }
  document.addEventListener('keydown', handleModalKeydown, true);
}

function handleChannelSave() {
  if (!settingsChannelModalState) return;
  const { mode, data } = settingsChannelModalState;
  const overlay = document.getElementById('settings-channel-overlay');
  if (!overlay) return;

  const nameInput = overlay.querySelector('[data-channel-name]');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) return;

  const selectedColor = overlay.querySelector('.settings-channel-modal__color-swatch--selected');
  const color = selectedColor ? selectedColor.dataset.channelColor : '#4a90d9';

  const isContext = mode.includes('context');
  const isEdit = mode.startsWith('edit-');

  // Get context for channels
  let context = null;
  if (!isContext) {
    const ctxBtn = overlay.querySelector('[data-channel-context-select]');
    const ctxSpan = ctxBtn ? ctxBtn.querySelector('span') : null;
    context = ctxSpan ? ctxSpan.textContent.trim() : null;
    if (context === 'Select') context = null;
  }

  // Get default toggle state
  const defaultToggle = overlay.querySelectorAll('.settings-toggle');
  let isDefault = false;
  let isPersonal = false;
  if (isContext) {
    // First toggle is personal, second is default
    if (defaultToggle[0]) isPersonal = defaultToggle[0].classList.contains('settings-toggle--on');
    if (defaultToggle[1]) isDefault = defaultToggle[1].classList.contains('settings-toggle--on');
  } else {
    // Only default toggle
    if (defaultToggle[0]) isDefault = defaultToggle[0].classList.contains('settings-toggle--on');
  }

  // Determine eventClass from color
  const eventClassMap = {
    '#ff79a7': 'cal-event--orange', '#d45d8c': 'cal-event--purple', '#e979fc': 'cal-event--purple',
    '#ff62be': 'cal-event--purple', '#856cc2': 'cal-event--purple', '#a382ff': 'cal-event--purple',
    '#7cadff': 'cal-event--blue', '#5e9fe0': 'cal-event--blue', '#90a4ae': 'cal-event--blue',
    '#4fc3f7': 'cal-event--blue', '#4dd0e1': 'cal-event--blue', '#4db6c1': 'cal-event--blue',
    '#4db6ac': 'cal-event--green', '#4da197': 'cal-event--green', '#74b077': 'cal-event--green',
    '#82c785': 'cal-event--green', '#95bc74': 'cal-event--green', '#aed580': 'cal-event--green',
    '#ffd451': 'cal-event--orange', '#ffbd4d': 'cal-event--orange', '#ffb74d': 'cal-event--orange',
    '#f8a34d': 'cal-event--orange', '#ff8964': 'cal-event--orange', '#ee805e': 'cal-event--orange',
    '#ff8686': 'cal-event--orange', '#e06d6d': 'cal-event--orange', '#a1887f': 'cal-event--blue',
    '#8e7973': 'cal-event--blue',
  };
  const eventClass = eventClassMap[color] || 'cal-event--blue';

  let channelId;
  if (isEdit) {
    // Update existing channel
    channelId = data.id;
    const ch = CHANNELS.find(c => c.id === data.id);
    if (ch) {
      ch.label = name;
      ch.hashColor = color;
      ch.eventClass = eventClass;
      if (!isContext) ch.context = context;
      if (isContext) ch.isPersonal = isPersonal;
    }
  } else {
    // Create new channel/context
    channelId = 'ch-' + uid();
    const newChannel = {
      id: channelId,
      label: name,
      context: isContext ? null : context,
      hashColor: color,
      eventClass: eventClass,
    };
    if (isContext) {
      newChannel.isContext = true;
      newChannel.isPersonal = isPersonal;
    }
    CHANNELS.push(newChannel);
    settings.channelEnabled[channelId] = true;
  }

  // Handle default channel (only one allowed)
  if (isDefault) {
    settings.defaultChannelId = channelId;
  } else if (settings.defaultChannelId === channelId) {
    settings.defaultChannelId = null;
  }

  rebuildChannelColors();
  persistSettings();
  closeChannelModal();

  // Re-render channels section
  const channelsSection = document.getElementById('settings-section-channels');
  if (channelsSection) {
    channelsSection.outerHTML = renderSettingsChannels();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function handleChannelDelete() {
  if (!settingsChannelModalState) return;
  const { data } = settingsChannelModalState;
  if (!data.id) return;

  const isContext = CHANNELS.find(ch => ch.id === data.id && ch.isContext);

  // Remove the channel
  const idx = CHANNELS.findIndex(ch => ch.id === data.id);
  if (idx !== -1) CHANNELS.splice(idx, 1);

  // If it's a context, also remove children or unlink them
  if (isContext) {
    CHANNELS.forEach(ch => {
      if (ch.context === data.label) {
        ch.context = null;
      }
    });
  }

  delete settings.channelEnabled[data.id];
  rebuildChannelColors();
  persistSettings();
  closeChannelModal();

  // Re-render
  const channelsSection = document.getElementById('settings-section-channels');
  if (channelsSection) {
    channelsSection.outerHTML = renderSettingsChannels();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ── Event Delegation ──

function attachSettingsEvents() {
  const settingsView = document.getElementById('settings-view');
  if (!settingsView) return;

  settingsView.addEventListener('click', e => {
    // Back button
    if (e.target.closest('[data-settings-back]')) {
      e.preventDefault();
      closeSettingsView();
      return;
    }

    // Nav items
    const navItem = e.target.closest('[data-settings-nav]');
    if (navItem) {
      e.preventDefault();
      const sectionId = navItem.dataset.settingsNav;
      // Suppress scroll spy during smooth scroll to prevent flickering
      settingsScrollSpySuppressed = true;
      clearTimeout(settingsScrollSpyTimer);
      settingsScrollSpyTimer = setTimeout(() => { settingsScrollSpySuppressed = false; }, 800);
      if (sectionId === 'general') {
        const contentEl = document.getElementById('settings-content');
        if (contentEl) contentEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const section = document.getElementById('settings-section-' + sectionId);
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      setSettingsActiveNav(sectionId);
      return;
    }

    // Dropdown trigger
    const selectBtn = e.target.closest('[data-settings-select]');
    if (selectBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = selectBtn.dataset.settingsSelect;
      if (settingsDropdownOpen && settingsDropdownOpen.key === key) {
        closeSettingsDropdown();
      } else {
        openSettingsDropdown(key, selectBtn);
      }
      return;
    }

    // Dropdown item selection
    const dropdownItem = e.target.closest('[data-settings-dropdown-item]');
    if (dropdownItem) {
      e.preventDefault();
      const key = dropdownItem.dataset.key;
      const value = dropdownItem.dataset.value;
      setSettingsValue(key, value);
      closeSettingsDropdown();

      // Update the trigger label
      const label = getSettingsDisplayLabel(key, value);
      let triggerSelector = `[data-settings-select="${key}"]`;
      const trigger = settingsView.querySelector(triggerSelector);
      if (trigger) {
        const span = trigger.querySelector('span');
        if (span) span.textContent = label;
      }

      // For schedule or timeFormat changes, re-render the schedule section
      if (key.startsWith('schedule-') || key === 'timeFormat') {
        const scheduleSection = document.getElementById('settings-section-schedule');
        if (scheduleSection) {
          scheduleSection.outerHTML = renderSettingsSchedule();
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
      return;
    }

    // Schedule workday toggle
    const workdayToggle = e.target.closest('[data-settings-schedule-workday]');
    if (workdayToggle) {
      e.preventDefault();
      const dayIdx = parseInt(workdayToggle.dataset.settingsScheduleWorkday);
      settings.schedule[dayIdx].workday = !settings.schedule[dayIdx].workday;
      persistSettings();
      const scheduleSection = document.getElementById('settings-section-schedule');
      if (scheduleSection) {
        scheduleSection.outerHTML = renderSettingsSchedule();
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
      return;
    }

    // Toggle switches
    const toggle = e.target.closest('[data-settings-toggle]');
    if (toggle) {
      e.preventDefault();
      const key = toggle.dataset.settingsToggle;
      const isOn = toggle.classList.contains('settings-toggle--on');
      toggle.classList.toggle('settings-toggle--on');

      if (key.startsWith('channel-')) {
        const chId = key.replace('channel-', '');
        settings.channelEnabled[chId] = !isOn;
      } else if (key === 'autoArchiveEnabled') {
        setAutoArchiveEnabled(!isOn, { rerender: false });
        return;
      } else {
        settings[key] = !isOn;
      }
      persistSettings();

      if (key === 'visualizeActualTimeOnCalendar') {
        if (!isOn) backfillTodayActualTimeEventsFromLogs();
        renderCalendarEvents();
        return;
      }

      if (key === 'hideCompletedTasksInCalendar') {
        renderCalendarEvents();
        return;
      }

      if (key === 'autoArchiveEnabled') {
        const generalSection = document.getElementById('settings-section-general');
        if (generalSection) {
          generalSection.outerHTML = renderSettingsGeneral();
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
      return;
    }

    // Profile upload
    if (e.target.closest('[data-settings-upload]')) {
      const fileInput = document.getElementById('settings-avatar-file');
      if (fileInput) fileInput.click();
      return;
    }

    // Create context
    if (e.target.closest('[data-create-context]')) {
      openChannelModal('create-context', {});
      return;
    }

    // Create channel
    if (e.target.closest('[data-create-channel]')) {
      openChannelModal('create-channel', {});
      return;
    }

    // Create channel in specific context
    const createInCtx = e.target.closest('[data-create-channel-in]');
    if (createInCtx) {
      const ctx = createInCtx.dataset.createChannelIn;
      openChannelModal('create-channel', { context: ctx === 'uncategorized' ? null : ctx });
      return;
    }

    // Edit channel
    const editBtn = e.target.closest('[data-channel-edit]');
    if (editBtn) {
      // Don't trigger if we clicked a toggle inside this row
      if (e.target.closest('.settings-toggle')) return;
      const chId = editBtn.dataset.channelEdit;
      const ch = CHANNELS.find(c => c.id === chId);
      if (ch) {
        const mode = ch.isContext ? 'edit-context' : 'edit-channel';
        openChannelModal(mode, { ...ch });
      }
      return;
    }

    // Close dropdown on click elsewhere
    if (settingsDropdownOpen && !e.target.closest('[data-settings-dropdown]')) {
      closeSettingsDropdown();
    }
  });

  // Text inputs
  settingsView.addEventListener('input', e => {
    const input = e.target.closest('[data-settings-input]');
    if (input) {
      const key = input.dataset.settingsInput;
      settings[key] = input.value;
      persistSettings();

      // Update avatar initials
      const avatar = document.getElementById('settings-avatar');
      if (avatar && !settings.profilePictureDataUrl) {
        const initials = ((settings.firstName || '').charAt(0) + (settings.lastName || '').charAt(0)).toUpperCase();
        avatar.textContent = initials;
      }
    }
  });

  // File upload (use event delegation since input is JS-rendered)
  settingsView.addEventListener('change', e => {
    if (e.target.id !== 'settings-avatar-file') return;
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      showToast('Image must be under 500 KB', 'dark');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      settings.profilePictureDataUrl = reader.result;
      persistSettings();
      const avatar = document.getElementById('settings-avatar');
      if (avatar) {
        avatar.innerHTML = `<img src="${reader.result}" alt="Profile">`;
      }
    };
    reader.readAsDataURL(file);
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const settingsEl = document.getElementById('settings-view');
    if (!settingsEl || settingsEl.hidden) return;

    // Close channel modal first
    if (settingsChannelModalState) {
      e.preventDefault();
      closeChannelModal();
      return;
    }

    // Close dropdown first
    if (settingsDropdownOpen) {
      e.preventDefault();
      closeSettingsDropdown();
      return;
    }

    // Close settings view
    e.preventDefault();
    closeSettingsView();
  });
}

/* ═══════════════════════════════════════════════
   TASK PERSISTENCE
═══════════════════════════════════════════════ */
const _taskWriteTimers = {};
const _loadedDateRanges = new Set();
const _loadingDateRanges = new Set();
const _loadedCalendarDates = new Set();
const _loadingCalendarDates = new Set();

function ensureDateDataLoaded(isoDate) {
  if (!_currentUserId || !isoDate) return;

  if (!_loadedDateRanges.has(isoDate) && !_loadingDateRanges.has(isoDate)) {
    _loadingDateRanges.add(isoDate);
    DB.loadTasksForDateRange(_currentUserId, isoDate, isoDate).then(docs => {
      populateColumnsFromTasks(docs);
      _loadedDateRanges.add(isoDate);
      initializeTaskTimeState();
      renderAllColumns();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }).catch(err => console.error('Failed to lazy-load tasks:', err))
      .finally(() => _loadingDateRanges.delete(isoDate));
  }

  if (!_loadedCalendarDates.has(isoDate) && !_loadingCalendarDates.has(isoDate)) {
    _loadingCalendarDates.add(isoDate);
    DB.loadCalendarEventsForRange(_currentUserId, isoDate, isoDate).then(events => {
      state.calendarEvents = state.calendarEvents.filter(evt => evt.date !== isoDate).concat(events);
      _loadedCalendarDates.add(isoDate);
      renderCalendarEvents._overrideDate = isoDate;
      renderCalendarEvents();
    }).catch(err => console.error('Failed to lazy-load calendar events:', err))
      .finally(() => _loadingCalendarDates.delete(isoDate));
  }
}

function getTaskContext(task) {
  // Find which column this task is in
  for (const col of state.columns) {
    const idx = col.tasks.indexOf(task);
    if (idx !== -1) return { columnDate: col.isoDate, orderIndex: idx };
  }
  // Check backlog
  const bIdx = state.backlog.indexOf(task);
  if (bIdx !== -1) return { columnDate: '__backlog__', orderIndex: bIdx };
  const aIdx = state.archive.indexOf(task);
  if (aIdx !== -1) return { columnDate: '__archive__', orderIndex: aIdx };
  return null;
}

function taskToDoc(task, columnDate, orderIndex) {
  const doc = {
    id: task.id,
    title: task.title || '',
    columnDate: columnDate,
    orderIndex: orderIndex,
    timeEstimateMinutes: task.timeEstimateMinutes || 0,
    actualTimeSeconds: task.actualTimeSeconds || 0,
    ownPlannedMinutes: task.ownPlannedMinutes || 0,
    ownActualTimeSeconds: task.ownActualTimeSeconds || 0,
    scheduledTime: task.scheduledTime || null,
    complete: !!task.complete,
    completedOnDate: task.completedOnDate || null,
    completedAt: task.completedAt || null,
    tag: task.tag || null,
    integrationColor: task.integrationColor || null,
    subtasks: (task.subtasks || []).map(s => ({
      id: s.id,
      label: s.label || '',
      done: !!s.done,
      plannedMinutes: s.plannedMinutes || 0,
      actualTimeSeconds: s.actualTimeSeconds || 0
    })),
    showSubtasks: !!task.showSubtasks,
    startDate: task.startDate || null,
    dueDate: task.dueDate || null,
    notes: task.notes || '',
    dailyActualTime: task.dailyActualTime || {},
    subtaskCompletionsByDate: task.subtaskCompletionsByDate || {},
    systemType: task.systemType || null,
    backlogHorizon: task.backlogHorizon || null,
    backlogOrder: task.backlogOrder || 0,
    archivedAt: task.archivedAt || null,
    archiveSourceDate: task.archiveSourceDate || null,
    repeatSeriesId: task.repeatSeriesId || null,
    repeatOccurrenceDate: task.repeatOccurrenceDate || null,
    repeatModified: !!task.repeatModified,
    isRepeatingTask: !!task.isRepeatingTask
  };
  return doc;
}

function docToTask(doc) {
  return {
    id: doc.id,
    title: doc.title || '',
    timeEstimateMinutes: doc.timeEstimateMinutes || 0,
    actualTimeSeconds: doc.actualTimeSeconds || 0,
    ownPlannedMinutes: doc.ownPlannedMinutes || 0,
    ownActualTimeSeconds: doc.ownActualTimeSeconds || 0,
    scheduledTime: doc.scheduledTime || null,
    complete: !!doc.complete,
    completedOnDate: doc.completedOnDate || null,
    completedAt: doc.completedAt || null,
    tag: doc.tag || null,
    integrationColor: doc.integrationColor || null,
    subtasks: (doc.subtasks || []).map(s => ({
      id: s.id,
      label: s.label || '',
      done: !!s.done,
      plannedMinutes: s.plannedMinutes || 0,
      actualTimeSeconds: s.actualTimeSeconds || 0
    })),
    showSubtasks: !!doc.showSubtasks,
    startDate: doc.startDate || null,
    dueDate: doc.dueDate || null,
    notes: doc.notes || '',
    dailyActualTime: doc.dailyActualTime || {},
    subtaskCompletionsByDate: doc.subtaskCompletionsByDate || {},
    systemType: doc.systemType || null,
    backlogHorizon: doc.backlogHorizon || null,
    backlogOrder: doc.backlogOrder || 0,
    archivedAt: doc.archivedAt || null,
    archiveSourceDate: doc.archiveSourceDate || null,
    repeatSeriesId: doc.repeatSeriesId || null,
    repeatOccurrenceDate: doc.repeatOccurrenceDate || null,
    repeatModified: !!doc.repeatModified,
    isRepeatingTask: !!doc.isRepeatingTask
  };
}

function persistTask(task, debounceMs) {
  if (!_currentUserId) return;
  if (debounceMs === undefined) debounceMs = 500;
  const taskId = task.id;

  if (debounceMs <= 0) {
    clearTimeout(_taskWriteTimers[taskId]);
    delete _taskWriteTimers[taskId];
    if (isDerivedRepeatTask(task)) materializeDerivedTask(task);
    const ctx = getTaskContext(task);
    if (!ctx) return;
    DB.saveTask(_currentUserId, taskToDoc(task, ctx.columnDate, ctx.orderIndex)).catch(err =>
      console.error('Failed to save task:', err)
    );
    return;
  }

  clearTimeout(_taskWriteTimers[taskId]);
  _taskWriteTimers[taskId] = setTimeout(() => {
    delete _taskWriteTimers[taskId];
    if (isDerivedRepeatTask(task)) materializeDerivedTask(task);
    const ctx = getTaskContext(task);
    if (!ctx) return;
    DB.saveTask(_currentUserId, taskToDoc(task, ctx.columnDate, ctx.orderIndex)).catch(err =>
      console.error('Failed to save task:', err)
    );
  }, debounceMs);
}

function persistColumnTaskOrder(column) {
  if (!column || !Array.isArray(column.tasks)) return;
  column.tasks.forEach(task => persistTask(task, 0));
}

function persistDeleteTask(taskId) {
  if (!_currentUserId) return;
  DB.deleteTask(_currentUserId, taskId).catch(err =>
    console.error('Failed to delete task:', err)
  );
}

function persistTrashEntry(entry) {
  if (!_currentUserId) return;
  DB.addToTrash(_currentUserId, {
    id: entry.id || entry.taskId || entry.task.id,
    task: entry.task,
    deletedFrom: entry.deletedFrom || {},
    repeatSkipFingerprint: entry.repeatSkipFingerprint || null
  }).catch(err => console.error('Failed to add to trash:', err));
}

function persistRemoveFromTrash(entryId) {
  if (!_currentUserId) return;
  DB.removeFromTrash(_currentUserId, entryId).catch(err =>
    console.error('Failed to remove from trash:', err)
  );
}

function persistRituals() {
  if (!_currentUserId) return;
  DB.saveRituals(_currentUserId, {
    dailyPlanningHistory: dailyPlanningState.runHistoryByDate || {},
    dailyShutdownHistory: {},
    deferPolicy: dailyPlanningState.deferPolicy || {},
    capacityConfig: dailyPlanningState.capacityConfig || {}
  }).catch(err => console.error('Failed to save rituals:', err));
}

function persistCalendarEvent(event) {
  if (!_currentUserId) return;
  DB.saveCalendarEvent(_currentUserId, event).catch(err =>
    console.error('Failed to save calendar event:', err)
  );
}

function persistDeleteCalendarEvent(eventId) {
  if (!_currentUserId) return;
  DB.deleteCalendarEvent(_currentUserId, eventId).catch(err =>
    console.error('Failed to delete calendar event:', err)
  );
}

function populateColumnsFromTasks(tasks) {
  const byDate = {};
  for (const doc of tasks) {
    const date = doc.columnDate;
    if (!date || date === '__backlog__') continue;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(doc);
  }
  for (const date in byDate) {
    byDate[date].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }
  for (const col of state.columns) {
    const docs = byDate[col.isoDate];
    if (docs) {
      col.tasks = docs.map(docToTask);
    }
  }
  reconcileVisibleRepeatTasks();
}

/* ═══════════════════════════════════════════════
   AUTH-GATED INITIALIZATION
═══════════════════════════════════════════════ */
let appInitialized = false;

function initializeApp() {
  initializeDayWindow();
  initializeTaskTimeState();
  performRollover();
  renderAllColumns();
  initializeTodayFirstColumnPosition();
  renderCalendarEvents();
  renderWorkdayMarkers();
  scheduleCurrentTimeLineUpdates();

  if (!appInitialized) {
    attachCalendarZoomEvents();
    attachEvents();
    attachBoardTopbarEvents();
    attachSidebarToggleEvents();
    attachSidebarEvents();
    attachRightSidebarEvents();
    attachWorkspaceMenuEvents();
    attachDailyPlanningEvents();
    attachDailyPlanningEscapeEvents();
    attachDailyShutdownEvents();
    attachDailyShutdownEscapeEvents();
    attachTodayViewEscapeEvents();
    attachTaskModalEvents();
    attachCalendarEvents();
    attachCalendarResizeEvents();
    attachWorkdayMarkerEvents();
    attachBacklogEvents();
    attachArchiveEvents();
    attachSearchPanelEvents();
    attachTrashEvents();
    attachSettingsEvents();
    attachShortcutEvents();
    appInitialized = true;
  }

  setSidebarCollapsed(false);
  setSidebarActiveNav('home');
  requestAnimationFrame(scrollTimelineToWorkdayStart);

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/* ─── Persistence helpers ─── */
let _currentUserId = null;
let _settingsWriteTimer = null;

function persistSettings() {
  if (!_currentUserId) return;
  clearTimeout(_settingsWriteTimer);
  _settingsWriteTimer = setTimeout(() => {
    DB.saveSettings(_currentUserId, settings).catch(err =>
      console.error('Failed to save settings:', err)
    );
  }, 1000);
}

async function onAuthReady(userId) {
  _currentUserId = userId;
  await DB.ensureUserDoc(userId);

  // Load settings before initializing the app
  const savedSettings = await DB.loadSettings(userId);
  if (savedSettings) {
    // Restore channels if saved
    if (savedSettings.channels && savedSettings.channels.length > 0) {
      CHANNELS.length = 0;
      savedSettings.channels.forEach(ch => CHANNELS.push(ch));
      rebuildChannelColors();
    }
    delete savedSettings.channels;

    // Merge saved settings into defaults
    Object.assign(settings, savedSettings);

    // Re-init channel enabled state for any new channels
    CHANNELS.forEach(ch => {
      if (settings.channelEnabled[ch.id] === undefined) settings.channelEnabled[ch.id] = true;
    });
  }

  normalizeSearchSettings();

  // Initialize day window first so columns exist
  initializeApp();

  // Load tasks for the visible date range
  const { startISO, endISO } = state.dayWindow;
  if (startISO && endISO) {
    try {
      const taskDocs = await DB.loadTasksForDateRange(userId, startISO, endISO);
      populateColumnsFromTasks(taskDocs);
      // Track loaded dates
      for (const col of state.columns) {
        _loadedDateRanges.add(col.isoDate);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }

  // Load backlog
  try {
    const backlogDocs = await DB.loadBacklog(userId);
    state.backlog = backlogDocs.map(docToTask);
  } catch (err) {
    console.error('Failed to load backlog:', err);
  }

  // Load archive
  try {
    const archiveDocs = await DB.loadArchive(userId);
    state.archive = archiveDocs.map(docToTask);
  } catch (err) {
    console.error('Failed to load archive:', err);
  }

  try {
    const repeatSeriesDocs = await DB.loadRepeatSeries(userId);
    state.repeatSeries = repeatSeriesDocs.map(normalizeRepeatSeries);
  } catch (err) {
    console.error('Failed to load repeat series:', err);
  }

  // Load calendar events for today
  try {
    const todayISO = getTodayISO();
    const events = await DB.loadCalendarEventsForRange(userId, startISO, endISO);
    state.calendarEvents = events;
    for (const col of state.columns) {
      _loadedCalendarDates.add(col.isoDate);
    }
  } catch (err) {
    console.error('Failed to load calendar events:', err);
  }

  // Load trash
  try {
    const trashDocs = await DB.loadTrash(userId);
    state.trash = trashDocs;
  } catch (err) {
    console.error('Failed to load trash:', err);
  }

  // Load rituals
  try {
    const rituals = await DB.loadRituals(userId);
    if (rituals) {
      if (rituals.dailyPlanningHistory) dailyPlanningState.runHistoryByDate = rituals.dailyPlanningHistory;
      if (rituals.deferPolicy) dailyPlanningState.deferPolicy = rituals.deferPolicy;
      if (rituals.capacityConfig) dailyPlanningState.capacityConfig = rituals.capacityConfig;
    }
  } catch (err) {
    console.error('Failed to load rituals:', err);
  }

  // Re-render with loaded data
  initializeTaskTimeState();
  reconcileVisibleRepeatTasks();
  performRollover();
  renderAllColumns();
  renderCalendarEvents();
  renderArchivePanel();
  renderTrashPanel();
  renderBacklogPanel();
  renderSearchPanel();
  applySettingsToApp();

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function onAuthClear() {
  _currentUserId = null;
  clearTimeout(_settingsWriteTimer);
  _loadedDateRanges.clear();
  _loadingDateRanges.clear();
  _loadedCalendarDates.clear();
  _loadingCalendarDates.clear();

  state.columns = [];
  state.backlog = [];
  state.archive = [];
  state.repeatSeries = [];
  state.calendarEvents = [];
  state.trash = [];
  state.dayWindow = { startISO: null, endISO: null };
  clearRepeatRuntimeState();
  repeatRuntimeState.pinnedOccurrenceKeys.clear();
  searchPanelState.query = '';
  closeSearchDropdown();
  todayViewState.isActive = false;
  todayViewState.selectedDate = null;
  todayViewState.returnToHomeDate = null;
  todayViewState.returnSidebarCollapsed = false;
  todayViewState.returnRightSidebarCollapsed = false;
  applyTodayViewLayout(false);

  const dayColumns = document.getElementById('day-columns');
  if (dayColumns) dayColumns.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  AppAuth.init();
});
