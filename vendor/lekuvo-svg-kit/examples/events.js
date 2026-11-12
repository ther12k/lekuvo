import { APP_EVENTS } from "../src/lekuvo-mascot.js";

/**
 * Explicit application-event bridge. It does not inspect a microphone, player,
 * operating system, or user inactivity. Your app calls emit when it knows that
 * an activity has started or ended.
 *
 * @param {import('../src/lekuvo-mascot.js').LekuvoMascot} mascot
 * @param {EventTarget} [target] A dedicated bus is used when omitted.
 */
export function createLekuvoEvents(mascot, target = new EventTarget()) {
  if (!mascot || typeof mascot.connectEvents !== "function") {
    throw new TypeError("Pass an upgraded <lekuvo-mascot> element.");
  }

  const knownEvents = new Set(APP_EVENTS);
  const disconnect = mascot.connectEvents(target);
  let destroyed = false;

  return Object.freeze({
    target,

    /**
     * @param {import('../src/lekuvo-mascot.js').LekuvoAppEvent} name
     * @param {import('../src/lekuvo-mascot.js').LekuvoEventDetail} [detail]
     * @returns {boolean} False if the bridge has been destroyed; otherwise true.
     */
    emit(name, detail = {}) {
      if (destroyed) return false;
      if (!knownEvents.has(name)) {
        throw new RangeError(`Unknown Lekuvo application event: ${name}`);
      }
      target.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    },

    /** Call during your screen/component teardown. Safe to call more than once. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      disconnect();
    },
  });
}

/**
 * Bind a real HTMLMediaElement to music activity. Playback remains under your
 * application's control; this function only observes its existing events.
 *
 * @param {HTMLMediaElement} media
 * @param {ReturnType<typeof createLekuvoEvents>} events
 * @returns {() => void} Remove all listeners when the player view is destroyed.
 */
export function bindMediaActivity(media, events) {
  const playing = () => events.emit("media:play");
  const paused = () => events.emit("media:pause");

  media.addEventListener("playing", playing);
  media.addEventListener("pause", paused);
  media.addEventListener("ended", paused);
  media.addEventListener("emptied", paused);

  if (!media.paused && !media.ended) playing();

  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    media.removeEventListener("playing", playing);
    media.removeEventListener("pause", paused);
    media.removeEventListener("ended", paused);
    media.removeEventListener("emptied", paused);
    paused();
  };
}
