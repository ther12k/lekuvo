# Lekuvo — animated SVG mascot

Lekuvo is a blue chameleon with a butter-yellow spiral tail and a quietly sleepy personality. This kit turns the character into a live, editable inline SVG component for a notch bar or another web interface.

The core has **no runtime dependencies**. It uses a native custom element, SVG layers, CSS keyframes, and a small JavaScript activity controller. The React adapter is optional and uses your application's existing React installation.

## Run the example

**Fastest:** unzip the kit and open `preview.html` in a modern browser. This file includes the full component and playground, so it works without a server, package installation, or network connection.

To work on the modular source, run from this folder:

```sh
python3 -m http.server 4173
```

Open <http://localhost:4173/demo/>. The modular `demo/index.html` needs HTTP because browsers apply module-loading restrictions to `file:` URLs. The bundled `preview.html` does not have that restriction.

## Files in this kit

| File | Purpose |
| --- | --- |
| `preview.html` | Complete offline playground with 12 mood controls, simulated app events, motion settings, and compact sizes. |
| `src/art.js` | Original layered SVG artwork and CSS animations. |
| `src/state-machine.js` | Framework-independent activity and reaction controller. |
| `src/lekuvo-mascot.js` | Native web component and event subscriptions. |
| `src/lekuvo-mascot.d.ts` | TypeScript declarations for the component. |
| `src/tokens.css` | Optional editable color palette. |
| `react/Lekuvo.tsx` | Optional React adapter with typed imperative methods. |
| `dist/lekuvo-mascot.js` | Single classic script for simple embedding without module loading. |
| `examples/events.js` | Explicit event bus and HTML media integration helpers. |
| `tests/` | Controller tests and browser integration checks. |

After editing source or demo files, run `node scripts/build.mjs` to refresh the two bundled outputs. Run `npm test` for the controller tests. Open `tests/browser.html` for the browser integration checks.

The classic bundle registers the same custom element as the module. Load **one** entry point per page. For a plain HTML integration, put `<script src="./dist/lekuvo-mascot.js"></script>` before the element or wait for `customElements.whenDefined('lekuvo-mascot')` before calling its methods.

## Add Lekuvo to a page

Copy the `src` folder into your application's static assets, keeping its files together. Then import the module:

```html
<link rel="stylesheet" href="./src/tokens.css" />
<script type="module" src="./src/lekuvo-mascot.js"></script>

<lekuvo-mascot
  id="buddy"
  mood="lazy"
  size="160"
  variant="full"
  motion="auto"
  label="Lekuvo, your desktop lookout"
  interactive
></lekuvo-mascot>
```

Importing the module registers `<lekuvo-mascot>`. Calling the exported `defineLekuvo()` again is safe. The optional `tokens.css` provides shared color variables; the SVG also has fallback colors.

An ES module can import the controller and use it immediately after the element exists:

```js
import { MOODS, APP_EVENTS } from "./src/lekuvo-mascot.js";

const buddy = document.querySelector("#buddy");

// A direct selection: replace current activity and keep this mood.
buddy.setMood("awake");

// A temporary greeting: return to the current activity afterwards.
buddy.setMood("wave", { duration: 1500, reason: "welcome" });

console.log(MOODS);      // All twelve valid mood names.
console.log(APP_EVENTS); // Supported application-event names.
```

## Attributes

| Attribute | Default | Meaning |
| --- | --- | --- |
| `mood` | `lazy` | Base/fallback mood; changing this attribute preserves active activities. Use `setMood()` for a manual override. |
| `size` | `160` | Numeric size in CSS pixels, such as `32`, `96`, or `240`; supported range is 8–2,048. |
| `variant` | `full` | `full` for the complete character; `compact` for a small notch presentation. |
| `motion` | `auto` | `auto` respects the device's reduced-motion preference; `on` explicitly enables animation; `off` keeps a still expression. |
| `label` | Component-generated label | Optional accessible name. |
| `interactive` | Absent / false | Opt in to a pointer or keyboard greeting. Boolean attribute: remove it to disable. |
| `live` | Absent / false | Opt in to polite state announcements for assistive technology. |

`interactive="false"` is still a present HTML boolean attribute. Omit the attribute to turn it off. The React wrapper handles this for you.

## Twelve moods

| Mood | Intended use |
| --- | --- |
| `lazy` | Relaxed default, with sleepy eyes. |
| `awake` | Available and attentive. |
| `wave` | A short greeting or acknowledgement. |
| `listening` | Your application has entered its listening activity. |
| `dance` | Music or other media is playing. |
| `sleep` | An explicit sleep state. |
| `surprised` | A short unexpected event or application error. |
| `dizzy` | A playful reaction or an explicitly requested state. |
| `focus` | A focus session is active. |
| `thinking` | A task is running. |
| `success` | A task completed successfully. |
| `alert` | A reminder needs attention. |

These names describe UI states. The component does not independently detect whether someone is tired, attentive, speaking, or working.

## Connect real application activity

No application-event subscriptions are installed automatically. Choose an explicit event bus, connect it, and dispatch events when your application knows that its activity changed:

```js
const appEvents = new EventTarget();
const disconnect = buddy.connectEvents(appEvents);

appEvents.dispatchEvent(new CustomEvent("app:focus-start"));

// Your existing voice workflow emits these; Lekuvo never opens a microphone.
appEvents.dispatchEvent(new CustomEvent("audio:listening-start"));
appEvents.dispatchEvent(new CustomEvent("audio:listening-end"));

// Listening has ended, so the still-active focus session becomes visible again.
appEvents.dispatchEvent(new CustomEvent("task:completed", {
  detail: { duration: 1800 }
}));

// After the success reaction expires, focus resumes.
appEvents.dispatchEvent(new CustomEvent("app:focus-end"));

// On screen/component teardown:
disconnect();
```

You can use `buddy.trigger("media:play")` instead of an event bus. `connectEvents()` with no argument connects to `window`; use that only when a global bus is an intentional part of your application.

The optional [`examples/events.js`](./examples/events.js) provides an explicit bus helper and a helper for observing a real HTML audio/video element:

```js
import {
  createLekuvoEvents,
  bindMediaActivity
} from "./examples/events.js";

const events = createLekuvoEvents(buddy);
const unbindMedia = bindMediaActivity(document.querySelector("audio"), events);

events.emit("app:busy");
try {
  await saveDocument(); // Your application's operation.
  events.emit("task:completed");
} catch (error) {
  events.emit("app:error");
  throw error;
} finally {
  events.emit("app:ready");
}

// Call in this order when this screen is destroyed:
unbindMedia();
events.destroy();
```

### Event mapping

| Event | Result |
| --- | --- |
| `app:idle` | Set the fallback to `lazy`. |
| `app:active` | Set the fallback to `awake`. |
| `app:focus-start` / `app:focus-end` | Start or end persistent `focus`. |
| `audio:listening-start` / `audio:listening-end` | Start or end persistent `listening`. |
| `media:play` / `media:pause` | Start or end persistent `dance`. |
| `app:busy` / `app:ready` | Start or end persistent `thinking`. |
| `pointer:wave` | Temporary `wave`, normally 1,500 ms. |
| `task:completed` | Temporary `success`, normally 1,800 ms. |
| `reminder:due` | Temporary `alert`, normally 2,600 ms. |
| `app:error` | Temporary `surprised`, normally 1,600 ms, with a higher priority than a reminder. |
| `app:dizzy` | Temporary `dizzy`, normally 1,800 ms. |
| `app:sleep` | Enter persistent `sleep` and clear the current temporary reaction. |
| `app:wake` | Leave sleep, set the fallback to `awake`, briefly wave, then resolve the activities still running. |

Every name in this table is application-defined integration: your code must dispatch it. Dispatching `media:play` does not start music, and dispatching `audio:listening-start` does not start voice capture.

### How competing activities resolve

Persistent activities keep their own state. By default, listening has priority over a running task, a focus session, and music. Sleep has the highest default priority. Temporary greetings and notifications can briefly take priority and then return to the activity that is still running.

| Activity | Default priority |
| --- | ---: |
| Music | 30 |
| Focus | 35 |
| Busy / thinking | 45 |
| Listening | 70 |
| Wave / success / dizzy | 80 |
| Reminder | 85 |
| Error | 90 |
| Sleep | 100 |

This is a state resolver, not a notification queue. A superseded temporary reaction is not a promise that it will play later. Keep your application's task or notification log separately.

## JavaScript API

| Member | Behavior |
| --- | --- |
| `buddy.mood` | Read the currently resolved mood. Assigning a mood makes a manual selection. |
| `setMood(mood, options?)` | Without a positive `duration`, clear activity channels and temporary state, then keep the selected mood. With a positive duration, request a priority-aware temporary state. Returns whether the request was accepted. |
| `setBaseMood(mood, reason?)` | Change only the fallback. Active channels and temporary reactions remain. |
| `trigger(eventName, detail?)` | Handle a supported application event. Returns `true` for a recognized, valid event even when a higher-priority state remains visible; unknown events return `false`. |
| `connectEvents(target = window)` | Listen for supported events on an explicit target. Returns a cleanup function. |
| `disconnectEvents()` | Disconnect the current event target. |
| `reset()` | Clear activity state and return to `lazy`. |
| `pause()` / `resume()` | Pause or resume visual animation. Application-state updates and temporary-state expiration continue. |

Options for a temporary `setMood()` call are `{ duration, priority, reason }`. Event details may include `duration` and `priority`; duration must be a finite number from 0 to 60,000 ms and priority a finite number from 0 to 100. Invalid values throw `RangeError`. For temporary application events, `duration: 0` suppresses the reaction; it never creates a permanent override. Invalid explicit mood names throw `RangeError`. An invalid HTML `mood` attribute safely falls back to `lazy`.

Listen for visible state changes:

```js
const onStateChange = (event) => {
  const { mood, previous, reason } = event.detail;
  console.log({ mood, previous, reason });
};

buddy.addEventListener("lekuvo:statechange", onStateChange);

// Remove your own listeners when your application no longer needs them.
buddy.removeEventListener("lekuvo:statechange", onStateChange);
```

The event reflects the resolved visible state. A valid low-priority activity can update internally without producing a different visible mood.

## React and TypeScript

Copy `react/Lekuvo.tsx` alongside `src`. The wrapper uses `React.createElement`, so it does not add a permissive global JSX declaration. The adjacent `.d.ts` file types the browser module and its custom element.

```tsx
"use client"; // Needed only in frameworks that distinguish client components.

import * as React from "react";
import { Lekuvo, type LekuvoHandle } from "./react/Lekuvo";

export function NotchBuddy() {
  const buddy = React.useRef<LekuvoHandle>(null);
  const [events, setEvents] = React.useState<EventTarget | null>(null);

  React.useEffect(() => {
    const bus = new EventTarget();
    setEvents(bus);
  }, []);

  return (
    <div>
      <Lekuvo
        ref={buddy}
        mood="lazy"
        size={64}
        variant="compact"
        motion="auto"
        eventTarget={events}
        interactive
        onStateChange={({ mood }) => console.log(mood)}
        onReady={(element) => element.trigger("pointer:wave")}
      />
      <button
        type="button"
        onClick={() => buddy.current?.trigger("task:completed")}
      >
        Celebrate
      </button>
    </div>
  );
}
```

The runtime imports inside a client effect. Unmount cleanup removes event connections and state listeners; cancelled imports do not attach listeners after unmount. This also handles React Strict Mode's development effect replay.

The React `mood` prop is the **base mood**, applied through `setBaseMood()`. A listening session or a temporary success reaction can take priority. Updating the prop changes the fallback; it does not erase ongoing activities. To make an explicit manual selection that clears activities, call `ref.current?.setMood("awake")`.

The ref exposes `element`, `mood`, `setMood`, `trigger`, `setBaseMood`, `reset`, `pause`, and `resume`. Before the browser element has upgraded, `element` and `mood` are `null`, state-setting calls are no-ops, and `setMood`/`trigger` return `false`. Use `onReady` for work that must happen after loading. `onLoadError` lets your application report a failed module load.

Only a provided `eventTarget` is connected. The wrapper does not silently subscribe to `window`.

## Accessibility and motion

- The mascot has an accessible label. Set `label` when a contextual name is more useful.
- `interactive` enables a keyboard-accessible greeting as well as pointer interaction. Use Tab to focus it and Enter or Space to greet.
- `motion="auto"` follows `prefers-reduced-motion`. `motion="off"` is suitable for an explicitly still character.
- `live` is optional because announcing every visual state is often unnecessary. Keep important application messages in the application's own accessible status UI.
- At small notch sizes, choose `variant="compact"` and keep the surrounding controls' click targets independent of the artwork.
- Motion and expression complement visible text; the mascot should not be the only indication of an error, recording session, or completed task.

## Edit the vector artwork

The character is real inline SVG. Its shapes and animation layers remain editable in the source; there is no required PNG, image CDN, or opaque minified `ae` asset string. Keep the core source files together because the controller imports the artwork module.

The character uses a blue body, yellow belly and spiral tail, cream eyes, and a dark blue outline. Override the inherited custom properties to adjust the palette:

```css
lekuvo-mascot {
  --lekuvo-blue: #4361d7;
  --lekuvo-blue-light: #87a3ff;
  --lekuvo-blue-shadow: #2b409a;
  --lekuvo-butter: #ffe4a0;
  --lekuvo-ink: #19253d;
  --lekuvo-eye: #fff7e8;
}
```

Motion is authored with SVG groups, expression layers, transforms, and CSS keyframes. This kit does **not** promise arbitrary automatic path morphing between any two drawings. Add a new pose by drawing and animating the appropriate layers, then extend the state contract deliberately.

## Scope

This is an embeddable browser component and an integration example. It does not create a native Windows overlay, inspect desktop applications, access an operating-system audio session, collect microphone input, run speech recognition, or implement a notification backend. Connect those features in your application and send their known state changes to Lekuvo.

The demo's controls exercise the component; they are not evidence that an external player, microphone, or desktop service is connected.

## Validation for this version

The 12 automated controller tests pass. They cover competing activities, temporary expiry, restoration of current activity, sleep/wake behavior, cancellation of stale timers, manual overrides, and invalid input. JavaScript source, the generated bundle, and the inline preview scripts pass syntax checks. The base vector artwork has been inspected through a static SVG render; the renderer does not reliably reproduce the browser's CSS transform origins, so it was not used to approve transformed poses or live animation.

The included `tests/browser.html` starts with **Not run yet** and performs 10 integration checks when you press **Run browser checks**. Browser execution was unavailable in the authoring environment because its browser could not open the local preview files. The React adapter has been reviewed but has not been compiled or exercised in a React runtime here. Run the browser checks and your application's React checks before integrating into a released app.
