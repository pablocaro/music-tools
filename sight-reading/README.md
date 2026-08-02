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

- **Notes — the alphabet:** a matrix of intervals (unison…octave) × direction
  (down/up). Each weight (0–4) is how *often* that move is used. Presets save to
  the browser (`localStorage`).
- **Rhythm — the figures:** check which note values are in play (whole … sixteenth),
  plus an option to include rests.
- **Range:** lowest and highest note the melody may reach.
- **Key, Measures, Show chunks.**

## Files

| File | Role |
|------|------|
| `index.html` / `style.css` | markup + styling |
| `engine.js` | generation layer — OSME overrides, interval walk, diatonic ladder |
| `app.js` | UI, render pipeline, Seeing-mode highlight overlay |
| `lib/osme.js` | prebuilt OSME + OSMD bundle (vendored) |
| `serve.py` | tiny no-cache dev server |

## Known limitations

- Rhythm figures are equally weighted (on/off), not yet probability-weighted.
- Time signature is fixed at 4/4.

## Roadmap

- **Letting-go mode** — hide measures as you reach them to force reading ahead.
- Probability-weighted rhythm figures; rhythm chunks marked below the staff.
- Interval/figure targeting tied to weak spots.
