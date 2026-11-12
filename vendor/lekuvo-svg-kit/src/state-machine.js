/**
 * Lekuvo's deterministic, DOM-independent mood controller.
 * Persistent activities are layered; temporary reactions expire safely.
 */
export const MOODS = Object.freeze([
  'lazy', 'awake', 'wave', 'listening', 'dance', 'sleep',
  'surprised', 'dizzy', 'focus', 'thinking', 'success', 'alert',
]);

export const APP_EVENTS = Object.freeze([
  'app:idle', 'app:active', 'app:focus-start', 'app:focus-end',
  'audio:listening-start', 'audio:listening-end', 'media:play', 'media:pause',
  'reminder:due', 'task:completed', 'app:error', 'app:sleep', 'app:wake',
  'pointer:wave', 'app:busy', 'app:ready', 'app:dizzy',
]);

const moodSet = new Set(MOODS);
const eventSet = new Set(APP_EVENTS);

export function validateMood(mood) {
  if (!moodSet.has(mood)) {
    throw new RangeError(`Unknown Lekuvo mood: ${String(mood)}. Use ${MOODS.join(', ')}.`);
  }
  return mood;
}

function boundedNumber(value, fallback, label, maximum) {
  const chosen = value === undefined ? fallback : value;
  if (typeof chosen !== 'number' || !Number.isFinite(chosen) || chosen < 0 || chosen > maximum) {
    throw new RangeError(`${label} must be a finite number from 0 to ${maximum}.`);
  }
  return chosen;
}

export class MoodController {
  constructor({
    mood = 'lazy',
    onChange = () => {},
    setTimer = (fn, delay) => setTimeout(fn, delay),
    clearTimer = (id) => clearTimeout(id),
  } = {}) {
    this.baseMood = validateMood(mood);
    this.onChange = onChange;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.channels = new Map();
    this.temporary = null;
    this.timer = null;
    this.sequence = 0;
    this.generation = 0;
    this.currentMood = mood;
  }

  get mood() { return this.currentMood; }

  resolve() {
    let result = { mood: this.baseMood, priority: 0, sequence: 0 };
    for (const candidate of this.channels.values()) {
      if (candidate.priority > result.priority ||
          (candidate.priority === result.priority && candidate.sequence > result.sequence)) {
        result = candidate;
      }
    }
    if (this.temporary && (this.temporary.priority > result.priority ||
        (this.temporary.priority === result.priority && this.temporary.sequence > result.sequence))) {
      result = this.temporary;
    }
    return result;
  }

  publish(reason) {
    const next = this.resolve().mood;
    const previous = this.currentMood;
    this.currentMood = next;
    if (next !== previous) this.onChange({ mood: next, previous, reason });
    return next;
  }

  clearTemporary() {
    this.generation += 1;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.temporary = null;
  }

  setBaseMood(mood, reason = 'base') {
    this.baseMood = validateMood(mood);
    this.publish(reason);
  }

  setMood(mood, options = {}) {
    validateMood(mood);
    const duration = boundedNumber(options.duration, 0, 'duration', 60000);
    const priority = boundedNumber(options.priority, 80, 'priority', 100);
    const reason = typeof options.reason === 'string' ? options.reason : 'manual';
    if (duration === 0) {
      this.clearTemporary();
      this.channels.clear();
      this.baseMood = mood;
      this.publish(reason);
      return true;
    }
    if (priority < this.resolve().priority) return false;
    this.clearTemporary();
    this.temporary = { mood, priority, sequence: ++this.sequence };
    const generation = this.generation;
    this.timer = this.setTimer(() => {
      // A canceled callback must never restore stale state.
      if (generation !== this.generation) return;
      this.timer = null;
      this.temporary = null;
      this.publish(`${reason}:expired`);
    }, duration);
    this.publish(reason);
    return true;
  }

  channel(key, mood, priority, reason) {
    this.channels.set(key, { mood, priority, sequence: ++this.sequence });
    this.publish(reason);
  }

  removeChannel(key, reason) {
    this.channels.delete(key);
    this.publish(reason);
  }

  trigger(name, detail = {}) {
    if (!eventSet.has(name)) return false;
    const data = detail && typeof detail === 'object' ? detail : {};
    const reaction = (mood, duration, priority) => {
      // Event reactions always remain temporary, including a duration of zero.
      // A zero-duration event is a no-op, never a permanent override.
      const ms = boundedNumber(data.duration, duration, 'duration', 60000);
      const rank = boundedNumber(data.priority, priority, 'priority', 100);
      if (ms > 0) this.setMood(mood, { duration: ms, priority: rank, reason: name });
      return true;
    };

    switch (name) {
      case 'app:idle': this.setBaseMood('lazy', name); break;
      case 'app:active': this.setBaseMood('awake', name); break;
      case 'app:focus-start': this.channel('focus', 'focus', 35, name); break;
      case 'app:focus-end': this.removeChannel('focus', name); break;
      case 'audio:listening-start': this.channel('listening', 'listening', 70, name); break;
      case 'audio:listening-end': this.removeChannel('listening', name); break;
      case 'media:play': this.channel('media', 'dance', 30, name); break;
      case 'media:pause': this.removeChannel('media', name); break;
      case 'app:busy': this.channel('busy', 'thinking', 45, name); break;
      case 'app:ready': this.removeChannel('busy', name); break;
      case 'app:sleep':
        this.clearTemporary();
        this.channel('sleep', 'sleep', 100, name);
        break;
      case 'app:wake':
        // Validate before changing state, so bad input cannot half-wake the mascot.
        boundedNumber(data.duration, 1500, 'duration', 60000);
        boundedNumber(data.priority, 80, 'priority', 100);
        this.channels.delete('sleep');
        this.baseMood = 'awake';
        if (data.duration === 0) this.publish(name);
        else {
          reaction('wave', 1500, 80);
          this.publish(name);
        }
        break;
      case 'pointer:wave': return reaction('wave', 1500, 80);
      case 'task:completed': return reaction('success', 1800, 80);
      case 'reminder:due': return reaction('alert', 2600, 85);
      case 'app:error': return reaction('surprised', 1600, 90);
      case 'app:dizzy': return reaction('dizzy', 1800, 80);
    }
    return true;
  }

  reset() {
    this.clearTemporary();
    this.channels.clear();
    this.baseMood = 'lazy';
    this.publish('reset');
  }

  suspend() {
    this.clearTemporary();
    this.publish('disconnected');
  }
}
