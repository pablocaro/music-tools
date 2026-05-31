# Gesture spec — pinch gating + rotation limits

Status: **draft for review** (not yet implemented)
Scope: touch interaction only — `script.js`. No visual/style changes.

---

## Background: how it works today (verified in source)

**Note model** — `AudioEngine.getNote(index)` ([script.js:502](script.js)):
each slice is one ascending scale step. Slice `0` = root at `rootOctave` (lowest),
slice `sliceCount-1` = highest. So the wheel is **one ring of `sliceCount`
ascending notes** spanning the full 360°. Because the wheel is large and
corner-anchored, only an **arc** of it is on-screen at once; rotating spins
different notes through that arc.

**The seam** ([script.js:920](script.js)): the boundary between the highest note
(slice `N-1`) and the lowest (slice `0`) sits at local angle 0 and is drawn as a
**dashed** gap line — the wrap-around point.

**Rotation** is a CSS transform on the slice group
(`rotate(${rotation}deg)`, [script.js:711](script.js) / [script.js:2122](script.js)).
`state.rotation` is shared by:
- the single-finger gripper drag (the live "spin"),
- its inertia + smooth-follow,
- the panel **Rotation** slider + presets (a design tool, 0–359°),
- `computeDefaultRotation(anchor, sliceCount)` ([script.js:78](script.js)) on load / slice-count / anchor change.

Today rotation **wraps** with `% 360` everywhere
([script.js:2506](script.js), [script.js:2538](script.js), [script.js:2672](script.js)) — infinite spin.

**The gripper ring** = the band `isInDraggableRing(...)` ([script.js:448](script.js)):
`gripRingRadius ≤ distance ≤ innerRadius`, where
`gripRingRadius = innerRadius − grabberWidth·uiScale`.

**Two-finger gesture** ([handleStart, script.js:2388](script.js)):
if **any** finger is in the gripper ring → `startPinch()` → `handlePinch()` →
`applyWidthScale()` ([script.js:2430](script.js), [script.js:2642](script.js), [script.js:3419](script.js)).
"Pinch" = **compress/expand slice width**; rotation is only nudged to keep the
pinch midpoint anchored. If **no** finger is in the ring, both touches fall
through and each presses its slice (multi-note play).

---

## Feature 1 — Pinch compress/expand requires BOTH fingers in the gripper

**Why:** so you can rotate with one finger in the gripper *while playing a note*
with the other finger — without that accidentally compressing/expanding the wheel.

**Change the two-finger branch in `handleStart` ([script.js:2388](script.js)) by
counting how many of the two touches are in the gripper ring:**

| Fingers in gripper | Behavior |
|---|---|
| **2 (both)** | `startPinch()` — compress/expand, exactly as today. |
| **1 (one)** | **NEW:** the gripper finger drives **rotation** (1:1); the other finger **presses its slice** (and may glissando). Simultaneous. |
| **0 (none)** | Fall through — each finger presses its slice (unchanged). |

The single-in-gripper case reuses the existing single-finger rotation path
(`startRotation` / `handleRotation`, [script.js:2470](script.js) / [script.js:2663](script.js)),
which already tracks one finger 1:1 — so rotation feel is unchanged; we just let a
second finger play at the same time.

**Implementation notes / required plumbing:**
- `handleMove` ([script.js:2545](script.js)) currently keys off `e.touches[0]`.
  For the rotate+play combo it must **route by touch identifier**: the gripper
  touch → `handleRotation`; the other touch → slice press/glissando.
- `handleEnd` / `touchend` ([script.js:2740](script.js)) must cleanly end whichever
  finger lifts (stop rotation *or* release the note) and keep the other going.

**Default decisions (flag if you disagree):**
- **Mode is locked at gesture start.** If two fingers start as "both on notes"
  and one later slides into the gripper, it stays 2-note play (no live flip to
  pinch/rotate). Avoids jarring mid-gesture mode changes.
- The note finger in rotate+play mode behaves like a normal press — slide it
  across slices to play different notes.

---

## Feature 2 — Limit rotation at the ends of the note range

**Why:** rotating should stop at the highest note and at the lowest note instead
of wrapping past the seam forever.

**Decisions (confirmed):**
- **Hard stop** — rotation simply can't go past the last note (no rubber-band for now).
- **Play gesture only** — the finger drag *and its inertia* clamp. The panel
  **Rotation** slider + presets stay a free 0–359° design control.

**Behavior:**
- The visible arc can slide from "lowest note (slice 0) at the near edge" up to
  "highest note (slice `N-1`) at the far edge," and no further. The dashed seam
  never enters the play arc.
- At each end the drag stops dead; inertia is killed at the bound (no bounce).

**Implementation approach:**
- During an interaction, track rotation as an **unwrapped** value (drop the
  `% 360`) so clamping is monotonic with no wrap jumps.
- Clamp to `[rotMin, rotMax]` in: `handleRotation` ([script.js:2672](script.js)),
  the smooth-follow loop ([script.js:2506](script.js)), and the inertia loop
  ([script.js:2538](script.js)). Stop inertia when a bound is hit.
- **Computing the bounds** (at gesture start; recompute on resize / slice-count change):
  - `aps = 360 / (sliceCount − 1 + partialFrac)` ([script.js:816](script.js)).
  - `entryAngle = ANCHOR_ENTRY_ANGLES[anchor]` ([script.js:66](script.js)) — near edge of the visible arc.
  - `V` = visible-arc span in slices (from viewport / radii / anchor).
  - `rotMax` (low end): lowest note (slice 0) at the near edge.
    `rotMin` (high end): highest note (slice `N-1`) at the far edge.
  - `V` depends on runtime geometry, so exact endpoints are **calibrated against
    the running app**; the seam staying just out of view is the acceptance test.
- Leave `computeDefaultRotation`, the slider, and presets untouched (gesture-only scope).

**Edge cases to handle:**
- `sliceCount` changes (pinch or stepper) → recompute bounds; if current rotation
  is now out of range, clamp it.
- If the wheel is currently parked outside `[rotMin, rotMax]` by a slider/preset
  ("design" position), a new gesture clamps from the current position toward the
  range rather than snapping.

---

## Feature 3 — Pinch-zoom: no drift, seam never appears

**Why:** two issues in testing — (1) slices **drifted under the fingers** while
pinching, and (2) the original snap-back-on-release felt wrong. User's reframe:
the seam should **never become visible**, since the visible arc is anchored to a
corner (lower-left / upper-right). Both fixed; the snap-back was removed.

### 3a. Live midpoint (drift fix)
The pinch anchors a fixed wheel-point (`pinchF`) under the fingers' midpoint, but
`pinchMidpointAngle` was captured **once** at `startPinch` and never updated. As the
fingers moved, the wheel held the *start* angle, so the grabbed point slid out from
under them. Fix: in `handlePinch`, recompute `pinchMidpointAngle` from the fingers'
**current** midpoint each frame (`pinchF` stays fixed — it's the grabbed point's
identity; only where we pin it tracks the fingers).
Verified headless: stale anchor drifted up to ~1.1 slices under the finger across a
1.0→1.4 zoom; live anchor = 0.00 drift.

### 3b. Rubber-band during pinch + spring-back on release (current)
The seam is rendered at the wheel's local angle 0 ([_renderGapLines `i===0`](script.js)),
so its **on-screen angle === `rotation`**.

History: first a hard clamp ("seam never shows"), but at an end it slid the note out
from under the fingers ("keys disappearing"). User chose the rubber-band middle path
(matches the rotation feel). The earlier hard clamp also exposed two fold/re-entrancy
bugs since fixed (see 3c).

Mechanics:
- `startPinch` captures the range once → `dragState.pinchClamp = {center, half}`
  (from `_computeRotationClamp`).
- `applyWidthScale` soft-clamps the anchored `newRot`: in range the anchor tracks the
  fingers (identity); past a bound the excess is damped asymptotically toward
  `_rotationOvershoot()` (~20°), so the seam **resists** with a small peek instead of
  either sliding the notes or folding. Bound chosen nearest the CURRENT rotation (not
  absolute-nearest) so a desired angle sweeping the blind arc can't fold to the far end.
- On release (both the `handleMove` <2-touch transition and the `handleEnd` catch-all)
  `_springBackAfterPinch()` eases the seam back to the nearest in-range bound with the
  same easeOutCubic/~340ms as the rotation spring. No-ops if the seam is already hidden.

Verified headless: in-range = identity; both ends damp with peek ≤ ~16° (cap 20),
no fold; release targets the correct nearest bound (185→180, 260→270).

### 3c. Shared-clamp bugs fixed (rotation + pinch)
The seam-crossing "gives up" reports were all the clamp losing authority near the
blind arc:
- **Fold-over:** signed distance via modulo flips sign past the blind-arc midpoint, so
  the clamp grabbed the FAR bound. Fixed in the rotation drag/inertia (unwrapped
  offset accumulator) and the pinch (nearest-to-current bound choice).
- **Re-grab mid spring-back:** `_setupRotationClamp`'s "design-park" exemption treated
  a still-easing spring as a deliberate slider park and disabled the clamp. Fixed:
  only exempt positions farther out than any gesture residue (bound + overshoot), and
  `handleStart` now cancels an in-flight `springRAF` on any new touch.

## Out of scope
- No changes to audio, visuals, presets, or the control panel.
- ~~Rubber-band/bounce~~ — implemented (unwrapped-offset rubber-band + spring-back).
