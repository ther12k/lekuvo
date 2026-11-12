/** The twelve supported visual states. */
export const MOODS: readonly [
  "lazy", "awake", "wave", "listening", "dance", "sleep",
  "surprised", "dizzy", "focus", "thinking", "success", "alert"
];

export type LekuvoMood = (typeof MOODS)[number];
export type LekuvoVariant = "full" | "compact";
export type LekuvoMotion = "auto" | "on" | "off";

/** Events the component understands when passed to trigger or connectEvents. */
export const APP_EVENTS: readonly [
  "app:idle", "app:active", "app:focus-start", "app:focus-end",
  "audio:listening-start", "audio:listening-end", "media:play", "media:pause",
  "reminder:due", "task:completed", "app:error", "app:sleep", "app:wake",
  "pointer:wave", "app:busy", "app:ready", "app:dizzy"
];

export type LekuvoAppEvent = (typeof APP_EVENTS)[number];

export interface LekuvoMoodOptions {
  /** Positive milliseconds create a temporary state; otherwise this is a manual override. */
  duration?: number;
  /** Relative priority for a temporary state. */
  priority?: number;
  /** Optional explanation included in the statechange event. */
  reason?: string;
}

export interface LekuvoEventDetail {
  duration?: number;
  priority?: number;
  [key: string]: unknown;
}

export interface LekuvoStateChangeDetail {
  mood: LekuvoMood;
  previous: LekuvoMood;
  reason: string;
}

export type LekuvoStateChangeEvent = CustomEvent<LekuvoStateChangeDetail>;

/**
 * An inline SVG mascot. Import the JavaScript module in a browser to register
 * <lekuvo-mascot>. The mood property reports the currently resolved visual state.
 */
export class LekuvoMascot extends HTMLElement {
  get mood(): LekuvoMood;
  set mood(value: LekuvoMood);

  /**
   * Set a manual state, or a priority-aware temporary state when duration > 0.
   * Invalid mood names throw RangeError. Returns whether the request was accepted.
   */
  setMood(mood: LekuvoMood, options?: LekuvoMoodOptions): boolean;

  /** Known, valid event names return true, including when another state has priority. */
  trigger(eventName: string, detail?: LekuvoEventDetail): boolean;

  /** Change the fallback state without clearing active channels or temporary states. */
  setBaseMood(mood: LekuvoMood, reason?: string): void;

  /** Connect explicitly to an application event bus. Returns an idempotent cleanup. */
  connectEvents(target?: EventTarget): () => void;
  disconnectEvents(): void;

  /** Clear activity state and return to lazy. */
  reset(): void;
  /** Pause visual animation. Activity resolution and expiration still continue. */
  pause(): void;
  resume(): void;

  addEventListener(
    type: "lekuvo:statechange",
    listener: (this: LekuvoMascot, event: LekuvoStateChangeEvent) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;

  removeEventListener(
    type: "lekuvo:statechange",
    listener: (this: LekuvoMascot, event: LekuvoStateChangeEvent) => unknown,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void;
}

/** Idempotently register the custom element. The module also calls this on import. */
export function defineLekuvo(): typeof LekuvoMascot;

declare global {
  interface HTMLElementTagNameMap {
    "lekuvo-mascot": LekuvoMascot;
  }
}
