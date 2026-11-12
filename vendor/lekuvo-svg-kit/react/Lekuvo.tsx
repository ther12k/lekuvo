"use client";

import * as React from "react";
import type {
  LekuvoEventDetail,
  LekuvoMascot,
  LekuvoMood,
  LekuvoMoodOptions,
  LekuvoMotion,
  LekuvoStateChangeDetail,
  LekuvoStateChangeEvent,
  LekuvoVariant,
} from "../src/lekuvo-mascot.js";

/** A safe imperative handle; the element is null until its browser upgrade completes. */
export interface LekuvoHandle {
  readonly element: LekuvoMascot | null;
  readonly mood: LekuvoMood | null;
  setMood(mood: LekuvoMood, options?: LekuvoMoodOptions): boolean;
  trigger(eventName: string, detail?: LekuvoEventDetail): boolean;
  setBaseMood(mood: LekuvoMood, reason?: string): void;
  reset(): void;
  pause(): void;
  resume(): void;
}

export interface LekuvoProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** The fallback mood; event-driven activity can temporarily take priority. */
  mood?: LekuvoMood;
  /** Render size in CSS pixels. */
  size?: number;
  variant?: LekuvoVariant;
  motion?: LekuvoMotion;
  label?: string;
  interactive?: boolean;
  live?: boolean;
  /** No global events are connected unless a target is explicitly provided. */
  eventTarget?: EventTarget | null;
  onStateChange?: (
    detail: LekuvoStateChangeDetail,
    event: LekuvoStateChangeEvent
  ) => void;
  onReady?: (element: LekuvoMascot) => void;
  onLoadError?: (error: unknown) => void;
}

/**
 * React 18/19 adapter. The runtime import happens in an effect, so rendering this
 * wrapper on a server does not evaluate the browser-only custom-element module.
 * Frameworks with server/client components should use this in a client component.
 */
export const Lekuvo = React.forwardRef<LekuvoHandle, LekuvoProps>(
  function Lekuvo(
    {
      mood = "lazy",
      size = 160,
      variant = "full",
      motion = "auto",
      label,
      interactive = false,
      live = false,
      eventTarget,
      onStateChange,
      onReady,
      onLoadError,
      ...htmlProps
    },
    forwardedRef
  ) {
    const elementRef = React.useRef<LekuvoMascot | null>(null);
    const callbacksRef = React.useRef({ onStateChange, onReady, onLoadError });
    const [ready, setReady] = React.useState(false);

    React.useEffect(() => {
      callbacksRef.current = { onStateChange, onReady, onLoadError };
    });

    React.useEffect(() => {
      let disposed = false;

      // Repeated imports share the browser module. defineLekuvo is idempotent.
      void import("../src/lekuvo-mascot.js")
        .then(async ({ defineLekuvo }) => {
          if (disposed) return;
          defineLekuvo();
          await customElements.whenDefined("lekuvo-mascot");
          if (!disposed) setReady(true);
        })
        .catch((error: unknown) => {
          if (disposed) return;
          const report = callbacksRef.current.onLoadError;
          if (report) report(error);
          else console.error("Lekuvo could not load its SVG runtime.", error);
        });

      return () => {
        disposed = true;
      };
    }, []);

    React.useImperativeHandle(
      forwardedRef,
      (): LekuvoHandle => {
        const getElement = (): LekuvoMascot | null => {
          const element = elementRef.current;
          return element && typeof element.setMood === "function"
            ? element
            : null;
        };

        return {
          get element() {
            return getElement();
          },
          get mood() {
            return getElement()?.mood ?? null;
          },
          setMood(nextMood, options) {
            return getElement()?.setMood(nextMood, options) ?? false;
          },
          trigger(eventName, detail) {
            return getElement()?.trigger(eventName, detail) ?? false;
          },
          setBaseMood(nextMood, reason) {
            getElement()?.setBaseMood(nextMood, reason);
          },
          reset() {
            getElement()?.reset();
          },
          pause() {
            getElement()?.pause();
          },
          resume() {
            getElement()?.resume();
          },
        };
      },
      []
    );

    React.useEffect(() => {
      if (!ready) return;
      const element = elementRef.current;
      if (!element) return;

      const listener = (event: LekuvoStateChangeEvent) => {
        callbacksRef.current.onStateChange?.(event.detail, event);
      };
      element.addEventListener("lekuvo:statechange", listener);
      return () => {
        element.removeEventListener("lekuvo:statechange", listener);
      };
    }, [ready]);

    React.useEffect(() => {
      if (ready) elementRef.current?.setBaseMood(mood, "react:base-mood");
    }, [ready, mood]);

    React.useEffect(() => {
      if (!ready || !eventTarget) return;
      return elementRef.current?.connectEvents(eventTarget);
    }, [ready, eventTarget]);

    React.useEffect(() => {
      const element = elementRef.current;
      if (ready && element) callbacksRef.current.onReady?.(element);
    }, [ready]);

    return React.createElement("lekuvo-mascot", {
      ...htmlProps,
      ref: elementRef,
      size: String(size),
      variant,
      motion,
      label,
      interactive: interactive ? "" : undefined,
      live: live ? "" : undefined,
    });
  }
);

Lekuvo.displayName = "Lekuvo";
export default Lekuvo;
