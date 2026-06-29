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

  // Like pickDelta, but reweights the candidate moves by musical context — chord
  // tones on strong beats, gap-fill after a leap, a phrase contour, and cadential
  // pull to the tonic — scaled by `musicality` (0 = the plain weighted-random walk).
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
    var m = ctx.musicality, total = 0, j, r;
    if (m > 0) {
      var leap = Math.abs(ctx.prevDelta) >= 2;
      for (j = 0; j < moves.length; j++) {
        var mv = moves[j], np = ctx.p + mv.d, degree = ((np % ctx.N) + ctx.N) % ctx.N, bonus = 0;
        if (ctx.strongBeat && ctx.chordTones.indexOf(degree) >= 0) bonus += 1.4;     // land on harmony
        if (ctx.cadence > 0) {                                                        // resolve at phrase ends
          if (degree === 0) bonus += 3.0 * ctx.cadence;
          else if (degree === 4 || degree === 2) bonus += 0.5 * ctx.cadence;
        }
        if (leap) {                                                                   // gap-fill: step back after a leap
          if (mv.d !== 0 && Math.abs(mv.d) <= 1 && (mv.d > 0) !== (ctx.prevDelta > 0)) bonus += 1.3;
          if (Math.abs(mv.d) >= 2) bonus -= 0.5;
        }
        if (ctx.targetP != null && Math.abs(np - ctx.targetP) < Math.abs(ctx.p - ctx.targetP)) bonus += 0.5; // contour
        mv.sw = mv.w * (1 + m * bonus);
        if (mv.sw < 0.0001) mv.sw = 0.0001;
        total += mv.sw;
      }
      r = Math.random() * total;
      for (j = 0; j < moves.length; j++) { r -= moves[j].sw; if (r <= 0) return moves[j].d; }
      return moves[moves.length - 1].d;
    }
    for (j = 0; j < moves.length; j++) total += moves[j].w;     // m === 0: plain weighted pick
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
        // Position-aware context for the musical biases.
        var beatF = startPosition.RealValue * 4;       // 0..4 in 4/4
        var bi = Math.round(beatF);
        var strongBeat = (Math.abs(beatF - bi) < 0.05) && (bi % 2 === 0);   // beat 1 or 3
        var mi = this._measureIdx || 0, totalM = this.options.measure_count || 8;
        var phrasePos = mi % 4;
        var root = [0, 3, 4, 0][phrasePos];            // I – IV – V – I, in scale-degree roots
        var chordTones = [root % N, (root + 2) % N, (root + 4) % N];
        var lastM = (mi === totalM - 1);
        var cadence = ((phrasePos === 3 || lastM) && beatF >= 2) ? (lastM ? 1.5 : 0.8) : 0;
        var progress = Math.max(0, Math.min(1, (mi + beatF / 4) / totalM));
        var targetP = PMIN + (PMAX - PMIN) * (0.35 + 0.4 * Math.sin(Math.PI * progress));   // gentle arch
        delta = pickMusicalDelta(alpha, {
          musicality: musicality, p: oldP, N: N, strongBeat: strongBeat, chordTones: chordTones,
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
