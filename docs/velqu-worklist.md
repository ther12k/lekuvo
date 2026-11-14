# velqu-view work list — from the Lekuvo notch port (prioritized by visual impact)

Evidence sources: pixel-diff passes vs the reference UI (a1f236e), tab-icon bake,
perf work (4b187e5), and the running morph/drag profiling pass.

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
