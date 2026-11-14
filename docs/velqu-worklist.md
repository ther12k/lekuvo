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
