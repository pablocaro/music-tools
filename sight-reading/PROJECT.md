# Prima Vista — project notes

The README covers what the app is and how to run it. This file holds the
thinking: why it's shaped the way it is, and where it's going.

## The idea

Sight-reading fluency is pattern recognition under time pressure. The app
attacks it in two modes, one built and one emerging:

- **Seeing** — no clock. You define a vocabulary (intervals, rhythm figures)
  and the engine generates endless fresh lines from it, highlighting the
  patterns so the eye learns to read in chunks instead of note-by-note.
- **Letting go** — the same material with the safety rail removed. Hide Ahead
  clears the page behind the cursor so you must read in front of where you
  are. The missing half is pressure that *adapts* — see the roadmap.

Two principles run through every control:

- **The panel is the exercise; everything else is how you practise it.**
  Every band in the settings panel is something a preset saves. Tempo, click,
  cursor, voice, volume and the reading aids live outside it. When placing a
  new control: preset saves it → panel; doesn't → popover.
- **The vocabulary is explicit.** Nothing is hidden behind a difficulty
  abstraction; you tick the exact intervals and figures in play. Dials
  (musicality, and one day chromaticism) shape *how* the vocabulary is used,
  never *what* it is.

## Architecture in one paragraph

OSME generates a score (its pitch picker replaced by our weighted interval
walk over a diatonic ladder), exports MusicXML, and OSMD renders it. Where
OSMD's behaviour falls short we rewrite the XML on the way through — clef,
6/8 beams. After rendering, app.js reads the engraved geometry back out of
the SVG to draw the chunk highlights and drive the note-by-note hide curtain.
Two units coexist deliberately: the clock counts quarter notes everywhere (so
a tempo means one speed in every meter) while a *beat* is the felt pulse — a
dotted quarter in 6/8 — and the metronome, cursor and Hide Ahead follow the
pulse.

Hidden form elements are the single source of truth for settings; visible
pills and steppers are their faces. One hard-won caveat: range inputs clamp
and snap their own values, so state that must round-trip exactly lives in
opinionless elements. Three separate bugs came from ignoring this.

## Roadmap

Phased so each unblocks the next. ~ one session each unless noted.

### 0 · Groundwork — DONE
- Commit the browser test harnesses as `test/` — they were being rewritten
  from scratch each session, and twice gave false signals.
- Flip `OB_ALWAYS` so onboarding shows once.
- Hide Ahead's lead moves out of a range input (see caveat above).
- The cadence trigger and contour arch still assume a four-quarter bar.

### 0.5 · Instrument onboarding — DONE
"What do you play?" as an onboarding page — melodic instruments plus Other.
Sets clef and range; stored as an app-level preference that `BUILTIN_DEFAULTS`
derives its clef from, so clicking a built-in preset stops stomping a
cellist back into treble. Changeable later from the panel.

### 1 · Harmony you can see — DONE (blues waits on the flat 7)
- Selectable progressions (data + a picker near How Musical?): I–IV–V–I,
  I–V–vi–IV, ii–V–I; i–VI–VII–i, i–VII–VI–V.
- Chord symbols drawn above the staff, so Follow Chords stops being a
  mystery dial and reading symbols becomes a skill of its own.
- 12-bar blues waits for accidentals (needs the flat 7).

### 2 · Accidentals — DONE except melodic minor (rule 2)
The structural one. The walk stays diatonic; each note gains an alteration
(−1/0/+1) chosen by rule:
1. raised 7th in minor V bars — the leading tone; minor finally cadences
2. raised 6th+7th ascending — melodic minor
3. chromatic passing tone
4. chromatic neighbour
Stop there (no secondary dominants). Behind a "How chromatic?" dial: 0 never,
low = leading tones, higher = passing chromatics. The Notes grid governs
scale degrees; accidentals ride along with their degree. Notation is free —
emit `<alter>` and OSMD draws the sharp from the key signature.

### 3 · Rhythm depth — DONE
- Triplets: durations already work ([1,12]); add the `<time-modification>`
  XML pass so brackets and the 3 render. Same technique as the 6/8 beams.
- Weighted figures: a cell's tap cycles off → ✓ → ×2 → ×4, mirroring the
  interval weights; the pattern bag duplicates cells by weight.

### 4 · Phrasing — slurs and motifs DONE; ties remain
- Ties across barlines: split-and-tie notes longer than the space left. The
  one piece NOT built in the full pass: today the generator never draws a
  cell longer than the room remaining, so ties mean deliberately allowing
  longer draws and then splitting them — which touches playback onsets, the
  hide curtain's note indexing (a tied pair is two rendered notes but one
  sounding event) and the chunk analyzer. A session of its own.
- Slurs as bowing patterns ("2 slurred 2 separate", "4 slurred") — a bow
  instruction, so a genuine reading skill, not decoration.
- Rhythmic motifs: state an idea, repeat it varied, answer it — rhythm's
  counterpart to the musicality dial, and the thing that stops generated
  lines sounding generated.

### 5 · The feedback loop — ramp DONE; the rest needs a decision
Adaptive letting-go and weak-spot targeting both need the app to know how
you're doing, and it currently has no input at all. Options, cheapest first:
time-based ramping (no input; a workout, not an assessment), tap-along
rhythm scoring, self-report, microphone (a different project). Start with
the ramp.

### Cut
Chord-anchoring lookahead — measured at ~5 percentage points on stepwise
alphabets for a two-ply search. Not worth it.

## Testing

`test/` holds browser harnesses run against a local server:

```sh
python3 -m http.server 8091 --directory sight-reading &
node sight-reading/test/sweep.js      # highlighter integrity, presets × meters
```

They measure the running app — chord-tone rates, beat crossings, hidden-note
prefixes — because most of what matters here is invisible in a diff. Two
lessons paid for: a test that hangs is not evidence the app is broken, and a
test that pokes hidden form elements directly can bypass the code path users
actually take. Drive the visible controls.
