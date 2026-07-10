/**
 * app.js — UI, rendering, and orchestration.
 *
 * Pipeline: read the controls -> ask OSME to generate a sheet (pitch selection
 * is overridden in engine.js) -> export to MusicXML -> load + render via OSMD's
 * standard path -> draw chunk brackets over the result.
 */
(function () {
  "use strict";

  // ---- OSME / OSMD classes (window.osme after the bundle loads) ----
  var O = window.osme;
  var ExampleSourceGenerator   = O.ExampleSourceGenerator;
  var ComplexityMap            = O.ComplexityMap;
  var DefaultInstrumentOptions = O.DefaultInstrumentOptions;
  var ScaleKey                 = O.ScaleKey;
  var OpenSheetMusicDisplay    = O.OpenSheetMusicDisplay;
  var RhythmInstruction        = O.RhythmInstruction;
  var RhythmSymbolEnum         = O.RhythmSymbolEnum;
  var Fraction                 = O.Fraction;
  var XMLSourceExporter        = O.XMLSourceExporter;

  // ---- config ----
  var COLOR_SCALE = "#9aa0a8";   // neutral grey — stepwise motion
  var COLOR_CHORD = "#0a84ff";   // iOS blue — leaps / arpeggios
  var WEIGHT_MAX = 4;            // max per-interval slider weight
  var MEASURES_PER_LINE = 6;     // cap on a wide screen
  var MIN_PER_LINE = 2;          // never fewer than this; shrink to fit if needed
  var MEASURE_PX = 175;          // ~full-size measure width (FixedMeasureWidth keeps it stable)
  var CLEF_PX = 88;              // ~clef + key + time prefix at a line start
  var BRACKET_GAP = 10;         // px the bracket sits above the highest notehead
  var BRACKET_TICK = 6;         // px length of the bracket's end ticks
  var SYSTEM_BREAK_PX = 40;     // vertical gap that signals a line wrap
  var STORE_KEY = "sr_presets";
  var SESSION_KEY = "sr_session";  // last-used settings, restored on reload
  var GROUPS_KEY = "sr_groups";    // collapsed/expanded state of panel groups
  var COUNTIN_FREQ = 1568;      // count-in click pitch (G6) — distinct from play
  var PLAY_FREQ = 784;          // in-piece click pitch (G5)

  // ===========================================================================
  // The alphabet matrix (notes)
  // ===========================================================================
  var INTERVALS = [
    { n: "unison", c: "#888780" },
    { n: "2nd",    c: COLOR_SCALE },
    { n: "3rd",    c: COLOR_CHORD },
    { n: "4th",    c: COLOR_CHORD },
    { n: "5th",    c: COLOR_CHORD },
    { n: "6th",    c: COLOR_CHORD },
    { n: "7th",    c: COLOR_CHORD },
    { n: "octave", c: COLOR_CHORD }
  ];

  // built-in presets (same weight applied to down + up): [uni,2,3,4,5,6,7,oct]
  var BUILTIN = {
    "steps only":   [0, 4, 0, 0, 0, 0, 0, 0],
    "thirds drill": [1, 2, 4, 1, 1, 0, 0, 0],
    "wide leaps":   [0, 1, 2, 3, 3, 2, 1, 2]
  };

  // Migrate an old 7-entry alphabet ([..,6th,octave]) to 8 entries by inserting
  // a 0 for the new 7th slot, so saved presets/sessions keep their octave weight.
  function fix7(a) {
    return (a && a.length === 7) ? a.slice(0, 6).concat([0], a.slice(6)) : a;
  }

  var downInputs = [], upInputs = [];
  var matrixEl  = document.getElementById("matrix");
  var presetsEl = document.getElementById("presets");

  function makeCell(arr) {
    var cell = document.createElement("div");
    cell.className = "cell";
    var input = document.createElement("input");
    input.type = "range"; input.min = 0; input.max = WEIGHT_MAX; input.step = 1; input.value = 0;
    var ro = document.createElement("span");
    ro.className = "ro"; ro.textContent = "0";
    input.addEventListener("input", function () { ro.textContent = input.value; });
    input.addEventListener("change", generate);
    cell.appendChild(input); cell.appendChild(ro);
    arr.push(input);
    return cell;
  }

  function buildMatrix() {
    INTERVALS.forEach(function (iv) {
      var row = document.createElement("div");
      row.className = "matrix-row";
      var label = document.createElement("div");
      label.className = "row-label";
      label.innerHTML = '<span class="dot" style="background:' + iv.c + '"></span>' + iv.n;
      row.appendChild(label);
      row.appendChild(makeCell(upInputs));
      row.appendChild(makeCell(downInputs));
      matrixEl.appendChild(row);
    });
  }

  function setWeights(weights) {
    weights = fix7(weights);
    for (var i = 0; i < weights.length; i++) {
      downInputs[i].value = weights[i];
      upInputs[i].value = weights[i];
      downInputs[i].nextElementSibling.textContent = weights[i];
      upInputs[i].nextElementSibling.textContent = weights[i];
    }
  }

  function readAlphabet() {
    return {
      down: downInputs.map(function (x) { return +x.value; }),
      up:   upInputs.map(function (x) { return +x.value; })
    };
  }

  // ---- presets (built-in + saved in localStorage) ----
  // Saved presets store the full {down, up} columns; built-ins (and any legacy
  // saves) are plain arrays applied symmetrically. A saved name shadowing a
  // built-in acts as an editable override; deleting it reverts to the built-in.
  var activePreset = null;

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function applyAlphabet(a) {
    var down = fix7(a.down), up = fix7(a.up);
    for (var i = 0; i < INTERVALS.length; i++) {
      var d = (down && down[i]) || 0, u = (up && up[i]) || 0;
      downInputs[i].value = d; upInputs[i].value = u;
      downInputs[i].nextElementSibling.textContent = d;
      upInputs[i].nextElementSibling.textContent = u;
    }
  }

  // A preset/session may carry any subset of the panel's state; apply what's
  // present. Built-ins (and legacy saves) are plain symmetric alphabet arrays.
  function applyPreset(p) {
    if (Array.isArray(p)) { setWeights(p); return; }
    if (p.alphabet) applyAlphabet(p.alphabet);
    else if (p.down || p.up) applyAlphabet(p);              // legacy {down, up}
    if (p.range) applyRange(p.range);
    if (p.beats) applyBeats(p.beats);
    if (p.key != null) setKeyFromCode(p.key);
    if (p.measures != null) measuresEl.value = String(Math.max(8, parseInt(p.measures, 10) || 16));
    if (p.musicality != null) { musicalityEl.value = p.musicality; musicalityValEl.textContent = p.musicality; }
    if (p.tempo != null) { tempoEl.value = p.tempo; tempoValEl.textContent = p.tempo; }
    if (p.cursor != null) cursorModeEl.value = p.cursor;
    // metronome is intentionally NOT restored — it always starts off each load
    if (p.playAlong != null) playAlongEl.checked = p.playAlong;
    if (p.instrument != null) instrumentEl.value = p.instrument;
    if (p.volume != null) { volumeEl.value = p.volume; volumeValEl.textContent = p.volume; }
    if (p.hideBehind != null) hideBehindEl.checked = p.hideBehind;
    if (p.hideLead != null) { hideLeadEl.value = p.hideLead; hideLeadValEl.textContent = p.hideLead; }
    if (p.showChunks != null) showChunksEl.checked = p.showChunks;
  }

  // The full panel snapshot — what a preset and the remembered session store.
  function readConfig() {
    return {
      alphabet: { down: downInputs.map(function (x) { return +x.value; }),
                  up:   upInputs.map(function (x) { return +x.value; }) },
      range: JSON.parse(JSON.stringify(rangeState)),
      beats: readBeatIds(),
      key: currentKeyCode(),
      measures: measuresEl.value,
      musicality: musicalityEl.value,
      tempo: tempoEl.value,
      cursor: cursorModeEl.value,
      metronome: clickOnEl.checked,
      playAlong: playAlongEl.checked,
      instrument: instrumentEl.value,
      volume: volumeEl.value,
      hideBehind: hideBehindEl.checked,
      hideLead: hideLeadEl.value,
      showChunks: showChunksEl.checked
    };
  }

  function persistSession() {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(readConfig())); } catch (e) {}
  }

  function restoreSession() {
    var s; try { s = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) {}
    if (s) { applyPreset(s); activePreset = null; }   // a session isn't a named preset
  }

  function renderPresets() {
    presetsEl.innerHTML = "";
    var saved = loadSaved();
    var all = {};
    Object.keys(BUILTIN).forEach(function (k) { all[k] = BUILTIN[k]; });
    Object.keys(saved).forEach(function (k) { all[k] = saved[k]; });

    Object.keys(all).forEach(function (name) {
      var pill = document.createElement("button");
      pill.className = "pill";
      var label = document.createElement("span");
      label.textContent = name;
      pill.appendChild(label);
      pill.addEventListener("click", function () {
        applyPreset(all[name]);
        activePreset = name;
        markActive(pill);
        generate();
      });
      if (saved.hasOwnProperty(name)) {                // user preset/override: updatable + deletable
        var upd = document.createElement("span");
        upd.className = "upd"; upd.textContent = "↻"; upd.title = "Update with current settings";
        upd.addEventListener("click", function (e) {
          e.stopPropagation();
          updatePreset(name);
        });
        pill.appendChild(upd);
        var del = document.createElement("span");
        del.className = "del"; del.textContent = "×"; del.title = "Delete preset";
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          deletePreset(name);
        });
        pill.appendChild(del);
      }
      if (name === activePreset) pill.classList.add("active");
      presetsEl.appendChild(pill);
    });

    var save = document.createElement("button");
    save.className = "pill save"; save.textContent = "+ save";
    save.addEventListener("click", saveCurrent);
    presetsEl.appendChild(save);
    updateHeader();
  }

  function markActive(pill) {
    presetsEl.querySelectorAll(".pill").forEach(function (p) { p.classList.remove("active"); });
    if (pill) pill.classList.add("active");
  }

  function deletePreset(name) {
    if (!confirm("Delete preset “" + name + "”?")) return;
    var saved = loadSaved();
    delete saved[name];
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    if (activePreset === name) activePreset = null;
    renderPresets();
  }

  // Overwrite an existing preset with the whole current panel state.
  function updatePreset(name) {
    if (!confirm("Update preset “" + name + "” with the current settings?")) return;
    var saved = loadSaved();
    saved[name] = readConfig();
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    activePreset = name;
    renderPresets();
  }

  // Create a new preset from the current panel (updating an existing one is the
  // ↻ button's job). Typing an existing name still overwrites it.
  function saveCurrent() {
    var name = prompt("New preset name:", "");
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    var saved = loadSaved();
    saved[name] = readConfig();
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    activePreset = name;
    renderPresets();
  }

  // ===========================================================================
  // Controls
  // ===========================================================================
  var keyTonicEl   = document.getElementById("key-tonic");
  var keyModeEl    = document.getElementById("key-mode");
  var measuresEl   = document.getElementById("measures");
  var musicalityEl    = document.getElementById("musicality");

  // The scale key as a "<mode>_<symbol>-<acc>" code (the form makeScaleKey reads).
  function currentKeyCode() { return keyModeEl.value + "_" + keyTonicEl.value; }
  function setKeyFromCode(code) {
    var parts = String(code).split("_");
    if (parts.length === 2) { keyModeEl.value = parts[0]; keyTonicEl.value = parts[1]; }
  }
  var musicalityValEl = document.getElementById("musicality-val");
  var beatsEl      = document.getElementById("beats");
  var showChunksEl = document.getElementById("show-chunks");
  var generateBtn  = document.getElementById("generate");
  var errorEl      = document.getElementById("error-msg");
  var sheetEl      = document.getElementById("sheet");
  var sheetHeadEl  = document.getElementById("sheet-head");
  var shTitleEl    = document.getElementById("sh-title");
  var shSubEl      = document.getElementById("sh-sub");
  var shNotesEl    = document.getElementById("sh-notes");

  // ===========================================================================
  // Note range grid
  // ===========================================================================
  var RANGE_OCTAVES = [2, 3, 4, 5, 6];
  var NOTE_COLS = [
    { name: "C", semi: 0 },  { name: "D", semi: 2 },  { name: "E", semi: 4 },
    { name: "F", semi: 5 },  { name: "G", semi: 7 },  { name: "A", semi: 9 },
    { name: "B", semi: 11 }
  ];

  var rangeState = {};   // { [oct]: [bool × 7] }
  var rangeCells = {};   // { "oct-i": button }

  function initRangeState() {
    RANGE_OCTAVES.forEach(function (oct) {
      rangeState[oct] = NOTE_COLS.map(function () { return oct === 4 || oct === 5; });
    });
  }

  function syncRangeCells(oct) {
    NOTE_COLS.forEach(function (nc, i) {
      var cell = rangeCells[oct + "-" + i];
      if (cell) cell.className = "note-cell" + (rangeState[oct][i] ? " on" : "");
    });
  }

  function applyRange(r) {
    RANGE_OCTAVES.forEach(function (oct) {
      if (r[oct]) {
        rangeState[oct] = NOTE_COLS.map(function (nc, i) { return !!r[oct][i]; });
        syncRangeCells(oct);
      }
    });
  }

  function buildRangeGrid() {
    var container = document.getElementById("range-grid");
    container.innerHTML = "";
    // column headers
    var hdr = document.createElement("div");
    hdr.className = "note-row";
    hdr.appendChild(document.createElement("span")); // empty corner
    NOTE_COLS.forEach(function (nc) {
      var h = document.createElement("span");
      h.className = "note-col-hdr"; h.textContent = nc.name;
      hdr.appendChild(h);
    });
    container.appendChild(hdr);
    // octave rows
    RANGE_OCTAVES.forEach(function (oct) {
      var row = document.createElement("div");
      row.className = "note-row";
      var lbl = document.createElement("button");
      lbl.className = "note-row-lbl"; lbl.textContent = "C" + oct;
      lbl.addEventListener("click", function () {
        var allOn = rangeState[oct].every(Boolean);
        rangeState[oct] = rangeState[oct].map(function () { return !allOn; });
        syncRangeCells(oct);
        generate();
      });
      row.appendChild(lbl);
      NOTE_COLS.forEach(function (nc, i) {
        var cell = document.createElement("button");
        cell.className = "note-cell" + (rangeState[oct][i] ? " on" : "");
        rangeCells[oct + "-" + i] = cell;
        (function (o, idx) {
          cell.addEventListener("click", function () {
            rangeState[o][idx] = !rangeState[o][idx];
            syncRangeCells(o);
            generate();
          });
        })(oct, i);
        row.appendChild(cell);
      });
      container.appendChild(row);
    });
  }

  function readRange() {
    var lowH = Infinity, highH = -Infinity;
    RANGE_OCTAVES.forEach(function (oct) {
      NOTE_COLS.forEach(function (nc, i) {
        if (rangeState[oct][i]) {
          var h = oct * 12 + nc.semi;
          if (h < lowH) lowH = h;
          if (h > highH) highH = h;
        }
      });
    });
    if (!isFinite(lowH)) { lowH = 48; highH = 71; } // fallback C4–B5
    return { lowH: lowH, highH: highH };
  }

  // ===========================================================================
  // OSMD renderer
  // ===========================================================================
  var osmd = new OpenSheetMusicDisplay(sheetEl, {
    autoResize: false,
    backend: "SVG",
    drawPartNames: false,
    drawTitle: false,
    autoBeam: true,
    autoBeamOptions: { beam_rests: false },
    cursorsOptions: [{ type: 0, color: "#1a1a1a", alpha: 0.18, follow: false }]
  });
  osmd.EngravingRules.AutoBeamNotes = true;                              // beam eighths/sixteenths
  osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = MEASURES_PER_LINE;
  osmd.EngravingRules.FixedMeasureWidth = true;                         // keep measures an even width

  var currentSheet = null;

  // build a ScaleKey from a "<type>_<sym>-<acc>" code, where type is
  // major / minor (natural) / harmonic / melodic.
  // (OSME's fromStringCode only understands major, so we build it ourselves.)
  var SCALE_TYPES = {
    major:    function () { return O.ScaleType.MAJOR; },
    minor:    function () { return O.ScaleType.MINOR_NATURAL; },
    harmonic: function () { return O.ScaleType.MINOR_HARMONIC; },
    melodic:  function () { return O.ScaleType.MINOR_MELODIC; }
  };
  function makeScaleKey(code) {
    var parts = code.split("_");
    var typeFn = SCALE_TYPES[parts[0]] || SCALE_TYPES.major;
    var type = typeFn();
    var tp = parts[1].split("-");
    var symbol = parseInt(tp[0], 10);
    var acc = (tp[1] === "b") ? -1 : (tp[1] === "#") ? 1 : 0;
    var tone = O.Tone.getToneFromSymbol(symbol, acc);
    var sk = ScaleKey.create(type, tone);

    // Harmonic/melodic minor: the raised 6th/7th are accidentals, not part of
    // the key signature. Force the signature to natural minor's; the raised
    // tones then render as accidentals on each note.
    if (type === O.ScaleType.MINOR_HARMONIC || type === O.ScaleType.MINOR_MELODIC) {
      var naturalNum = ScaleKey.create(O.ScaleType.MINOR_NATURAL, tone).getKeyNumber();
      sk.getKeyNumber = function () { return naturalNum; };
    }
    return sk;
  }

  // Rhythm figures, in display order. Each event is [num, den] or [num, den,
  // true] for a rest; a figure's events sum to one beat (1/4) unless it's a
  // multi-beat cell (whole/half). Rendered as a flat grid of notation cells.
  var BEAT_FIGURES = [
    // plain figures
    { id: "w",    name: "whole",                  events: [[1,1]] },
    { id: "h",    name: "half",       def: true,  events: [[1,2]] },
    { id: "q",    name: "quarter",    def: true,  events: [[1,4]] },
    { id: "ee",   name: "eighths",    def: true,  events: [[1,8],[1,8]] },
    { id: "ssss", name: "sixteenths",             events: [[1,16],[1,16],[1,16],[1,16]] },
    // mixed
    { id: "ess",  name: "eighth + 2 sixteenths",  events: [[1,8],[1,16],[1,16]] },
    { id: "sse",  name: "2 sixteenths + eighth",  events: [[1,16],[1,16],[1,8]] },
    { id: "ses",  name: "16th–8th–16th",          events: [[1,16],[1,8],[1,16]] },
    // dotted
    { id: "des",  name: "dotted 8th + 16th",      events: [[3,16],[1,16]] },
    { id: "sde",  name: "16th + dotted 8th",      events: [[1,16],[3,16]] },
    // with rests
    { id: "qr",   name: "quarter rest",           events: [[1,4,true]] },
    { id: "re",   name: "8th rest + eighth",      events: [[1,8,true],[1,8]] },
    { id: "er",   name: "eighth + 8th rest",      events: [[1,8],[1,8,true]] }
  ];

  var BEAT_PATTERNS = {}; // id -> [{n,d,rest}]

  // A tiny notation glyph (inline SVG, currentColor so it inverts when the cell
  // is on) for each rhythm figure — noteheads, stems, beams, dots, rests.
  function figureGlyph(id) {
    var H = 19, TOP = 5, SB = 8.6;   // notehead baseline, stem top, 2nd-beam y
    function head(x, open) {
      return open
        ? '<ellipse cx="' + x + '" cy="' + H + '" rx="3.4" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/>'
        : '<ellipse cx="' + x + '" cy="' + H + '" rx="3.3" ry="2.5" fill="currentColor"/>';
    }
    function stem(x) { return '<line x1="' + (x + 2.6) + '" y1="' + (H - 1) + '" x2="' + (x + 2.6) + '" y2="' + TOP + '" stroke="currentColor" stroke-width="1.1"/>'; }
    function beam(x1, x2, y) { return '<rect x="' + x1 + '" y="' + y + '" width="' + (x2 - x1) + '" height="2.4" fill="currentColor"/>'; }
    function dot(x) { return '<circle cx="' + (x + 5.8) + '" cy="' + H + '" r="1.1" fill="currentColor"/>'; }
    function flag(x) { var s = x + 2.6; return '<path d="M ' + s + ' ' + TOP + ' c 4 1.5 4.5 4.5 1.5 7.6" fill="none" stroke="currentColor" stroke-width="1.3"/>'; }
    function rest8(x) { return '<circle cx="' + (x - 0.5) + '" cy="' + (H - 7) + '" r="1.6" fill="currentColor"/><path d="M ' + (x + 0.8) + ' ' + (H - 8.2) + ' L ' + (x - 2) + ' ' + (H) + '" stroke="currentColor" stroke-width="1.2" fill="none"/>'; }
    function rest4(x) { return '<path d="M ' + (x - 2) + ' ' + (TOP + 1) + ' l 3.6 4 l -3 2.4 l 3.6 4.6 l -2 1.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'; }
    var g;
    switch (id) {
      case "w":    g = head(22, true); break;
      case "h":    g = head(22, true) + stem(22); break;
      case "q":    g = head(22, false) + stem(22); break;
      case "ee":   g = head(14, 0) + head(30, 0) + stem(14) + stem(30) + beam(16.6, 32.6, TOP); break;
      case "ssss": g = head(9, 0) + head(18, 0) + head(27, 0) + head(36, 0) + stem(9) + stem(18) + stem(27) + stem(36) + beam(11.6, 38.6, TOP) + beam(11.6, 38.6, SB); break;
      case "ess":  g = head(11, 0) + head(22, 0) + head(33, 0) + stem(11) + stem(22) + stem(33) + beam(13.6, 35.6, TOP) + beam(24.6, 35.6, SB); break;
      case "sse":  g = head(11, 0) + head(22, 0) + head(33, 0) + stem(11) + stem(22) + stem(33) + beam(13.6, 35.6, TOP) + beam(13.6, 24.6, SB); break;
      case "ses":  g = head(11, 0) + head(22, 0) + head(33, 0) + stem(11) + stem(22) + stem(33) + beam(13.6, 35.6, TOP) + beam(13.6, 17.6, SB) + beam(31.6, 35.6, SB); break;
      case "des":  g = head(14, 0) + head(30, 0) + stem(14) + stem(30) + beam(16.6, 32.6, TOP) + beam(26.6, 32.6, SB) + dot(14); break;
      case "sde":  g = head(14, 0) + head(30, 0) + stem(14) + stem(30) + beam(16.6, 32.6, TOP) + beam(16.6, 22.6, SB) + dot(30); break;
      case "qr":   g = rest4(22); break;
      case "re":   g = rest8(13) + head(30, 0) + stem(30) + flag(30); break;
      case "er":   g = head(14, 0) + stem(14) + flag(14) + rest8(33); break;
      default:     g = head(22, false) + stem(22);
    }
    return '<svg viewBox="0 0 44 28" class="fig-svg">' + g + "</svg>";
  }

  // Flat grid of rhythm figures — each cell is a notation glyph toggled on/off,
  // its name revealed on hover. A hidden .beat checkbox keeps the read/apply
  // path (buildBeatPatterns / readBeatIds / applyBeats) unchanged.
  function buildBeatsPalette() {
    var grid = document.createElement("div");
    grid.className = "fig-grid";
    BEAT_FIGURES.forEach(function (item) {
      BEAT_PATTERNS[item.id] = item.events.map(function (e) {
        return { n: e[0], d: e[1], rest: !!e[2] };
      });
      var cell = document.createElement("label");
      cell.className = "fig-cell";
      cell.setAttribute("data-name", item.name);
      cell.setAttribute("aria-label", item.name);
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.className = "beat"; cb.value = item.id; cb.checked = !!item.def; cb.hidden = true;
      if (cb.checked) cell.classList.add("on");
      cb.addEventListener("change", function () { cell.classList.toggle("on", cb.checked); generate(); });
      cell.appendChild(cb);
      cell.insertAdjacentHTML("beforeend", figureGlyph(item.id));
      grid.appendChild(cell);
    });
    beatsEl.appendChild(grid);
  }

  function buildBeatPatterns() {
    var out = [];
    beatsEl.querySelectorAll(".beat:checked").forEach(function (cb) {
      if (BEAT_PATTERNS[cb.value]) out.push(BEAT_PATTERNS[cb.value]);
    });
    if (out.length === 0) out.push([{ n: 1, d: 4 }]); // fallback: a quarter
    return out;
  }

  function readBeatIds() {
    var ids = [];
    beatsEl.querySelectorAll(".beat:checked").forEach(function (cb) { ids.push(cb.value); });
    return ids;
  }

  function applyBeats(ids) {
    var set = {};
    (ids || []).forEach(function (id) { set[id] = true; });
    beatsEl.querySelectorAll(".beat").forEach(function (cb) {
      cb.checked = !!set[cb.value];
      var cell = cb.closest(".fig-cell");
      if (cell) cell.classList.toggle("on", cb.checked);
    });
  }

  function buildOptions() {
    var scaleKey = makeScaleKey(currentKeyCode());
    var ladder = SREngine.buildLadder(scaleKey);
    var range = readRange();
    var bounds = SREngine.computeBounds(ladder, range.lowH, range.highH);

    return {
      complexity: 0.5,  // required by OSME; pitch/rhythm are driven by our settings
      measure_count: parseInt(measuresEl.value, 10),
      tempo: 80,
      time_signature: new RhythmInstruction(new Fraction(4, 4, 0, false), RhythmSymbolEnum.NONE),
      scale_key: scaleKey,
      instruments: [DefaultInstrumentOptions.get("trumpet")],
      pitch_settings: ComplexityMap.getPitchSettings(0.5), // unused (overridden) but kept valid
      alphabet: readAlphabet(),
      ladder: ladder,
      rangeMin: bounds.min,
      rangeMax: bounds.max,
      beatPatterns: buildBeatPatterns(),
      musicality: (+musicalityEl.value) / 100
    };
  }

  function generate(after) {
    clearError();
    if ((playing || paused) && !advancing) resetTop();   // manual regen stops playback; auto-advance keeps it
    try {
      var plugin = new ExampleSourceGenerator(buildOptions());
      currentSheet = plugin.generate();
      var xml = new XMLSourceExporter().export(currentSheet);
      osmd.load(xml).then(function () {
        renderLoaded();
        persistSession();
        if (typeof after === "function") after();
      }).catch(function (e) {
        showError("Load failed: " + (e.message || e));
        console.error(e);
      });
    } catch (e) {
      showError(e.message || String(e));
      console.error(e);
    }
  }

  function availWidth() {
    var area = sheetEl.parentNode, cs = getComputedStyle(area);
    return area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  // ===========================================================================
  // Summary header — title / digest / notes, reflecting the current settings
  // ===========================================================================
  var MODE_SHORT = { major: "maj", minor: "min", harmonic: "harm", melodic: "mel" };

  function titleCase(s) {
    return String(s).replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // "{n} Rhythms" — the count of selected beat figures.
  function rhythmSummary() {
    var n = readBeatIds().length;
    return n ? n + " Rhythm" + (n !== 1 ? "s" : "") : "";
  }

  // The selected pitches: a span ("C4–B5") when contiguous, an explicit list
  // ("A5,B5,D6,G6") when a few are scattered, else a count.
  function noteSummary() {
    var sel = [];
    RANGE_OCTAVES.forEach(function (oct) {
      NOTE_COLS.forEach(function (nc, ci) {
        if (rangeState[oct] && rangeState[oct][ci]) {
          sel.push({ oct: oct, ci: ci, name: nc.name + oct, h: oct * 12 + nc.semi });
        }
      });
    });
    if (!sel.length) return "no notes";
    sel.sort(function (a, b) { return a.h - b.h; });
    var lo = sel[0], hi = sel[sel.length - 1];
    if (sel.length === 1) return lo.name;
    var between = 0;
    RANGE_OCTAVES.forEach(function (oct) {
      NOTE_COLS.forEach(function (nc) {
        var h = oct * 12 + nc.semi;
        if (h >= lo.h && h <= hi.h) between++;
      });
    });
    if (between === sel.length) return lo.name + "–" + hi.name;     // contiguous block
    if (sel.length <= 8) return sel.map(function (s) { return s.name; }).join(",");
    return sel.length + " notes";
  }

  function updateTempoPill() {
    if (tempoPillValEl) tempoPillValEl.textContent = tempoEl.value;
  }

  function updateHeader() {
    var tonic = keyTonicEl.options[keyTonicEl.selectedIndex].textContent;
    var mode = MODE_SHORT[keyModeEl.value] || "";
    if (mode) mode = mode.charAt(0).toUpperCase() + mode.slice(1);
    shTitleEl.textContent = titleCase(activePreset || "Custom") + " · " + tonic + " " + mode;
    shSubEl.textContent = measuresEl.value + " Bars, " + noteSummary();
    var r = rhythmSummary();
    if (+musicalityEl.value > 0) r += (r ? ", " : "") + "Musical";
    shNotesEl.textContent = r;
    updateTempoPill();
  }

  // Reflow to fit the width: pick a measures-per-line target (never below
  // MIN_PER_LINE), keep zoom at 1.0 when that fits, and only shrink just enough
  // to fit the target when the screen is too narrow (so phones get 2 per line
  // rather than 1 huge measure, but desktop is never scaled).
  function renderLoaded() {
    var avail = availWidth();
    var per = Math.max(MIN_PER_LINE, Math.min(MEASURES_PER_LINE, Math.floor((avail - CLEF_PX) / MEASURE_PX)));
    osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = per;
    osmd.zoom = Math.min(1, avail / (CLEF_PX + MEASURE_PX * per));
    osmd.render();
    var svg = sheetEl.querySelector("svg");               // correct any estimate drift
    if (svg) {
      var w = svg.getBoundingClientRect().width;
      if (w > avail + 1) { osmd.zoom *= (avail / w) * 0.99; osmd.render(); }
    }
    drawOverlay();
    updateHeader();
    computeLines();
    if (playing) { lastScrollTarget = -1; followCursor(); }   // keep the cursor in view on a mid-play reflow
    else scrollSheetTop();
    alignHeader();
  }

  // ===========================================================================
  // Viewport pages — the sheet scrolls inside #sheet-stage, but two paper covers
  // mask whatever partial line peeks in at the top and bottom so only WHOLE
  // lines ever show. The masked strips read as a gap between viewport "pages".
  // During play the view holds still until the cursor reaches the last whole
  // line on screen, then scrolls that line to the top to reveal the next page.
  // ===========================================================================
  var lineYs = [];               // {top, bottom} of each system, in content-Y
  var lastScrollTarget = -1;     // de-dupe scrollTo during a smooth scroll
  var TOP_PAD = 14;              // breathing room above the line scrolled to top
  var LINE_OVERLAP = 6;          // px a measure must overlap a system's band to join it
  var coverTopEl = document.getElementById("cover-top");
  var coverBotEl = document.getElementById("cover-bot");

  function scrollSheetTop() {
    var st = sheetEl.parentNode;
    st.scrollTo({ top: 0, behavior: "auto" });   // instant — also cancels an in-flight smooth auto-scroll
    st.scrollTop = 0;                             // belt-and-suspenders for older iPadOS Safari
    requestAnimationFrame(function () { st.scrollTop = 0; });   // re-assert once layout settles
    lastScrollTarget = -1;
    updateGap();
  }

  // Group measures into systems (a leftward x reset marks a new line) and record
  // each line's vertical span (scroll-invariant: relative to #sheet's own top).
  // Group measures into systems (lines) by vertical band. We can't key off an
  // x-reset: when the window is narrow enough to render ONE measure per line every
  // measure shares the same left, so no reset ever appears and all systems collapse
  // into one. Instead, a measure starts a new system when it sits clear below the
  // current system's band (measures within a system overlap vertically; the next
  // system is separated by a gap). Works for any measures-per-line.
  function computeLines() {
    lineYs = [];
    var svg = sheetEl.querySelector("svg");
    if (!svg) return;
    var sheetTop = sheetEl.getBoundingClientRect().top;
    var li = -1;
    Array.prototype.forEach.call(svg.querySelectorAll(".vf-measure"), function (m) {
      var r = m.getBoundingClientRect(), top = r.top - sheetTop, bot = r.bottom - sheetTop;
      if (li < 0 || top >= lineYs[li].bottom - LINE_OVERLAP) {   // no overlap with current system → new line
        li++; lineYs[li] = { top: top, bottom: bot };
      } else {
        lineYs[li].top = Math.min(lineYs[li].top, top);
        lineYs[li].bottom = Math.max(lineYs[li].bottom, bot);
      }
    });
  }

  // The system the cursor currently sits on, as an index into lineYs.
  function cursorLineIndex() {
    var cur = osmd.cursor && osmd.cursor.cursorElement;
    if (!cur) return -1;
    var cRect = cur.getBoundingClientRect();
    if (!cRect.height) return -1;
    var mid = (cRect.top + cRect.bottom) / 2 - sheetEl.getBoundingClientRect().top;  // content-Y
    var ci = 0;
    for (var i = 0; i < lineYs.length; i++) { if (mid >= lineYs[i].top - 4) ci = i; }
    return ci;
  }

  // The whole systems fully inside the current viewport.
  function visibleLineRange() {
    var stage = sheetEl.parentNode;
    var scrollTop = stage.scrollTop, stageH = stage.clientHeight, visBottom = scrollTop + stageH;
    var firstIdx = -1, lastIdx = -1, firstT = scrollTop, lastB = visBottom;
    for (var i = 0; i < lineYs.length; i++) {
      if (lineYs[i].top >= scrollTop - 2 && lineYs[i].bottom <= visBottom + 2) {
        if (firstIdx < 0) { firstIdx = i; firstT = lineYs[i].top; }
        lastIdx = i; lastB = lineYs[i].bottom;
      }
    }
    return { firstIdx: firstIdx, lastIdx: lastIdx, firstT: firstT, lastB: lastB,
             scrollTop: scrollTop, stageH: stageH, visBottom: visBottom };
  }

  // Size/position the paper covers over the partial lines at the viewport edges.
  function updateGap() {
    if (!coverTopEl || !coverBotEl) return;
    var stage = sheetEl.parentNode, area = stage.parentNode;
    var aRect = area.getBoundingClientRect(), sRect = stage.getBoundingClientRect();
    var left = (sRect.left - aRect.left) + "px", width = stage.clientWidth + "px";
    var top = sRect.top - aRect.top;
    coverTopEl.style.left = coverBotEl.style.left = left;
    coverTopEl.style.width = coverBotEl.style.width = width;
    if (!lineYs.length) { coverTopEl.style.height = coverBotEl.style.height = "0px"; return; }
    var r = visibleLineRange();
    var topGap = (r.firstIdx < 0) ? 0 : Math.max(0, r.firstT - r.scrollTop);
    var botGap = (r.firstIdx < 0) ? 0 : Math.max(0, r.visBottom - r.lastB);
    coverTopEl.style.top = top + "px";
    coverTopEl.style.height = topGap + "px";
    coverBotEl.style.top = (top + r.stageH - botGap) + "px";
    coverBotEl.style.height = botGap + "px";
  }

  function followCursor() {
    if (!lineYs.length) return;
    var ci = cursorLineIndex();
    if (ci < 0) return;
    var stage = sheetEl.parentNode;
    var r = visibleLineRange();
    var clipped = (r.lastIdx < 0) || ci > r.lastIdx ||
                  lineYs[ci].bottom > r.visBottom - 2 || lineYs[ci].top < r.scrollTop - 2;
    var reachedEnd = (r.lastIdx >= 0) && (ci >= r.lastIdx) && (ci < lineYs.length - 1);
    if (reachedEnd || clipped) {
      var maxScroll = stage.scrollHeight - stage.clientHeight;
      var target = Math.min(Math.max(0, lineYs[ci].top - TOP_PAD), maxScroll);
      if (target > stage.scrollTop + 4 && Math.abs(target - lastScrollTarget) > 4) {
        lastScrollTarget = target;
        stage.scrollTo({ top: target, behavior: "smooth" });
      }
    }
    updateGap();
  }

  // Inset the header row so the title lines up with the music's left edge and the
  // tempo pill lines up with its right edge.
  function alignHeader() {
    var ms = sheetEl.querySelectorAll(".vf-measure");
    if (!ms.length || !sheetTopEl) return;
    var topRect = sheetTopEl.getBoundingClientRect();
    var left = Infinity, right = -Infinity;
    Array.prototype.forEach.call(ms, function (m) {
      var r = m.getBoundingClientRect();
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
    });
    sheetTopEl.style.paddingLeft = Math.max(0, left - topRect.left) + "px";
    sheetTopEl.style.paddingRight = Math.max(0, topRect.right - right) + "px";
  }

  // Reflect the metronome on/off state in the tempo pill.
  function syncMetroPill() {
    if (tempoPillEl) tempoPillEl.classList.toggle("metro-on", clickOnEl.checked);
  }

  // ===========================================================================
  // Seeing mode: read the rendered notes back out and bracket the chunks
  // ===========================================================================
  function collectNotes() {
    var out = [];
    var measureList = osmd.graphic && osmd.graphic.MeasureList;
    if (!measureList) return out;
    for (var m = 0; m < measureList.length; m++) {
      var staves = measureList[m];
      if (!staves || !staves[0]) continue;
      var staffEntries = staves[0].staffEntries || [];
      for (var s = 0; s < staffEntries.length; s++) {
        var gves = staffEntries[s].graphicalVoiceEntries || [];
        for (var v = 0; v < gves.length; v++) {
          var notes = gves[v].notes || [];
          for (var n = 0; n < notes.length; n++) {
            var gn = notes[n], src = gn.sourceNote;
            var isRest = src.isRest();
            var halfTone = (!isRest && src.Pitch) ? src.Pitch.getHalfTone() : null;
            var el = null;
            try { el = gn.getSVGGElement ? gn.getSVGGElement() : null; } catch (err) { el = null; }
            out.push({ isRest: isRest, halfTone: halfTone, el: el });
          }
        }
      }
    }
    return out;
  }

  // group maximal same-direction runs; classify scale (steps) vs chord (leaps)
  function analyzeChunks(notes) {
    var chunks = [], run = [], dir = 0;
    function flush() {
      if (run.length >= 2) {
        var maxStep = 0;
        for (var i = 1; i < run.length; i++) maxStep = Math.max(maxStep, Math.abs(run[i].halfTone - run[i - 1].halfTone));
        chunks.push({ notes: run.slice(), type: maxStep >= 3 ? "chord" : "scale" });
      }
      run = []; dir = 0;
    }
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      if (note.isRest || note.halfTone == null || !note.el) { flush(); continue; }
      if (run.length === 0) { run = [note]; dir = 0; continue; }
      var diff = note.halfTone - run[run.length - 1].halfTone;
      if (diff === 0) { flush(); run = [note]; continue; }
      var d = diff > 0 ? 1 : -1;
      if (dir === 0) { dir = d; run.push(note); }
      else if (d === dir) { run.push(note); }
      else { flush(); run = [note]; dir = d; }
    }
    flush();
    return chunks;
  }

  function drawOverlay() {
    var old = document.getElementById("chunk-overlay");
    if (old) old.remove();
    if (!showChunksEl.checked) return;

    var chunks = analyzeChunks(collectNotes());
    if (chunks.length === 0) return;

    var cRect = sheetEl.getBoundingClientRect();
    var scrollLeft = sheetEl.scrollLeft || 0, scrollTop = sheetEl.scrollTop || 0;
    var NS = "http://www.w3.org/2000/svg";
    var overlay = document.createElementNS(NS, "svg");
    overlay.setAttribute("id", "chunk-overlay");
    overlay.setAttribute("width", sheetEl.scrollWidth);
    overlay.setAttribute("height", sheetEl.scrollHeight);

    chunks.forEach(function (chunk) {
      var left = Infinity, right = -Infinity, top = Infinity, firstTop = null, sameLine = true;
      chunk.notes.forEach(function (note) {
        var r = note.el.getBoundingClientRect();
        if (firstTop === null) firstTop = r.top;
        if (Math.abs(r.top - firstTop) > SYSTEM_BREAK_PX) sameLine = false;
        left = Math.min(left, r.left); right = Math.max(right, r.right); top = Math.min(top, r.top);
      });
      if (!sameLine) return; // skip chunks that wrap across a system line break

      var x1 = left - cRect.left + scrollLeft;
      var x2 = right - cRect.left + scrollLeft;
      var y = top - cRect.top + scrollTop - BRACKET_GAP;
      var color = chunk.type === "chord" ? COLOR_CHORD : COLOR_SCALE;
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M " + x1 + " " + (y + BRACKET_TICK) + " L " + x1 + " " + y +
                             " L " + x2 + " " + y + " L " + x2 + " " + (y + BRACKET_TICK));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      overlay.appendChild(path);
    });
    sheetEl.appendChild(overlay);
  }

  // ===========================================================================
  // Play mode: the moving clock
  //
  // A single rAF loop is the master clock. From it we drive two event streams,
  // both measured in beats from the downbeat so they stay phase-locked:
  //   - metronome clicks on every beat (plus a 1-bar count-in at negative beats)
  //   - the OSMD cursor, advanced when the playhead reaches each note's onset
  // Note onsets are precomputed by walking the cursor once (durations read off
  // its iterator), which guarantees they line up with the steps we'll take.
  // ===========================================================================
  var tempoEl      = document.getElementById("tempo");
  var tempoValEl   = document.getElementById("tempo-val");
  var tempoPillValEl = document.getElementById("tempo-pill-val");
  var tempoPillEl  = document.getElementById("tempo-pill");
  var metroToggleEl = document.getElementById("metro-toggle");
  var sheetTopEl   = document.getElementById("sheet-top");
  var clickOnEl    = document.getElementById("click-on");
  var playAlongEl  = document.getElementById("play-along");
  var instrumentEl = document.getElementById("instrument");
  var volumeEl     = document.getElementById("volume");
  var volumeValEl  = document.getElementById("volume-val");
  var hideBehindEl = document.getElementById("hide-behind");
  var cursorModeEl = document.getElementById("cursor-mode");
  var hideLeadEl   = document.getElementById("hide-lead");
  var hideLeadValEl = document.getElementById("hide-lead-val");
  var countdownEl  = document.getElementById("countdown");
  var playBtn      = document.getElementById("play");

  // Play / Pause icons swapped into the control-bar button by state.
  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.3"/><rect x="13.5" y="5" width="4" height="14" rx="1.3"/></svg>';
  function setPlayIcon(playingNow) {
    playBtn.innerHTML = playingNow ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute("aria-label", playingNow ? "Pause" : "Play");
  }

  var BEATS_PER_BAR = 4;        // 4/4, fixed
  var playing = false;
  var paused = false;           // frozen mid-line, resumable from the same beat
  var advancing = false;        // mid auto-advance regen (keeps playback alive)
  var rafId = null;
  var session = null;           // live play state (onsets, cursor position, elapsed beats)
  var audioCtx = null;
  var playVoices = [];          // scheduled play-along oscillators, killed on stop

  tempoEl.addEventListener("input", function () { tempoValEl.textContent = tempoEl.value; updateHeader(); retempo(); });
  hideLeadEl.addEventListener("input", function () { hideLeadValEl.textContent = hideLeadEl.value; });
  volumeEl.addEventListener("input", function () {
    volumeValEl.textContent = volumeEl.value;
    if (bus) bus.master.gain.value = volume();        // live while playing
  });

  function volume() { return (+volumeEl.value) / 100; }

  // Create + unlock the audio context. Safari mutes Web Audio until a sound is
  // produced *synchronously inside a user gesture*, so we play a 1-sample silent
  // buffer here. Must be called from a real gesture (a click/tap/keydown).
  function ensureAudio() {
    if (audioCtx && audioCtx.state === "closed") audioCtx = null;  // got torn down — rebuild
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return; }
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    try {
      var src = audioCtx.createBufferSource();
      src.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      src.connect(audioCtx.destination);
      src.start(0);
    } catch (e) {}
  }

  function tick(freq) {
    if (!audioCtx) return;
    var t = audioCtx.currentTime;
    var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
    osc.frequency.value = freq || PLAY_FREQ;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.06);
  }

  // A short synthetic impulse response, so the convolver gives the voice a
  // little room instead of a dry beep.
  function makeImpulse(seconds, decay) {
    var len = Math.floor(audioCtx.sampleRate * seconds);
    var buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // Shared output bus: dry + reverb send into a compressor (gentle limiter), so
  // overlapping notes stay warm and don't clip. Built once per audio context.
  var bus = null;
  function audioBus() {
    if (bus && bus.ctx === audioCtx) return bus;
    if (!audioCtx) return null;
    var comp = audioCtx.createDynamicsCompressor();   // brick-wall limiter: catch clip peaks only, don't squash tone
    comp.threshold.value = -1; comp.knee.value = 0; comp.ratio.value = 20;
    comp.attack.value = 0.002; comp.release.value = 0.1;
    comp.connect(audioCtx.destination);
    var master = audioCtx.createGain(); master.gain.value = volume(); master.connect(comp);
    var reverb = audioCtx.createConvolver(); reverb.buffer = makeImpulse(1.5, 3.2);
    var wet = audioCtx.createGain(); wet.gain.value = 0.22;
    reverb.connect(wet); wet.connect(master);
    bus = { ctx: audioCtx, master: master, reverb: reverb };
    return bus;
  }

  // Play-along: one melody note — triangle through a lowpass (warmth) with a
  // smooth attack/release, sent dry + into the reverb. Scheduled on the audio
  // clock for tight timing; tracked in playVoices so Stop can kill it.
  function scheduleTone(freq, startT, endT) {
    var b = audioBus();
    if (!b) return;
    var osc = audioCtx.createOscillator();
    osc.type = (freq > 520) ? "sine" : "triangle";        // sine up high — no harsh harmonics
    osc.frequency.value = freq;
    var filt = audioCtx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = Math.min(freq * 3.5, 2600);    // roll off harsh harmonics
    filt.Q.value = 0.4;
    var g = audioCtx.createGain();
    var peak = Math.max(0.06, 0.13 * Math.min(1, 520 / freq));  // quieter as pitch climbs
    var atk = 0.014;
    var noteLen = Math.max(0.06, endT - startT);
    var rel = Math.min(0.16, noteLen * 0.6);
    var e = startT + noteLen;
    g.gain.setValueAtTime(0.0001, startT);
    g.gain.exponentialRampToValueAtTime(peak, startT + atk);                 // attack
    g.gain.setValueAtTime(peak, Math.max(startT + atk + 0.001, e - 0.005)); // sustain
    g.gain.exponentialRampToValueAtTime(0.0001, e + rel);                    // release tail
    osc.connect(filt); filt.connect(g);
    g.connect(b.master); g.connect(b.reverb);
    osc.start(startT); osc.stop(e + rel + 0.05);
    playVoices.push(osc);
  }

  // Organ: additive sine "drawbars" (sub-octave, fundamental, octave, fifth,
  // two octaves) with a gentle vibrato — warm and sustaining, no samples.
  var ORGAN_BARS = [{ m: 0.5, g: 0.34 }, { m: 1, g: 1 }, { m: 2, g: 0.5 }, { m: 3, g: 0.28 }, { m: 4, g: 0.16 }];
  function scheduleOrgan(freq, startT, endT) {
    var b = audioBus();
    if (!b) return;
    var noteLen = Math.max(0.06, endT - startT);
    var atk = 0.018, rel = Math.min(0.16, noteLen * 0.5), e = startT + noteLen;
    var peak = 0.085;                                   // partials sum, leave headroom
    var ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.0001, startT);
    ng.gain.exponentialRampToValueAtTime(peak, startT + atk);
    ng.gain.setValueAtTime(peak, Math.max(startT + atk + 0.001, e - 0.005));
    ng.gain.exponentialRampToValueAtTime(0.0001, e + rel);
    ng.connect(b.master); ng.connect(b.reverb);
    var lfo = audioCtx.createOscillator(), lg = audioCtx.createGain();   // shared vibrato
    lfo.frequency.value = 5.5; lg.gain.value = 6;       // ±6 cents
    lfo.connect(lg);
    ORGAN_BARS.forEach(function (bar) {
      var pf = freq * bar.m;
      if (pf > 9000) return;
      var osc = audioCtx.createOscillator(), pg = audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = pf; pg.gain.value = bar.g;
      lg.connect(osc.detune);
      osc.connect(pg); pg.connect(ng);
      osc.start(startT); osc.stop(e + rel + 0.05);
      playVoices.push(osc);
    });
    lfo.start(startT); lfo.stop(e + rel + 0.05);
    playVoices.push(lfo);
  }

  // Sampled instruments: real VCSL samples (a handful per instrument, one every
  // few semitones), pitch-shifted to the nearest. Audio is embedded base64 in
  // samples/instruments.js (window.SR_*); decoded + normalized lazily. Until a
  // set is ready (or if it fails), the organ stands in.
  var SAMPLE_SETS = {
    marimba: { data: "SR_MARIMBA", notes: [["F1",29],["C2",36],["G2",43],["B2",47],["F3",53],["C4",60],["G4",67],["B4",71],["F5",77],["C6",84]] },
    piano:   { data: "SR_PIANO",   notes: [["C2",36],["F#2",42],["C3",48],["F#3",54],["C4",60],["F#4",66],["C5",72],["F#5",78],["C6",84]] },
    vibraphone: { data: "SR_VIBRAPHONE", notes: [["F2",41],["A2",45],["C3",48],["E3",52],["G3",55],["B3",59],["D4",62],["F4",65],["A4",69],["C5",72],["E5",76]] }
  };
  var sampleBuffers = {};   // name -> { midi: {buf, norm} } once decoded
  var sampleLoading = {};   // name -> true while decoding
  var sampleFailed  = {};   // name -> true if its data is missing/undecodable
  function isSampled(name) { return !!SAMPLE_SETS[name]; }

  // decodeAudioData with both the promise form (modern) and the callback form
  // (older Safari, which returns undefined from the promise call).
  function decodeAudio(ab) {
    return new Promise(function (resolve, reject) {
      try {
        var p = audioCtx.decodeAudioData(ab, resolve, reject);
        if (p && typeof p.then === "function") p.then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }

  function b64ToArrayBuffer(b64) {
    var bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // Decode a sampled instrument's notes from its embedded base64 (no fetch, so
  // it works standalone from file://). Each sample is peak-normalized on load —
  // the VCSL recordings are very quiet and uneven (~ -30 to -42 dB).
  function loadSamples(name) {
    if (sampleBuffers[name] || sampleLoading[name] || sampleFailed[name]) return;
    var set = SAMPLE_SETS[name], data = window[set.data];
    ensureAudio();
    if (!audioCtx || !data) { sampleFailed[name] = true; showError(name + " samples unavailable."); return; }
    sampleLoading[name] = true;
    var map = {}, pending = set.notes.length, ok = 0;
    var done = function () {
      if (--pending > 0) return;
      sampleLoading[name] = false;
      if (ok > 0) { sampleBuffers[name] = map; }
      else { sampleFailed[name] = true; showError(name + " samples failed to decode — using the organ instead."); }
    };
    set.notes.forEach(function (nm) {
      var b64 = data[nm[0]];
      if (!b64) { done(); return; }
      decodeAudio(b64ToArrayBuffer(b64))
        .then(function (buf) {
          var d = buf.getChannelData(0), peak = 0;
          for (var i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a; }
          map[nm[1]] = { buf: buf, norm: peak > 0.0005 ? 1 / peak : 1 };   // normalize each to full scale
          ok++; done();
        })
        .catch(function (e) { console.error(name + " sample " + nm[0], e); done(); });
    });
  }

  function freqToMidi(freq) { return 69 + 12 * Math.log(freq / 440) / Math.log(2); }

  function scheduleSampled(name, freq, startT, endT) {
    var b = audioBus(), bufs = sampleBuffers[name];
    if (!b || !bufs) return false;
    var midi = freqToMidi(freq), best = null, bestD = 1e9;
    SAMPLE_SETS[name].notes.forEach(function (nm) {
      if (!bufs[nm[1]]) return;
      var d = Math.abs(nm[1] - midi);
      if (d < bestD) { bestD = d; best = nm[1]; }
    });
    if (best == null) return false;
    var entry = bufs[best];
    var src = audioCtx.createBufferSource();
    src.buffer = entry.buf;
    src.playbackRate.value = Math.pow(2, (midi - best) / 12);          // pitch-shift to exact note
    var g = audioCtx.createGain();
    var ring = Math.min((endT - startT) + 0.4, src.buffer.duration / src.playbackRate.value);
    var stopAt = startT + Math.max(0.18, ring);
    var peak = 0.9 * entry.norm;                                       // normalized to full scale, then played hot
    g.gain.setValueAtTime(peak, startT);
    g.gain.setValueAtTime(peak, Math.max(startT + 0.02, stopAt - 0.08));
    g.gain.linearRampToValueAtTime(0.0001, stopAt);                    // release fade, no click
    src.connect(g); g.connect(b.master); g.connect(b.reverb);
    src.start(startT); src.stop(stopAt + 0.02);
    playVoices.push(src);
    return true;
  }

  // Dispatch a play-along note to the selected voice. A sampled instrument falls
  // back to the organ whenever it can't actually sound a sample (still loading,
  // or failed) — so a load problem is audible rather than silent.
  function scheduleNote(freq, startT, endT) {
    var inst = instrumentEl.value;
    if (isSampled(inst)) {
      if (scheduleSampled(inst, freq, startT, endT)) return;
      if (!sampleBuffers[inst]) loadSamples(inst);
      scheduleOrgan(freq, startT, endT);
      return;
    }
    if (inst === "organ") scheduleOrgan(freq, startT, endT);
    else scheduleTone(freq, startT, endT);
  }

  function stopVoices() {
    playVoices.forEach(function (o) { try { o.stop(); } catch (e) {} });
    playVoices = [];
  }

  function showCountdown(n) { if (countdownEl) { countdownEl.textContent = n; countdownEl.hidden = false; } }
  function hideCountdown() { if (countdownEl) countdownEl.hidden = true; }

  function blinkCursor(on, ms) {
    var el = osmd.cursor && osmd.cursor.cursorElement;
    if (!el) return;
    if (on) { el.style.animationDuration = ms + "ms"; el.classList.add("sr-cursor-blink"); }
    else el.classList.remove("sr-cursor-blink");
  }

  // "Hide behind" empties played measures: it hides the note ink (noteheads,
  // stems, beams, ledger lines) inside each finished measure while leaving the
  // staff lines, clef and barlines in place — so a played bar reads as a clean
  // empty measure rather than a white hole. VexFlow wraps each measure's content
  // in a .vf-measure node, which maps 1:1 (document order) to our measure index.
  var INK_SEL = ".vf-stavenote, .vf-beam, .vf-ledgers, .vf-stem";

  function showAllInk() {
    sheetEl.querySelectorAll(INK_SEL).forEach(function (el) { el.style.visibility = ""; });
  }

  // Hide the ink in measures [0, count); show it in the rest.
  function hideMeasures(measureInk, count) {
    for (var i = 0; i < measureInk.length; i++) {
      var vis = (i < count) ? "hidden" : "";
      var nodes = measureInk[i];
      for (var j = 0; j < nodes.length; j++) nodes[j].style.visibility = vis;
    }
  }

  // Full reset to the top: stop, hide the cursor, rewind to the first note.
  function resetTop() {
    playing = false; paused = false;
    if (session && session.rafId) cancelAnimationFrame(session.rafId);
    session = null; rafId = null;
    setPlayIcon(false);
    blinkCursor(false);
    try { osmd.cursor.hide(); osmd.cursor.reset(); } catch (e) {}
    hideCountdown();
    showAllInk();
    stopVoices();
    scrollSheetTop();
  }

  // Freeze in place: stop the loop and voices but keep the cursor and elapsed-beat
  // position, so Play resumes from exactly here instead of the top.
  function pausePlay() {
    if (!playing) return;
    playing = false; paused = true;
    if (session && session.rafId) cancelAnimationFrame(session.rafId);
    rafId = null;
    stopVoices();
    blinkCursor(false);
    hideCountdown();
    setPlayIcon(false);
  }

  // A line finished while playing: tear down its timers/cursor but keep the
  // playing flag set, generate a fresh line, and play it with a fresh count-in
  // so every new line gets its own countdown, until the user pauses or resets.
  function advanceAndPlay() {
    if (session && session.rafId) cancelAnimationFrame(session.rafId);
    rafId = null;
    try { osmd.cursor.hide(); osmd.cursor.reset(); } catch (e) {}
    showAllInk();
    stopVoices();
    advancing = true;
    generate(function () {
      advancing = false;
      if (playing) startPlay();
    });
  }

  function startPlay(noCountIn) {
    if (!currentSheet) return;
    var cur = osmd.cursor;
    if (!cur) { showError("Cursor unavailable."); return; }

    ensureAudio();

    // Precompute note onsets (in beats) by walking the cursor once. Capture the
    // melody (pitched notes only) at the same time, for the play-along voice.
    cur.reset();
    var onsets = [], measureFirst = [], melody = [], beat = 0, idx = 0;
    while (!cur.Iterator.EndReached) {
      var ves = cur.Iterator.CurrentVoiceEntries;
      var note = ves && ves[0] && ves[0].Notes && ves[0].Notes[0];
      var durBeats = (note ? note.Length.RealValue : 0.25) * BEATS_PER_BAR;
      var meas = Math.floor(beat / BEATS_PER_BAR + 1e-6);
      if (measureFirst[meas] == null) measureFirst[meas] = idx;
      if (note && !note.isRest() && note.Pitch) {
        melody.push({ onset: beat, dur: durBeats, freq: note.Pitch.Frequency });
      }
      onsets.push(beat);
      beat += durBeats;
      idx++;
      cur.next();
    }
    var totalBeats = beat;
    cur.reset(); cur.show();
    scrollSheetTop();                              // start at the top

    // The note sounding on each beat, so the cursor pulses on the beat instead
    // of darting across every subdivision (and holds through sustained notes).
    var beatNote = [], jb = 0;
    for (var b = 0; b < Math.ceil(totalBeats); b++) {
      while (jb + 1 < onsets.length && onsets[jb + 1] <= b + 1e-6) jb++;
      beatNote[b] = jb;
    }

    var measureInk = Array.prototype.map.call(
      sheetEl.querySelectorAll(".vf-measure"),
      function (g) { return g.querySelectorAll(INK_SEL); }
    );
    showAllInk();

    var countIn = noCountIn ? 0 : BEATS_PER_BAR;     // 1-bar count-in, skipped on auto-advance
    session = {
      cur: cur, measureFirst: measureFirst, melody: melody, beatNote: beatNote,
      measureInk: measureInk, totalBeats: totalBeats,
      elapsed: -countIn,       // count-in beats are negative
      nextBeat: -countIn,
      cursorIdx: 0,
      hideState: -1,
      rafId: null
    };
    runSession(true);          // fresh start: run the count-in, schedule play-along from the top
  }

  // Anchor the animation clock so curBeat continues from session.elapsed, (re)schedule
  // the play-along voice for the notes still ahead, and start the rAF loop. Shared by a
  // fresh startPlay and a resume-from-pause.
  function runSession(fresh) {
    var s = session;
    if (!s) return;
    ensureAudio();
    var bms = 60000 / (+tempoEl.value);
    s.bms = bms;
    s.t0 = performance.now() - s.elapsed * bms;      // curBeat == s.elapsed at 'now'

    blinkCursor(fresh && s.elapsed < 0 && cursorModeEl.value !== "off", bms);

    stopVoices();
    if (playAlongEl.checked && audioCtx) {
      var secPerBeat = bms / 1000;
      s.melody.forEach(function (n) {
        if (n.onset + n.dur <= s.elapsed) return;    // already finished
        var startBeat = Math.max(n.onset, s.elapsed);
        var st = audioCtx.currentTime + (startBeat - s.elapsed) * secPerBeat;
        var en = audioCtx.currentTime + (n.onset + n.dur - s.elapsed) * secPerBeat;
        scheduleNote(n.freq, st, en);
      });
    }

    playing = true; paused = false;
    setPlayIcon(true);
    s.rafId = rafId = requestAnimationFrame(frame);
  }

  function resumePlay() {
    if (!paused || !session) { startPlay(); return; }
    runSession(false);
  }

  // Live tempo change during playback: re-anchor the clock to the new rate at the
  // current beat and reschedule the play-along voice ahead. (Paused/idle simply pick
  // up the new tempo on the next runSession.)
  function retempo() {
    var s = session;
    if (!s || !playing) return;
    var now = performance.now();
    s.elapsed = (now - s.t0) / s.bms;      // exact current beat under the old rate
    s.bms = 60000 / (+tempoEl.value);
    s.t0 = now - s.elapsed * s.bms;         // same beat, new rate
    if (playAlongEl.checked && audioCtx) {
      stopVoices();
      var secPerBeat = s.bms / 1000;
      s.melody.forEach(function (n) {
        if (n.onset + n.dur <= s.elapsed) return;
        var startBeat = Math.max(n.onset, s.elapsed);
        scheduleNote(n.freq, audioCtx.currentTime + (startBeat - s.elapsed) * secPerBeat,
                             audioCtx.currentTime + (n.onset + n.dur - s.elapsed) * secPerBeat);
      });
    }
  }

  function frame(now) {
    if (!playing || !session) return;
    var s = session, cur = s.cur;
    var curBeat = (now - s.t0) / s.bms;
    s.elapsed = curBeat;

    while (s.nextBeat <= Math.floor(curBeat) && s.nextBeat < s.totalBeats) {
      if (s.nextBeat < 0) {                          // count-in
        if (clickOnEl.checked) tick(COUNTIN_FREQ);
        showCountdown(-s.nextBeat);
      } else {                                       // playing
        if (clickOnEl.checked) tick(PLAY_FREQ);
        var target = (cursorModeEl.value === "measure")
          ? s.measureFirst[Math.min(Math.floor(s.nextBeat / BEATS_PER_BAR), s.measureFirst.length - 1)]
          : s.beatNote[Math.min(s.nextBeat, s.beatNote.length - 1)];
        while (s.cursorIdx < target) { try { cur.next(); } catch (e) {} s.cursorIdx++; }
      }
      s.nextBeat++;
    }
    if (curBeat >= 0) { hideCountdown(); blinkCursor(false); }   // downbeat: solid, counting done
    if (cur.cursorElement) cur.cursorElement.style.display = (cursorModeEl.value === "off") ? "none" : "";

    if (curBeat >= 0) {
      var hideCount = hideBehindEl.checked
        ? Math.floor((curBeat + (+hideLeadEl.value)) / BEATS_PER_BAR)
        : 0;
      if (hideCount !== s.hideState) { hideMeasures(s.measureInk, hideCount); s.hideState = hideCount; }
      followCursor();   // scroll once the cursor reaches the last visible line
    }
    if (curBeat >= s.totalBeats) { if (playing) advanceAndPlay(); return; }  // line done — keep practicing
    s.rafId = rafId = requestAnimationFrame(frame);
  }

  // ===========================================================================
  // Wiring + init
  // ===========================================================================
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function clearError() { errorEl.hidden = true; errorEl.textContent = ""; }

  [keyTonicEl, keyModeEl, measuresEl, musicalityEl].forEach(function (el) { el.addEventListener("change", generate); });
  musicalityEl.addEventListener("input", function () { musicalityValEl.textContent = musicalityEl.value; });
  showChunksEl.addEventListener("change", drawOverlay);
  generateBtn.addEventListener("click", function () { generate(); });
  playBtn.addEventListener("click", function () {
    if (playing) pausePlay();
    else if (paused) resumePlay();
    else startPlay();
  });
  document.getElementById("from-top").addEventListener("click", resetTop);
  setPlayIcon(false);

  // Tempo stepper pill (kept in sync with the sidebar slider). The steppers only
  // act when the metronome is on; the sidebar slider adjusts tempo either way.
  function bumpTempo(d) {
    if (!clickOnEl.checked) return;
    var v = Math.max(40, Math.min(160, (parseInt(tempoEl.value, 10) || 80) + d));
    tempoEl.value = v;
    tempoEl.dispatchEvent(new Event("input"));
  }
  document.getElementById("tempo-down").addEventListener("click", function () { bumpTempo(-5); });
  document.getElementById("tempo-up").addEventListener("click", function () { bumpTempo(5); });

  // The ♩ in the pill toggles the metronome (synced with the sidebar checkbox).
  metroToggleEl.addEventListener("click", function () {
    clickOnEl.checked = !clickOnEl.checked;
    clickOnEl.dispatchEvent(new Event("change"));
  });
  clickOnEl.addEventListener("change", syncMetroPill);
  syncMetroPill();

  // Collapsible settings. The control bar (Play / New line) is always visible;
  // the sidebar is a drawer that shows only when .panel-open — closed by default
  // so a fresh load shows the full, uncovered staff. On a wide window the drawer
  // reserves space and the music reflows beside it (push); narrow, or when its
  // pushed width equals the full width, it just overlays and nothing re-renders.
  var layoutEl = document.querySelector(".layout");
  function setPanel(open) {
    if (layoutEl.classList.contains("panel-open") === open) return;
    var before = availWidth();
    layoutEl.classList.toggle("panel-open", open);
    if (currentSheet && availWidth() !== before) renderLoaded();   // only when the region actually resized
  }
  document.getElementById("settings-toggle").addEventListener("click", function () {
    setPanel(!layoutEl.classList.contains("panel-open"));
  });
  var scrimEl = document.getElementById("scrim");
  if (scrimEl) scrimEl.addEventListener("click", function () { setPanel(false); });

  // Unlock audio on the very first interaction anywhere, so it's primed well
  // before Play (Safari especially).
  function primeAudio() {
    ensureAudio();
    if (isSampled(instrumentEl.value)) loadSamples(instrumentEl.value);   // decode within a gesture (Safari)
    window.removeEventListener("pointerdown", primeAudio);
    window.removeEventListener("keydown", primeAudio);
  }
  window.addEventListener("pointerdown", primeAudio);
  window.addEventListener("keydown", primeAudio);

  // Safari caps how many AudioContexts exist and doesn't free them on reload, so
  // release ours as the page leaves — otherwise repeated reloads exhaust the cap
  // and audio silently dies until the window is closed.
  window.addEventListener("pagehide", function () {
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
  });

  // Playback controls don't regenerate the sheet, so persist the session directly.
  [tempoEl, clickOnEl, playAlongEl, instrumentEl, volumeEl, cursorModeEl, hideBehindEl, hideLeadEl, showChunksEl].forEach(function (el) {
    el.addEventListener("change", persistSession);
  });

  // Pre-load a sampled instrument as soon as it's chosen, so it's decoded by Play.
  instrumentEl.addEventListener("change", function () {
    var v = instrumentEl.value;
    if (isSampled(v)) { sampleFailed[v] = false; loadSamples(v); }
  });

  // Remember which panel groups are open/closed.
  function initGroups() {
    var state = {};
    try { state = JSON.parse(localStorage.getItem(GROUPS_KEY)) || {}; } catch (e) {}
    var groups = document.querySelectorAll(".group");
    groups.forEach(function (g) {
      var name = g.getAttribute("data-group");
      if (state.hasOwnProperty(name)) g.open = state[name];
      g.addEventListener("toggle", function () {
        var s = {};
        groups.forEach(function (gg) { s[gg.getAttribute("data-group")] = gg.open; });
        try { localStorage.setItem(GROUPS_KEY, JSON.stringify(s)); } catch (e) {}
      });
    });
  }

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (currentSheet) renderLoaded(); }, 200);
  });

  // Keep the page covers aligned as the stage scrolls (idle or smooth auto-scroll).
  sheetEl.parentNode.addEventListener("scroll", updateGap);

  initRangeState();
  buildRangeGrid();
  buildBeatsPalette();
  buildMatrix();
  setWeights(BUILTIN["thirds drill"]);
  activePreset = "thirds drill";
  restoreSession();            // override defaults with last-used settings, if any
  syncMetroPill();             // reflect the restored metronome state in the pill
  if (isSampled(instrumentEl.value)) loadSamples(instrumentEl.value);   // preload so it's ready before Play
  renderPresets();
  initGroups();
  generate();
}());
