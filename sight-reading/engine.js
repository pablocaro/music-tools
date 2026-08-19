/**
 * engine.js — the generation layer.
 *
 * OSME's ExampleSourceGenerator normally picks pitches by weighted-random scale
 * degree. We override two of its methods so pitch selection is an *interval walk*
 * driven by the alphabet matrix, and so notes can be rests:
 *
 *   - getNextEntry  : choose the next pitch by walking the diatonic ladder
 *   - generateEntry : turn a flagged pitch into a rest
 *
 * Method names survive in the (unminified) bundle, so we can patch the prototype
 * from here with no engine rebuild. Exposes window.SREngine for app.js.
 */
(function () {
  "use strict";

  var O = window.osme;
  var Note = O.Note;

  // Ladder steps per interval row: unison, 2nd, 3rd, 4th, 5th, 6th, 7th, octave
  var STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
  var BASE_OCTAVE = 1;          // OSME octave of the tonic (renders around middle C)
  var LADDER_LO = -21, LADDER_HI = 35;  // precomputed ladder span (~8 octaves)

  // Pick a signed ladder delta from the weighted alphabet.
  function pickDelta(alpha) {
    var moves = [], total = 0;
    for (var i = 0; i < STEPS.length; i++) {
      var s = STEPS[i];
      if (s === 0) {
        var w = (alpha.up[i] || 0) + (alpha.down[i] || 0);
        if (w > 0) { moves.push({ d: 0, w: w }); total += w; }
      } else {
        var wd = alpha.down[i] || 0; if (wd > 0) { moves.push({ d: -s, w: wd }); total += wd; }
        var wu = alpha.up[i] || 0;   if (wu > 0) { moves.push({ d: s, w: wu }); total += wu; }
      }
    }
    if (total <= 0) return (Math.random() < 0.5 ? -1 : 1); // empty alphabet -> a step
    var r = Math.random() * total;
    for (var j = 0; j < moves.length; j++) { r -= moves[j].w; if (r <= 0) return moves[j].d; }
    return moves[moves.length - 1].d;
  }

  // Where chord-following starts on the one dial. Below this the line is only
  // being shaped, not harmonised.
  var CHORD_KNEE = 0.3;

  // The chord pull is a preference, never a veto. At a full 1.0 an off-chord
  // move is multiplied to zero and survives only on the 0.0001 floor, which
  // puts it four orders of magnitude behind anything that reaches the chord —
  // enough to overturn the interval weights completely.
  var PULL_MAX = 0.95;

  // …but capping it alone only moves the damage around: loose enough to keep a
  // stepwise alphabet honest is too loose for an arpeggio to hold its shape.
  // The way out is that the pull should only ever redistribute *within* what
  // the student asked for. So it is scaled by how much of the alphabet's weight
  // can actually reach a chord tone from here. Tick mostly 3rds and the line is
  // held firmly, because holding it costs nothing you didn't ask for; tick
  // mostly 2nds and the pull barely registers, because enforcing it would mean
  // overruling the matrix. It reaches full strength once this share of the
  // weight can reach the chord — beyond that, more reachability changes nothing.
  var REACH_SAT = 0.4;

  // Even at the top of the dial, notes between the beats stay looser than the
  // beats themselves — that gap is what a passing tone lives in. Without it the
  // top of the dial anchors every note, and a stepwise alphabet has nowhere to
  // put a step.
  var OFFBEAT_ANCHOR = 0.7;

  // Tendency tones. A note that belonged to the last bar's chord but not to
  // this one is under an obligation: the chord moved out from under it, and it
  // owes its resolution to the nearest tone of the chord that displaced it.
  // The leading tone rising to the tonic and the dominant seventh falling to
  // the third are the two famous instances, but the rule never asks which
  // chord it is looking at — membership is the whole test, so it fires just as
  // correctly in progressions nobody thought to enumerate. It knees in above
  // the chord pull: resolving between chords means nothing until the line is
  // landing on chords at all.
  var OBLIGE_KNEE = 0.6;
  var OBLIGE_PULL = 4;

  // Seam smoothing, the gentler sibling. At a chord change every note — not
  // only a tendency tone — leans toward arriving on the NEAREST tone of the
  // incoming chord, including the common tone: the one note both chords
  // share, held while its meaning changes underneath, which is the smoothest
  // seam there is. Deliberately weaker than the obligation (a nudge, not a
  // rule), and confined to the barline: the leaps *inside* a bar are what an
  // arpeggio drill is for, and smoothing them would blunt the drill.
  var SMOOTH_PULL = 1.5;

  // Momentum. A random walk turns direction about half the time, which is why
  // it noodles; a real line runs a few notes one way before it turns. A step
  // begun prefers to carry — after a leap the gap-fill rule is turning the
  // line around instead, so the two never apply to the same note. The one
  // leap that does carry is the chordal skip: chord tone to chord tone in the
  // same direction is an arpeggio, not a gap that needs filling, so it earns
  // a fraction of this bonus inside the leap branch rather than the turn
  // penalty. Momentum has to shout a little (the chord pull talks over it on
  // the beats), which is why it outweighs gap-fill's 1.3 — they are never in
  // the same room, so the comparison never happens.
  var MOMENTUM = 1.4;

  // Non-chord tones have jobs. A note off the current chord reads as a
  // passing or neighbour figure exactly when it is approached by step and
  // left by step; leapt onto or leapt away from, it is just a note that
  // happens to be off the chord — the thing every counterpoint teacher
  // circles. Two rules, both sides of the same coin: don't leap ONTO a
  // dissonance (damping, not a bonus, so the rate of non-chord tones is not
  // inflated — only their treatment), and once ON one, leave by step. Strong
  // enough to overrule a 3rd-heavy alphabet, deliberately: the alphabet says
  // which intervals the line is made of, but dissonance treatment is grammar,
  // and a 4:1 weight on thirds should not buy leaps off a dissonance.
  var NCT_STEP = 1.5;
  var NCT_LEAP = 0.9;

  // The dominant, as a 0-based scale degree: 0 is I, so 4 is V. Named because
  // it is asked for in two places that must agree — the seventh added to its
  // chord here, and the leading tone raised in its bars in minor.
  var DOMINANT = 4;

  // ---------------------------------------------------------------------------
  // Ties across barlines. A note begins in one bar and holds into the next,
  // written as two noteheads joined by a curve — the reader has to carry the
  // sound through the barline instead of re-attacking, which is the whole
  // skill. The generator does not split a long note: it *extends* the bar's
  // last note by whole pulses of the following bar. That keeps both halves
  // individually notatable (no arbitrary remainders to spell) and keeps the
  // next bar beat-aligned, because what the tie eats is exactly one or two
  // cell-sized slots off its front. Which bars tie is recorded here and the
  // notation is written in app.js, the same division of labour as tuplets.
  // ---------------------------------------------------------------------------
  var TIE_BARS = [];        // measure indices whose last note holds over

  // A held-over length, as a whole-note fraction: k felt pulses, where a pulse
  // is a quarter in the simple meters and a dotted quarter in 6/8. Eighths
  // divide both, so d = 8 covers every meter with an integer numerator.
  function pulseSpan(pulseBeats, k) {
    return { n: Math.round((pulseBeats || 1) * 2 * k), d: 8 };
  }

  // 0 below `a`, 1 above `b`, straight line between — used to bring each class
  // of metric position under the chord one after another as the dial climbs.
  function ramp(v, a, b) { return Math.max(0, Math.min(1, (v - a) / (b - a))); }

  // ---------------------------------------------------------------------------
  // Accidentals. The walk stays diatonic — positions are scale degrees and the
  // interval matrix keeps meaning what it means. An alteration is a decision
  // made per emitted note, one semitone at most, on top of whatever accidental
  // the scale tone already carries (so C minor's Bb raised is B natural, and
  // E minor's D raised is D sharp). Notation is free: the exporter writes the
  // <alter>, and OSMD decides how to draw it against the key signature.
  // ---------------------------------------------------------------------------
  // The bundle doesn't export Pitch or AccidentalEnum, so the class comes from
  // the instance and the enum values are used numerically — decoded empirically
  // from F major's tones (naturals carry 2, Bb carries 1) and the semitone
  // shifts each value produces: SHARP=0, FLAT=1, NONE=2, NATURAL=3. A change
  // that would need a double accidental is skipped rather than guessed at.
  var ACC_SHARP = 0, ACC_FLAT = 1, ACC_NONE = 2, ACC_NATURAL = 3;
  function alterPitch(pitch, dir) {
    var cur = pitch.Accidental, next = null;
    if (dir > 0) next = (cur === ACC_NONE || cur === ACC_NATURAL) ? ACC_SHARP
                      : (cur === ACC_FLAT) ? ACC_NATURAL : null;
    else         next = (cur === ACC_NONE || cur === ACC_NATURAL) ? ACC_FLAT
                      : (cur === ACC_SHARP) ? ACC_NATURAL : null;
    if (next == null) return pitch;
    var Ctor = pitch.constructor;
    return new Ctor(pitch.FundamentalNote, pitch.Octave, next);
  }

  // Semitone gap between two ladder positions — decides whether a chromatic
  // note can fit between them (only a whole step has room).
  function semitoneGap(tones, ladder, N, a, b) {
    function ht(pos) {
      var d = ((pos % N) + N) % N;
      var oct = (ladder && ladder.octaveOf[pos] != null) ? ladder.octaveOf[pos] : (BASE_OCTAVE + Math.floor(pos / N));
      return tones[d].toPitch(oct).getHalfTone();
    }
    return Math.abs(ht(a) - ht(b));
  }

  // Like pickDelta, but reweights the candidate moves by musical context, all of
  // it driven by the single `musicality` dial the caller splits into two:
  //
  //   ctx.phrase — shape over time: gap-fill after a leap, a contour arch, and
  //                cadential pull to the tonic at phrase ends.
  //   ctx.pull   — how hard *this* note is asked to be a chord tone. The caller
  //                works it out from where the note falls in the bar, so the
  //                chord is a target for arrival rather than a filter on every
  //                note; the ones in between are free to pass through.
  //
  // Both 0 is the plain weighted-random walk.
  //
  // Two guards keep the pull from doing something stupid. It only applies when
  // some *moving* candidate can actually reach a chord tone: a stepwise
  // alphabet can never step from one chord tone to another (they sit a 3rd
  // apart), and punishing both neighbours equally is just a slower way of
  // picking at random. And a unison never counts as reaching the chord — sitting
  // still would otherwise be the cheapest way to satisfy it, which is how the
  // line used to freeze into a drone. The one exception is the seam: across a
  // chord change a held note that belongs to the incoming chord is a common
  // tone, not loitering (see SMOOTH_PULL).
  function pickMusicalDelta(alpha, ctx) {
    var moves = [];
    for (var i = 0; i < STEPS.length; i++) {
      var s = STEPS[i];
      if (s === 0) { var w = (alpha.up[i] || 0) + (alpha.down[i] || 0); if (w > 0) moves.push({ d: 0, w: w }); }
      else {
        var wd = alpha.down[i] || 0; if (wd > 0) moves.push({ d: -s, w: wd });
        var wu = alpha.up[i] || 0;   if (wu > 0) moves.push({ d: s, w: wu });
      }
    }
    if (moves.length === 0) return (Math.random() < 0.5 ? -1 : 1);
    var ph = ctx.phrase || 0, pull = ctx.pull || 0, total = 0, j, r;
    if (ph > 0 || pull > 0) {
      var leap = Math.abs(ctx.prevDelta) >= 2;
      // The caller reflects a move that would leave the range (oldP - delta),
      // which throws away everything decided here — the reflected note lands
      // wherever it lands, off the chord and off the contour. Cheaper to not
      // pick those moves at all: zero them, and only fall back to reflection
      // if the range leaves nothing playable.
      var lo = (ctx.pMin != null) ? ctx.pMin : -Infinity;
      var hi = (ctx.pMax != null) ? ctx.pMax : Infinity;
      var tones = ctx.chordTones || [];

      function degreeAt(d) { var np = ctx.p + d; return ((np % ctx.N) + ctx.N) % ctx.N; }
      function inRange(d) { var np = ctx.p + d; return np >= lo && np <= hi; }

      // Guard 1: scale the pull by the share of the alphabet's weight that can
      // reach a chord tone from here. This subsumes the old "is it reachable at
      // all?" test — nothing reachable means a share of zero means no pull —
      // and it also handles the case that test missed, where the chord *is*
      // reachable but only by an interval the student barely asked for.
      if (pull > 0) {
        var reachW = 0, totalW = 0;
        for (j = 0; j < moves.length; j++) {
          var q = moves[j];
          if (!inRange(q.d)) continue;
          totalW += q.w;
          if (q.d !== 0 && tones.indexOf(degreeAt(q.d)) >= 0) reachW += q.w;
        }
        pull *= (totalW > 0) ? Math.min(1, (reachW / totalW) / REACH_SAT) : 0;
      }

      // A seam resolves to the NEAREST tone of the new chord — but nearest
      // among the moves this alphabet actually offers, so a student who
      // unticked 2nds gets the closest resolution they asked for rather than
      // none. If no move reaches the chord at all, obNear stays 0 and both
      // seam preferences quietly withdraw.
      var ob = ctx.oblige || 0, sm = ctx.smooth || 0, obNear = 0;
      if (ob > 0 || sm > 0) {
        for (j = 0; j < moves.length; j++) {
          var od = moves[j].d;
          if (od === 0 || !inRange(od)) continue;
          if (tones.indexOf(degreeAt(od)) < 0) continue;
          if (!obNear || Math.abs(od) < obNear) obNear = Math.abs(od);
        }
      }

      // Whether the note we stand on is off the current chord — a dissonance
      // that owes its exit a step (see NCT_STEP).
      var offHome = tones.length > 0 && tones.indexOf(degreeAt(0)) < 0;

      var last = -1;
      for (j = 0; j < moves.length; j++) {
        var mv = moves[j], np = ctx.p + mv.d, degree = degreeAt(mv.d), bonus = 0;
        if (ph > 0) {
          if (ctx.cadence > 0) {                                                      // resolve at phrase ends
            // Onto the chord the phrase actually ends on, not always the
            // tonic — a phrase ending on V is a half cadence and wants the
            // dominant under it. On top of that, phrases alternate question
            // and answer. An asking phrase ends ON its chord but OFF the
            // chord's root: the classical imperfect close, settled enough to
            // breathe, unsettled enough to need the next phrase. An answering
            // phrase — and always the final bar — lands the root. Parity is
            // the whole test; no knowledge of which chords the progression
            // put where, so a period falls out of any progression at all.
            var croot = (ctx.chordRoot == null) ? 0 : ctx.chordRoot;
            if (ctx.cadOpen) {
              if (tones.indexOf(degree) >= 0 && degree !== croot) bonus += 2.0 * ctx.cadence;
              else if (degree === croot) bonus += 0.3 * ctx.cadence;
            } else if (ctx.cadFinal) {
              if (degree === croot) bonus += 6.0 * ctx.cadence;
              else if (tones.indexOf(degree) >= 0) bonus += 0.5 * ctx.cadence;
            } else {
              // The approach. Rewarding the root here was self-defeating: an
              // early arrival only has to leave again (the unison ban) and
              // rarely gets back in one move. So the notes before the close
              // aim NEXT to the root — a step or a third away, where the
              // final note can reach it — and landing on it early costs.
              var dr = ((degree - croot) % ctx.N + ctx.N) % ctx.N;
              dr = Math.min(dr, ctx.N - dr);
              if (dr === 1 || dr === 2) bonus += 1.5 * ctx.cadence;
              else if (dr === 0) bonus -= 1.0 * ctx.cadence;
            }
          }
          if (leap) {                                                                 // gap-fill: step back after a leap
            // …unless the leap is a chordal skip carrying on: chord tone to
            // chord tone in the same direction is an arpeggio being spelled,
            // not a gap. Gated on the chord actually being in force here.
            var arp = pull > 0 && mv.d !== 0 && (mv.d > 0) === (ctx.prevDelta > 0) &&
                      tones.indexOf(degreeAt(0)) >= 0 && tones.indexOf(degree) >= 0;
            if (arp) bonus += MOMENTUM * 0.7;
            if (mv.d !== 0 && Math.abs(mv.d) <= 1 && (mv.d > 0) !== (ctx.prevDelta > 0)) bonus += 1.3;
            if (Math.abs(mv.d) >= 2 && !arp) bonus -= 0.5;
          } else if (ctx.prevDelta !== 0) {                                           // momentum: a step begun carries
            if (mv.d !== 0 && (mv.d > 0) === (ctx.prevDelta > 0)) bonus += MOMENTUM;
          }
          if (tones.length > 0) {                                                     // dissonances are stepwise business
            if (mv.d !== 0 && Math.abs(mv.d) >= 2 && tones.indexOf(degree) < 0) bonus -= NCT_LEAP;
            // Sitting on one is no better than leaping off it: a repeated
            // dissonance is a job postponed, and the postponer fails 'left
            // by step' just as surely as a leap does.
            if (offHome) bonus += (mv.d === 0) ? -NCT_LEAP
                                : (Math.abs(mv.d) === 1 ? NCT_STEP : -NCT_LEAP);
          }
          if (ctx.targetP != null && Math.abs(np - ctx.targetP) < Math.abs(ctx.p - ctx.targetP)) bonus += 0.5; // contour
        }
        mv.sw = mv.w * (1 + ph * bonus);
        // guard 2 lives in the `mv.d === 0` half of this test: a unison is
        // never an arrival WITHIN a bar, however good the note it stays on
        // happens to be — sitting still was the cheapest way to satisfy the
        // pull, and the line froze into a drone. Across a chord change the
        // same interval means the opposite thing: the note holds while the
        // chord moves underneath it, a common tone, not loitering. So the
        // seam is the one place the unison is exempted, and only when the
        // held note actually belongs to the incoming chord.
        var common = sm > 0 && mv.d === 0 && tones.indexOf(degree) >= 0;
        if (pull > 0 && !common && (mv.d === 0 || tones.indexOf(degree) < 0)) mv.sw *= (1 - pull);
        // Both seam preferences are weighted, never a pick: a looping
        // progression fed a deterministic "always nearest" would print the
        // same four-bar shape forever. The obligation is the strong form (the
        // old note lost its chord and owes a resolution), smoothing the
        // gentle one (any seam prefers the close arrival). When both
        // directions tie for nearest — the seventh's F sits a step from E
        // and from G alike — the falling side gets the edge, because
        // dissonance falls; the leading tone is never ambiguous this way,
        // its upper neighbour being the tonic.
        if (common) {
          mv.sw *= 1 + sm * SMOOTH_PULL;
        } else if (obNear && mv.d !== 0 && Math.abs(mv.d) === obNear &&
                   tones.indexOf(degree) >= 0) {
          var g = (ob > 0) ? ob * OBLIGE_PULL : sm * SMOOTH_PULL;
          mv.sw *= 1 + g * (mv.d < 0 ? 1.3 : 1);
        }
        if (mv.sw < 0.0001) mv.sw = 0.0001;
        if (np < lo || np > hi) { mv.sw = 0; continue; }
        last = j;
        total += mv.sw;
      }
      if (total > 0) {
        r = Math.random() * total;
        for (j = 0; j < moves.length; j++) { r -= moves[j].sw; if (r <= 0 && moves[j].sw > 0) return moves[j].d; }
        return moves[last].d;
      }
    }
    // Plain weighted pick: no biases asked for, or the range left nothing.
    for (j = 0; j < moves.length; j++) total += moves[j].w;
    r = Math.random() * total;
    for (j = 0; j < moves.length; j++) { r -= moves[j].w; if (r <= 0) return moves[j].d; }
    return moves[moves.length - 1].d;
  }

  function patternTotal(p) {
    var t = 0;
    for (var i = 0; i < p.length; i++) { t += p[i].n / p[i].d; }
    return t;
  }

  // Pick a random pattern (cell) that still fits the space left in the measure,
  // returning a fresh copy of its events. Cells may be longer than one beat
  // (half, whole), so we filter by what fits — keeping everything beat-aligned.
  function nextBeat(patterns, remaining) {
    var fit = (patterns || []).filter(function (p) { return patternTotal(p) <= remaining + 1e-6; });
    if (fit.length === 0) return [{ n: 1, d: 4 }]; // fall back to a quarter
    var p = fit[Math.floor(Math.random() * fit.length)];
    return p.map(function (e) { return { n: e.n, d: e.d, rest: !!e.rest }; });
  }

  // ---------------------------------------------------------------------------
  // Rhythmic memory. Melody got phrasing from the musicality dial long ago;
  // rhythm was still a bag of cells, every beat an independent draw, which is
  // why generated lines sounded generated — real music states a rhythmic idea
  // and repeats it, varied. So a bar drawn at a phrase start is remembered,
  // and the bars after it reuse the idea in proportion to the same dial,
  // usually with one beat's cell swapped for a fresh one of the same length
  // (the "varied" half of "repeat it, varied").
  // ---------------------------------------------------------------------------
  function copyCell(cell) { return cell.map(function (e) { return { n: e.n, d: e.d, rest: !!e.rest }; }); }
  function cellBeats(cell) {
    var t = 0;
    for (var i = 0; i < cell.length; i++) t += cell[i].n / cell[i].d;
    return t;
  }

  function drawFreshBar(patterns, barBeats) {
    var cells = [], rem = barBeats;
    while (rem > 1e-6) {
      var c = nextBeat(patterns, rem);
      cells.push(c);
      rem -= cellBeats(c);
    }
    return cells;
  }

  // Swap one cell for a fresh draw of the same length, so the bar still sums.
  function varyBar(cells, patterns) {
    var i = Math.floor(Math.random() * cells.length);
    var target = cellBeats(cells[i]);
    var fits = (patterns || []).filter(function (pt) { return Math.abs(patternTotal(pt) - target) < 1e-6; });
    if (fits.length) {
      var pick = fits[Math.floor(Math.random() * fits.length)];
      cells[i] = pick.map(function (e) { return { n: e.n, d: e.d, rest: !!e.rest }; });
    }
    return cells;
  }

  // Diatonic ladder: position -> octave (per key) + displayed semitone height,
  // so "lowest / highest note" bounds resolve correctly in any key.
  function buildLadder(scaleKey) {
    var tones = scaleKey.getTones();
    var N = tones.length;
    var octaveOf = {}, heightOf = {};

    var oct = BASE_OCTAVE, prevSym = tones[0].getSymbol();
    octaveOf[0] = BASE_OCTAVE;
    for (var p = 1; p <= LADDER_HI; p++) {
      var sym = tones[((p % N) + N) % N].getSymbol();
      if (sym <= prevSym) oct++;        // letter wrapped past B -> C: up an octave
      prevSym = sym;
      octaveOf[p] = oct;
    }
    oct = BASE_OCTAVE; prevSym = tones[0].getSymbol();
    for (var q = -1; q >= LADDER_LO; q--) {
      var deg = ((q % N) + N) % N;
      var s2 = tones[deg].getSymbol();
      if (s2 >= prevSym) oct--;          // descending, letter went up: down an octave
      prevSym = s2;
      octaveOf[q] = oct;
    }
    for (var r = LADDER_LO; r <= LADDER_HI; r++) {
      var d = ((r % N) + N) % N;
      heightOf[r] = (octaveOf[r] + 3) * 12 + tones[d].getHalftone(); // displayed semitone
    }
    return { octaveOf: octaveOf, heightOf: heightOf, N: N, lo: LADDER_LO, hi: LADDER_HI };
  }

  // Smallest/largest ladder positions whose pitch falls within [lowH, highH].
  function computeBounds(ladder, lowH, highH) {
    var min = null, max = null;
    for (var p = ladder.lo; p <= ladder.hi; p++) {
      var h = ladder.heightOf[p];
      if (h >= lowH && h <= highH) { if (min === null) min = p; max = p; }
    }
    if (min === null) { min = 0; max = ladder.N - 1; } // fallback: one octave from tonic
    return { min: min, max: max };
  }

  // --- prototype overrides -------------------------------------------------

  // this._p = current position on the diatonic ladder (0 = tonic at BASE_OCTAVE)
  O.ExampleSourceGenerator.prototype.getNextEntry = function (currentMeasure, scaleKey, startPosition) {
    var tones = scaleKey.getTones();
    var N = tones.length;
    var ladder = this.options.ladder;
    var PMIN = (this.options.rangeMin != null) ? this.options.rangeMin : 0;
    var PMAX = (this.options.rangeMax != null) ? this.options.rangeMax : N - 1;
    // Rhythm comes one cell at a time from the beat-pattern palette, so the page
    // stays metrically structured (clean groupings, beat-aligned rests). Cells
    // can span multiple beats (half, whole); we only draw one that still fits.
    if (startPosition.RealValue === 0) {              // new measure
      if (this._measureIdx == null) { TIE_BARS = []; }  // first bar of a fresh generation
      this._beatQueue = null;                         // drop carryover
      this._measureIdx = (this._measureIdx == null) ? 0 : this._measureIdx + 1;
    }
    if (!this._beatQueue || this._beatQueue.length === 0) {
      var remaining = currentMeasure.Duration.RealValue - startPosition.RealValue;
      if (startPosition.RealValue === 0) {
        // A note held over from the previous bar sounds first and eats the
        // front of this one, so the bar is drawn to fill only what is left.
        var carry = this._tieCarry || null;
        this._tieCarry = null;
        if (carry) remaining -= carry.n / carry.d;

        // A whole bar is drawn at once so its rhythm can be remembered and
        // reused. Phrase starts (every 4th bar) state the idea; the bars after
        // them echo it in proportion to the musicality dial, usually with one
        // cell swapped for a fresh one of the same length. A bar that opens
        // with a held note is drawn fresh and not remembered: it is short by
        // the tie, so it is not the bar's own idea to repeat.
        var mm = this.options.musicality || 0;
        var phrasePosR = (this._measureIdx || 0) % 4;
        var cells;
        if (!carry && mm > 0 && phrasePosR > 0 && this._motifCells && Math.random() < mm * 0.85) {
          cells = this._motifCells.map(copyCell);
          if (Math.random() < 0.4) cells = varyBar(cells, this.options.beatPatterns);
        } else {
          cells = drawFreshBar(this.options.beatPatterns, remaining);
          if (!carry && mm > 0 && phrasePosR === 0) this._motifCells = cells.map(copyCell);
        }
        this._beatQueue = carry ? [carry] : [];
        for (var ci = 0; ci < cells.length; ci++) this._beatQueue = this._beatQueue.concat(cells[ci]);
        this._maybeTieOut(currentMeasure);
      } else {
        // Mid-bar refills keep the old per-beat draw (only reachable if a cell
        // ran short, e.g. the fallback quarter).
        this._beatQueue = nextBeat(this.options.beatPatterns, remaining);
      }
    }
    var ev = this._beatQueue.shift();
    var duration = new O.Fraction(ev.n, ev.d);
    var makeRest = !!ev.rest;
    // The far side of a tie is not a new note — it is the same note still
    // sounding. The walk is skipped entirely so the position, the previous
    // interval and any chromatic obligation all stay exactly as they were.
    var isTieStop = !!ev.tieStop;

    if (this._p === undefined || this._p === null) {
      // The opening note is a choice, not a tell. It used to be PMIN — every
      // exercise began on the very bottom of the range, which no melody does
      // and every regular user learns to expect. Now it is drawn from a
      // comfort curve peaking a third of the way up the range and fading at
      // both extremes; once the dial is on at all, only the first bar's chord
      // tones qualify — a melody opens by establishing its harmony — and the
      // root gets an edge for stating the key. At dial zero the chord is not
      // consulted, so zero stays a walk that owes nothing to the harmony;
      // only the dead constant is gone. The second pass drops the chord
      // filter for a range too narrow to hold any chord tone.
      var sMus = this.options.musicality || 0;
      var sProg = this.options.progression || [0, 3, 4, 0];
      var sRoot = sProg[0] % N;
      var sTones = [sRoot, (sRoot + 2) % N, (sRoot + 4) % N];
      var sSpan = Math.max(1, PMAX - PMIN);
      var sCands = [], sTot = 0;
      for (var sPass = 0; sPass < 2 && !sCands.length; sPass++) {
        for (var sp = PMIN; sp <= PMAX; sp++) {
          var sDeg = ((sp % N) + N) % N;
          if (sPass === 0 && sMus > 0 && sTones.indexOf(sDeg) < 0) continue;
          var sw = Math.max(0.05, 1 - Math.abs((sp - PMIN) / sSpan - 0.33) * 1.8);
          if (sMus > 0 && sDeg === sRoot) sw *= 1.4;
          sCands.push({ p: sp, w: sw }); sTot += sw;
        }
      }
      this._p = PMIN;
      if (sCands.length) {
        var sR = Math.random() * sTot;
        this._p = sCands[sCands.length - 1].p;
        for (var sc = 0; sc < sCands.length; sc++) {
          sR -= sCands[sc].w;
          if (sR <= 0) { this._p = sCands[sc].p; break; }
        }
      }
    } else if (!makeRest && !isTieStop) {
      var alpha = this.options.alphabet || { down: [0, 1, 0, 0, 0, 0, 0], up: [0, 1, 0, 0, 0, 0, 0] };
      var musicality = this.options.musicality || 0;
      var oldP = this._p, delta;
      if (musicality > 0) {
        // One dial, two things. Phrasing tracks it directly; chord-following
        // lags, because a wandering line first needs direction, and committing
        // to the harmony is the bigger statement — it belongs at the top.
        var phrase = musicality;
        var chord = Math.max(0, (musicality - CHORD_KNEE) / (1 - CHORD_KNEE));

        // Which chord this bar sits on. One chord per bar, looping — so the
        // progression is meter-independent, unlike the beat maths below it.
        // Scale-degree roots, one per bar. The caller picks the pattern to suit
        // the mode (see PROGRESSIONS in app.js); this is only the fallback.
        var prog = this.options.progression || [0, 3, 4, 0];   // I – IV – V – I
        var mi = this._measureIdx || 0, totalM = this.options.measure_count || 8;
        var root = prog[mi % prog.length];
        var chordTones = [root % N, (root + 2) % N, (root + 4) % N];
        // The dominant gets its seventh. That interval is the whole reason a
        // V pulls home: with it, the chord holds the tritone that only the
        // tonic resolves. Degree 4 alone — a seventh on every chord is a
        // different idiom, not a stronger cadence. In minor the leading tone
        // is already raised in these bars, so this lands as a true V7.
        if (root === DOMINANT) chordTones.push((root + 6) % N);

        // The seam (see OBLIGE_KNEE / SMOOTH_PULL). Only the first walked
        // note of a bar is the seam — a tie held across the barline skips the
        // walk, so when a suspension hangs over the change the obligation
        // simply waits and lands on the note after the hold, which is where a
        // suspension resolves anyway. A downbeat rest defers it the same way.
        // Every seam smooths; the seams where the old note lost its chord
        // carry the stronger obligation on top.
        var oblige = 0, smooth = 0;
        if (mi > 0 && this._seamMeasure !== mi) {
          var proot = prog[(mi - 1) % prog.length];
          if (proot !== root) {
            smooth = ramp(musicality, OBLIGE_KNEE, 1.0);
            var ptones = [proot % N, (proot + 2) % N, (proot + 4) % N];
            if (proot === DOMINANT) ptones.push((proot + 6) % N);
            var oldDeg = ((oldP % N) + N) % N;
            if (ptones.indexOf(oldDeg) >= 0 && chordTones.indexOf(oldDeg) < 0) {
              oblige = smooth;
            }
          }
        }
        this._seamMeasure = mi;

        // Where this note falls in the bar, in felt pulses — a quarter in the
        // simple meters, a dotted quarter in 6/8, so "on the beat" means the
        // same thing to a reader in every meter.
        var beatF = startPosition.RealValue * 4;               // in quarter notes
        var pulseLen = this.options.pulseBeats || 1;
        var pulses = beatF / pulseLen;
        var onDownbeat = Math.abs(beatF) < 0.05;
        var onPulse = Math.abs(pulses - Math.round(pulses)) < 0.05;

        // How hard this particular note is asked to be a chord tone. Downbeats
        // always are, once chord-following is on at all; the weaker positions
        // are recruited as the dial climbs, until at the top every note is an
        // arrival and a chord-shaped alphabet comes out as pure arpeggios.
        var anchor = onDownbeat ? 1
                   : onPulse   ? ramp(musicality, 0.45, 0.75)
                   :             ramp(musicality, 0.75, 1.0) * OFFBEAT_ANCHOR;

        var phrasePos = mi % 4;
        var lastM = (mi === totalM - 1);
        // The bar's real length, so "second half of the bar" and "how far
        // through the piece" stop assuming four quarters — hardcoded 2 and /4
        // made the cadence fire early and the contour arch run fast in 3/4
        // and 6/8.
        var barQ = currentMeasure.Duration.RealValue * 4;
        // The second half of a phrase-end bar drifts toward the cadence; the
        // bar's FINAL note carries most of the weight. Flat weighting landed
        // the root early, got pushed off it (the unison ban), and left the
        // actual last note under no more pressure than its neighbours — the
        // close rate sat at chance. The walk knows this note's duration, so
        // it knows when it is placing the one the phrase will be judged by.
        var lastNote = beatF + duration.RealValue * 4 >= barQ - 0.05;
        var cadence = ((phrasePos === 3 || lastM) && beatF >= barQ / 2)
          ? (lastM ? 1.5 : 0.8) * (lastNote ? 2.5 : 0.6) : 0;
        // Phrases alternate question and answer. The first and third phrases
        // end open; the second, fourth and always the final bar close. Parity
        // is the whole test — what "open" and "closed" mean melodically is
        // decided at the pick (see the cadence branch there).
        var cadOpen = (Math.floor(mi / 4) % 2 === 0) && !lastM;
        var progress = Math.max(0, Math.min(1, (mi + beatF / barQ) / totalM));
        var targetP = PMIN + (PMAX - PMIN) * (0.35 + 0.4 * Math.sin(Math.PI * progress));   // gentle arch
        delta = pickMusicalDelta(alpha, {
          phrase: phrase, pull: chord * anchor * PULL_MAX, p: oldP, N: N,
          pMin: PMIN, pMax: PMAX, chordTones: chordTones, chordRoot: root % N,
          cadence: cadence, cadOpen: cadOpen, cadFinal: lastNote, targetP: targetP,
          prevDelta: this._prevDelta || 0, oblige: oblige, smooth: smooth
        });
      } else {
        delta = pickDelta(alpha);
      }

      // -----------------------------------------------------------------------
      // Chromatic figures. A figure spans two notes — the altered one and its
      // resolution — so starting one stores an obligation (_forced) that the
      // next sounding note honours instead of walking. A rest arriving in
      // between simply drops the obligation: the figure doesn't complete, which
      // is rare and reads as an ordinary chromatic tone.
      // -----------------------------------------------------------------------
      var alterDir = 0;
      var chroma = this.options.chroma || 0;
      if (this._forced != null) {
        delta = this._forced;
        this._forced = null;
      } else if (chroma > 0) {
        if (delta === 0 && Math.random() < chroma * 0.5 && oldP - 1 >= PMIN
            && semitoneGap(tones, ladder, N, oldP - 1, oldP) === 2) {
          // Chromatic lower neighbour: instead of repeating the note, dip to
          // the scale step below raised a semitone (G -> F# -> G), which is the
          // correct spelling, then the obligation returns us home.
          delta = -1; alterDir = +1; this._forced = +1;
        } else if (Math.abs(delta) === 1 && Math.random() < chroma * 0.35
            && semitoneGap(tones, ladder, N, oldP, oldP + delta) === 2) {
          // Chromatic passing tone: the chosen step is delayed one slot and the
          // gap is filled — D -> D# -> E ascending (sharp side), E -> Eb -> D
          // descending (flat side). Spelled as the old note altered toward the
          // target, which is the conventional spelling for each direction.
          this._forced = delta;
          alterDir = (delta > 0) ? +1 : -1;
          delta = 0;
        }
      }

      var np = oldP + delta;
      if (np > PMAX || np < PMIN) { np = oldP - delta; this._forced = null; } // reflect breaks any figure
      if (np > PMAX) np = PMAX;
      if (np < PMIN) np = PMIN;
      this._prevDelta = np - oldP;
      this._p = np;
      this._alterDir = alterDir;
    }
    if (makeRest) this._forced = null;   // a rest interrupts a chromatic figure

    var p = this._p;
    var degree = ((p % N) + N) % N;
    var octave = (ladder && ladder.octaveOf[p] != null) ? ladder.octaveOf[p] : (BASE_OCTAVE + Math.floor(p / N));
    var pitch = tones[degree].toPitch(octave);

    // The leading tone: in minor, a dominant bar raises its 7th, which is what
    // turns the diatonic v into a real V and gives the cadence somewhere to
    // lean. Applied at emission, so it needs no help from the harmony dial.
    var alt = (!makeRest && this._alterDir) ? this._alterDir : 0;
    if (!makeRest && !alt && this.options.mode === "minor" && degree === 6) {
      var prg = this.options.progression || [0, 5, 6, 0];
      if (prg[(this._measureIdx || 0) % prg.length] === DOMINANT) alt = +1;
    }
    // A tie's far side inherits the alteration outright rather than deriving
    // one. The rule above reads the *current* bar, so a leading tone held out
    // of a V bar into a i bar would come back natural — two different pitches
    // under one curve, which is not a tie at all.
    if (isTieStop) alt = this._tieAlt || 0;
    else if (ev.tieStart) this._tieAlt = alt;
    if (alt) pitch = alterPitch(pitch, alt);
    this._alterDir = 0;

    if (makeRest) { pitch.__rest = true; } // flag carried through to generateEntry

    return { Pitch: pitch, Duration: duration };
  };

  // Decide whether the bar just drawn holds its last note over the barline.
  // Called with the queue already filled, so the last event in it is the bar's
  // last event. A rest cannot be held, and the final bar has nothing to hold
  // into. The held length is whole pulses so the next bar stays beat-aligned,
  // and never the whole of it — a tie that swallows a bar leaves nothing to
  // read there.
  O.ExampleSourceGenerator.prototype._maybeTieOut = function (currentMeasure) {
    var prob = this.options.ties || 0;
    if (prob <= 0) return;
    if ((this._measureIdx || 0) >= (this.options.measure_count || 8) - 1) return;
    var q = this._beatQueue, lastEv = q[q.length - 1];
    if (!lastEv || lastEv.rest) return;
    if (Math.random() >= prob) return;

    var barLen = currentMeasure.Duration.RealValue;
    var pulse = this.options.pulseBeats || 1;
    var two = pulseSpan(pulse, 2);
    var span = (Math.random() < 0.25 && two.n / two.d < barLen) ? two : pulseSpan(pulse, 1);
    if (span.n / span.d >= barLen) return;

    lastEv.tieStart = true;
    this._tieCarry = { n: span.n, d: span.d, tieStop: true };
    TIE_BARS.push(this._measureIdx || 0);
  };

  // A flagged pitch becomes a rest (but keeps a real pitch object so nothing
  // downstream chokes on a null).
  O.ExampleSourceGenerator.prototype.generateEntry = function (currentMeasure, staff, voice, entryBegin, entryDuration, pitch) {
    var staffEntry = currentMeasure.findOrCreateStaffEntry(entryBegin, 0, staff).staffEntry;
    var voiceEntry = currentMeasure.findOrCreateVoiceEntry(staffEntry, voice).voiceEntry;
    var isRest = !!(pitch && pitch.__rest);
    var note = new Note(voiceEntry, staffEntry, entryDuration, pitch, currentMeasure, isRest);
    voiceEntry.Notes.push(note);
    return note;
  };

  window.SREngine = {
    buildLadder: buildLadder,
    computeBounds: computeBounds,
    // Which bars hold their last note over the barline. Read once, straight
    // after generate() and before the export is written — generation is
    // synchronous, so take-and-clear leaves nothing behind for the next run.
    takeTies: function () { var t = TIE_BARS.slice(); TIE_BARS = []; return t; }
  };
}());
