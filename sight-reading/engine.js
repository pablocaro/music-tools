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

  // 0 below `a`, 1 above `b`, straight line between — used to bring each class
  // of metric position under the chord one after another as the dial climbs.
  function ramp(v, a, b) { return Math.max(0, Math.min(1, (v - a) / (b - a))); }

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
  // line used to freeze into a drone.
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

      var last = -1;
      for (j = 0; j < moves.length; j++) {
        var mv = moves[j], np = ctx.p + mv.d, degree = degreeAt(mv.d), bonus = 0;
        if (ph > 0) {
          if (ctx.cadence > 0) {                                                      // resolve at phrase ends
            if (degree === 0) bonus += 3.0 * ctx.cadence;
            else if (degree === 4 || degree === 2) bonus += 0.5 * ctx.cadence;
          }
          if (leap) {                                                                 // gap-fill: step back after a leap
            if (mv.d !== 0 && Math.abs(mv.d) <= 1 && (mv.d > 0) !== (ctx.prevDelta > 0)) bonus += 1.3;
            if (Math.abs(mv.d) >= 2) bonus -= 0.5;
          }
          if (ctx.targetP != null && Math.abs(np - ctx.targetP) < Math.abs(ctx.p - ctx.targetP)) bonus += 0.5; // contour
        }
        mv.sw = mv.w * (1 + ph * bonus);
        // guard 2 lives in the `mv.d === 0` half of this test: a unison is never
        // an arrival, however good the note it stays on happens to be.
        if (pull > 0 && (mv.d === 0 || tones.indexOf(degree) < 0)) mv.sw *= (1 - pull);
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
      this._beatQueue = null;                         // drop carryover
      this._measureIdx = (this._measureIdx == null) ? 0 : this._measureIdx + 1;
    }
    if (!this._beatQueue || this._beatQueue.length === 0) {
      var remaining = currentMeasure.Duration.RealValue - startPosition.RealValue;
      this._beatQueue = nextBeat(this.options.beatPatterns, remaining);
    }
    var ev = this._beatQueue.shift();
    var duration = new O.Fraction(ev.n, ev.d);
    var makeRest = !!ev.rest;

    if (this._p === undefined || this._p === null) {
      this._p = PMIN; // start at the bottom of the chosen range
    } else if (!makeRest) {
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
        var cadence = ((phrasePos === 3 || lastM) && beatF >= barQ / 2) ? (lastM ? 1.5 : 0.8) : 0;
        var progress = Math.max(0, Math.min(1, (mi + beatF / barQ) / totalM));
        var targetP = PMIN + (PMAX - PMIN) * (0.35 + 0.4 * Math.sin(Math.PI * progress));   // gentle arch
        delta = pickMusicalDelta(alpha, {
          phrase: phrase, pull: chord * anchor * PULL_MAX, p: oldP, N: N,
          pMin: PMIN, pMax: PMAX, chordTones: chordTones,
          cadence: cadence, targetP: targetP, prevDelta: this._prevDelta || 0
        });
      } else {
        delta = pickDelta(alpha);
      }
      var np = oldP + delta;
      if (np > PMAX || np < PMIN) np = oldP - delta; // reflect at edges
      if (np > PMAX) np = PMAX;
      if (np < PMIN) np = PMIN;
      this._prevDelta = np - oldP;
      this._p = np;
    }

    var p = this._p;
    var degree = ((p % N) + N) % N;
    var octave = (ladder && ladder.octaveOf[p] != null) ? ladder.octaveOf[p] : (BASE_OCTAVE + Math.floor(p / N));
    var pitch = tones[degree].toPitch(octave);
    if (makeRest) { pitch.__rest = true; } // flag carried through to generateEntry

    return { Pitch: pitch, Duration: duration };
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
    computeBounds: computeBounds
  };
}());
