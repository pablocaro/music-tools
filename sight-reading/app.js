/**
 * app.js — UI, rendering, and orchestration.
 *
 * Pipeline: read the controls -> ask OSME to generate a sheet (pitch selection
 * is overridden in engine.js) -> export to MusicXML -> load + render via OSMD's
 * standard path -> highlight the chunks over the result.
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

  // ===========================================================================
  // Language
  //
  // Strings live in i18n.js. Markup declares what it needs with data-i18n (text)
  // and data-i18n-aria (label, which the hover tooltip also reads), so switching
  // language is one pass over the document plus a re-render of anything built at
  // runtime. Note letters stay English in both languages.
  // ===========================================================================
  var LANG_KEY = "sr_lang";
  var LANGS = [{ id: "en", label: "ENG" }, { id: "es", label: "ESP" }];
  var I18N = window.SR_I18N || { en: {} };
  var lang = "en";
  // A first visit has no stored choice, and onboarding runs before the student
  // can reach the language pills — so the browser's own language picks the
  // opening one. An explicit choice, once made, always wins.
  var navLang = (navigator.language || "").slice(0, 2).toLowerCase();
  if (I18N[navLang]) lang = navLang;
  try { if (I18N[localStorage.getItem(LANG_KEY)]) lang = localStorage.getItem(LANG_KEY); } catch (e) {}

  // Look up a string, filling {placeholders}. Falls back through English to the
  // key itself, so a missing translation degrades to something readable.
  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace("{" + k + "}", vars[k]);
      });
    }
    return s;
  }

  // ---- config ----
  // Chunk ink, mirroring the --chunk-* tokens. One register only: the dot beside
  // an interval in the panel is the exact colour that will highlight it on the
  // staff, so the code is learned in one place and recognised in the other.
  var HL_STEP = "#4fd9ef";       // highlighter cyan — stepwise motion
  var HL_LEAP = "#a8e63c";       // highlighter lime — leaps / arpeggios
  var WEIGHT_MIN = 1;            // min per-interval slider weight (the checkbox owns off)
  var WEIGHT_MAX = 4;            // max per-interval slider weight
  var MEASURES_PER_LINE = 6;     // cap on a wide screen
  var MIN_PER_LINE = 2;          // never fewer than this; shrink to fit if needed
  var MEASURE_PX = 175;          // ~full-size measure width (FixedMeasureWidth keeps it stable)
  var CLEF_PX = 88;              // ~clef + key + time prefix at a line start
  var HL_PAD_X = 4;             // px the block runs past the first/last notehead
  var HL_PAD_Y = 6;             // px above the top notehead and below the bottom
  var HL_RADIUS = 6;            // corner radius — a highlighter stroke, not a pill
  var STORE_KEY = "sr_presets";
  var SESSION_KEY = "sr_session";  // last-used settings, restored on reload
  var COUNTIN_FREQ = 1568;      // count-in click pitch (G6) — distinct from play
  var PLAY_FREQ = 784;          // in-piece click pitch (G5)

  // ===========================================================================
  // The alphabet matrix (notes)
  // ===========================================================================
  var INTERVALS = [
    { n: "unison", c: "#888780" },
    { n: "2nd",    c: HL_STEP },
    { n: "3rd",    c: HL_LEAP },
    { n: "4th",    c: HL_LEAP },
    { n: "5th",    c: HL_LEAP },
    { n: "6th",    c: HL_LEAP },
    { n: "7th",    c: HL_LEAP },
    { n: "octave", c: HL_LEAP }
  ];

  // built-in presets (same weight applied to down + up): [uni,2,3,4,5,6,7,oct]
  // The alphabet each built-in drill is built around (same weight up and down).
  var BUILTIN = {
    "steps only":   [0, 4, 0, 0, 0, 0, 0, 0],
    "thirds drill": [1, 2, 4, 1, 1, 0, 0, 0],
    "wide leaps":   [0, 1, 2, 3, 3, 2, 1, 2]
  };

  // What a built-in leaves alone would otherwise be whatever the last drill
  // happened to use, so each one carries the same five fields a saved preset
  // does — the alphabet it's named for, plus the neutral staff to read it on.
  var BUILTIN_DEFAULTS = { musicality: "0", key: "major_0-0", clef: "treble", timesig: "4/4", measures: "16" };

  function builtinPreset(name) {
    var w = BUILTIN[name];
    var p = { alphabet: { down: w.slice(), up: w.slice() }, range: defaultRange() };
    Object.keys(BUILTIN_DEFAULTS).forEach(function (k) { p[k] = BUILTIN_DEFAULTS[k]; });
    return p;
  }

  // Migrate an old 7-entry alphabet ([..,6th,octave]) to 8 entries by inserting
  // a 0 for the new 7th slot, so saved presets/sessions keep their octave weight.
  function fix7(a) {
    return (a && a.length === 7) ? a.slice(0, 6).concat([0], a.slice(6)) : a;
  }

  var downInputs = [], upInputs = [], stepChecks = [], matrixRows = [];
  var matrixEl  = document.getElementById("matrix");
  var presetsEl = document.getElementById("presets");

  // Short row labels — the matrix now leads with a checkbox, so the name column
  // is narrow. ("=" is the unison/repeat row.)
  var STEP_LABELS = ["=", "2", "3", "4", "5", "6", "7", "8ve"];

  function makeCell(arr) {
    var cell = document.createElement("div");
    cell.className = "cell";
    var input = document.createElement("input");
    input.type = "range"; input.min = WEIGHT_MIN; input.max = WEIGHT_MAX; input.step = 1; input.value = WEIGHT_MIN;
    var ro = document.createElement("span");
    ro.className = "ro"; ro.textContent = String(WEIGHT_MIN);
    input.addEventListener("input", function () { ro.textContent = input.value; });
    input.addEventListener("change", generate);
    cell.appendChild(input); cell.appendChild(ro);
    arr.push(input);
    return cell;
  }

  // Each interval row: a checkbox (is it in play?) + up/down weight sliders.
  // The checkbox owns on/off, so a weight never has to mean "never" — it floors
  // at WEIGHT_MIN and readAlphabet() zeroes out unchecked rows instead.
  function buildMatrix() {
    INTERVALS.forEach(function (iv, i) {
      var row = document.createElement("div");
      row.className = "matrix-row";

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("aria-label", t("interval." + i));
      cb.addEventListener("change", function () { syncStepRow(i); generate(); });
      stepChecks.push(cb);
      row.appendChild(cb);

      var label = document.createElement("div");
      label.className = "row-label";
      label.innerHTML = '<span class="dot" style="background:' + iv.c + '"></span>' + STEP_LABELS[i];
      row.appendChild(label);

      row.appendChild(makeCell(upInputs));
      row.appendChild(makeCell(downInputs));
      matrixRows.push(row);
      matrixEl.appendChild(row);
    });
  }

  function syncStepRow(i) {
    if (matrixRows[i]) matrixRows[i].classList.toggle("off", !stepChecks[i].checked);
  }

  // Apply a weight to both directions of a row. 0 means "not in play" — the
  // checkbox goes off and the sliders rest at the floor.
  function setRow(i, w) {
    var on = w > 0, v = on ? Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, w)) : WEIGHT_MIN;
    stepChecks[i].checked = on;
    downInputs[i].value = v; upInputs[i].value = v;
    downInputs[i].nextElementSibling.textContent = v;
    upInputs[i].nextElementSibling.textContent = v;
    syncStepRow(i);
  }

  function setWeights(weights) {
    weights = fix7(weights);
    for (var i = 0; i < weights.length && i < INTERVALS.length; i++) setRow(i, +weights[i] || 0);
  }

  // An unchecked interval contributes 0, which is what the engine's weighted
  // draw already understands — so nothing downstream needed to change.
  function readAlphabet() {
    return {
      down: downInputs.map(function (x, i) { return stepChecks[i].checked ? +x.value : 0; }),
      up:   upInputs.map(function (x, i) { return stepChecks[i].checked ? +x.value : 0; })
    };
  }

  // ---- presets (built-in + saved in localStorage) ----
  // Saved presets store the full {down, up} columns; built-ins (and any legacy
  // saves) are plain arrays applied symmetrically. A saved name shadowing a
  // built-in acts as an editable override; deleting it reverts to the built-in.
  var activePreset = null;

  // Built-ins are keyed by a stable English id, which is also what a saved
  // preset uses if it shadows one — so only the label translates and nothing in
  // localStorage has to move. A preset the student named shows as they typed it.
  function presetLabel(name) {
    if (!name) return "";
    return BUILTIN.hasOwnProperty(name) ? t("preset." + name) : name;
  }

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  // A row is in play when either direction carries weight; the sliders then show
  // each direction's weight (floored, since 0 is now expressed by the checkbox).
  function applyAlphabet(a) {
    var down = fix7(a.down), up = fix7(a.up);
    for (var i = 0; i < INTERVALS.length; i++) {
      var d = (down && +down[i]) || 0, u = (up && +up[i]) || 0;
      var on = (d > 0 || u > 0);
      stepChecks[i].checked = on;
      var dv = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, d || WEIGHT_MIN));
      var uv = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, u || WEIGHT_MIN));
      downInputs[i].value = dv; upInputs[i].value = uv;
      downInputs[i].nextElementSibling.textContent = dv;
      upInputs[i].nextElementSibling.textContent = uv;
      syncStepRow(i);
    }
  }

  // A preset/session may carry any subset of the panel's state; apply what's
  // present. Built-ins (and legacy saves) are plain symmetric alphabet arrays.
  // A preset never carries the session-only fields (see readConfig), so this
  // stays one function: applying a preset just leaves them untouched, and
  // applying a session naturally restores them too.
  function applyPreset(p) {
    if (Array.isArray(p)) { setWeights(p); return; }
    if (p.alphabet) applyAlphabet(p.alphabet);
    else if (p.down || p.up) applyAlphabet(p);              // legacy {down, up}
    if (p.range) applyRange(p.range);
    if (p.key != null) setKeyFromCode(p.key);
    if (p.clef != null) clefEl.value = p.clef;
    if (p.timesig != null) timesigEl.value = p.timesig;
    if (p.measures != null) measuresEl.value = String(Math.max(8, parseInt(p.measures, 10) || 16));
    if (p.musicality != null) musicalityEl.value = p.musicality;
    syncBeatsFamily();   // meter may have just changed the figure grid — rebuild
                         // before applyBeats looks for checkboxes in it
    if (p.beats) applyBeats(p.beats);
    if (p.tempo != null) { tempoEl.value = p.tempo; tempoValEl.textContent = p.tempo; }
    if (p.cursor != null) cursorModeEl.value = p.cursor;
    if (p.metronome != null) clickOnEl.checked = p.metronome;
    if (p.playAlong != null) playAlongEl.checked = p.playAlong;
    if (p.instrument != null) instrumentEl.value = p.instrument;
    if (p.volume != null) volumeEl.value = p.volume;
    if (p.hideBehind != null) hideBehindEl.checked = p.hideBehind;
    if (p.hideLead != null) hideLeadEl.value = p.hideLead;
    if (p.hideUnit != null) hideUnitEl.dataset.unit = p.hideUnit;
    if (p.showChunks != null) showChunksEl.checked = p.showChunks;
  }

  // What a *preset* defines: the melodic material itself — which intervals,
  // which pitches, how musical, and the staff it's written on. Playback
  // controls (tempo, metronome, accompaniment, hide-ahead, rhythm, chunks)
  // are the student's in-the-moment choices, not part of the drill, so a
  // saved preset leaves them alone — whatever's currently set stays set.
  function readPresetConfig() {
    return {
      alphabet: { down: downInputs.map(function (x) { return +x.value; }),
                  up:   upInputs.map(function (x) { return +x.value; }) },
      range: JSON.parse(JSON.stringify(rangeState)),
      musicality: musicalityEl.value,
      key: currentKeyCode(),
      clef: clefEl.value,
      timesig: timesigEl.value,
      measures: measuresEl.value
    };
  }

  // The full panel snapshot — everything a preset defines, plus the session-only
  // controls, so a reload picks up exactly where practice left off.
  function readConfig() {
    var cfg = readPresetConfig();
    cfg.beats = readBeatIds();
    cfg.tempo = tempoEl.value;
    cfg.cursor = cursorModeEl.value;
    cfg.metronome = clickOnEl.checked;
    cfg.playAlong = playAlongEl.checked;
    cfg.instrument = instrumentEl.value;
    cfg.volume = volumeEl.value;
    cfg.hideBehind = hideBehindEl.checked;
    cfg.hideLead = hideLeadEl.value;
    cfg.hideUnit = hideUnitEl.dataset.unit || "beats";
    cfg.showChunks = showChunksEl.checked;
    return cfg;
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
    Object.keys(BUILTIN).forEach(function (k) { all[k] = builtinPreset(k); });
    Object.keys(saved).forEach(function (k) { all[k] = saved[k]; });

    Object.keys(all).forEach(function (name) {
      var pill = document.createElement("button");
      pill.className = "pill";
      var label = document.createElement("span");
      label.textContent = presetLabel(name);
      pill.appendChild(label);
      pill.addEventListener("click", function () {
        applyPreset(all[name]);
        syncPanel();              // a preset can move any control — re-read them all
        activePreset = name;
        markActive(pill);
        generate();
      });
      if (saved.hasOwnProperty(name)) {                // user preset/override: updatable + deletable
        var upd = document.createElement("span");
        upd.className = "upd"; upd.textContent = "↻"; upd.setAttribute("aria-label", t("aria.updatePreset"));
        upd.addEventListener("click", function (e) {
          e.stopPropagation();
          updatePreset(name);
        });
        pill.appendChild(upd);
        var del = document.createElement("span");
        del.className = "del"; del.textContent = "×"; del.setAttribute("aria-label", t("aria.deletePreset"));
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
    save.className = "pill save"; save.textContent = t("val.save");
    save.addEventListener("click", saveCurrent);
    presetsEl.appendChild(save);
    updateHeader();
  }

  function markActive(pill) {
    presetsEl.querySelectorAll(".pill").forEach(function (p) { p.classList.remove("active"); });
    if (pill) pill.classList.add("active");
  }

  function deletePreset(name) {
    if (!confirm(t("msg.deletePreset", { name: presetLabel(name) }))) return;
    var saved = loadSaved();
    delete saved[name];
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    if (activePreset === name) activePreset = null;
    renderPresets();
  }

  // Overwrite an existing preset with the drill-defining part of the panel
  // (see readPresetConfig) — not the whole panel, so it doesn't freeze in
  // whatever tempo or metronome state happened to be set at save time.
  function updatePreset(name) {
    if (!confirm(t("msg.updatePreset", { name: presetLabel(name) }))) return;
    var saved = loadSaved();
    saved[name] = readPresetConfig();
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    activePreset = name;
    renderPresets();
  }

  // Create a new preset from the current panel (updating an existing one is the
  // ↻ button's job). Typing an existing name still overwrites it.
  function saveCurrent() {
    var name = prompt(t("msg.newPresetName"), "");
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    var saved = loadSaved();
    saved[name] = readPresetConfig();
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
  var clefEl       = document.getElementById("clef");
  var timesigEl    = document.getElementById("timesig");
  var musicalityEl    = document.getElementById("musicality");

  // The scale key as a "<mode>_<symbol>-<acc>" code (the form makeScaleKey reads).
  function currentKeyCode() { return keyModeEl.value + "_" + keyTonicEl.value; }
  // Restore a "<mode>_<symbol>-<acc>" code, ignoring anything the current build
  // doesn't offer (a preset saved before a key list changed shouldn't wedge the app).
  function setKeyFromCode(code) {
    var parts = String(code).split("_");
    if (parts.length !== 2) return;
    if (keyModeEl.querySelector('option[value="' + parts[0] + '"]')) keyModeEl.value = parts[0];
    if (keyTonicEl.querySelector('option[value="' + parts[1] + '"]')) keyTonicEl.value = parts[1];
  }
  var beatsEl      = document.getElementById("beats");
  var showChunksEl = document.getElementById("show-chunks");
  var generateBtn  = document.getElementById("generate");
  var errorEl      = document.getElementById("error-msg");
  var sheetEl      = document.getElementById("sheet");
  var shTitleEl    = document.getElementById("sh-title");
  var shSubEl      = document.getElementById("sh-sub");

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

  // Treble's home octaves — the starting selection, and what a built-in resets to.
  function defaultRange() {
    var r = {};
    RANGE_OCTAVES.forEach(function (oct) {
      r[oct] = NOTE_COLS.map(function () { return oct === 4 || oct === 5; });
    });
    return r;
  }

  function initRangeState() { rangeState = defaultRange(); }

  function syncRangeCells(oct) {
    NOTE_COLS.forEach(function (nc, i) {
      var cell = rangeCells[oct + "-" + i];
      if (cell) cell.className = "note-cell" + (rangeState[oct][i] ? " on" : "");
    });
    syncOctCheck(oct);
  }

  function applyRange(r) {
    RANGE_OCTAVES.forEach(function (oct) {
      if (r[oct]) {
        rangeState[oct] = NOTE_COLS.map(function (nc, i) { return !!r[oct][i]; });
        syncRangeCells(oct);
      }
    });
  }

  // Octave checkbox: on when any note in the row is picked; toggling it turns the
  // whole octave on or off (matching the Step rows' checkbox-owns-the-row idea).
  var octChecks = {};

  function syncOctCheck(oct) {
    if (octChecks[oct]) octChecks[oct].checked = rangeState[oct].some(Boolean);
  }

  function buildRangeGrid() {
    var container = document.getElementById("range-grid");
    container.innerHTML = "";
    // column headers
    var hdr = document.createElement("div");
    hdr.className = "note-row";
    hdr.appendChild(document.createElement("span")); // checkbox corner
    hdr.appendChild(document.createElement("span")); // octave-label corner
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

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = rangeState[oct].some(Boolean);
      cb.setAttribute("aria-label", t("aria.octave") + " " + oct);
      (function (o) {
        cb.addEventListener("change", function () {
          var on = cb.checked;
          rangeState[o] = rangeState[o].map(function () { return on; });
          syncRangeCells(o);
          generate();
        });
      })(oct);
      octChecks[oct] = cb;
      row.appendChild(cb);

      var lbl = document.createElement("span");
      lbl.className = "note-row-lbl"; lbl.textContent = String(oct);
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
  // Clef
  //
  // OSME always exports a treble clef, so we swap the <clef> element in the
  // MusicXML on its way to OSMD — render-side only, no generator changes.
  // Each clef also carries the octave pair the melody should sit in, so
  // switching clef moves the notes onto the staff instead of onto ledger lines.
  // ===========================================================================
  var CLEFS = [
    { id: "treble", label: "𝄞", sign: "G", line: 2, octaves: [4, 5] },   // 𝄞
    { id: "alto",   label: "𝄡", sign: "C", line: 3, octaves: [3, 4] },   // 𝄡
    { id: "tenor",  label: "𝄡", sign: "C", line: 4, octaves: [3, 4] },
    { id: "bass",   label: "𝄢", sign: "F", line: 4, octaves: [2, 3] }    // 𝄢
  ];
  function clefDef(id) {
    for (var i = 0; i < CLEFS.length; i++) if (CLEFS[i].id === id) return CLEFS[i];
    return CLEFS[0];
  }

  // ===========================================================================
  // Time signature. num/den are what's printed on the staff — passed straight
  // through to the generator. The playback clock's own notion of "how many
  // beats make a bar" is separate; see barBeats() below.
  //
  // "compound" marks 6/8-family meters, where the beat groups in 3s and the
  // Rhythm figure palette swaps to the dotted-quarter-beat set
  // (BEAT_FIGURES_COMPOUND).
  // ===========================================================================
  var TIME_SIGS = [
    { id: "2/4", num: 2, den: 4 },
    { id: "3/4", num: 3, den: 4 },
    { id: "4/4", num: 4, den: 4 },
    { id: "6/8", num: 6, den: 8, compound: true }
  ];
  function timeSigDef(id) {
    for (var i = 0; i < TIME_SIGS.length; i++) if (TIME_SIGS[i].id === id) return TIME_SIGS[i];
    return TIME_SIGS[2];   // 4/4
  }

  // Rewrite the exported score's clef. The exporter emits exactly one
  // <clef><sign>G</sign><line>2</line></clef> per part, at the first measure.
  function applyClefToXml(xml) {
    var c = clefDef(clefEl.value);
    if (c.id === "treble") return xml;
    return xml.replace(/<clef>[\s\S]*?<\/clef>/g,
      "<clef><sign>" + c.sign + "</sign><line>" + c.line + "</line></clef>");
  }

  // OSMD's auto-beam produces zero beams for any /8 meter (empirically
  // confirmed: identical eighth-note content beams cleanly in 3/4, not at all
  // in 6/8) — the exporter never emits explicit <beam> elements for anything,
  // so simple meters only ever looked beamed because OSMD's own guesswork
  // happened to work there. For compound meters we write the beams ourselves.
  //
  // Walk each measure's notes in eighth-note position order and group
  // consecutive beamable notes (eighth or shorter, not rests, not chord
  // tones) that fall inside the same 3-eighth pulse — 6/8's two real beats —
  // stopping a group at a rest, a longer note, or the pulse boundary itself.
  // A lone beamable note (no partner in its pulse) is left with a flag.
  var BEAMABLE_TYPES = { eighth: true, "16th": true, "32nd": true, "64th": true };

  function child(el, tag) {
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].tagName === tag) return el.children[i];
    }
    return null;
  }

  function applyBeamsToXml(xml) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return xml;   // never risk a blank score over beaming
    var divisions = null;

    Array.prototype.forEach.call(doc.getElementsByTagName("measure"), function (measure) {
      var attrs = child(measure, "attributes");
      var divEl = attrs && child(attrs, "divisions");
      if (divEl) divisions = +divEl.textContent;
      if (!divisions) return;
      var eighthTicks = divisions / 2;

      var pos = 0, run = [], runPulse = -1;
      function flush() {
        if (run.length >= 2) {
          run.forEach(function (n, i) {
            var beam = doc.createElement("beam");
            beam.setAttribute("number", "1");
            beam.textContent = i === 0 ? "begin" : (i === run.length - 1 ? "end" : "continue");
            n.appendChild(beam);
          });
        }
        run = [];
      }

      Array.prototype.forEach.call(measure.children, function (el) {
        if (el.tagName !== "note") return;
        var isChord = !!child(el, "chord");
        var isRest = !!child(el, "rest");
        var durEl = child(el, "duration");
        var dur = durEl ? +durEl.textContent : 0;
        var typeEl = child(el, "type");
        var type = typeEl ? typeEl.textContent : "";
        var pulse = Math.floor((pos + 1e-6) / 3);

        if (!isChord && !isRest && BEAMABLE_TYPES[type]) {
          if (run.length && pulse !== runPulse) flush();
          runPulse = pulse;
          run.push(el);
        } else {
          flush();
        }
        if (!isChord) pos += dur / eighthTicks;
      });
      flush();
    });

    return new XMLSerializer().serializeToString(doc);
  }

  // Move the picked notes onto the new clef's staff: select every pitch in that
  // clef's two octaves. (Hand-picking afterwards is untouched until the next
  // clef change.)
  function shiftRangeToClef(id) {
    var octs = clefDef(id).octaves;
    RANGE_OCTAVES.forEach(function (oct) {
      var on = (octs.indexOf(oct) >= 0);
      rangeState[oct] = NOTE_COLS.map(function () { return on; });
      syncRangeCells(oct);
    });
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
    major: function () { return O.ScaleType.MAJOR; },
    minor: function () { return O.ScaleType.MINOR_NATURAL; }
  };
  function makeScaleKey(code) {
    var parts = code.split("_");
    var typeFn = SCALE_TYPES[parts[0]] || SCALE_TYPES.major;
    var tp = parts[1].split("-");
    var symbol = parseInt(tp[0], 10);
    var acc = (tp[1] === "b") ? -1 : (tp[1] === "#") ? 1 : 0;
    return ScaleKey.create(typeFn(), O.Tone.getToneFromSymbol(symbol, acc));
  }

  // Rhythm figures, in display order. Each event is [num, den] or [num, den,
  // true] for a rest; a figure's events sum to one beat (1/4) unless it's a
  // multi-beat cell (whole/half). Rendered as a flat grid of notation cells.
  var BEAT_FIGURES_SIMPLE = [
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

  // 6/8's beat is a dotted quarter (3 eighths), not a quarter — so the simple
  // set's figures (built around a quarter-note beat) don't tile a compound bar
  // cleanly, and the beat-level figures here read wrong. Each figure below is
  // sized to one full beat (a dotted quarter, 3/8) or the whole two-beat bar
  // (a dotted half, 3/4), the same way the simple set's figures are each one
  // beat (1/4) or the whole bar (1, the whole note).
  var BEAT_FIGURES_COMPOUND = [
    { id: "dq",  name: "dotted quarter",          def: true,  events: [[3,8]] },
    { id: "eee", name: "three eighths",           def: true,  events: [[1,8],[1,8],[1,8]] },
    { id: "qe",  name: "quarter + eighth",        def: true,  events: [[1,4],[1,8]] },
    { id: "eq",  name: "eighth + quarter",                    events: [[1,8],[1,4]] },
    { id: "dh",  name: "dotted half",                         events: [[3,4]] },
    { id: "dqr", name: "dotted quarter rest",                 events: [[3,8,true]] },
    { id: "ree", name: "8th rest + 2 eighths",                events: [[1,8,true],[1,8],[1,8]] },
    { id: "eer", name: "2 eighths + 8th rest",                events: [[1,8],[1,8],[1,8,true]] }
  ];

  var BEAT_PATTERNS = {}; // id -> [{n,d,rest}], populated for both sets up front

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
      // compound (6/8-family) figures
      case "dq":   g = head(22, false) + stem(22) + dot(22); break;
      case "eee":  g = head(10, 0) + head(22, 0) + head(34, 0) + stem(10) + stem(22) + stem(34) + beam(12.6, 36.6, TOP); break;
      case "qe":   g = head(11, false) + stem(11) + head(30, 0) + stem(30) + flag(30); break;
      case "eq":   g = head(11, 0) + stem(11) + flag(11) + head(30, false) + stem(30); break;
      case "dh":   g = head(22, true) + stem(22) + dot(22); break;
      case "dqr":  g = rest4(22) + dot(22); break;
      case "ree":  g = rest8(11) + head(23, 0) + head(34, 0) + stem(23) + stem(34) + beam(25.6, 36.6, TOP); break;
      case "eer":  g = head(11, 0) + head(22, 0) + stem(11) + stem(22) + beam(13.6, 24.6, TOP) + rest8(35); break;
      default:     g = head(22, false) + stem(22);
    }
    return '<svg viewBox="0 0 44 28" class="fig-svg">' + g + "</svg>";
  }

  // Flat grid of rhythm figures — each cell is a notation glyph toggled on/off,
  // its name revealed on hover. A hidden .beat checkbox keeps the read/apply
  // path (buildBeatPatterns / readBeatIds / applyBeats) unchanged.
  // Every figure's pattern is known up front, from both sets, regardless of
  // which one is currently on screen — only the visible grid (and therefore
  // what readBeatIds/applyBeats see as "in play") changes with the meter.
  [BEAT_FIGURES_SIMPLE, BEAT_FIGURES_COMPOUND].forEach(function (set) {
    set.forEach(function (item) {
      BEAT_PATTERNS[item.id] = item.events.map(function (e) {
        return { n: e[0], d: e[1], rest: !!e[2] };
      });
    });
  });

  function currentBeatFigures() {
    return timeSigDef(timesigEl.value).compound ? BEAT_FIGURES_COMPOUND : BEAT_FIGURES_SIMPLE;
  }

  function buildBeatsPalette(figures) {
    beatsEl.innerHTML = "";
    beatsEl.dataset.family = timeSigDef(timesigEl.value).compound ? "compound" : "simple";
    var grid = document.createElement("div");
    grid.className = "fig-grid";
    figures.forEach(function (item) {
      var cell = document.createElement("label");
      cell.className = "fig-cell";
      cell.setAttribute("aria-label", t("fig." + item.id));
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

  // Only rebuilds (and resets to that family's defaults) when the meter
  // actually crosses the simple/compound line — cycling among 2/4, 3/4 and
  // 4/4 shares one grid and leaves whatever is checked alone.
  function syncBeatsFamily() {
    var wantCompound = !!timeSigDef(timesigEl.value).compound;
    var have = beatsEl.dataset.family === "compound";
    if (wantCompound === have) return;
    buildBeatsPalette(currentBeatFigures());
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
      time_signature: new RhythmInstruction(new Fraction(timeSigDef(timesigEl.value).num, timeSigDef(timesigEl.value).den, 0, false), RhythmSymbolEnum.NONE),
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
      var xml = applyClefToXml(new XMLSourceExporter().export(currentSheet));
      if (timeSigDef(timesigEl.value).compound) xml = applyBeamsToXml(xml);
      osmd.load(xml).then(function () {
        renderLoaded();
        persistSession();
        if (typeof after === "function") after();
      }).catch(function (e) {
        showError(t("msg.loadFailed", { detail: (e.message || e) }));
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
  // Summary header — the drill's name + key/length digest
  // ===========================================================================

  // The top bar: drill name, then "Key Mode – N Bars".
  function updateHeader() {
    var sel = keyTonicEl.options[keyTonicEl.selectedIndex];
    var tonic = sel ? sel.textContent : "C";
    var mode = t("mode." + keyModeEl.value);
    shTitleEl.textContent = presetLabel(activePreset) || t("val.custom");
    shSubEl.textContent = tonic + " " + mode + " – " + measuresEl.value + " " + t("val.bars");
    syncTransport();
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
    if (playing && !advancing) { lastScrollTarget = -1; followCursor(); }  // keep the cursor in view on a mid-play reflow
    else scrollSheetTop();                                                  // …but an auto-advanced fresh line resets to the top
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
    lastScrollTarget = -1;
    // Chrome cancels an in-flight smooth auto-scroll the moment we reset; iPad Safari
    // lets it keep animating through the re-render and the next count-in, so it lands
    // back at the bottom. Force instant and re-assert the top across the animation's
    // lifetime so the stale scroll can't win. (The count-in gives us a quiet window.)
    function top() { st.scrollTo(0, 0); st.scrollTop = 0; }
    top();
    requestAnimationFrame(top);
    [80, 250, 500, 800].forEach(function (ms) { setTimeout(top, ms); });
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

  // Reflect the transport toggles' state on their buttons (blue tint when active).
  // Both the metronome and the accompaniment have two faces — the transport bar
  // and their own section in the panel — so every .js-metro / .js-accomp button
  // tracks the one checkbox.
  function syncMetroPill() {
    document.querySelectorAll(".js-metro").forEach(function (b) {
      b.classList.toggle("on", clickOnEl.checked);
    });
  }
  function syncAccompBtn() {
    document.querySelectorAll(".js-accomp").forEach(function (b) {
      b.classList.toggle("on", playAlongEl.checked);
    });
  }
  function syncTransport() { syncMetroPill(); syncAccompBtn(); }

  // ===========================================================================
  // Seeing mode: read the rendered noteheads back out and highlight the chunks
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
            // The notehead alone anchors the highlighter — a note's own <g>
            // stretches 35px up or down for the stem, which would swell every
            // block far past the notes it is marking.
            var head = el ? (el.querySelector(".vf-notehead") || el) : null;
            // Which engraved system this note landed on, so a run that wraps at
            // a line break can be highlighted once per line.
            var sys = el ? el.closest(".staffline") : null;
            out.push({ isRest: isRest, halfTone: halfTone, el: el, head: head, sys: sys, measure: m });
          }
        }
      }
    }
    return out;
  }

  // A chunk is what the eye can take in at once: consecutive notes moving the
  // same way, by the same kind of interval. Direction alone isn't a fine enough
  // grouping — classifying a whole run by its widest interval painted "C D E G"
  // entirely as a leap when three quarters of it is a scale.
  //
  // So a direction-run is split again wherever steps meet leaps. The two
  // segments share the note between them and blocks must not overlap, so the
  // leap keeps it: a jump is the more salient event and the one worth seeing
  // marked. A step fragment left holding a single note isn't a chunk, and drops.
  var LEAP_SEMITONES = 3;   // a minor 3rd or wider; every diatonic step is 1 or 2

  function analyzeChunks(notes) {
    var chunks = [], run = [], dir = 0;

    function flush() {
      if (run.length >= 2) {
        var leap = [];    // one entry per interval: is it a leap?
        for (var i = 1; i < run.length; i++) {
          leap.push(Math.abs(run[i].halfTone - run[i - 1].halfTone) >= LEAP_SEMITONES);
        }
        // Walk maximal same-kind stretches of intervals. Intervals [a, b) span
        // notes [a, b], so neighbouring stretches meet on a shared note.
        var a = 0;
        for (var b = 1; b <= leap.length; b++) {
          if (b < leap.length && leap[b] === leap[a]) continue;
          var isLeap = leap[a], lo = a, hi = b;
          if (!isLeap) {
            if (a > 0) lo++;                // yield the note shared with the leap before
            if (b < leap.length) hi--;      // …and the one shared with the leap after
          }
          if (hi > lo) chunks.push({ notes: run.slice(lo, hi + 1), type: isLeap ? "chord" : "scale" });
          a = b;
        }
      }
      run = []; dir = 0;
    }
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      if (note.isRest || note.halfTone == null || !note.head) { flush(); continue; }
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

  // Split a run at system boundaries, keeping order. A run that straddles a
  // line break gets one block per line — which is what a highlighter does when
  // a phrase wraps, and it retires the old "skip chunks that wrap" limitation.
  function splitBySystem(notes) {
    var parts = [], cur = null, sys;
    for (var i = 0; i < notes.length; i++) {
      if (!cur || notes[i].sys !== sys) { cur = []; parts.push(cur); sys = notes[i].sys; }
      cur.push(notes[i]);
    }
    return parts;
  }

  // Each chunk is drawn as a highlighter block whose opposite corners are the
  // run's first and last noteheads. Runs are strictly monotonic — analyzeChunks
  // ends one the moment direction reverses — so those two notes are always the
  // pitch extremes, and the block is exactly the bounding box of the run's
  // noteheads with the melodic contour tracing its diagonal. Consecutive chunks
  // therefore always run opposite ways and their blocks step past each other,
  // so two same-coloured runs never read as one.
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
      var color = chunk.type === "chord" ? HL_LEAP : HL_STEP;
      splitBySystem(chunk.notes).forEach(function (part) {
        // A wrapped run can leave one note stranded on the far side of the line
        // break. A block around a single note says nothing on its own and reads
        // as a stray chip of colour, so only the substantial side is marked.
        if (part.length < 2) return;
        var l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
        for (var i = 0; i < part.length; i++) {
          var box = part[i].head.getBoundingClientRect();
          l = Math.min(l, box.left); r = Math.max(r, box.right);
          t = Math.min(t, box.top);  b = Math.max(b, box.bottom);
        }
        var rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", l - cRect.left + scrollLeft - HL_PAD_X);
        rect.setAttribute("y", t - cRect.top + scrollTop - HL_PAD_Y);
        rect.setAttribute("width",  (r - l) + HL_PAD_X * 2);
        rect.setAttribute("height", (b - t) + HL_PAD_Y * 2);
        rect.setAttribute("rx", HL_RADIUS);
        rect.setAttribute("fill", color);
        rect.dataset.measure = part[0].measure;
        overlay.appendChild(rect);
      });
    });
    sheetEl.appendChild(overlay);
    syncHighlights(session ? Math.max(0, session.hideState) : 0);
  }

  // Blocks empty out with the measures they sit on, so "hide behind" leaves a
  // clean bar instead of a slab of ink floating over nothing. A block is keyed
  // to the measure its run starts in.
  function syncHighlights(count) {
    var ov = document.getElementById("chunk-overlay");
    if (!ov) return;
    ov.querySelectorAll("rect").forEach(function (r) {
      r.style.visibility = (+r.dataset.measure < count) ? "hidden" : "";
    });
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
  var clickOnEl    = document.getElementById("click-on");
  var playAlongEl  = document.getElementById("play-along");
  var instrumentEl = document.getElementById("instrument");
  var volumeEl     = document.getElementById("volume");
  var hideBehindEl = document.getElementById("hide-behind");
  var cursorModeEl = document.getElementById("cursor-mode");
  var hideLeadEl   = document.getElementById("hide-lead");
  var countdownEl  = document.getElementById("countdown");
  var playBtn      = document.getElementById("play");

  // Play / Pause: both glyphs live in the button; .playing picks which shows.
  function setPlayIcon(playingNow) {
    playBtn.classList.toggle("playing", !!playingNow);
    playBtn.setAttribute("aria-label", t(playingNow ? "aria.pause" : "aria.play"));
  }

  // The playback clock (elapsed/nextBeat/onsets, everywhere below) always counts
  // in quarter-note beats — that's what ties it to the tempo slider's BPM number,
  // and it must stay fixed regardless of meter so the same tempo value plays at
  // the same real speed in 3/4 as in 6/8. Only "how many of those beats make a
  // bar" varies: 4 for /4 meters (unchanged from before this was configurable),
  // 3 for 6/8 (a 6/8 bar is 3/4 of a whole note — 3 quarter-beats long, exactly
  // as many as a 3/4 bar, since duration is duration regardless of how the bar
  // is felt). barBeats() is that one number; nothing else here is meter-aware.
  function barBeats() {
    var ts = timeSigDef(timesigEl.value);
    return ts.num * 4 / ts.den;
  }
  var playing = false;
  var paused = false;           // frozen mid-line, resumable from the same beat
  var advancing = false;        // mid auto-advance regen (keeps playback alive)
  var rafId = null;
  var session = null;           // live play state (onsets, cursor position, elapsed beats)
  var pinTop = false;           // during an auto-advance transition, hold the view at the top
  var audioCtx = null;
  var playVoices = [];          // scheduled play-along oscillators, killed on stop

  tempoEl.addEventListener("input", function () { tempoValEl.textContent = tempoEl.value; updateHeader(); retempo(); });
  volumeEl.addEventListener("input", function () {
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
    if (!audioCtx || !data) { sampleFailed[name] = true; showError(t("msg.noSamples", { name: t("inst." + name) })); return; }
    sampleLoading[name] = true;
    var map = {}, pending = set.notes.length, ok = 0;
    var done = function () {
      if (--pending > 0) return;
      sampleLoading[name] = false;
      if (ok > 0) {
        sampleBuffers[name] = map;
        // Chosen mid-line: the queued notes are sounding the organ stand-in, so
        // re-voice them now that the real samples are decoded.
        if (playing && instrumentEl.value === name) scheduleAhead();
      }
      else { sampleFailed[name] = true; showError(t("msg.badSamples", { name: t("inst." + name) })); }
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
    syncHighlights(0);
  }

  // Hide the ink in measures [0, count); show it in the rest.
  function hideMeasures(measureInk, count) {
    for (var i = 0; i < measureInk.length; i++) {
      var vis = (i < count) ? "hidden" : "";
      var nodes = measureInk[i];
      for (var j = 0; j < nodes.length; j++) nodes[j].style.visibility = vis;
    }
    syncHighlights(count);
  }

  // Full reset to the top: stop, hide the cursor, rewind to the first note.
  function resetTop() {
    playing = false; paused = false; pinTop = false;
    if (session && session.rafId) cancelAnimationFrame(session.rafId);
    session = null; rafId = null;
    setPlayIcon(false);
    syncSwing();
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
    playing = false; paused = true; pinTop = false;
    if (session && session.rafId) cancelAnimationFrame(session.rafId);
    rafId = null;
    stopVoices();
    blinkCursor(false);
    hideCountdown();
    setPlayIcon(false);
    syncSwing();
  }

  // A line finished while playing: tear down its timers/cursor but keep the
  // playing flag set, generate a fresh line, and play it with a fresh count-in
  // so every new line gets its own countdown, until the user pauses or resets.
  function advanceAndPlay() {
    if (session && session.rafId) cancelAnimationFrame(session.rafId);
    rafId = null;
    pinTop = true;   // hold the top through the re-render + count-in of the fresh line
    // Kill the last line's in-flight smooth scroll-to-end NOW (synchronously, before the
    // async re-render) so it can't animate on through and fight the reset-to-top.
    var st = sheetEl.parentNode; st.scrollTo(0, 0); st.scrollTop = 0;
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
    if (!cur) { showError(t("msg.noCursor")); return; }
    pinTop = true;   // hold the top until the new line's downbeat (released in frame)

    ensureAudio();

    // Precompute note onsets (in beats) by walking the cursor once. Capture the
    // melody (pitched notes only) at the same time, for the play-along voice.
    cur.reset();
    var bpb = barBeats();   // fixed for this session — a regenerate rebuilds it fresh
    var onsets = [], measureFirst = [], melody = [], beat = 0, idx = 0;
    while (!cur.Iterator.EndReached) {
      var ves = cur.Iterator.CurrentVoiceEntries;
      var note = ves && ves[0] && ves[0].Notes && ves[0].Notes[0];
      // Always quarter-beats (RealValue is a fraction of a whole note, and a
      // quarter is always 1/4 of one) — this is the tempo clock's own unit
      // and must not vary with meter; see barBeats() above.
      var durBeats = (note ? note.Length.RealValue : 0.25) * 4;
      var meas = Math.floor(beat / bpb + 1e-6);
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

    var countIn = noCountIn ? 0 : bpb;     // 1-bar count-in, skipped on auto-advance
    session = {
      cur: cur, measureFirst: measureFirst, melody: melody, beatNote: beatNote,
      measureInk: measureInk, totalBeats: totalBeats, barBeats: bpb,
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

    scheduleAhead();

    playing = true; paused = false;
    setPlayIcon(true);
    syncSwing();
    s.rafId = rafId = requestAnimationFrame(frame);
  }

  // (Re)schedule the play-along voice for everything still ahead of the playhead,
  // dropping whatever was already queued. Anything that changes how the melody
  // should sound from here on — tempo, instrument, the accompaniment toggle —
  // just calls this and the change takes effect without interrupting playback.
  function scheduleAhead() {
    var s = session;
    stopVoices();
    if (!s || !playAlongEl.checked || !audioCtx) return;
    var secPerBeat = s.bms / 1000;
    s.melody.forEach(function (n) {
      if (n.onset + n.dur <= s.elapsed) return;      // already finished
      var startBeat = Math.max(n.onset, s.elapsed);
      scheduleNote(n.freq, audioCtx.currentTime + (startBeat - s.elapsed) * secPerBeat,
                           audioCtx.currentTime + (n.onset + n.dur - s.elapsed) * secPerBeat);
    });
  }

  // The metronome beats by mirroring: each beat flips the glyph so the pendulum
  // snaps to its other side. Called from the play loop, so it lands exactly on
  // the beat rather than free-running.
  var metroFlipped = false;

  function metroGlyphs() { return document.querySelectorAll(".js-metro .ic-metro.state-on"); }

  function flipMetro() {
    metroFlipped = !metroFlipped;
    metroGlyphs().forEach(function (el) { el.classList.toggle("flip", metroFlipped); });
  }

  // Back to rest — the pendulum shouldn't stay parked on one side once we stop.
  function syncSwing() {
    if (playing && clickOnEl.checked) return;
    metroFlipped = false;
    metroGlyphs().forEach(function (el) { el.classList.remove("flip"); });
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
    scheduleAhead();
    syncSwing();                            // the pendulum tracks the new tempo
  }

  function frame(now) {
    if (!playing || !session) return;
    var s = session, cur = s.cur;
    var curBeat = (now - s.t0) / s.bms;
    s.elapsed = curBeat;

    while (s.nextBeat <= Math.floor(curBeat) && s.nextBeat < s.totalBeats) {
      if (clickOnEl.checked) flipMetro();             // the glyph mirrors on the beat
      if (s.nextBeat < 0) {                          // count-in
        if (clickOnEl.checked) tick(COUNTIN_FREQ);
        showCountdown(-s.nextBeat);
      } else {                                       // playing
        if (clickOnEl.checked) tick(PLAY_FREQ);
        var target = (cursorModeEl.value === "measure")
          ? s.measureFirst[Math.min(Math.floor(s.nextBeat / s.barBeats), s.measureFirst.length - 1)]
          : s.beatNote[Math.min(s.nextBeat, s.beatNote.length - 1)];
        while (s.cursorIdx < target) { try { cur.next(); } catch (e) {} s.cursorIdx++; }
      }
      s.nextBeat++;
    }
    if (curBeat >= 0) { hideCountdown(); blinkCursor(false); pinTop = false; }   // downbeat: counting done; release the top-pin
    if (cur.cursorElement) cur.cursorElement.style.display = (cursorModeEl.value === "off") ? "none" : "";

    if (curBeat >= 0) {
      var hideCount = hideBehindEl.checked
        ? Math.floor((curBeat + (+hideLeadEl.value)) / s.barBeats)
        : 0;
      if (hideCount !== s.hideState) { hideMeasures(s.measureInk, hideCount); s.hideState = hideCount; }
      followCursor();   // scroll once the cursor reaches the last visible line
    }
    if (curBeat >= s.totalBeats) { if (playing) advanceAndPlay(); return; }  // line done — keep practicing
    s.rafId = rafId = requestAnimationFrame(frame);
  }

  // ===========================================================================
  // Panel controls
  //
  // The visible pills / steppers / grids drive the hidden form elements, which
  // remain the single source of truth the preset + session snapshot reads.
  // ===========================================================================
  var tonicCycleEl = document.getElementById("tonic-cycle");
  var accCycleEl   = document.getElementById("acc-cycle");
  var modeCycleEl  = document.getElementById("mode-cycle");
  var clefCycleEl  = document.getElementById("clef-cycle");
  var timesigPillsEl = document.getElementById("timesig-pills");
  var hideUnitEl   = document.getElementById("hide-unit");
  var hideValEl    = document.getElementById("hide-val");
  var instCycleEl  = document.getElementById("instrument-cycle");
  var chunksBtnEl  = document.getElementById("chunks-toggle");
  var cursorBtnEl  = document.getElementById("cursor-toggle");
  var tempoUiEl    = document.getElementById("tempo-ui");
  var volumeUiEl   = document.getElementById("volume-ui");
  var measuresPillsEl = document.getElementById("measures-pills");

  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];          // key-code symbols 0–6
  var ACCS = [{ v: "0", label: "♮" }, { v: "#", label: "♯" }, { v: "b", label: "♭" }];
  var MODES = ["major", "minor"];
  var HIDE_MAX = 8;

  // Which letter+accidental combinations OSME can actually build a scale from.
  // ScaleKey.create doesn't reject an impossible key (D♯ major and friends) — it
  // hands back tones the ladder then chokes on — so probe by actually building
  // the ladder in every mode and keeping only the keys that survive.
  var validAcc = {};
  function keyWorks(sym, acc) {
    for (var m = 0; m < MODES.length; m++) {
      try {
        var sk = makeScaleKey(MODES[m] + "_" + sym + "-" + acc);
        var tones = sk.getTones();
        if (!tones || tones.length < 7) return false;
        for (var t = 0; t < tones.length; t++) {
          if (!tones[t] || typeof tones[t].getSymbol !== "function") return false;
        }
        SREngine.buildLadder(sk);
      } catch (e) { return false; }
    }
    return true;
  }

  // Probe, then rebuild the hidden <select> to hold exactly the valid keys — so
  // any code a saved preset carries can still be restored onto it.
  function probeKeys() {
    var current = keyTonicEl.value;
    keyTonicEl.innerHTML = "";
    for (var s = 0; s < 7; s++) {
      validAcc[s] = [];
      ACCS.forEach(function (a) {
        if (!keyWorks(s, a.v)) return;
        validAcc[s].push(a.v);
        var o = document.createElement("option");
        o.value = s + "-" + a.v;
        o.textContent = LETTERS[s] + (a.v === "#" ? "♯" : a.v === "b" ? "♭" : "");
        keyTonicEl.appendChild(o);
      });
      if (!validAcc[s].length) validAcc[s] = ["0"];
    }
    keyTonicEl.value = keyTonicEl.querySelector('option[value="' + current + '"]') ? current : "0-0";
  }

  function keyParts() {
    var tp = String(keyTonicEl.value).split("-");
    return { sym: parseInt(tp[0], 10) || 0, acc: tp[1] || "0" };
  }
  function setKeyParts(sym, acc) {
    if (validAcc[sym] && validAcc[sym].indexOf(acc) < 0) acc = validAcc[sym][0];
    keyTonicEl.value = sym + "-" + acc;   // probeKeys() guarantees the option exists
  }

  function syncKeyRow() {
    var k = keyParts();
    tonicCycleEl.textContent = LETTERS[k.sym];
    var a = ACCS.filter(function (x) { return x.v === k.acc; })[0] || ACCS[0];
    accCycleEl.textContent = a.label;
    accCycleEl.classList.toggle("on", k.acc !== "0");
    modeCycleEl.textContent = t("mode." + keyModeEl.value);
    clefCycleEl.textContent = clefDef(clefEl.value).label;
  }

  function buildTimesigPills() {
    timesigPillsEl.innerHTML = "";
    TIME_SIGS.forEach(function (ts) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.textContent = ts.id;
      b.addEventListener("click", function () {
        timesigEl.value = ts.id;
        syncTimesigPills();
        syncBeatsFamily();    // swaps the figure grid only if simple<->compound changed
        generate();
      });
      timesigPillsEl.appendChild(b);
    });
    syncTimesigPills();
  }
  function syncTimesigPills() {
    Array.prototype.forEach.call(timesigPillsEl.children, function (b, i) {
      b.classList.toggle("on", TIME_SIGS[i].id === timesigEl.value);
    });
  }

  // Hide Ahead: 0 reads as "Off" — that's what replaces the old hide-behind
  // checkbox, so any value above 0 means hiding is on with that much lead.
  function hideUnitIsMeasures() { return hideUnitEl.dataset.unit === "measures"; }
  function syncHide() {
    var n = parseInt(hideValEl.dataset.n, 10) || 0;
    hideValEl.textContent = n === 0 ? t("val.off") : String(n);
    hideUnitEl.textContent = hideUnitIsMeasures() ? t("val.measures") : t("val.beats");
    hideBehindEl.checked = n > 0;
    hideLeadEl.value = Math.min(HIDE_MAX, hideUnitIsMeasures() ? n * barBeats() : n);
  }
  function setHide(n, unit) {
    hideValEl.dataset.n = Math.max(0, Math.min(HIDE_MAX, n));
    if (unit) hideUnitEl.dataset.unit = unit;
    syncHide();
  }
  // Restore the stepper from the stored beats-lead + on/off flag.
  function hideFromState() {
    var lead = parseInt(hideLeadEl.value, 10) || 0;
    if (!hideBehindEl.checked) { setHide(0); return; }
    if (hideUnitIsMeasures()) setHide(Math.max(1, Math.round(lead / barBeats())));
    else setHide(Math.max(1, lead));
  }

  function syncInstrument() {
    var o = instrumentEl.options[instrumentEl.selectedIndex];
    instCycleEl.textContent = t("inst." + instrumentEl.value);
  }
  function syncChunks() {
    chunksBtnEl.textContent = showChunksEl.checked ? t("val.on") : t("val.off");
    chunksBtnEl.classList.toggle("on", showChunksEl.checked);
  }
  function syncCursorBtn() {
    cursorBtnEl.classList.toggle("on", cursorModeEl.value !== "off");
  }
  function syncTempoUi() {
    tempoUiEl.value = tempoEl.value;
    tempoValEl.textContent = tempoEl.value;
    paintRange(tempoUiEl);        // the ± steppers move the slider without an input event
  }

  // A cycle's label changes as you tap through it, which would make the pill
  // jump between "Piano" and "Vibraphone" (or "Major" and "Harmonic Minor") and
  // shove its neighbours around. Measure every value it can show and pin the
  // width to the widest, so the row stays put.
  function lockCycleWidth(btn, labels) {
    if (!btn || !labels.length) return;
    var prev = btn.textContent, max = 0;
    btn.style.minWidth = "";
    labels.forEach(function (t) {
      btn.textContent = t;
      max = Math.max(max, btn.getBoundingClientRect().width);
    });
    btn.textContent = prev;
    btn.style.minWidth = Math.ceil(max) + "px";
  }

  function lockCycleWidths() {
    var optionText = function (sel) {
      return Array.prototype.map.call(sel.options, function (o) { return o.textContent; });
    };
    lockCycleWidth(instCycleEl, Array.prototype.map.call(instrumentEl.options,
      function (o) { return t("inst." + o.value); }));
    lockCycleWidth(modeCycleEl, MODES.map(function (m) { return t("mode." + m); }));
    lockCycleWidth(hideUnitEl, [t("val.beats"), t("val.measures")]);
    lockCycleWidth(tonicCycleEl, LETTERS);
    lockCycleWidth(accCycleEl, ACCS.map(function (a) { return a.label; }));
    lockCycleWidth(clefCycleEl, CLEFS.map(function (c) { return c.label; }));
    lockCycleWidth(chunksBtnEl, [t("val.off"), t("val.on")]);
  }

  // ===========================================================================
  // Help
  //
  // The sections, in the order they appear in the interface, so reading the
  // guide top to bottom walks the panel top to bottom. Copy lives in i18n.js.
  // ===========================================================================
  var HELP_SECTIONS = ["exercise", "transport", "presets", "tempo", "accomp",
                       "hide", "rhythm", "step", "notes", "musicality",
                       "chunks", "staff"];

  function buildHelpBody() {
    var host = document.getElementById("help-body");
    if (!host) return;
    host.innerHTML = "";

    var intro = document.createElement("p");
    intro.className = "help-intro";
    intro.textContent = t("help.intro");
    host.appendChild(intro);

    HELP_SECTIONS.forEach(function (id) {
      var item = document.createElement("div");
      item.className = "help-item";
      var h = document.createElement("h3");
      h.textContent = t("help.g." + id);
      var p = document.createElement("p");
      p.textContent = t("help." + id);
      item.appendChild(h); item.appendChild(p);
      host.appendChild(item);
    });
  }

  function setHelp(open) {
    var scrim = document.getElementById("help-scrim");
    var sheet = document.getElementById("help-sheet");
    if (!scrim || !sheet) return;
    if (open) buildHelpBody();          // rebuild so it's always in the current language
    scrim.hidden = !open;
    sheet.hidden = !open;
    if (open) {
      sheet.querySelector(".help-body").scrollTop = 0;
      var close = document.getElementById("help-close");
      if (close) close.focus();
    }
  }

  function wireHelp() {
    var open = document.getElementById("help-open");
    var close = document.getElementById("help-close");
    var scrim = document.getElementById("help-scrim");
    if (open) open.addEventListener("click", function () { setHelp(true); });
    if (close) close.addEventListener("click", function () { setHelp(false); });
    if (scrim) scrim.addEventListener("click", function () { setHelp(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setHelp(false);
    });
  }

  // ===========================================================================
  // Onboarding — shown once on a first visit, then never again.
  //
  // It is a tour of the settings panel as much as a setup step: the goal is
  // that when the student opens ⚙ for the first time they already recognise
  // the shapes in it. So the pages use the panel's own controls, wired to the
  // same hidden inputs, rather than simplified stand-ins that would teach a
  // model the panel then contradicts.
  //
  // One page carries choices, and it's skippable — whatever else a beginner
  // skips, they should still be told where the settings live, so Skip lands
  // on the closing page rather than dismissing outright.
  //
  // Clef was cut as a page on its own: "which clef do you read" assumes one
  // answer, and a violist reads two. Clef stays a panel setting, defaulted
  // and changeable there, just never asked up front.
  // ===========================================================================
  var OB_KEY  = "sr_onboarded";
  // TEMPORARY — while the walkthrough is being reviewed it runs on every load.
  // Set to false to restore once-per-visitor behaviour; the flag is still
  // written on finish, so nothing else has to change.
  var OB_ALWAYS = true;
  var OB_PAGES = ["intro", "vocab", "done"];
  // The plain note values plus one rest: the first six cells of the real rhythm
  // grid, in the same order, so the grid is recognisable when the rest appear.
  var OB_FIGS = ["w", "h", "q", "ee", "ssss", "qr"];
  var obPage = 0;

  function obSetFigure(id, on) {
    var cb = beatsEl.querySelector('.beat[value="' + id + '"]');
    if (!cb) return;
    cb.checked = on;
    cb.parentNode.classList.toggle("on", on);
  }

  function obFigureOn(id) {
    var cb = beatsEl.querySelector('.beat[value="' + id + '"]');
    return !!(cb && cb.checked);
  }

  // A row of pills that behave like the panel control they stand for —
  // intervals here are independent toggles, same as the Step checkboxes.
  function obPills(host, items, isOn, onPick, cls) {
    var row = document.createElement("div");
    row.className = "ob-pills";
    items.forEach(function (item) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt" + (cls ? " " + cls : "");
      b.innerHTML = item.html;
      b.classList.toggle("on", isOn(item));
      b.addEventListener("click", function () {
        onPick(item);
        row.querySelectorAll(".opt").forEach(function (el, i) {
          el.classList.toggle("on", isOn(items[i]));
        });
      });
      row.appendChild(b);
    });
    host.appendChild(row);
    return row;
  }

  function obGroup(host, titleKey) {
    var g = document.createElement("div");
    g.className = "ob-group";
    var h = document.createElement("h3");
    h.textContent = t(titleKey);
    g.appendChild(h);
    host.appendChild(g);
    return g;
  }

  function obPara(host, key, cls) {
    var p = document.createElement("p");
    if (cls) p.className = cls;
    p.textContent = t(key);
    host.appendChild(p);
    return p;
  }

  function buildObPage() {
    var host = document.getElementById("ob-body");
    var page = OB_PAGES[obPage];
    host.innerHTML = "";
    host.scrollTop = 0;

    if (page === "intro") {
      var mark = document.createElement("p");
      mark.className = "ob-wordmark";
      mark.id = "ob-title";
      mark.textContent = "Prima Vista";     // the app's name, untranslated
      host.appendChild(mark);
      obPara(host, "ob.pitch");

    } else if (page === "vocab") {
      obHeading(host, "ob.vocabTitle");

      var rg = obGroup(host, "ob.vocabRhythm");
      var grid = document.createElement("div");
      grid.className = "fig-grid";
      rg.appendChild(grid);
      OB_FIGS.forEach(function (id) {
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className = "fig-cell";
        cell.setAttribute("aria-label", t("fig." + id));
        cell.innerHTML = figureGlyph(id);
        cell.classList.toggle("on", obFigureOn(id));
        cell.addEventListener("click", function () {
          obSetFigure(id, !obFigureOn(id));
          cell.classList.toggle("on", obFigureOn(id));
        });
        grid.appendChild(cell);
      });

      // Unison is left out: a repeated note is the least useful thing a
      // beginner can switch on, and dropping it makes the row read cleanly.
      var ig = obGroup(host, "ob.vocabSteps");
      var ivs = [];
      for (var i = 1; i < INTERVALS.length; i++) ivs.push({ i: i, html:
        '<span class="dot" style="background:' + INTERVALS[i].c + '"></span>' + STEP_LABELS[i] });
      obPills(ig, ivs,
        function (it) { return stepChecks[it.i].checked; },
        function (it) { stepChecks[it.i].checked = !stepChecks[it.i].checked; syncStepRow(it.i); },
        "ob-int");

      obPara(host, "ob.vocabNote", "ob-note");

    } else {
      obHeading(host, "ob.doneTitle");
      obPara(host, "ob.doneChunks");
      obPara(host, "ob.doneWhere");
    }

    var dots = document.getElementById("ob-dots");
    dots.innerHTML = "";
    OB_PAGES.forEach(function (_, i) {
      var d = document.createElement("i");
      if (i === obPage) d.className = "on";
      dots.appendChild(d);
    });

    var last = obPage === OB_PAGES.length - 1;
    var next = document.getElementById("ob-next");
    next.textContent = t(last ? "ob.go" : "ob.next");
    // Skip only sits on the pages that ask something. The intro has nothing to
    // skip past, and the closing page is already the end.
    document.getElementById("ob-skip").hidden = (page === "intro" || last);
  }

  function obHeading(host, key) {
    var h = document.createElement("h2");
    h.id = "ob-title";
    h.textContent = t(key);
    host.appendChild(h);
    return h;
  }

  function obGo(i) {
    obPage = i;
    if (obPage === 1) {
      // Get Started puts a beginner on the gentlest built-in. It is applied as
      // the current setup, not saved as a new preset — naming one is a later
      // idea, and it would drag a keyboard into the first thirty seconds.
      applyPreset(builtinPreset("steps only"));
      activePreset = "steps only";
      syncPanel();
    }
    buildObPage();
  }

  function obFinish() {
    document.getElementById("ob").hidden = true;
    try { localStorage.setItem(OB_KEY, "1"); } catch (e) {}
    syncPanel();
    persistSession();
    generate();          // one render for everything chosen along the way
  }

  function wireOnboarding() {
    var ob = document.getElementById("ob");
    if (!ob) return;
    var seen = true;
    try { seen = !OB_ALWAYS && !!localStorage.getItem(OB_KEY); } catch (e) {}
    document.getElementById("ob-next").addEventListener("click", function () {
      if (obPage === OB_PAGES.length - 1) obFinish();
      else obGo(obPage + 1);
    });
    // Skip lands on the closing page, not straight out — whatever else a
    // student skips, they should still be told where the settings are.
    document.getElementById("ob-skip").addEventListener("click", function () {
      obGo(OB_PAGES.length - 1);
    });
    if (seen) return;
    ob.hidden = false;
    buildObPage();
    // Focus the dialog itself rather than Next: it puts keyboard and
    // screen-reader context inside the walkthrough without painting a
    // focus ring on a button nobody has reached for yet.
    ob.focus();
  }

  // Re-label everything for the current language: the declarative bits from the
  // markup, then the pieces built at runtime, then anything measured from text.
  function applyLang() {
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });

    // runtime-built labels
    stepChecks.forEach(function (cb, i) { cb.setAttribute("aria-label", t("interval." + i)); });
    RANGE_OCTAVES.forEach(function (oct) {
      if (octChecks[oct]) octChecks[oct].setAttribute("aria-label", t("aria.octave") + " " + oct);
    });
    beatsEl.querySelectorAll(".beat").forEach(function (cb) {
      var cell = cb.closest(".fig-cell");
      if (cell) cell.setAttribute("aria-label", t("fig." + cb.value));
    });

    setPlayIcon(playing);
    renderPresets();          // preset labels and the "+ save" pill
    var sheet = document.getElementById("help-sheet");
    if (sheet && !sheet.hidden) buildHelpBody();
    syncPanel();              // every value shown on a control
    syncLangPills();
    lockCycleWidths();        // translated labels are a different width
  }

  function setLang(next) {
    if (!I18N[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyLang();
  }

  function buildLangPills() {
    var host = document.getElementById("lang-pills");
    if (!host) return;
    host.innerHTML = "";
    LANGS.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.textContent = l.label;
      b.setAttribute("aria-label", l.label);
      b.dataset.lang = l.id;
      b.addEventListener("click", function () { setLang(l.id); });
      host.appendChild(b);
    });
    syncLangPills();
  }

  function syncLangPills() {
    var host = document.getElementById("lang-pills");
    if (!host) return;
    Array.prototype.forEach.call(host.children, function (b) {
      b.classList.toggle("on", b.dataset.lang === lang);
    });
  }

  function buildMeasuresPills() {
    measuresPillsEl.innerHTML = "";
    Array.prototype.forEach.call(measuresEl.options, function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.textContent = opt.textContent;
      b.addEventListener("click", function () {
        measuresEl.value = opt.value;
        syncMeasuresPills();
        generate();
      });
      measuresPillsEl.appendChild(b);
    });
    syncMeasuresPills();
  }
  function syncMeasuresPills() {
    Array.prototype.forEach.call(measuresPillsEl.children, function (b, i) {
      b.classList.toggle("on", measuresEl.options[i].value === measuresEl.value);
    });
  }

  // Sliders are drawn by CSS from a gradient stop, so each one needs its filled
  // fraction kept current. One delegated listener covers every range on the page,
  // including the sixteen built for the Step matrix.
  function paintRange(el) {
    var min = +el.min || 0, max = (el.max === "" ? 100 : +el.max), v = +el.value;
    var pct = (max > min) ? ((v - min) / (max - min)) * 100 : 0;
    el.style.setProperty("--pct", pct + "%");
  }
  function paintAllRanges() {
    document.querySelectorAll('input[type="range"]').forEach(paintRange);
  }
  document.addEventListener("input", function (e) {
    if (e.target && e.target.type === "range") paintRange(e.target);
  });

  // Reflect every hidden control onto its visible counterpart. Called after any
  // preset / session restore, so the whole panel re-reads from one place.
  function syncPanel() {
    syncKeyRow();
    syncTimesigPills();
    syncBeatsFamily();    // a preset/session restore can change meter family too
    syncInstrument();
    syncChunks();
    syncCursorBtn();
    syncTempoUi();
    syncMeasuresPills();
    hideFromState();
    volumeUiEl.value = volumeEl.value;
    syncTransport();
    paintAllRanges();
  }

  function wirePanel() {
    // --- key row: each pill advances through its own list ---
    tonicCycleEl.addEventListener("click", function () {
      var k = keyParts();
      setKeyParts((k.sym + 1) % 7, k.acc);
      syncKeyRow(); generate();
    });
    accCycleEl.addEventListener("click", function () {
      var k = keyParts(), allowed = validAcc[k.sym] || ["0"];
      var i = allowed.indexOf(k.acc);
      setKeyParts(k.sym, allowed[(i + 1) % allowed.length]);
      syncKeyRow(); generate();
    });
    modeCycleEl.addEventListener("click", function () {
      var i = MODES.indexOf(keyModeEl.value);
      keyModeEl.value = MODES[(i + 1) % MODES.length];
      syncKeyRow(); generate();
    });
    clefCycleEl.addEventListener("click", function () {
      var ids = CLEFS.map(function (c) { return c.id; });
      var i = ids.indexOf(clefEl.value);
      clefEl.value = ids[(i + 1) % ids.length];
      shiftRangeToClef(clefEl.value);      // move the notes onto the new staff
      syncKeyRow(); generate();
    });

    // --- tempo: slider drags, ±5 nudges ---
    tempoUiEl.addEventListener("input", function () {
      tempoEl.value = tempoUiEl.value;
      tempoEl.dispatchEvent(new Event("input"));
      tempoValEl.textContent = tempoEl.value;
    });
    tempoUiEl.addEventListener("change", persistSession);
    function bumpTempo(d) {
      tempoEl.value = Math.max(40, Math.min(160, (parseInt(tempoEl.value, 10) || 80) + d));
      tempoEl.dispatchEvent(new Event("input"));
      syncTempoUi();
      persistSession();
    }
    document.getElementById("tempo-down").addEventListener("click", function () { bumpTempo(-5); });
    document.getElementById("tempo-up").addEventListener("click", function () { bumpTempo(5); });

    // --- accompaniment ---
    instCycleEl.addEventListener("click", function () {
      ensureAudio();
      var n = instrumentEl.options.length;
      instrumentEl.selectedIndex = (instrumentEl.selectedIndex + 1) % n;
      instrumentEl.dispatchEvent(new Event("change"));
      syncInstrument();
    });
    volumeUiEl.addEventListener("input", function () {
      volumeEl.value = volumeUiEl.value;
      volumeEl.dispatchEvent(new Event("input"));
    });
    volumeUiEl.addEventListener("change", persistSession);

    // --- hide ahead ---
    document.getElementById("hide-down").addEventListener("click", function () {
      setHide((parseInt(hideValEl.dataset.n, 10) || 0) - 1); persistSession();
    });
    document.getElementById("hide-up").addEventListener("click", function () {
      setHide((parseInt(hideValEl.dataset.n, 10) || 0) + 1); persistSession();
    });
    hideUnitEl.addEventListener("click", function () {
      hideUnitEl.dataset.unit = hideUnitIsMeasures() ? "beats" : "measures";
      syncHide(); persistSession();
    });

    // --- chunks + cursor ---
    chunksBtnEl.addEventListener("click", function () {
      showChunksEl.checked = !showChunksEl.checked;
      showChunksEl.dispatchEvent(new Event("change"));
      syncChunks();
    });
    cursorBtnEl.addEventListener("click", function () {
      cursorModeEl.value = (cursorModeEl.value === "off") ? "beat" : "off";
      cursorModeEl.dispatchEvent(new Event("change"));
      syncCursorBtn();
    });
  }

  // A tooltip answers "what is this?", so it has nothing left to say once you've
  // used the control — it would otherwise sit there through every tap while you
  // cycle the voice or nudge the tempo. Pressing marks it spent; leaving the
  // control re-arms it. Delegated, since rhythm tiles and preset pills are built
  // at runtime. (pointerleave doesn't bubble, so it's caught on the way down.)
  var TIP_SEL = ".cb-icon, .tb-btn, .icon-toggle, .cycle, .step-btn, .fig-cell, .upd, .del";

  document.addEventListener("pointerdown", function (e) {
    var el = (e.target && e.target.closest) ? e.target.closest(TIP_SEL) : null;
    if (el) el.classList.add("tip-off");
  }, true);

  // Only a leave of the control itself re-arms it. Clicking one of these swaps
  // its glyph, which hides the outgoing <svg> and fires pointerleave on that
  // child — matching by closest() here would clear the flag the press just set,
  // in the same gesture.
  document.addEventListener("pointerleave", function (e) {
    var el = e.target;
    if (el && el.matches && el.matches(TIP_SEL)) el.classList.remove("tip-off");
  }, true);

  // ===========================================================================
  // Wiring + init
  // ===========================================================================
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function clearError() { errorEl.hidden = true; errorEl.textContent = ""; }

  [keyTonicEl, keyModeEl, measuresEl, musicalityEl].forEach(function (el) { el.addEventListener("change", generate); });
  showChunksEl.addEventListener("change", drawOverlay);
  generateBtn.addEventListener("click", function () { generate(); });
  playBtn.addEventListener("click", function () {
    if (playing) { pausePlay(); return; }
    if (paused) resumePlay(); else startPlay();
    setPanel(false);   // starting or resuming clears the panel so the sheet is
                        // uncovered while it plays; pausing leaves it as is
  });
  document.getElementById("from-top").addEventListener("click", resetTop);
  setPlayIcon(false);

  // Either 🎼 button (transport bar or Tempo section) toggles the metronome.
  document.querySelectorAll(".js-metro").forEach(function (b) {
    b.addEventListener("click", function () {
      clickOnEl.checked = !clickOnEl.checked;
      clickOnEl.dispatchEvent(new Event("change"));
    });
  });
  clickOnEl.addEventListener("change", function () { syncMetroPill(); syncSwing(); });

  // Either ♩ button (transport bar or Accompaniment section) toggles play-along.
  document.querySelectorAll(".js-accomp").forEach(function (b) {
    b.addEventListener("click", function () {
      ensureAudio();   // this is a real gesture — a good moment to unlock/prime audio
      playAlongEl.checked = !playAlongEl.checked;
      playAlongEl.dispatchEvent(new Event("change"));
    });
  });
  playAlongEl.addEventListener("change", syncAccompBtn);
  syncTransport();

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

  // Pre-load a sampled instrument as soon as it's chosen, so it's decoded by Play,
  // and re-voice anything already queued so the change is audible immediately
  // rather than at the next line.
  instrumentEl.addEventListener("change", function () {
    var v = instrumentEl.value;
    if (isSampled(v)) { sampleFailed[v] = false; loadSamples(v); }
    if (playing) scheduleAhead();
  });

  // Turning the accompaniment on or off mid-line takes effect on the spot too:
  // scheduleAhead() queues the rest of the melody, or clears it when switched off.
  playAlongEl.addEventListener("change", function () {
    if (playing) scheduleAhead();
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (currentSheet) renderLoaded(); }, 200);
  });

  // Keep the page covers aligned as the stage scrolls (idle or smooth auto-scroll).
  sheetEl.parentNode.addEventListener("scroll", updateGap);

  // While pinned (auto-advance → the new line's downbeat), force the view back to the top on
  // every scroll event a stale smooth auto-scroll fires — it can't win. iPad Safari lets that
  // animation run on through the re-render and count-in; this defeats it deterministically.
  // A real scroll gesture releases the pin so the user is never trapped.
  sheetEl.parentNode.addEventListener("scroll", function () {
    if (pinTop && sheetEl.parentNode.scrollTop !== 0) sheetEl.parentNode.scrollTop = 0;
  }, { passive: true });
  ["touchstart", "wheel"].forEach(function (ev) {
    sheetEl.parentNode.addEventListener(ev, function () { pinTop = false; }, { passive: true });
  });

  probeKeys();                 // which accidentals each letter supports
  initRangeState();
  buildRangeGrid();
  buildBeatsPalette(currentBeatFigures());
  buildMatrix();
  buildMeasuresPills();
  buildTimesigPills();
  buildLangPills();
  wirePanel();
  wireHelp();
  setWeights(BUILTIN["thirds drill"]);
  activePreset = "thirds drill";
  restoreSession();            // override defaults with last-used settings, if any
  applyLang();                 // label everything, sync the panel, size the pills
  wireOnboarding();            // first visit only — built after the panel is in sync
  if (isSampled(instrumentEl.value)) loadSamples(instrumentEl.value);   // preload so it's ready before Play
  // Re-measure once Rubik is actually in play — the fallback font would have
  // sized the cycle pills wrong.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(lockCycleWidths);
  generate();
}());
