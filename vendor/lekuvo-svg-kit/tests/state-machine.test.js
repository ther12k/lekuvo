import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_EVENTS, MOODS, MoodController } from '../src/state-machine.js';

function harness() {
  let counter = 0;
  const active = new Map();
  const every = new Map();
  const changes = [];
  const state = new MoodController({
    onChange: (change) => changes.push(change),
    setTimer(fn) { const id = ++counter; active.set(id, fn); every.set(id, fn); return id; },
    clearTimer(id) { active.delete(id); },
  });
  return { state, active, every, changes, expire() {
    const scheduled = [...active.entries()]; active.clear();
    for (const [, fn] of scheduled) fn();
  } };
}

test('publishes twelve canonical moods and seventeen app events', () => {
  assert.equal(MOODS.length, 12);
  assert.equal(new Set(MOODS).size, 12);
  assert.equal(APP_EVENTS.length, 17);
});

test('listening interrupts focus and music, then reveals the still-active channel', () => {
  const { state } = harness();
  state.trigger('media:play'); assert.equal(state.mood, 'dance');
  state.trigger('app:focus-start'); assert.equal(state.mood, 'focus');
  state.trigger('audio:listening-start'); assert.equal(state.mood, 'listening');
  state.trigger('media:pause'); assert.equal(state.mood, 'listening');
  state.trigger('audio:listening-end'); assert.equal(state.mood, 'focus');
  state.trigger('app:focus-end'); assert.equal(state.mood, 'lazy');
});

test('temporary reactions restore the latest base, not an obsolete snapshot', () => {
  const { state, expire } = harness();
  state.trigger('task:completed'); assert.equal(state.mood, 'success');
  state.trigger('app:active'); assert.equal(state.mood, 'success');
  state.trigger('app:focus-start'); assert.equal(state.mood, 'success');
  expire(); assert.equal(state.mood, 'focus');
  state.trigger('app:focus-end'); assert.equal(state.mood, 'awake');
});

test('lower-priority reactions are ignored; old timers cannot overwrite a newer reaction', () => {
  const { state, every, active, expire } = harness();
  state.trigger('pointer:wave');
  const obsolete = every.get(1);
  state.trigger('app:error'); assert.equal(state.mood, 'surprised');
  assert.equal(state.setMood('dance', { duration: 100, priority: 20 }), false);
  obsolete(); assert.equal(state.mood, 'surprised');
  assert.equal(active.size, 1);
  expire(); assert.equal(state.mood, 'lazy');
});

test('sleep blocks activity and reactions; wake resumes music after its greeting', () => {
  const { state, expire, active } = harness();
  state.trigger('media:play');
  state.trigger('pointer:wave');
  state.trigger('app:sleep'); assert.equal(state.mood, 'sleep');
  assert.equal(active.size, 0);
  state.trigger('reminder:due'); assert.equal(state.mood, 'sleep');
  state.trigger('app:wake'); assert.equal(state.mood, 'wave');
  expire(); assert.equal(state.mood, 'dance');
});

test('manual selection clears event channels and cancels pending reactions', () => {
  const { state, expire, active } = harness();
  state.trigger('app:sleep');
  state.setMood('dizzy'); assert.equal(state.mood, 'dizzy');
  state.trigger('task:completed');
  state.setMood('focus'); assert.equal(active.size, 0);
  expire(); assert.equal(state.mood, 'focus');
  state.trigger('app:focus-end'); assert.equal(state.mood, 'focus');
});

test('base changes preserve events while reset clears all state', () => {
  const { state, active } = harness();
  state.trigger('media:play');
  state.setBaseMood('awake'); assert.equal(state.mood, 'dance');
  state.trigger('task:completed');
  state.reset(); assert.equal(state.mood, 'lazy');
  assert.equal(active.size, 0); assert.equal(state.channels.size, 0);
});

test('disconnect suspension releases timers and preserves persistent channels', () => {
  const { state, active } = harness();
  state.trigger('app:focus-start');
  state.trigger('pointer:wave');
  state.suspend(); assert.equal(state.mood, 'focus'); assert.equal(active.size, 0);
});

test('invalid or unrecognized data cannot corrupt state', () => {
  const { state } = harness();
  assert.equal(state.trigger('unknown:event'), false);
  assert.throws(() => state.setMood('missing'), RangeError);
  for (const duration of [-1, NaN, Infinity, 60001, '200']) {
    assert.throws(() => state.setMood('wave', { duration }), RangeError);
  }
  state.trigger('app:sleep');
  assert.throws(() => state.trigger('app:wake', { duration: -1 }), RangeError);
  assert.equal(state.mood, 'sleep');
});

test('zero-duration app reaction does not become a permanent state', () => {
  const { state, active } = harness();
  state.trigger('media:play');
  state.trigger('reminder:due', { duration: 0 });
  assert.equal(state.mood, 'dance'); assert.equal(active.size, 0);
});

test('same-mood reactions do not spam state changes but extend their expiry', () => {
  const { state, changes, active, every, expire } = harness();
  state.trigger('pointer:wave');
  state.trigger('pointer:wave');
  assert.equal(changes.length, 1); assert.equal(active.size, 1);
  every.get(1)(); assert.equal(state.mood, 'wave');
  expire(); assert.equal(state.mood, 'lazy');
});

test('a low-priority wake greeting cannot leave an obsolete sleep state visible', () => {
  const { state } = harness();
  state.trigger('audio:listening-start');
  state.trigger('app:sleep');
  state.trigger('app:wake', { priority: 10 });
  assert.equal(state.mood, 'listening');
});
