import { describe, expect, it } from 'vitest';
import { clock, focusMinutesOn, nextPhase, pauseTimer, phaseMs, remainingShare, resumeTimer, startTimer, timeLeft, type Timer } from '../timer';

const settings = { focusMin: 25, breakMin: 5 };
const idle: Timer = { status: 'idle', phase: 'focus', remainingMs: phaseMs(settings, 'focus'), endsAt: null };

describe('the focus timer', () => {
  it('counts down from the end time while running', () => {
    const running = startTimer(idle, 'focus', settings, 1000);
    expect(timeLeft(running, 1000 + 60_000)).toBe(24 * 60_000);
  });

  it('keeps the time left when paused, and carries on from it', () => {
    const running = startTimer(idle, 'focus', settings, 0);
    const paused = pauseTimer(running, 5 * 60_000);
    expect(timeLeft(paused, 99_999_999)).toBe(20 * 60_000);
    const resumed = resumeTimer(paused, 10 * 60_000);
    expect(timeLeft(resumed, 11 * 60_000)).toBe(19 * 60_000);
  });

  it('never shows less than zero', () => {
    const running = startTimer(idle, 'break', settings, 0);
    expect(timeLeft(running, 60 * 60_000)).toBe(0);
  });

  it('alternates focus and break', () => {
    expect(nextPhase('focus')).toBe('break');
    expect(nextPhase('break')).toBe('focus');
  });
});

describe('the display', () => {
  it('shows a clock face, rounding up the seconds', () => {
    expect(clock(25 * 60_000)).toBe('25:00');
    expect(clock(59_100)).toBe('01:00');
    expect(clock(0)).toBe('00:00');
  });

  it('gives the share left for the ring, between 0 and 1', () => {
    expect(remainingShare(30, 60)).toBe(0.5);
    expect(remainingShare(120, 60)).toBe(1);
    expect(remainingShare(10, 0)).toBe(0);
  });
});

describe('the sessions', () => {
  it('adds up the focus minutes of one day', () => {
    const sessions = [
      { day: '2026-10-24', minutes: 25, at: 1 },
      { day: '2026-10-24', minutes: 50, at: 2 },
      { day: '2026-10-23', minutes: 25, at: 3 },
    ];
    expect(focusMinutesOn(sessions, '2026-10-24')).toBe(75);
  });
});
