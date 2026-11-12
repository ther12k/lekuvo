import { createArtwork, MASCOT_CSS } from './art.js';
import { APP_EVENTS, MOODS, MoodController, validateMood } from './state-machine.js';

export { APP_EVENTS, MOODS };
let nextInstance = 0;
const ElementBase = globalThis.HTMLElement ?? class {};
const INTERNAL_CSS = `
  :host { display: inline-block; width: var(--lekuvo-size, 160px); line-height: 0; vertical-align: middle; }
  :host([hidden]) { display: none; }
  :host([interactive]) { cursor: pointer; border-radius: 22%; outline: none; -webkit-tap-highlight-color: transparent; }
  :host([interactive]:focus-visible) { outline: 3px solid var(--lekuvo-blue-light, #87a3ff); outline-offset: 5px; }
  .stage { position: relative; width: 100%; }
  .stage > svg { display: block; width: 100%; height: auto; overflow: visible; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
`;

/** Original, event-driven inline SVG mascot. No framework or image dependencies. */
export class LekuvoMascot extends ElementBase {
  static observedAttributes = ['mood', 'size', 'motion', 'variant', 'label', 'interactive', 'live'];

  constructor() {
    super();
    this._controller = new MoodController({ onChange: (change) => this._renderState(change) });
    this._manualPause = false;
    this._inView = true;
    this._eventTarget = null;
    this._bindingToken = null;
    this._eventCleanups = [];
    this._observer = null;
    this._connected = false;
    this._boundVisibility = () => this._syncPause();
    this._boundClick = () => {
      if (this.hasAttribute('interactive')) this.trigger('pointer:wave');
    };
    this._boundKey = (event) => {
      if (this.hasAttribute('interactive') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        this.trigger('pointer:wave');
      }
    };
    if (typeof this.attachShadow === 'function') {
      const prefix = `lekuvo-${++nextInstance}`;
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>${INTERNAL_CSS}\n${MASCOT_CSS}</style><div class="stage">${createArtwork(prefix)}</div><span class="sr-only" data-status></span>`;
      this._status = shadow.querySelector('[data-status]');
      // Host carries the accessible name; decorative SVG internals stay out of the tree.
      const svg = shadow.querySelector('svg');
      if (svg) {
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
      }
    }
  }

  connectedCallback() {
    if (this._connected) return;
    this._connected = true;
    this._applyAttributes();
    this.addEventListener('click', this._boundClick);
    this.addEventListener('keydown', this._boundKey);
    this.ownerDocument.addEventListener('visibilitychange', this._boundVisibility);
    const ViewObserver = this.ownerDocument.defaultView?.IntersectionObserver;
    if (ViewObserver) {
      this._observer = new ViewObserver((entries) => {
        for (const entry of entries) if (entry.target === this) this._inView = entry.isIntersecting;
        this._syncPause();
      });
      this._observer.observe(this);
    }
    this._bindEvents();
    this._syncPause();
  }

  disconnectedCallback() {
    this._connected = false;
    this.removeEventListener('click', this._boundClick);
    this.removeEventListener('keydown', this._boundKey);
    this.ownerDocument.removeEventListener('visibilitychange', this._boundVisibility);
    this._observer?.disconnect();
    this._observer = null;
    this._unbindEvents();
    this._controller.suspend();
    this.setAttribute('data-paused', '');
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this._controller) return;
    if (name === 'mood') {
      this.setBaseMood(MOODS.includes(newValue) ? newValue : 'lazy', 'attribute');
    } else if (name === 'size') {
      this._applySize();
    } else if (name === 'motion') {
      if (newValue !== null && !['auto', 'on', 'off'].includes(newValue)) this.setAttribute('motion', 'auto');
    } else if (name === 'variant') {
      if (newValue !== null && !['full', 'compact'].includes(newValue)) this.setAttribute('variant', 'full');
    }
    if (['label', 'interactive', 'live', 'mood'].includes(name)) this._syncAccessibility();
  }

  _applyAttributes() {
    // Initial HTML attributes are handled by attributeChangedCallback, including
    // upgrade of a pre-existing element. Do not reapply an obsolete mood when
    // a manually controlled element is detached and later reinserted.
    this.setAttribute('data-mood', this._controller.mood);
    this._applySize();
    this._syncAccessibility();
  }

  _applySize() {
    const raw = this.getAttribute('size');
    const size = Number(raw);
    if (raw !== null && Number.isFinite(size) && size >= 8 && size <= 2048) {
      this.style.setProperty('--lekuvo-size', `${size}px`);
    } else {
      this.style.removeProperty('--lekuvo-size');
    }
  }

  _syncAccessibility() {
    const interactive = this.hasAttribute('interactive');
    this.setAttribute('role', interactive ? 'button' : 'img');
    if (interactive) this.setAttribute('tabindex', '0');
    else this.removeAttribute('tabindex');
    const label = this.getAttribute('label')?.trim();
    this.setAttribute('aria-label', label || `Lekuvo, ${this._controller.mood}${interactive ? '. Activate to wave.' : ''}`);
    if (this._status) {
      this._status.setAttribute('aria-live', this.hasAttribute('live') ? 'polite' : 'off');
      this._status.setAttribute('aria-atomic', 'true');
    }
  }

  _renderState(change) {
    this.setAttribute('data-mood', change.mood);
    this._syncAccessibility();
    if (this._status && this.hasAttribute('live')) this._status.textContent = `Lekuvo is ${change.mood}.`;
    const EventClass = this.ownerDocument?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
    if (EventClass) this.dispatchEvent(new EventClass('lekuvo:statechange', { detail: change, bubbles: true, composed: true }));
  }

  _syncPause() {
    const paused = this._manualPause || !this._connected || this.ownerDocument.hidden || !this._inView;
    this.toggleAttribute('data-paused', paused);
  }

  get mood() { return this._controller.mood; }
  set mood(value) { this.setMood(value); }

  setMood(mood, options = {}) { return this._controller.setMood(validateMood(mood), options); }
  setBaseMood(mood, reason = 'base') { this._controller.setBaseMood(validateMood(mood), reason); }
  trigger(eventName, detail = {}) { return this._controller.trigger(eventName, detail); }
  reset() { this._controller.reset(); }
  pause() { this._manualPause = true; this._syncPause(); }
  resume() { this._manualPause = false; this._syncPause(); }

  connectEvents(target = globalThis.window) {
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
      throw new TypeError('connectEvents requires an EventTarget.');
    }
    this.disconnectEvents();
    this._eventTarget = target;
    const token = Symbol('lekuvo-event-binding');
    this._bindingToken = token;
    this._bindEvents();
    return () => { if (this._bindingToken === token) this.disconnectEvents(); };
  }

  disconnectEvents() {
    this._unbindEvents();
    this._eventTarget = null;
    this._bindingToken = null;
  }

  _bindEvents() {
    if (!this._connected || !this._eventTarget || this._eventCleanups.length) return;
    const target = this._eventTarget;
    for (const eventName of APP_EVENTS) {
      const listener = (event) => this.trigger(eventName, event.detail);
      target.addEventListener(eventName, listener);
      this._eventCleanups.push(() => target.removeEventListener(eventName, listener));
    }
  }

  _unbindEvents() {
    for (const cleanup of this._eventCleanups) cleanup();
    this._eventCleanups = [];
  }
}

export function defineLekuvo() {
  if (typeof globalThis.customElements !== 'undefined' && !customElements.get('lekuvo-mascot')) {
    customElements.define('lekuvo-mascot', LekuvoMascot);
  }
  return LekuvoMascot;
}

defineLekuvo();
