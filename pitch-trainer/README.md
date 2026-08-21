# Pitch Trainer — Pitch Uke

An ear-training tool for pitch matching, played on a two-string plucked
instrument rendered in SVG. Pluck the left (reference) string, pluck the
right (target) string, and judge whether the target is sharp, flat, or in
tune. Get it right and the allowed margin tightens; get it wrong and it
eases back off — an adaptive staircase that keeps the exercise at the edge
of what you can actually hear.

## Run it

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8934 --directory pitch-trainer
```

Or any static file server. The root [`index.html`](../index.html) also
links here as "Pitch_Uke_".

## How it works

```
note + interval picker ──► two string frequencies ──► pluck gesture ──► Web Audio oscillator
                                                                              │
                                                        sharp / flat / in-tune answer
                                                                              │
                                                        adaptive cents-deviation staircase
```

- The **reference** string always sounds the chosen pitch class in a fixed
  octave. The **target** string is tuned to the chosen interval above it
  (unison, 4th, 5th, or octave), then nudged sharp or flat by some cents
  deviation — or left exactly in tune.
- Strings are grabbed, bent, and released by dragging on the SVG
  (`onDown`/`onMove`/`onUp`); releasing plays a sine-tone oscillator
  (`playTone`) and the string's on-screen vibration decays on its own
  exponential envelope (`pluckString`), independent of the sound.
- The target string stays muted (dimmed, unpluckable) until the reference
  has sounded at least once that round, so you always hear the reference
  first.
- Difficulty is a classic psychophysics-style adaptive staircase
  (`adjust()`): a correct answer shrinks the allowed deviation (25%, or
  10% once you're oscillating right at your threshold); a wrong answer
  grows it back (30%, 10% near-threshold, or a snap 80% jump after four
  wrong answers in a row to escape a too-hard setting quickly). The
  tightest deviation reached is saved as "best" and only clears on a
  manual reset — it never drifts back up on its own.
- A wrong answer doesn't just advance — it drops into a review step where
  you can re-pluck the target and flip it in/out of tune (`toggleCompare`)
  to hear the difference before moving on.

## Controls

- **Note & interval picker** (top-right chip) — a fixed pitch class or "All
  Notes" (a fresh one every round); a fixed interval (unison/4th/5th/octave)
  or "All" to draw randomly every round.
- **Cents chip** (top-left, next to the gear) — shows the current allowed
  deviation; doubles as a reset button (tap → confirm → back to the easy
  warm-up deviation, best score cleared).
- **Gear → Visual settings** — a full theming panel over the instrument's
  look: Header, Appearance, Body, Rosette, Saddle, Bridge, Vibration
  (pluck decay/tail), Buttons, Feedback, and Preset (save the current look
  as the loaded default, reset to the code-baked defaults, or export/import
  the whole look as JSON).

## Persistence

Both are `localStorage`, per browser, never synced anywhere:

| Key | Holds |
|---|---|
| `pitch-game-v1` | best (tightest) deviation reached |
| `pitch-game-settings-v1` | the visual-settings panel's current look |

Note/interval picker choices are intentionally **not** persisted — every
load starts back on "All Notes" / "All" intervals.

## Files

| File | Role |
|---|---|
| `index.html` | the entire app — markup, styles, and game/visual-settings logic in one file |
| `_reference/` | design reference (`iteration.png` mock, `panel.svg` bridge shape) the current build matches |

Historical visual-experiment sandboxes (`rosette-lab.html`, `strings-lab.html`,
`strings-row.html`, `vibration-compare.html`) predate the in-app Visual
Settings panel and now live in [`../archive/`](../archive/).

## Known limitations

- No automated tests — unlike `sight-reading/`'s `test/` harness, every
  change here is verified by hand in a browser.
- The reference note is always the same fixed octave; there's no
  range/octave control, so low or high registers aren't reachable.
- The interval pool is fixed to four values (unison, 4th, 5th, octave) and
  isn't user-extensible from the UI.
- Single instrument voice — a plain sine oscillator, not a modeled string
  or sampled instrument.
