import '../src/lekuvo-mascot.js';

const moods = [
  { id: 'lazy', name: 'Lazy', title: 'Taking it easy.', description: 'A quiet moment, right at the edge.' },
  { id: 'awake', name: 'Awake', title: 'Ready when you are.', description: 'A little attention, without the interruption.' },
  { id: 'wave', name: 'Wave', title: 'Oh, hello there.', description: 'A small greeting to welcome you back.' },
  { id: 'listening', name: 'Listening', title: 'You have my attention.', description: 'Listening closely while your app takes the lead.' },
  { id: 'dance', name: 'Dance', title: 'Found the rhythm.', description: 'A little movement for the music in your day.' },
  { id: 'sleep', name: 'Sleep', title: 'Settling in for a rest.', description: 'Quiet eyes. A comfortable curl. Nothing to do.' },
  { id: 'surprised', name: 'Surprised', title: 'Well, that was new.', description: 'A quick reaction when something unexpected happens.' },
  { id: 'dizzy', name: 'Dizzy', title: 'One little moment…', description: 'A playful wobble before finding its feet again.' },
  { id: 'focus', name: 'Focus', title: 'Let’s stay with it.', description: 'Attentive and composed while you concentrate.' },
  { id: 'thinking', name: 'Thinking', title: 'Working on something.', description: 'A thoughtful pause while an activity is in progress.' },
  { id: 'success', name: 'Success', title: 'Nicely done.', description: 'A small celebration for a finished task.' },
  { id: 'alert', name: 'Alert', title: 'A gentle heads-up.', description: 'Something needs your attention. Take a look.' }
];

const events = [
  ['app:idle', 'App becomes idle'], ['app:active', 'App becomes active'],
  ['app:focus-start', 'Start focus'], ['app:focus-end', 'End focus'],
  ['audio:listening-start', 'Start listening'], ['audio:listening-end', 'End listening'],
  ['media:play', 'Play music'], ['media:pause', 'Pause music'],
  ['reminder:due', 'Reminder is due'], ['task:completed', 'Task completed'],
  ['app:error', 'Unexpected error'], ['app:sleep', 'Go to sleep'],
  ['app:wake', 'Wake up'], ['pointer:wave', 'Wave hello'],
  ['app:busy', 'Start thinking'], ['app:ready', 'Finish thinking'],
  ['app:dizzy', 'Feel dizzy']
];

const $ = id => document.getElementById(id);
const mascot = $('main-mascot');
const specimens = [...document.querySelectorAll('.size-mascot')];
const moodMap = new Map(moods.map(mood => [mood.id, mood]));
const eventLabels = new Map(events);
const sequenceTimers = [];
let sequenceName = null;
let motionPreference = 'auto';
let currentMood = 'lazy';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

await customElements.whenDefined('lekuvo-mascot');

function stopSequence(message = 'Sequence stopped. Current activity remains until another event or mood is selected.') {
  sequenceTimers.splice(0).forEach(timer => window.clearTimeout(timer));
  const wasRunning = sequenceName !== null;
  sequenceName = null;
  $('stop-sequence').disabled = true;
  document.querySelectorAll('[data-sequence]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  if (wasRunning) $('sequence-status').textContent = message;
}

function updateStateView(moodId, reason = '') {
  const mood = moodMap.get(moodId) ?? moodMap.get('lazy');
  currentMood = mood.id;
  $('stage-mood').textContent = mood.title;
  $('stage-description').textContent = mood.description;
  $('state-pill-text').textContent = mood.name;
  $('current-mood').textContent = mood.id;
  if (reason) $('current-reason').textContent = reason;
  document.querySelectorAll('button[data-mood]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mood === mood.id)));
  specimens.forEach(specimen => {
    specimen.setMood(mood.id);
    specimen.setAttribute('label', `Lekuvo at ${specimen.getAttribute('size')} pixels, ${mood.name.toLowerCase()}`);
  });
}

function addStateLog(detail) {
  const list = $('event-log');
  list.querySelector('.empty-log')?.remove();
  const row = document.createElement('li');
  const top = document.createElement('div');
  top.className = 'log-top';
  const title = document.createElement('strong');
  const previous = detail.previous || 'initial';
  title.textContent = `${previous} → ${detail.mood}`;
  const time = document.createElement('time');
  const now = new Date();
  time.dateTime = now.toISOString();
  time.textContent = now.toLocaleTimeString([], { hour12: false });
  const reason = document.createElement('span');
  reason.className = 'log-reason';
  reason.textContent = detail.reason || 'State changed';
  top.append(title, time);
  row.append(top, reason);
  list.prepend(row);
  while (list.children.length > 16) list.lastElementChild.remove();
  $('announcer').textContent = `${moodMap.get(detail.mood)?.name || detail.mood} mood. ${detail.reason || ''}`;
}

mascot.addEventListener('lekuvo:statechange', event => {
  const detail = event.detail || {};
  if (!moodMap.has(detail.mood)) return;
  updateStateView(detail.mood, detail.reason || 'state change');
  addStateLog(detail);
});

moods.forEach(mood => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mood-button';
  button.dataset.mood = mood.id;
  button.textContent = mood.name;
  button.title = mood.description;
  button.setAttribute('aria-pressed', String(mood.id === 'lazy'));
  button.addEventListener('click', () => {
    stopSequence('Sequence stopped by a manual mood selection.');
    mascot.setMood(mood.id);
    updateStateView(mood.id, 'manual mood');
  });
  $('mood-grid').append(button);
});

events.forEach(([name, label]) => {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = `${name} · ${label}`;
  $('event-select').append(option);
});
$('event-select').value = 'media:play';

function sendEvent(name, fromSequence = false) {
  if (!fromSequence) stopSequence('Sequence stopped by a new app event.');
  const recognized = mascot.trigger(name);
  $('event-select').value = name;
  if (!fromSequence) {
    $('sequence-status').textContent = recognized
      ? `Sent ${name}. The component decides which active mood takes priority.`
      : `The component did not recognize ${name}.`;
  }
  return recognized;
}

[
  ['media:play', 'Play music'], ['media:pause', 'Pause music'],
  ['app:focus-start', 'Focus'], ['audio:listening-start', 'Listen'],
  ['audio:listening-end', 'Stop listening'], ['task:completed', 'Task done'],
  ['reminder:due', 'Reminder'], ['app:wake', 'Wake up']
].forEach(([name, label]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-event';
  button.textContent = label;
  button.title = name;
  button.addEventListener('click', () => sendEvent(name));
  $('quick-events').append(button);
});

$('event-form').addEventListener('submit', event => {
  event.preventDefault();
  sendEvent($('event-select').value);
});

const sequences = {
  layers: {
    label: 'Music → focus → listening',
    steps: [[0, 'media:play'], [1400, 'app:focus-start'], [2900, 'audio:listening-start'], [5200, 'audio:listening-end'], [7200, 'app:focus-end'], [9200, 'media:pause']],
    finish: 10400
  },
  attention: {
    label: 'A moment that needs attention',
    steps: [[0, 'app:busy'], [1700, 'task:completed'], [3700, 'reminder:due'], [8200, 'app:ready']],
    finish: 9400
  }
};

function runSequence(name) {
  stopSequence();
  const sequence = sequences[name];
  if (!sequence) return;
  sequenceName = name;
  mascot.setMood('awake');
  updateStateView('awake', 'sequence start');
  $('stop-sequence').disabled = false;
  document.querySelectorAll('[data-sequence]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sequence === name)));
  sequence.steps.forEach(([delay, eventName], index) => {
    sequenceTimers.push(window.setTimeout(() => {
      if (sequenceName !== name) return;
      sendEvent(eventName, true);
      $('sequence-status').textContent = `${sequence.label} · ${index + 1}/${sequence.steps.length}: ${eventLabels.get(eventName)} (${eventName})`;
    }, delay));
  });
  sequenceTimers.push(window.setTimeout(() => {
    if (sequenceName !== name) return;
    stopSequence(`${sequence.label} complete.`);
  }, sequence.finish));
}

document.querySelectorAll('[data-sequence]').forEach(button => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => runSequence(button.dataset.sequence));
});
$('stop-sequence').addEventListener('click', () => stopSequence());

$('clear-log').addEventListener('click', () => {
  $('event-log').replaceChildren();
  const empty = document.createElement('li');
  empty.className = 'empty-log';
  empty.textContent = 'Log cleared. New state changes will appear here.';
  $('event-log').append(empty);
  $('announcer').textContent = 'State-change log cleared.';
});

document.querySelectorAll('button[data-surface]').forEach(button => button.addEventListener('click', () => {
  document.documentElement.dataset.surface = button.dataset.surface;
  document.querySelectorAll('button[data-surface]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
}));

document.querySelectorAll('[data-view]').forEach(button => {
  if (button.tagName !== 'BUTTON') return;
  button.addEventListener('click', () => {
    const compact = button.dataset.view === 'compact';
    $('desktop').dataset.view = compact ? 'compact' : 'expanded';
    mascot.setAttribute('size', compact ? '40' : '160');
    mascot.setAttribute('variant', compact ? 'compact' : 'full');
    document.querySelectorAll('button[data-view]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  });
});

function updateMotionNote() {
  $('motion-note').textContent = motionPreference === 'off'
    ? 'Motion is off. Expressions remain available as static vector states.'
    : motionPreference === 'on'
      ? 'Motion is explicitly on for this preview.'
      : reducedMotion.matches
        ? 'Auto: your system currently requests reduced motion.'
        : 'Auto follows your system’s reduced-motion setting.';
}

document.querySelectorAll('button[data-motion]').forEach(button => button.addEventListener('click', () => {
  motionPreference = button.dataset.motion;
  document.documentElement.dataset.motion = motionPreference;
  document.querySelectorAll('lekuvo-mascot').forEach(element => element.setAttribute('motion', motionPreference));
  document.querySelectorAll('button[data-motion]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  updateMotionNote();
}));
reducedMotion.addEventListener('change', updateMotionNote);
updateMotionNote();

$('copy-code').addEventListener('click', async () => {
  const button = $('copy-code');
  const code = $('usage-code').textContent;
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = 'Copied';
    window.setTimeout(() => { button.textContent = 'Copy example'; }, 1800);
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('usage-code'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'Selected — copy with your keyboard';
    window.setTimeout(() => { button.textContent = 'Copy example'; }, 2500);
  }
});

window.addEventListener('pagehide', () => stopSequence());
updateStateView(currentMood, 'initial state');
