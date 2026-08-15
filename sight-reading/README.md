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
  dotted-quarter pulse. Two units are in play throughout the code and they are
  worth keeping straight: the clock counts *quarter notes* everywhere, which is
  what makes a tempo mean the same speed in every meter, while a *beat* is the
  pulse a reader counts — a quarter in the simple meters, a dotted quarter in
  6/8. The metronome, the cursor and Hide Ahead all follow the pulse.
- **Notes:** which pitches the line may reach, by octave or one at a time.
- **How musical?** — one dial over two mechanisms. 0 is a plain weighted random
  walk. Rising, the *phrasing* biases come in (contour arch, gap-fill after a
  leap, cadence at phrase ends). Past ~30 the line also starts landing on the
  bar's chord — each bar sits on one, looping I–IV–V–I in major and i–VI–VII–i
  in minor. Which notes have to be chord tones widens as the dial climbs:
  downbeats first, then every beat, then every note.

  The chord is a target for *arrival*, not a filter on every note — the ones in
  between pass through freely. Two guards keep that honest: the pull is dropped
  when no move can reach a chord tone (a stepwise alphabet can never step
  between them — they sit a 3rd apart), and a unison never counts as arriving,
  or standing still would be the cheapest way to obey and the line would drone.

  So the same dial position means different things depending on the alphabet: a
  chord-shaped one comes out as arpeggios, a stepwise one as a scale study that
  lands on the chord at the beats.
- **How chromatic?** — 0 stays in the key. Higher, chromatic passing tones
  fill whole steps and neighbour notes dip a semitone and return. Minor keys
  raise their 7th in dominant bars regardless — that one is what makes a
  cadence lean, not an option.
- **Follow the chords:** pick the progression (roman-numeral pills under the
  musicality dial), and the bar-by-bar chord names draw above the staff while
  the harmony is in play.
- **Hide Ahead:** clears the page behind you to force reading forward. The unit
  sets two things at once — how far ahead the curtain sits, *and* how big a
  block goes at a time. Beats clears a beat at a time, Measures clears a bar.
  Blocks therefore land where the music is already grouped, so a beamed group
  is never cut in half.
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
- The tempo number is a quarter note in every meter, so 6/8 at 80 runs at 80
  quarters rather than the 80 dotted quarters its tempo marking would imply.
  The click and Hide Ahead both follow the felt pulse (two to a 6/8 bar); only
  the tempo number itself still counts quarters.
- Progressions are selectable per mode but fixed in content; 12-bar blues
  still waits on a flat 7 the harmony layer can ask for.
- Chord anchoring has no lookahead: it prefers a chord tone on the beat it is
  currently placing, but never sets up the approach a note early. With a
  stepwise alphabet that caps how often the beats can land on the chord, since
  no step leads from one chord tone to another (measured: ~62% of beats).
- Accidentals are figures, not free pitches: the raised 7th in minor dominant
  bars, chromatic passing tones and chromatic neighbours ("How chromatic?").
  Ascending melodic minor (raised 6th+7th outside dominant bars) isn't there
  yet, and neither are double accidentals — a raise that would need one is
  skipped.

## Roadmap

- **Letting-go mode** — Hide Ahead is the first half of this; what's missing is
  pressure that adapts (speeding up, or widening the curtain, as you succeed).
- Melodic minor ascending; 12-bar blues once the harmony can ask for a flat 7.
- Probability-weighted rhythm figures; rhythm chunks marked below the staff.
- Interval/figure targeting tied to weak spots.
