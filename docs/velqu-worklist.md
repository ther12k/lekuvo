# velqu-view work list — from the Lekuvo notch port (prioritized by visual impact)

Evidence sources: pixel-diff passes vs the reference UI (a1f236e), tab-icon bake,
perf work (4b187e5), and the running morph/drag profiling pass.

## Status (2026-11-15)

P0 + the spring half of P1 shipped in velqu-view `host-write-api`
(commits `27910c4` + `8699042`, ADR 0026/0027):

1. **Gradients — DONE, ADOPTED.** `linear-gradient`/`radial-gradient` parse
   (angles, `to <corner>`, ellipse/circle sizes, `at` positions, px/% stops,
   hard stops), geometry resolves at emit, per-pixel painter fill; `hsl()`/
   `hsla()` color parsing added. The app's card wash is now the real
   reference gradient (`lk-wash-*` on `#card-surface`); the fake
   `lk-corner` blob + its 70px feather shadow are gone. `var()` inside
   stops is not resolved yet (declaration skips gracefully) — inline the
   values or wait for custom properties.
2. **Crisp 1px borders — DONE.** Coverage rasterization (ADR 0026): rings
   paint at true partial coverage at any fractional position.
3. **Subpixel layout — DONE.** The painter no longer snaps edges; exact
   span fractions + SDF/4×4-subsample coverage. 8/18 velqu-view fixture
   digests re-pinned after audit (AA edges only, geometry identical).
4. **Springs — DONE, ADOPTED.** Physical damped oscillator on the virtual
   clock, momentum-preserving retargets,
   `transition-timing-function: spring(k, d[, m])`, `box-shadow` (first
   layer) animatable, no authored duration needed. The card morph runs
   `spring(200, 26, 1)` (ζ ≈ 0.92 — one gentle overshoot, ~0.65s settle,
   momentum carried through mid-morph taps).
5. **Damage-region painting — DONE** (perf stream, same batch): display-list
   diff → repaint window; `LEKUVO_PERF=1` instruments every phase.

Morph bench on the real card (single-pass shadow + scoped damage + wash
gradient + spring): render p95 14.6ms, interval p95 16.0ms — the 22ms gate
passes with the morph completing its full spring settle (40 frames).

**Bench caveat:** the binary discovers resources via
`discover_resources()` → the INSTALLED copy `~/.local/share/lekuvo/app`
(stale, Nov 13 — predates the `:style` width/height morph, so benches run
the old `vx-show` design). Dev benches must set
`LEKUVO_APP=<repo>/app`, or reinstall. With the real document the morph
bench is the honest gate.

## P0 — quality blockers (what makes it "look bad")
1. **Gradients** (linear + radial, per-corner): today the card's tab wash is an
   approximated flat blob + blurred shadow; the reference is a corner radial that
   fades to transparent. Same for noise tiles and the focus ring glow.
   Needs: `background: radial-gradient(...)`/`linear-gradient(...)` parsing +
   painter fill (per-scanline color lerp is enough; no GPU needed).
2. **Crisp 1px borders on rounded rects**: hairlines (`border-white/10`) wobble or
   disappear at some radii — user-visible "bad border". Likely AA/coverage issue at
   the border ring path; a signed-distance or inner/outer-rect stroke would fix.
3. **Subpixel layout/positioning**: elements snap to integer px; the reference uses
   fractional spacings (`gap-2.5`, `p-[2.5px]`, 15.5px text) so rhythm reads off.
   Layout should carry f32 to paint and only rasterize text/borders at device px.

## P1 — animation system (answers the "animation library" question)
4. No external lib fits: velqu is a custom layout+paint engine; libs don't know the
   frame scheduler or damage regions. Instead finish the animation plan in anim.rs:
   - **Springs** (damped harmonic oscillator — framer-motion's model, ~100 lines:
     x'' = -k(x-target) - c·x'; expose stiffness/damping/mass per transition)
   - **vx-transition** directive with enter/leave stages (plan ADR)
   - Transition of `width/height/border-radius/transform/opacity/box-shadow`
   - One paint per tick aligned to the ticker (perf agent is measuring this now)
5. **Damage-region painting** (perf agent may already have a patch): morph frames
   repaint only pill+card bounds; drag moves repaint nothing.

## P2 — polish
6. Fractional DPI (scale-factor ≠ 1) correct text/border rasterization.
7. `text-wrap: balance/pretty`, letter-spacing for the display font (Outfit reads
   tighter in the reference).
8. Focus-visible pseudo-state (keyboard path) — frozen-set ADR 0011 extension.

## P0 additions (found 2026-11-15, user screenshot + pixel proof)
9. **background-image must composite over background-color**: when a gradient
   background-image is present, the painter drops the solid background-color
   fill — wherever the gradient is transparent, the surface vanishes (the card
   showed the desktop through it; measured 61% desktop pixels inside the card).
   Interim app fix: opaque navy underlay div + wash on a separate layer.
10. **Text vertical centering in flex/pill shapes**: text sits off-center inside
    buttons/pills (baseline vs content-box math). App mitigation: line-height:1
    on .lk-btn. Needs correct baseline/line-box handling in text layout.

## P0 addition 11 (found 2026-11-15, blocks washes + hanging mascot)
11. **position:absolute must remove children from flow**: the compiler accepts
    `absolute` but the layout engine keeps those children in flow (an inset-0
    overlay adds a full-size flex box; the hanging mascot shifts the footer).
    Needed: out-of-flow positioning with relative-parent coordinates + z-order.
    (Interim hacks in the app: negative-margin overlap for the mascot — fragile.)

## Item 10 evidence (re-measured 2026-11-15, controlled probe matrix)
Repro: LEKUVO_SNAPSHOT_HEADLESS system.png; ink-core centroid vs shape center.
Supersedes the earlier baseline theory — alpha text, :class ternaries, borders,
backgrounds, and line-height were all exonerated by controlled probes.

**The rule (deterministic across runs):** a flex container that is itself a
flex child places its inline TEXT runs at the content-box origin (top-left)
instead of centered. Offset ≈ −7..−10px on 32px shapes.

Probe matrix (32px round chips, text "Xy", static classes):
| case | d from center |
|---|---|
| A tailwind flex utilities, light bg + ink text | (−7.4, −6.6) |
| B tailwind flex, dark bg + light text | (−10.4, −6.8) |
| B' same, text wrapped in `<span>` | identical (−10.4, −6.8) |
| D author-CSS `display:flex;align-items:center;justify-content:center` | (−10.4, −6.8) |
| E with `border-2` | (−7.5, −4.9) |
| F content-sized `h-8 items-center` (flow width) | vertical −6.9 |
| parent changed to `grid grid-cols-4` | still (−8.7, −9.0) |

Controls that DO center correctly:
- `<img>` children of flex-in-flex (grip/close/prev/next: ±0.5px)
- text in a NON-flex flow button (`Exit`, `px-2.5 py-1`): ±0.5px
- calendar day cells (`.cal-cell` CSS flex, `vx-text` content, grid parent): ±2px
- element boxes (divs/spans with explicit sizes, e.g. play/pause bars): ±1px

App impact today: system chips WF/BT/DN/DM, pin "P", focus "R"/"3s", calendar
chevrons, todo nudge "!", noise tile letters, home device-kind letters — all
raw-text-in-flex children of flex rows. Mitigations attempted that do NOT
work: opaque pre-blended colors (`lk-fog*` classes kept — they're the correct
visual color either way), span-wrapping, grid parents, line-height tweaks.
Working mitigations: bake the label as an `<img>` (icons are exempt), or make
the button a non-flex flow box (Exit pattern). The lucide icon bake replaces
nearly all affected labels with imgs — tracked as the app-side fix.

## P0 addition 12 (found 2026-11-15, probe G collapsed)
12. **Block flex-children lose width/height utilities**: a `w-8 h-8` div
    with NO `flex` class, placed inside a flex parent, rendered as a ~1px
    sliver — the width/height utilities did not size the flex item (it
    collapsed to content width 0). Flex items that carry `flex` themselves
    size fine. Repro: probe G in the session matrix (32px round chip,
    block display, bg fill — vanished to a 1px column).

## P1 feature requests — UX completeness (2026-11-15 UI review)
Not bugs; capabilities the reference UX needs that the profile lacks today.
Ordered by UX unlock:
- **Text input** (`<input>`/`contenteditable` + key events): To-do add/rename
  is impossible in-page today. Biggest missing interaction.
- **Pointer-drag events** (press → move stream → release on one element):
  continuous seek scrubbing, Mixer volume sliders, brightness. Click-only
  today (the 10-segment seek bar is the workaround).
- **Author-CSS `@keyframes` + `animation-delay`**: the EQ bars are static
  (`animate-pulse` is baked but uniform — bars pulse in sync, and the music
  panel's bars have no animation at all). Staggered per-bar animation needs
  custom keyframes with per-element delay.
- **Image tint/mask (currentColor)**: icons bake two PNGs per glyph (white +
  ink). A tint/filter would halve the asset set and enable state colors.
- **`margin: auto`** (`ml-auto` deferred): worked around with `flex-1`
  spacers; only console-noise today.
