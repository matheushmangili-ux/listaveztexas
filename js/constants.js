// ============================================
// MinhaVez — Named Constants
// Replaces magic numbers across the codebase
// ============================================

// ─── Timeouts & Intervals (ms) ───

export const SESSION_TIMEOUT_TABLET = 30 * 60 * 1000; // 30 min — inactivity logout (tablet)
export const SESSION_TIMEOUT_DASHBOARD = 8 * 60 * 60 * 1000; // 8h — inactivity logout (dashboard/TV)
export const SESSION_CHECK_INTERVAL = 60000; // 1 min — check inactivity

export const FOOTER_TIMER_INTERVAL = 60000; // 1 min — footer pause/atend timers
export const AUTO_SYNC_INTERVAL = 30000; // 30s — periodic data reload
export const QUICK_STATS_INTERVAL = 60000; // 1 min — quick stats update
export const GHOST_CLEANUP_INTERVAL = 3000; // 3s — orphan drag ghost cleanup

export const RT_VENDEDOR_DEBOUNCE = 100; // realtime vendedor reload debounce
export const RT_DASHBOARD_DEBOUNCE = 500; // realtime dashboard reload debounce
export const RT_RECONNECT_DELAY = 3000; // realtime channel reconnect

export const ACTION_LOCK_SAFETY = 8000; // max lock duration before force-release
export const ACTION_LOCK_RESET = 300; // lock reset after operation
export const LOCAL_ACTION_DEBOUNCE = 2000; // local action flag debounce

export const INPUT_FOCUS_DELAY = 100; // delay before focusing input after sheet open
export const OVERLAY_HIDE_DELAY = 200; // CSS transition time before display:none
export const OUTCOME_OPEN_DELAY = 50; // delay before opening outcome sheet after drag

// ─── Toast Durations (ms) ───

export const TOAST_SHORT = 1500;
export const TOAST_MEDIUM = 2000;

// ─── Celebration Durations (ms) ───

export const CELEBRATION_FLASH_SHOW = 1200;
export const CELEBRATION_FLASH_FADE = 400;
export const CELEBRATION_EPIC_SHOW = 6000;
export const CELEBRATION_EPIC_FADE = 500;

// ─── Drag & Touch (px) ───

export const DRAG_THRESHOLD_QUEUE = 8; // min px movement to start queue drag
export const DRAG_THRESHOLD_ATENDIMENTO = 12; // min px movement to start atend drag
export const DRAG_GHOST_Y_OFFSET = 30; // ghost vertical offset from touch point

// ─── Business Logic ───

export const COLD_SELLER_TIMEOUT = 20 * 60 * 1000; // 20 min — mark vendor as "cold" in queue
export const ATTENDANCE_DANGER_SECONDS = 2400; // 40 min — timer turns red
export const TROCA_PREMIUM_VALUE = 1000; // R$ 1000 — epic troca threshold (front of queue)

// ─── Z-Indices ───

export const Z_DRAG_GHOST = 9999;
export const Z_CHANGELOG = 1003;
export const Z_OUTCOME_MULTI = 1002;
export const Z_MODAL = 1001;
export const Z_MENU = 999;

// ─── Chart Resize ───

export const CHART_RESIZE_DELAY = 50; // delay before dispatching resize on tab change
