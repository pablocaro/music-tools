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

- **One shape per contract.** A switch is on/off and nothing else; a cycle pill
  advances through a named set (C, Major, Marimba); an opt row picks from a
  small visible set, one or many. Binary state used to have four shapes, and
  worse, the pill reading "On" was the same control as the pill reading "C" —
  which is not a state you flip but a value you advance. Ties keeps its opt row
  because it is three states, and Hide Ahead keeps its stepper because a switch
  cannot say "4 beats".
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
- Selectable progressions (data + a picker under the Musicality switch): I–IV–V–I,
  I–V–vi–IV, ii–V–I; i–VI–VII–i, i–VII–VI–V.
- Chord symbols drawn above the staff, so Follow Chords stops being a
  mystery dial and reading symbols becomes a skill of its own.
- Dominant sevenths: V carries its 7th in both the chord-tone set and the
  symbol. Adding it exposed a real bug — the cadence rule pulled phrase
  endings to the *tonic* whatever the chord was, so a progression ending on
  V (a half cadence) fought its own harmony in the bar that mattered most.
  The bonus now targets the current chord's root; with I last, that is the
  old constants exactly.
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
- Weighted figures: a cell's tap cycles off → ✓ → ×2, and the pattern bag
  duplicates cells by weight. It ran to ×4 at first. Nobody could hear the
  difference — against a handful of other lit figures, ×2 and ×4 both read as
  "mostly this one" — and the fourth rung made getting back to off something you
  had to count. Every shipped preset had already stopped at ×2.

### 4 · Phrasing — DONE
- Ties across barlines. The trick that made this cheap: don't split a long
  note, *extend* the bar's last one by whole pulses of the next bar. Both
  halves stay notatable and the next bar stays beat-aligned, because the tie
  eats exactly one or two cell-sized slots off its front. The far side skips
  the interval walk and inherits its alteration outright (deriving one would
  return a natural for a G♯ held out of a V bar); playback merges the pair
  into one attack; the chunk highlighter skips continuations, which would
  otherwise read as a unison and break the run at the barline.
- Slurs — one instruction to every instrument (one bow, one tongue, one
  breath), so a genuine reading skill, not decoration. Lengths are
  multi-select and each group is drawn from what is lit, so the line phrases
  in a mixture rather than one length over and over; the rhythm figures work
  the same way, and this row being pick-one was the odd one out. Nothing lit
  means no slurs, so there is no Off pill.
  - 1 is the separate bow. Alone it says nothing — every note on its own is
    exactly "no slurs" — but mixed with 2 or 3 it is what puts air between
    the groups. (Which is why the earlier "there is no group of 1" was only
    true while the row was pick-one.)
  - Slurs run through barlines. Per-bar grouping stranded the tail of every
    bar the group did not divide: "slur in 2s" in 3/4 joined two notes and
    left the third bare, in every bar. Where the group does divide the bar
    the chain re-aligns by itself, so the meters that already looked right
    were untouched.
  - A tied note counts once however many noteheads it is written with. A tie
    and a slur are the same curve meaning opposite things, so a slur that
    restarted on the far side of a tie made the line unreadable.
- Still open: "2 slurred, 2 separate" as a repeating *pattern*. A random mix
  of 1s and 2s gives variety; the drill wants regularity. Different exercise,
  not subsumed by multi-select.
- Natural next step: let a phrase pick a slur pattern and repeat it, the way
  rhythm motifs already work, instead of drawing each group independently.
- Rhythmic motifs: state an idea, repeat it varied, answer it — rhythm's
  counterpart to musicality, and the thing that stops generated
  lines sounding generated.

### 4.5 · Onboarding asks both axes — DONE
The vocab page grew a second row. It is two named vocabularies and then
everything, twice: Steps / Thirds / A Mix, and Quarters / Eighths / A Mix. The
ordered version it replaced (Steps Only / Thirds / Wide Leaps) was wrong about
its own data — only "steps only" is a real restriction, `[0,4,0,0,0,0,0,0]`,
while thirds and wide leaps are both mixtures with different centres of
gravity. "A bit of everything" is also the honest end state, because real
reading is not restricted.

Both rows on one page, because one bar of preview can only answer both
questions if both are asked together; split across pages each gets half a
preview. The rhythm row writes the figure grid directly rather than going
through a preset — the interval built-ins deliberately carry no rhythm so that
switching between them leaves your figures alone, and `presetMatchesPanel`
skips a preset's absent keys, so the title still reads the drill's name instead
of falling to Custom.

The preview draws a bar rather than four loose notes, since rhythm means
nothing without a measure, and everything that moves is a transform on a CSS
variable: the note's place, its stem's length (a rect scaled on Y, so the
stroke width does not scale with it), and the beam's height. Nothing animates a
geometry attribute, so the bar glides in every engine rather than only where
cx/cy/r happen to be animatable — and it glides through a change of interval
even with beams overhead, because the x positions depend only on the durations.

### 4.6 · Musical lines — DONE, all six milestones
A campaign against the ways the walk still sounds like a walk, measured end
to end by `test/melody.js` (built first, engine touched second). Standing
rules for every entry: no rule ever names a preset, progression, key or
meter — everything is derived from membership tests the engine can run on
any chord it is handed; everything is a weighted preference, never a pick
(a looping progression fed a deterministic rule prints the same four bars
forever); everything scales by what the alphabet can reach; everything
rides musicality, so off stays a pure random walk.

1. **Tendency tones — DONE.** A note that belonged to the last bar's chord
   but not this one owes its resolution to the nearest tone of the chord
   that displaced it — leading tone up and dominant seventh down fall out
   as instances of a rule that never asks which chord it is looking at.
   Knees in at 0.6, above the chord pull, because resolving between chords
   means nothing until the line lands on chords at all. At the top of the
   dial, leading-tone resolution went 19→57% (Arpeggios), 33→67% (Mixed),
   36→58% (Cadences); the seventh falling went 32→50/77/56%. A tie across
   the seam defers the obligation to the note after the hold, which is
   where a suspension resolves anyway.
2. **Seam smoothing — DONE.** Every chord change now prefers the nearest
   arrival, at about a third of the obligation's strength — a nudge, and
   confined to the barline, because the leaps *inside* a bar are what an
   arpeggio drill is for. The common tone is the exception to the unison
   guard: across a change a held note that belongs to the incoming chord
   is the chord moving underneath it, not loitering, so the seam is the one
   place a unison counts as an arrival. Mean seam width at full dial:
   2.37→1.78 (Arpeggios), 2.25→1.66 (Mixed), 1.79→1.25 (Cadences) staff
   steps against a nearest-available floor of ~1.3 — Cadences lands under
   the floor because its common tones arrive at distance zero.
3. **Momentum and the starting note — DONE.** A step begun prefers to
   carry; after a leap gap-fill still turns the line, except for the
   chordal skip — chord tone to chord tone in the same direction is an
   arpeggio being spelled, not a gap. Mean same-direction runs went
   1.6→2.0–2.15 at full dial, with Arpeggios moving most because its turns
   were the structural ones. And the opening note stopped being `PMIN`
   every time: it is drawn from a comfort curve peaking a third of the way
   up the range, restricted to the first bar's chord tones once the dial
   is on (root favoured). Five to six distinct openings per 18 exercises,
   all chord tones; at dial zero the chord is not consulted.
4. **Antecedent/consequent — DONE.** First and third phrases end ON their
   chord but OFF its root (the classical imperfect close: settled enough to
   breathe, unsettled enough to need the next phrase); second, fourth and
   the final bar land the root. Parity is the whole test, so a period falls
   out of any progression at all. Two mechanisms made it work: the bar's
   FINAL note carries most of the cadence weight, and the notes before it
   aim NEXT to the root rather than onto it — rewarding an early root was
   self-defeating, since the unison ban forces the line off it and it
   rarely gets back in one move. Questions open ~80%, answers close ~66%,
   from chance (~50/~40).
5. **Non-chord tones have jobs — DONE.** Two rules, both sides of one
   coin: don't leap onto a dissonance (damping, so the rate of non-chord
   tones is not inflated — only their treatment), and once on one, leave
   by step — a repeated dissonance counts as a postponed job and is
   penalised the same. Strong enough to overrule a 3rd-heavy alphabet on
   purpose: the alphabet is vocabulary, dissonance treatment is grammar.
   Entries by step ~84%, complete passing/neighbour figures ~51% (from
   ~33%), with the residual exits owned by rules that legitimately outrank
   the step (seam obligations, cadence landings). Side benefit measured,
   not planned: obliged seam resolutions rose to 94–98% and the dominant
   seventh's fall to ~65%, because the seventh IS a dissonance leaving by
   step.
6. **Pitch motif and sequence — DONE.** The phrase-start bar records the
   deltas the walk actually took (post-reflection: the shape remembered is
   the shape that sounded); an echo bar replays them at the same note
   ordinals as a strong preference. A tonal sequence, not a real one — the
   exact interval scores highest, same-direction-nearly-the-size scores
   most of it, and the chord pull is left free to bend the shape into each
   new harmony, which is how sequences actually climb. The echo bar's
   first note is placed by the seam rules like any note, so the harmony
   picks each repetition's transposition. Contour similarity between a
   phrase's opening bar and its echoes: ~27% exact-delta (from 7–18%
   chance), with the strict metric underselling what the page shows —
   bars visibly rhyme, and descending two-note sequences appear.

### 5 · The feedback loop — ramp built, then cut; the rest needs a decision
Adaptive letting-go and weak-spot targeting both need the app to know how
you're doing, and it currently has no input at all. Options, cheapest first:
time-based ramping (no input; a workout, not an assessment), tap-along
rhythm scoring, self-report, microphone (a different project). Start with
the ramp.

### 6 · Harmony instruments — promised in the UI, so it is now owed
The instrument page says "Piano and other harmony instruments are coming",
because piano is the loudest absence on that list and a pianist who scans the
row and does not find themselves cannot tell "not supported" from "not yet".
Saying so costs one line; the line is a debt.

It is the largest phase here, because almost everything downstream of the
generator assumes one note sounding at a time:
- The walk produces a melody. A grand staff needs two voices with a harmonic
  relationship between them, not two independent walks — and the progression
  layer is the obvious place that relationship comes from, since it already
  knows the chord under every bar.
- Two staves means a piano part in the MusicXML and a brace in OSMD, plus a
  clef control that stops being one choice.
- Hide Ahead and the chunk highlighter both read the engraved SVG left to
  right and assume a single line of noteheads. Two staves breaks the ordering
  they depend on, not just the geometry.

A cheaper first step that pays most of the benefit: keep one staff and let a
"note" be a chord — block chords in the right hand, read vertically. That
exercises the harmonic generation and the notation without touching the
single-line assumptions in the reading aids, and it is a real sight-reading
skill on its own.

### Cut
- Chord-anchoring lookahead — measured at ~5 percentage points on stepwise
  alphabets for a two-ply search. Not worth it.
- Time-based ramp (letting-go v1) — built, shipped, cut. A toggle whose whole
  effect lives inside another toggle: off unless Hide Ahead was also on, which
  made "Ramp: On" beside "Hide Ahead: Off" a dead control wearing a live face.
  The idea (pressure that creeps per finished line) may return as part of Hide
  Ahead itself rather than as a sibling switch.
- Modal minor (the lowercase v) — deliberately not supported, for now. Every
  degree-4 bar in minor gets the raised leading tone and the seventh: the
  classical dialect, hardcoded. Folk/pop progressions built on the natural
  minor v (i–v–VI–VII and friends) would come out wearing a tuxedo. Opening
  that door costs one honest bit on the progression definition (`modal:
  true`) respected in the two places that share the DOMINANT constant — plus
  accepting that modal cadences lose the leading tone, their strongest
  tendency tone, and close softer. Decided 2026-08: classical is enough for
  a sight-reading trainer today.

## Tweaks — dragging the design instead of describing it

`?tweaks` puts a panel of sliders over the spacing and type tokens. It exists
because every spacing decision so far has cost a full edit → screenshot → look
→ edit round trip, while the values were already named in `:root` and could
just as well be dragged. When something looks right, **Copy as prompt** hands
back only what moved, named by token — that step is the point, not the sliders.

Four rules, and the first is the one that keeps it useful:

- **Expose the decision, not the property.** "Panel density" is a decision;
  `--pop-gap` is a property. Five controls that each mean something beat twenty
  that need a map, and the interesting ones stop being findable long before
  twenty.
- **The panel renders from a spec list.** Adding a control is a field in
  `DEFAULTS`, an entry in `SETS`, a line in `apply()`. The rendering code never
  learns an individual control's name.
- **Every control drives a token the stylesheet already had.** Nothing is
  invented for the panel's sake, so deleting the file leaves the design intact.
- **The panel reads none of the tokens it drives** — otherwise dragging density
  deforms the slider under the cursor. This is not theoretical: the app's global
  `button { font-size: var(--fs-2) }` caught the panel's own buttons on the
  first run, and the type-scale slider resized them as it went. `test/tweaks.js`
  measures it rather than trusting the eye.

Eight sets, and they fold independently — which is what keeps thirty controls
navigable rather than a wall: typography, spacing, shape, rail platters, colour,
music, onboarding, motion.

Making a value reachable by a slider is most of the work, and it is the same
move every time: **express it in parts, or as a calc off a base.** The accent
became `--accent-h/s/l` feeding one `hsl()`, so hue is a number rather than a
hex string. Paper and ink the same. The radii and shadows became calcs off
`--radius-card` and `--shadow-depth`, so a family scales together and keeps its
relationships. `--ctl-h-lg` derives from `--ctl-h`. Every default is the value
that shipped, so an un-flagged page renders exactly what the file says.

Two of them aren't CSS at all, and they are the ones that most change how the
music reads: bars per line and staff size. Those live in `window.__srLayout`,
which `renderLoaded()` takes fresh on every pass; the panel writes there and
fires a `resize`, borrowing the debounced render path the app already has rather
than growing a second entry point.

The one genuinely new capability that fell out of it: `.reduce-motion` is now a
real hard override, honoured from `prefers-reduced-motion` as well as the panel.
Having the switch is what makes the contract checkable without changing an OS
setting — which is the only way anyone remembers to check it.

## Testing

`test/` holds browser harnesses run against a local server:

```sh
python3 -m http.server 8091 --directory sight-reading &
node sight-reading/test/sweep.js      # highlighter integrity, presets × meters
node sight-reading/test/rail.js       # settings rail: push vs overlay, transport pill
node sight-reading/test/tweaks.js     # ?tweaks drives its tokens, and nothing else
node sight-reading/test/mark.js       # the mark's entrance, and the preview's glide
node sight-reading/test/fold.js      # platters open and close without lying
```

They measure the running app — chord-tone rates, beat crossings, hidden-note
prefixes — because most of what matters here is invisible in a diff. Three
lessons paid for:

- A test that hangs is not evidence the app is broken.
- Measure the thing being complained about before fixing the thing you
  assume. "A bounce on tap" was three candidates — the iOS tap highlight, a
  sub-pixel shimmer, and the tapped header sliding 176px down the screen — and
  the first two theories (scroll anchoring, pinning the header) both measured
  as *no change* before anything shipped. Pinning in particular is impossible
  at the end of a scroll: there is nowhere left to scroll to, so the header's
  final position is arithmetic. Only the path was ever available.
- Measure the axis the complaint is on. The platter fold passed a harness that
  checked body height and header *top* while the header's *height* ballooned
  50px → 201px → 50px every fold — the collapsing grid row's surplus landed in
  the auto header row, which re-centred its label the whole way. The user's
  hunch ("the header takes the space and centers itself") was the exact
  mechanism, and the probe confirmed it in one run. The fold now animates
  measured px (the onboarding card's FLIP), which leaves the engine nothing to
  resolve mid-flight.
- An animated thing can lie where an instant one could not. `display: none`
  is honest by construction; a height animation can leave a platter clipped
  after it settles (cutting off the tooltips that reach outside it), leave a
  closed platter's controls in the tab order, or replay every stored fold as a
  collapse on load. None of those is visible in a diff, and two of the three
  were real on the first pass.
- Measure the thing being animated, not a box around it. The mark's circles
  were first checked with getBoundingClientRect, which for a child of a
  rotating group is the axis-aligned box of a rotated box — it grows and
  shrinks on its own and reported a radius that changes while the radius is
  the one thing the entrance never touches. Reading the computed transform
  measures what the animation actually drives.
- A test that pokes hidden form elements directly can bypass the code path
  users actually take. Drive the visible controls — the mode remap and the
  progression-pill rebuild hang off the cycle button's click, so setting
  `#key-mode` directly leaves the picker showing the other mode's list.
- A test encodes the rule it is checking, so a rule change dates it. When
  V gained its seventh, harmony.js still scored every bar against a bare
  triad and marked each generated seventh a wrong note — an ~8 point drop
  that looked exactly like a regression. Check the expectation before
  believing the number.

`window.__srSession` is a read-only handle on the live play state, for the
things only observable there: that a tied pair is one sounding event and not
two cannot be seen in the rendered page at all.
