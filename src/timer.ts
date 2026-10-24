// Timing rules for the focus timer, as plain functions, so they can be tested without the app.
export type Phase = 'focus' | 'break';
export type Status = 'idle' | 'running' | 'paused';
export type Timer = { status: Status; phase: Phase; remainingMs: number; endsAt: number | null };
export type Settings = { focusMin: number; breakMin: number };
export type Session = { day: string; minutes: number; at: number };

// What the timer shows now. While running, the time left comes from the end time, so it stays right
// after the app is closed and reopened. While paused, the time left is the saved amount.
export const timeLeft = (timer: Timer, now: number): number =>
  timer.status === 'running' ? Math.max(0, (timer.endsAt ?? now) - now) : timer.remainingMs;

// The time of a phase in milliseconds.
export const phaseMs = (settings: Settings, phase: Phase): number =>
  (phase === 'focus' ? settings.focusMin : settings.breakMin) * 60 * 1000;

// A clock face such as 24:59, from milliseconds.
export const clock = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// The share of a phase still to go, from 0 to 1, for the ring.
export const remainingShare = (ms: number, total: number): number =>
  total > 0 ? Math.min(1, Math.max(0, ms / total)) : 0;

export const startTimer = (timer: Timer, phase: Phase, settings: Settings, now: number): Timer => ({
  ...timer,
  phase,
  status: 'running',
  endsAt: now + phaseMs(settings, phase),
  remainingMs: phaseMs(settings, phase),
});

export const pauseTimer = (timer: Timer, now: number): Timer => ({
  ...timer,
  status: 'paused',
  remainingMs: timeLeft(timer, now),
  endsAt: null,
});

export const resumeTimer = (timer: Timer, now: number): Timer => ({
  ...timer,
  status: 'running',
  endsAt: now + timer.remainingMs,
});

// A focus is followed by a break, a break by the next focus.
export const nextPhase = (phase: Phase): Phase => (phase === 'focus' ? 'break' : 'focus');

// Minutes of focus logged on a given day.
export const focusMinutesOn = (sessions: Session[], day: string): number =>
  sessions.filter((s) => s.day === day).reduce((sum, s) => sum + s.minutes, 0);

// A day key such as 2026-10-24, in local time.
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
