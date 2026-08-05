# Prima Vista — Seeing Mode

A practice tool for building sight-reading **fluency** on violin. You define a
*vocabulary* — which melodic intervals and which rhythmic figures are allowed —
and the engine generates endless fresh exercises from it. Recognizable patterns
are highlighted on the staff (cyan = stepwise, lime = leaps) to train the eye
to read in chunks instead of note-by-note.

This is **Seeing mode**: pattern recognition with no time pressure. It's the
first of a planned progression toward a "letting-go" trainer that forces reading
ahead under pressure.

> For the philosophy, the full build arc, and an architecture/handoff overview,
> see **[PROJECT.md](PROJECT.md)**.

## Run it

No build step. Serve the folder and open it:

```sh
python3 serve.py          # serves on http://localhost:8091/ (no-cache)
```

Or any static server (`python3 -m http.server`, etc.).

## How it works

```
controls ──► OSME generates a sheet ──► export MusicXML ──► OSMD load + render ──► highlight the chunks
             (pitch picker overridden)                      (standard pipeline)
```

- **OSME** (bundled in `lib/osme.js`) is the music engine; **OSMD** renders it to
  SVG. The bundle is a prebuilt, vendored artifact.
- We don't use OSME's random pitch picker. `engine.js` overrides it with an
  **interval walk**: starting on the tonic, each next note is chosen by drawing a
  weighted interval (the alphabet matrix) and stepping along the diatonic ladder,
  staying in key and inside the chosen note range.
- Generation goes out as MusicXML and back in through OSMD's standard
  `load() → render()` so render options (auto-beaming, layout) actually apply.
- After rendering, `app.js` reads each notehead's SVG position back out of OSMD
  and draws the chunk highlights on an overlay. Each run's first and last
  noteheads are opposite corners of a block, which multiply-blends so the
  notation reads straight through the colour.

## Controls

- **Intervals — the melodic alphabet:** one row per interval (unison…octave).
  Tick it to allow the move, and slide *less → more* to set how often it turns
  up. Presets save to the browser (`localStorage`).
- **Rhythm — the figures:** the meter (2/4, 3/4, 4/4, 6/8) plus which note
  values are in play. 6/8 swaps in a compound-time figure set built on the
  dotted-quarter pulse.
- **Notes:** which pitches the line may reach, by octave or one at a time.
- **How musical?** — 0 is a plain weighted random walk. Higher, contour,
  gap-fill and cadence biases start shaping the line into phrases.
- **Follow chords?** — each bar sits on a chord (I–IV–V–I, looping). At 0 the
  chords are ignored; at the top every note is a chord tone and the line
  arpeggiates. This is what the *Arpeggios* preset turns all the way up.
- **Clef & key, Measures, Highlight patterns.**

## Files

| File | Role |
|------|------|
| `index.html` / `style.css` | markup + styling |
| `engine.js` | generation layer — OSME overrides, interval walk, diatonic ladder |
| `app.js` | UI, render pipeline, Seeing-mode highlight overlay |
| `i18n.js` | the English/Spanish string catalogue |
| `lib/osme.js` | prebuilt OSME + OSMD bundle (vendored) |
| `serve.py` | tiny no-cache dev server |

## Known limitations

- Rhythm figures are equally weighted (on/off), not yet probability-weighted.
- The chord progression is fixed at I–IV–V–I; it isn't selectable yet.
- "How musical?" reads strong beats as though the meter were 4/4, so its
  strong-beat bonus lands wrong in 3/4 and 6/8.

## Roadmap

- **Letting-go mode** — hide measures as you reach them to force reading ahead.
- Selectable chord progressions (I–V–vi–IV, ii–V–I, 12-bar blues).
- Probability-weighted rhythm figures; rhythm chunks marked below the staff.
- Interval/figure targeting tied to weak spots.
