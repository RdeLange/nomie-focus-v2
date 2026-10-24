<script lang="ts">
  import { onMount } from 'svelte';
  import { timeLeft, phaseMs, clock, remainingShare, startTimer, pauseTimer, resumeTimer, nextPhase, focusMinutesOn, dayKey, type Timer, type Session, type Settings } from './timer';
  import { paletteFrom, type Palette } from './palette';
  import { offerTracker } from './tracker-offer';

  const FOCUS_CHOICES = [15, 25, 50];
  const BREAK_CHOICES = [5, 10];
  const RING = 2 * Math.PI * 52;

  let plugin: any;
  let view = $state<'modal' | 'widget'>('modal');
  let palette = $state<Palette>(paletteFrom(undefined));
  let scale = $state(1);
  let settings = $state<Settings>({ focusMin: 25, breakMin: 5 });
  let timer = $state<Timer>({ status: 'idle', phase: 'focus', remainingMs: phaseMs({ focusMin: 25, breakMin: 5 }, 'focus'), endsAt: null });
  let sessions = $state<Session[]>([]);
  let now = $state(Date.now());
  let ready = $state(false);

  const left = $derived(timeLeft(timer, now));
  const total = $derived(phaseMs(settings, timer.phase));
  const share = $derived(remainingShare(left, total));
  const today = $derived(dayKey(new Date(now)));
  const todaysMinutes = $derived(focusMinutesOn(sessions, today));
  const todaysCount = $derived(sessions.filter((s) => s.day === today).length);
  const running = $derived(timer.status === 'running');

  const applyNomieValues = () => {
    if (!plugin?.prefs) return;
    palette = paletteFrom(plugin.prefs);
    scale = plugin.prefs.fontScale || 1;
  };

  const saveTimer = () => plugin?.storage.setItem('timer', $state.snapshot(timer));
  const saveSettings = () => plugin?.storage.setItem('settings', $state.snapshot(settings));
  const saveSessions = () => plugin?.storage.setItem('sessions', $state.snapshot(sessions.slice(-500)));

  // A focus that finished goes into the timeline, so it shows with the rest of the day
  const finishFocus = () => {
    const minutes = settings.focusMin;
    sessions = [...sessions, { day: dayKey(new Date()), minutes, at: Date.now() }];
    saveSessions();
    plugin.createNote(`Focus session: ${minutes} min ✅ #focus`);
  };

  // Moves to the next phase when the time is up. After a focus the break starts at once; after a break the next focus waits for Start.
  const checkEnd = () => {
    if (timer.status !== 'running' || timeLeft(timer, Date.now()) > 0) return;
    if (timer.phase === 'focus') finishFocus();
    const next = nextPhase(timer.phase);
    timer = next === 'break'
      ? startTimer(timer, 'break', settings, Date.now())
      : { ...timer, phase: 'focus', status: 'idle', remainingMs: phaseMs(settings, 'focus'), endsAt: null };
    saveTimer();
    plugin?.alert(next === 'break' ? 'Focus done' : 'Break over', next === 'break' ? 'Time for a break.' : 'Ready for the next focus?');
  };

  const start = () => {
    timer = timer.status === 'paused' ? resumeTimer(timer, Date.now()) : startTimer(timer, timer.phase, settings, Date.now());
    saveTimer();
  };
  const pause = () => {
    timer = pauseTimer(timer, Date.now());
    saveTimer();
  };
  const reset = () => {
    timer = { status: 'idle', phase: timer.phase, remainingMs: phaseMs(settings, timer.phase), endsAt: null };
    saveTimer();
  };
  const skip = () => {
    const next = nextPhase(timer.phase);
    timer = { status: 'idle', phase: next, remainingMs: phaseMs(settings, next), endsAt: null };
    saveTimer();
  };

  const changeFocus = (focusMin: number) => {
    settings = { ...settings, focusMin };
    saveSettings();
    if (timer.status === 'idle' && timer.phase === 'focus') reset();
  };
  const changeBreak = (breakMin: number) => {
    settings = { ...settings, breakMin };
    saveSettings();
    if (timer.status === 'idle' && timer.phase === 'break') reset();
  };

  const reflect = () => plugin.openNoteEditor('Focus reflection: What did I finish in this session?\n');

  // The clock ticks once a second while the timer runs, and checks whether the phase is over
  $effect(() => {
    if (!ready) return;
    const ticker = setInterval(() => {
      now = Date.now();
      checkEnd();
    }, 1000);
    return () => clearInterval(ticker);
  });

  const load = async () => {
    await plugin.storage.init();
    const savedSettings = plugin.storage.getItem('settings');
    if (savedSettings) settings = { ...settings, ...savedSettings };
    const savedTimer = plugin.storage.getItem('timer');
    if (savedTimer) timer = savedTimer;
    sessions = plugin.storage.getItem('sessions') || [];
    now = Date.now();
    ready = true;
    // a timer that ended while the app was closed is finished now
    checkEnd();
  };

  onMount(() => {
    plugin = new NomiePlugin({
      name: 'Nomie Focus',
      emoji: '⏱️',
      description: 'A focus timer with breaks. Each finished focus is written into your timeline, with a reflection if you want one.',
      uses: ['createNote', 'openNoteEditor', 'alert', 'getStorageItem', 'setStorageItem', 'getTrackable', 'openTrackableEditor', 'confirm'],
      version: '2.0',
      addToCaptureMenu: true,
      addToMoreMenu: true,
      addToWidgets: true,
    });
    plugin.onRegistered(async () => {
      applyNomieValues();
      await load();
    });
    plugin.onWidget(async () => {
      view = 'widget';
      applyNomieValues();
      if (ready) checkEnd(); else await load();
    });
    plugin.onUIOpened(async () => {
      view = 'modal';
      applyNomieValues();
      offerTracker(plugin, { tag: 'focus', label: 'Focus', emoji: '🎯', color: '#5E5CE6' });
      if (ready) checkEnd(); else await load();
    });
  });
</script>

<div class="card" class:widget={view === 'widget'} style="--page: {palette.page}; --card: {palette.card}; --text: {palette.text}; --muted: {palette.textSecondary}; --line: {palette.separator}; --fill: {palette.fill}; --tint: {palette.tint}; --on-tint: {palette.onTint}; --tint-soft: {palette.tintSoft}; --scale: {scale};">
  {#if view === 'widget'}
    <div class="head">
      <span aria-hidden="true">⏱️</span>
      <span>{timer.phase === 'focus' ? 'Focus' : 'Break'}</span>
      <span class="meta">{todaysCount} today</span>
    </div>
    <div class="widget-time">{clock(left)}</div>
    <button class="primary wide" onclick={running ? pause : start}>{running ? 'Pause' : timer.status === 'paused' ? 'Resume' : 'Start'}</button>
  {:else}
    <h1>Focus</h1>
    <p class="muted">{timer.phase === 'focus' ? 'Focus time' : 'Break time'} · {today}</p>
    <div class="ring-wrap">
      <svg viewBox="0 0 120 120" width="220" height="220" aria-hidden="true">
        <circle cx="60" cy="60" r="52" class="track" />
        <circle cx="60" cy="60" r="52" class="progress" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - share)} transform="rotate(-90 60 60)" />
      </svg>
      <div class="clock">{clock(left)}</div>
    </div>
    <div class="controls">
      <button class="primary" onclick={running ? pause : start}>{running ? 'Pause' : timer.status === 'paused' ? 'Resume' : 'Start'}</button>
      <button class="ghost" onclick={reset} disabled={timer.status === 'idle'}>Reset</button>
      <button class="ghost" onclick={skip}>Skip</button>
    </div>

    <h2>Today</h2>
    <p>{todaysCount} {todaysCount === 1 ? 'session' : 'sessions'} · {todaysMinutes} min of focus</p>
    <button class="link" onclick={reflect}>Write a reflection</button>

    <h2>Focus length</h2>
    <div class="chips">
      {#each FOCUS_CHOICES as m (m)}
        <button class:active={settings.focusMin === m} onclick={() => changeFocus(m)}>{m} min</button>
      {/each}
    </div>
    <h2>Break length</h2>
    <div class="chips">
      {#each BREAK_CHOICES as m (m)}
        <button class:active={settings.breakMin === m} onclick={() => changeBreak(m)}>{m} min</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .card { box-sizing: border-box; min-height: 100vh; padding: 16px; background: var(--page); color: var(--text); font-size: calc(16px * var(--scale)); line-height: 1.4; }
  .card.widget { min-height: 0; padding: 12px; font-size: calc(14px * var(--scale)); }
  h1 { margin: 0; font-size: calc(26px * var(--scale)); font-weight: 700; }
  h2 { margin: 20px 0 6px; font-size: calc(13px * var(--scale)); font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { margin: 4px 0; color: var(--muted); }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .meta { margin-left: auto; color: var(--muted); }
  .widget-time { font-size: calc(34px * var(--scale)); font-weight: 700; font-variant-numeric: tabular-nums; }
  .ring-wrap { position: relative; width: 220px; margin: 16px auto; }
  .track { fill: none; stroke: var(--fill); stroke-width: 8; }
  .progress { fill: none; stroke: var(--tint); stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 0.5s linear; }
  .clock { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: calc(36px * var(--scale)); font-weight: 700; font-variant-numeric: tabular-nums; }
  .controls { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .primary, .ghost { padding: 12px 16px; border-radius: 12px; font: inherit; font-weight: 600; cursor: pointer; border: 0; }
  .primary { background: var(--tint); color: var(--on-tint); }
  .wide { width: 100%; margin-top: 6px; }
  .ghost { background: var(--fill); color: var(--text); }
  .ghost:disabled { opacity: 0.4; cursor: default; }
  .link { border: 0; background: transparent; color: var(--tint); font: inherit; padding: 8px 0; cursor: pointer; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { padding: 8px 12px; border: 0; border-radius: 10px; background: var(--fill); color: var(--text); font: inherit; cursor: pointer; }
  .chips button.active { background: var(--tint-soft); color: var(--tint); font-weight: 600; }
</style>
