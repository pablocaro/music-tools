/* ---------------------------------------------------------------------------
   Tweaks — a live panel over the spacing and type tokens.

   Off unless the URL carries ?tweaks, so it ships inert: the script loads, sees
   no flag, and returns before touching the page.

   Why it exists. Every spacing or type decision so far has cost a full
   edit → screenshot → look → edit round trip, and the values are already named
   in :root — so they can be dragged in the browser instead and handed back as
   numbers once they look right. That last step is what "Copy as prompt" is for;
   without it this is just a debug readout.

   What earns a control: a decision, not a property. "How dense is the panel" is
   a decision; --pop-gap is a property. Five controls that each mean something
   beat twenty that need a map to navigate — and each one here drives a token
   the stylesheet already had, never a new one invented for the panel's sake.

   Adding one is a data change: a field in DEFAULTS, an entry in SETS, a line in
   apply(), and its token in TOKEN. The rendering code never learns about it.

   The panel is styled in literal px on purpose. It reads none of the tokens it
   drives — otherwise dragging density would deform the slider under the cursor.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  if (!/[?&]tweaks(?:[=&]|$)/.test(location.search)) return;

  var KEY = "sr_tweaks:v16";      // bumped when the defaults move, so a stored
                                 // set of slider values cannot mask the new baseline
                                 // (v16: stores only what moved — see save())
  var FOLD = "sr_tweaks_fold";

  // 1 · Defaults — one flat object, one entry per decision. Every value here is
  //     the neutral one, so "all defaults" is byte-identical to no panel.
  var DEFAULTS = {
    // type
    typeScale: 1, sizeMicro: 10, sizeCaption: 12, sizeLabel: 15, sizeLead: 18,
    titleSize: 29, baseWeight: 425, weightStep: 175,
    tracking: 0.9, leading: 1.5,
    // spacing
    density: 1.15, controlH: 40, headerGap: 8, railW: 400, gutter: 28, pagePad: 48,
    // shape
    pillRadius: 999, boxRadius: 18, surfaceRadius: 26, shadowDepth: 0.65,
    cornerCurve: 1,
    // rail
    railTone: 4, platterRadius: 24, platterPad: 18, platterGap: 10,
    platterLift: 0.1, platterEdge: 0, railInset: 20,
    caretSize: 12, caretWeight: 2, bandFold: 260,
    swScale: 0.63, thumbW: 22, thumbGap: 2, sliderW: 300, checkRadius: 6,
    // colour
    accentH: 208, accentS: 100, paperWarmth: 18, inkL: 16, chunkAlpha: 0.5,
    // music
    perLine: 6, staffSize: 1, musicFade: 60,
    // onboarding
    obLogoSize: 72, obLogoAlpha: 0.5, obLogoR: 20, obLogoSpread: 7,
    obTitle: 30, obTitleWeight: 550, wordmark: 40, wordmarkTrack: -0.02,
    obBody: 24, obLeading: 1.4, obPad: 44, obRadius: 34,
    obEnterMs: 420, obEnterRise: 16,
    obMarkMs: 620, obMarkTurn: 12, obMarkStagger: 70,
    // motion
    motion: 1, reduceMotion: 0
  };

  // 2 · Specs — the panel renders from this. `re` marks a control the engraver
  //     cares about: changing it re-lays the music out (see nudge()).
  var SETS = [
    { id: "type", title: "Typography", controls: [
      { key: "typeScale",   label: "Type scale",   min: 0.85, max: 1.25, step: 0.01, unit: "×",
        note: "multiplies every step below at once" },
      { key: "sizeMicro",   label: "Micro",        min: 7,  max: 16, step: 0.5, unit: "px",
        note: "note letters, octave numbers, weights" },
      { key: "sizeCaption", label: "Caption",      min: 8,  max: 18, step: 0.5, unit: "px",
        note: "section headings, legend, tooltips" },
      { key: "sizeLabel",   label: "Label",        min: 10, max: 22, step: 0.5, unit: "px",
        note: "anything you tap that says a word" },
      { key: "sizeLead",    label: "Lead",         min: 12, max: 26, step: 0.5, unit: "px",
        note: "the subtitle under the drill title" },
      { key: "titleSize",   label: "Drill title",  min: 18, max: 44, step: 1, unit: "px",
        note: "display type, riding over the scale" },
      { key: "baseWeight",  label: "Base weight",  min: 300, max: 800, step: 25, unit: "",
        note: "labels and body copy — the one running weight" },
      { key: "weightStep",  label: "Value step",   min: 0, max: 300, step: 25, unit: "",
        note: "how much heavier a value is than a label" },
      { key: "tracking",    label: "Caption track", min: 0, max: 2, step: 0.05, unit: "px",
        note: "letter-spacing on the uppercase headings" },
      { key: "leading",     label: "Line height",  min: 1.1, max: 2, step: 0.05, unit: "×",
        note: "body copy only; controls set their own" }
    ] },
    { id: "space", title: "Spacing", controls: [
      { key: "density",   label: "Panel density", min: 0.7, max: 1.4, step: 0.05, unit: "×",
        note: "the settings panel's gaps and padding" },
      { key: "controlH",  label: "Control size",  min: 32,  max: 54,  step: 1, unit: "px",
        note: "pills and toggles; round buttons follow at +8" },
      { key: "swScale",   label: "Switch size",   min: 0.45, max: 0.9, step: 0.02, unit: "×",
        note: "against the control height; iOS's own is 0.78 here" },
      { key: "thumbW",    label: "Slider thumb",  min: 14,  max: 40,  step: 1, unit: "px",
        note: "its width — the height follows the track" },
      { key: "thumbGap",  label: "Thumb gap",     min: 0,   max: 10,  step: 0.5, unit: "px",
        note: "where the track breaks around it; 0 is one unbroken line" },
      { key: "sliderW",   label: "Slider length", min: 120, max: 420, step: 10, unit: "px",
        note: "the interval weight tracks; capped by the rail's width" },
      { key: "headerGap", label: "Header gap",    min: 6,   max: 28,  step: 1, unit: "px",
        note: "between the three buttons top right" },
      { key: "railW",     label: "Rail width",    min: 300, max: 520, step: 10, unit: "px", re: 1,
        note: "the settings rail; also moves the push breakpoint" },
      { key: "pagePad",   label: "Page margin",   min: 8,   max: 80,  step: 2, unit: "px",
        note: "the title's inset and the floor under the music" },
      { key: "gutter",    label: "Music margin",  min: 8,   max: 96,  step: 2, unit: "px", re: 1,
        note: "air either side of the staff" }
    ] },
    { id: "shape", title: "Shape", controls: [
      { key: "pillRadius",    label: "Pill radius",    min: 4, max: 30, step: 1, unit: "px",
        maxLabel: "round", maxApply: 999, note: "presets, options, toggles" },
      { key: "boxRadius",     label: "Cell radius",    min: 0, max: 25, step: 1, unit: "px",
        note: "rhythm figures and the note grid" },
      { key: "surfaceRadius", label: "Surface radius", min: 4, max: 30, step: 1, unit: "px",
        note: "popovers; the sheet and menu follow at ±4" },
      { key: "shadowDepth",   label: "Shadow depth",   min: 0, max: 2,  step: 0.05, unit: "×",
        note: "how far surfaces lift off the paper" },
      { key: "checkRadius",   label: "Checkbox corner", min: 0, max: 10, step: 0.5, unit: "px",
        note: "give the curve below something to shape" },
      { key: "cornerCurve",   label: "Corner curve",   min: 0, max: 3,  step: 0.1, unit: "",
        note: "0 bevel · 1 round · 2 squircle (Chromium only)" }
    ] },
    { id: "rail", title: "Rail platters", controls: [
      { key: "railTone",      label: "Trough tone",     min: 0, max: 14, step: 1, unit: "",
        note: "grey behind the platters; 0 is white" },
      { key: "platterRadius", label: "Platter radius",  min: 0, max: 28, step: 1, unit: "px",
        note: "corner softness of a card" },
      { key: "platterLift",   label: "Platter lift",    min: 0, max: 2,  step: 0.05, unit: "×",
        note: "its shadow — 0 sits flat on the trough" },
      { key: "platterEdge",   kind: "switch", label: "Platter hairline",
        note: "a drawn edge as well as the shadow" },
      { key: "platterPad",    label: "Platter padding", min: 6, max: 30, step: 1, unit: "px",
        note: "air inside a card" },
      { key: "platterGap",    label: "Platter gap",     min: 0, max: 24, step: 1, unit: "px",
        note: "trough showing between cards" },
      { key: "railInset",     label: "Panel inset",     min: 0, max: 40, step: 1, unit: "px",
        note: "how far the stack sits off the rail's edge" },
      { key: "caretSize",     label: "Chevron size",    min: 8, max: 22, step: 1, unit: "px",
        note: "the fold arrow on a platter header" },
      { key: "caretWeight",   label: "Chevron weight",  min: 1, max: 4, step: 0.25, unit: "px",
        note: "its stroke — the points stay round at any weight" },
      { key: "bandFold",      label: "Fold speed",      min: 0, max: 700, step: 20, unit: "ms",
        note: "opening and closing a platter; the chevron turns with it" }
    ] },
    { id: "colour", title: "Colour", controls: [
      { key: "accentH",     label: "Accent hue",   min: 0, max: 360, step: 1, unit: "°",
        note: "everything selected takes this" },
      { key: "accentS",     label: "Accent punch", min: 0, max: 100, step: 1, unit: "%",
        note: "saturation — 0 is a grey UI" },
      { key: "paperWarmth", label: "Paper warmth", min: 0, max: 30,  step: 1, unit: "",
        note: "0 is white; a little gives manuscript cream" },
      { key: "inkL",        label: "Ink lightness", min: 0, max: 40, step: 1, unit: "%",
        note: "lower is blacker — the notation's contrast" },
      { key: "chunkAlpha",  label: "Highlighter",  min: 0.1, max: 1, step: 0.05, unit: "×",
        note: "strength of the pattern blocks" }
    ] },
    { id: "music", title: "Music", controls: [
      { key: "perLine",   label: "Bars per line", min: 2,   max: 6,   step: 1, unit: "", re: 1,
        note: "a cap — a narrow window still fits fewer" },
      { key: "staffSize", label: "Staff size",    min: 0.6, max: 1.4, step: 0.05, unit: "×", re: 1,
        note: "ceiling on how large the staff is drawn" },
      { key: "musicFade", label: "Bottom fade",   min: 0, max: 160, step: 4, unit: "px", re: 1,
        note: "music dissolves before the pill; 0 is a hard clip" }
    ] },
    { id: "ob", title: "Onboarding", controls: [
      { key: "obLogoSize",   label: "Logo size",    min: 28, max: 72, step: 1, unit: "px",
        note: "open ?onboarding&tweaks to watch these land" },
      { key: "obLogoAlpha",  label: "Logo ink",     min: 0.2, max: 0.8, step: 0.05, unit: "×",
        note: "each circle's strength; overlaps multiply" },
      { key: "obLogoR",      label: "Circle size",  min: 7, max: 20, step: 0.5, unit: "px",
        note: "radius of each of the three" },
      { key: "obLogoSpread", label: "Circle spread", min: 0, max: 16, step: 0.5, unit: "px",
        note: "less is more overlap; the mark refits itself either way" },
      { key: "wordmark",     label: "Wordmark size", min: 20, max: 64, step: 1, unit: "px",
        note: "Prima Vista on the onboarding card" },
      { key: "wordmarkTrack",label: "Wordmark track", min: -0.06, max: 0.06, step: 0.005, unit: "em",
        note: "in em, so the header and the card track alike" },
      { key: "obTitle",      label: "Title size",   min: 20, max: 40, step: 1, unit: "px",
        note: "the wordmark and each page's question" },
      { key: "obTitleWeight",label: "Title weight", min: 400, max: 900, step: 25, unit: "",
        note: "" },
      { key: "obBody",       label: "Body size",    min: 14, max: 28, step: 0.5, unit: "px",
        note: "the walkthrough's copy" },
      { key: "obLeading",    label: "Body leading", min: 1.2, max: 1.9, step: 0.05, unit: "×",
        note: "" },
      { key: "obPad",        label: "Card padding", min: 24, max: 64, step: 2, unit: "px",
        note: "desktop card; the phone wall keeps its own" },
      { key: "obRadius",     label: "Card radius",  min: 12, max: 40, step: 1, unit: "px",
        note: "" },
      { key: "obEnterMs",    label: "Card entrance", min: 0, max: 1000, step: 20, unit: "ms",
        note: "reload to see it; the mark is timed against it" },
      { key: "obEnterRise",  label: "Card rise",     min: 0, max: 48, step: 1, unit: "px",
        note: "how far it comes up through; it leaves downward" },
      { key: "obMarkMs",     label: "Mark assembly", min: 0, max: 1400, step: 20, unit: "ms",
        note: "click the mark to play it again" },
      { key: "obMarkTurn",   label: "Mark spin",     min: 0, max: 60, step: 1, unit: "\u00b0",
        note: "how far the ring unwinds as the circles part" },
      { key: "obMarkStagger", label: "Mark stagger", min: 0, max: 200, step: 5, unit: "ms",
        note: "delay between the three circles" }
    ] },
    { id: "motion", title: "Motion", controls: [
      { key: "motion",       label: "Transition speed", min: 0, max: 2, step: 0.05, unit: "×",
        note: "the rail's slide and the scrim's fade" },
      { key: "reduceMotion", kind: "switch", label: "Reduce motion",
        note: "hard override — stills everything, whatever the dial says" }
    ] }
  ];

  // The token (or seam) each control drives. In the pasted block, so what comes
  // back names the thing to edit rather than describing it in prose.
  var TOKEN = {
    typeScale: "--type-scale", titleSize: "--fs-4-base",
    sizeMicro: "--fs-0-base", sizeCaption: "--fs-1-base",
    sizeLabel: "--fs-2-base", sizeLead: "--fs-3-base",
    baseWeight: "--weight-standard", weightStep: "--weight-step",
    tracking: "--track-caption",
    leading: "--leading",
    density: "--density", controlH: "--ctl-h", headerGap: "--tb-gap",
    swScale: "--sw-scale", thumbW: "--thumb-w", thumbGap: "--thumb-gap",
    sliderW: "--slider-w",
    railW: "--rail-w", gutter: "--music-gutter", pagePad: "--page-pad",
    pillRadius: "--ctl-radius", boxRadius: "--ctl-radius-box",
    surfaceRadius: "--radius-card", shadowDepth: "--shadow-depth",
    cornerCurve: "--corner-curve", checkRadius: "--check-radius",
    railTone: "--rail-tone", platterRadius: "--platter-radius",
    platterPad: "--platter-pad", platterGap: "--platter-gap",
    platterLift: "--platter-lift", platterEdge: "--platter-edge",
    railInset: "--rail-inset",
    caretSize: "--caret-size", caretWeight: "--caret-weight",
    bandFold: "--band-fold-ms",
    accentH: "--accent-h", accentS: "--accent-s", paperWarmth: "--paper-warmth",
    inkL: "--ink-l", chunkAlpha: "--chunk-alpha",
    perLine: "app.js LAYOUT.perLine", staffSize: "app.js LAYOUT.zoomCap",
    musicFade: "--music-fade",
    obLogoSize: "--ob-logo-size", obLogoAlpha: "--ob-logo-alpha",
    obLogoR: "--ob-logo-r", obLogoSpread: "--ob-logo-spread",
    obTitle: "--ob-title-size", obTitleWeight: "--ob-title-weight",
    wordmark: "--wordmark-size", wordmarkTrack: "--wordmark-track",
    obBody: "--ob-body-size", obLeading: "--ob-leading",
    obPad: "--ob-pad", obRadius: "--ob-radius",
    obEnterMs: "--ob-enter-ms", obEnterRise: "--ob-enter-rise",
    obMarkMs: "--ob-mark-ms", obMarkTurn: "--ob-mark-turn",
    obMarkStagger: "--ob-mark-stagger",
    motion: "--motion", reduceMotion: ".reduce-motion on <html>"
  };

  // --- the baseline this viewport actually shipped -------------------------
  // DEFAULTS is one flat object, but the stylesheet's defaults are conditional:
  // four tokens change under the 720px media query. The panel used to ignore
  // that twice over. It seeded its sliders from the desktop numbers, and then
  // apply() wrote them inline on <html>, where they outrank the media query —
  // so merely opening the panel on a phone restored desktop spacing (a 390px
  // screen got a 48px page margin), and every "was" reported afterwards named
  // a value that viewport had never had.
  //
  // So the baseline is read rather than assumed, and read BEFORE the first
  // apply(), while :root is still the only thing setting these. Anything that
  // is not a plain number with a simple unit keeps its DEFAULTS entry, so an
  // exotic value degrades to the old behaviour instead of to nonsense.
  var NUMERIC = /^-?\d*\.?\d+(px|ms|s|em|rem|%|deg)?$/;
  var SHIPPED = (function () {
    var cs = getComputedStyle(document.documentElement), v = {}, k, t, raw;
    for (k in DEFAULTS) {
      v[k] = DEFAULTS[k];
      t = TOKEN[k];
      if (!t || t.slice(0, 2) !== "--") continue;      // app.js knobs, class flags
      raw = cs.getPropertyValue(t).trim();
      if (NUMERIC.test(raw)) v[k] = parseFloat(raw);
    }
    return v;
  })();

  // --- state ---------------------------------------------------------------
  var state = load();

  function load() {
    var v = {}, k;
    for (k in DEFAULTS) v[k] = SHIPPED[k];
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      for (k in DEFAULTS) if (typeof raw[k] === "number") v[k] = raw[k];
    } catch (e) {}
    return v;
  }
  // Only what was actually moved is stored. Storing the whole set conflated
  // "the user chose 48" with "48 was the desktop default at the time", which
  // is what let a phone reload into desktop spacing even after the seeding
  // above was right — and it makes one saved set mean the same thing on both
  // viewports, since an untouched token now falls to whatever that screen
  // ships rather than to whatever screen it was last saved from.
  function save() {
    try {
      var out = {}, k;
      for (k in DEFAULTS) if (state[k] !== SHIPPED[k]) out[k] = state[k];
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch (e) {}
  }

  // 3 · Wiring — the one place a value becomes a CSS variable. Set on <html>,
  //     so these inline properties beat the stylesheet's :root, including the
  //     mobile media query (deliberate: on a phone the sliders still bite).
  //     Only for values that were moved, though — see the release pass at the
  //     end, and SHIPPED above for why that distinction had to be drawn.
  function apply() {
    var el = document.documentElement, r = el.style;

    r.setProperty("--type-scale",       String(state.typeScale));
    r.setProperty("--fs-4-base",        state.titleSize + "px");
    r.setProperty("--fs-0-base",        state.sizeMicro + "px");
    r.setProperty("--fs-1-base",        state.sizeCaption + "px");
    r.setProperty("--fs-2-base",        state.sizeLabel + "px");
    r.setProperty("--fs-3-base",        state.sizeLead + "px");
    r.setProperty("--weight-standard", String(state.baseWeight));
    r.setProperty("--weight-step",     String(state.weightStep));
    r.setProperty("--track-caption",    state.tracking + "px");
    r.setProperty("--leading",          String(state.leading));

    r.setProperty("--density",      String(state.density));
    r.setProperty("--ctl-h",        state.controlH + "px");
    r.setProperty("--tb-gap",       state.headerGap + "px");
    r.setProperty("--sw-scale",     String(state.swScale));
    r.setProperty("--thumb-w",      state.thumbW + "px");
    r.setProperty("--thumb-gap",    state.thumbGap + "px");
    r.setProperty("--slider-w",     state.sliderW + "px");
    r.setProperty("--rail-w",       state.railW + "px");
    r.setProperty("--music-gutter", state.gutter + "px");
    r.setProperty("--page-pad",     state.pagePad + "px");

    // pillRadius carries a sentinel: its top step means "fully round", which is
    // the shipped value (999px) and the app's identity. A linear slider to 999
    // would spend its whole travel somewhere nothing changes.
    r.setProperty("--ctl-radius",     (state.pillRadius >= 30 ? 999 : state.pillRadius) + "px");
    r.setProperty("--ctl-radius-box", state.boxRadius + "px");
    r.setProperty("--radius-card",    state.surfaceRadius + "px");
    r.setProperty("--shadow-depth",   String(state.shadowDepth));
    r.setProperty("--corner-curve",   String(state.cornerCurve));
    r.setProperty("--check-radius",   state.checkRadius + "px");

    r.setProperty("--rail-tone",       String(state.railTone));
    r.setProperty("--platter-radius",  state.platterRadius + "px");
    r.setProperty("--platter-pad",     state.platterPad + "px");
    r.setProperty("--platter-gap",     state.platterGap + "px");
    r.setProperty("--platter-lift",    String(state.platterLift));
    r.setProperty("--platter-edge",    String(state.platterEdge));
    r.setProperty("--rail-inset",      state.railInset + "px");
    r.setProperty("--caret-size",      String(state.caretSize));    // unitless — see style.css
    r.setProperty("--caret-weight",    String(state.caretWeight));
    r.setProperty("--band-fold-ms",    String(state.bandFold));   // unitless ms

    r.setProperty("--accent-h",     String(state.accentH));
    r.setProperty("--accent-s",     state.accentS + "%");
    r.setProperty("--paper-warmth", String(state.paperWarmth));
    r.setProperty("--ink-l",        state.inkL + "%");
    r.setProperty("--chunk-alpha",  String(state.chunkAlpha));

    r.setProperty("--music-fade", state.musicFade + "px");

    r.setProperty("--ob-logo-size",    state.obLogoSize + "px");
    r.setProperty("--ob-logo-alpha",   String(state.obLogoAlpha));
    r.setProperty("--ob-logo-r",       String(state.obLogoR));      // unitless
    r.setProperty("--ob-logo-spread",  String(state.obLogoSpread));
    r.setProperty("--wordmark-size",   state.wordmark + "px");
    r.setProperty("--wordmark-track",  state.wordmarkTrack + "em");
    r.setProperty("--ob-title-size",   state.obTitle + "px");
    r.setProperty("--ob-title-weight", String(state.obTitleWeight));
    r.setProperty("--ob-body-size",    state.obBody + "px");
    r.setProperty("--ob-leading",      String(state.obLeading));
    r.setProperty("--ob-pad",          state.obPad + "px");
    r.setProperty("--ob-radius",       state.obRadius + "px");
    // Unitless — style.css multiplies them into ms and deg, so --motion can
    // scale the whole entrance the way it scales every other transition.
    r.setProperty("--ob-enter-ms",     String(state.obEnterMs));
    r.setProperty("--ob-enter-rise",   String(state.obEnterRise));
    r.setProperty("--ob-mark-ms",      String(state.obMarkMs));
    r.setProperty("--ob-mark-turn",    String(state.obMarkTurn));
    r.setProperty("--ob-mark-stagger", String(state.obMarkStagger));
    r.setProperty("--motion", String(state.motion));
    el.classList.toggle("reduce-motion", !!state.reduceMotion);

    // The two that aren't CSS at all.
    if (window.__srLayout) {
      window.__srLayout.perLine = state.perLine;
      window.__srLayout.zoomCap = state.staffSize;
    }

    // Then hand back everything that was not actually moved. Writing all 60
    // inline pinned them to whatever the viewport was at load: an untouched
    // token could no longer answer a media query, so rotating a phone past
    // 720px — or opening the panel on one at all — froze the layout at the
    // other screen's spacing. An inline property is how a slider overrules
    // the stylesheet, so only a moved slider should get one; the rest stay
    // where the stylesheet can still reach them. Every token the panel drives
    // is defined on :root, so removal always lands on a real value.
    for (var k in DEFAULTS) {
      if (state[k] === SHIPPED[k] && TOKEN[k] && TOKEN[k].slice(0, 2) === "--") {
        r.removeProperty(TOKEN[k]);
      }
    }
  }

  // A control the engraver cares about needs the score laid out again. app.js
  // already debounces window resize into its render pass, so borrowing that is
  // cheaper than a second entry point — and it is the same path a real window
  // resize takes, so there is nothing extra to keep correct.
  var nudgeTimer = null;
  function nudge() {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
    }, 120);
  }

  function ctl(key) {
    for (var i = 0; i < SETS.length; i++)
      for (var j = 0; j < SETS[i].controls.length; j++)
        if (SETS[i].controls[j].key === key) return SETS[i].controls[j];
    return null;
  }
  function shown(key, val) {
    var c = ctl(key);
    if (c.kind === "switch") return val ? "on" : "off";
    if (c.maxLabel && val >= c.max) return c.maxLabel;
    // Round only where the step is whole — tracking moves in 0.05px, and
    // rounding it reported the 0.7px default back as "1px".
    return (c.unit === "px" && c.step >= 1 ? Math.round(val) : val) + c.unit;
  }

  // 5 · The block you paste back — only what moved, named by its token.
  //     "was" names what THIS viewport shipped, not what the desktop :root
  //     says, and where those differ the note says so: a number dragged on a
  //     phone belongs in the media query, and pasting it as the base value
  //     would move the desktop silently.
  function toPrompt() {
    var lines = [], notes = [], k;
    for (k in DEFAULTS) {
      if (state[k] !== SHIPPED[k]) {
        lines.push("  " + TOKEN[k] + ": " + shown(k, state[k]) +
                   "   (was " + shown(k, SHIPPED[k]) + ", " + ctl(k).label.toLowerCase() + ")");
        if (SHIPPED[k] !== DEFAULTS[k]) {
          notes.push("  " + TOKEN[k] + " is overridden for this screen — " +
                     shown(k, SHIPPED[k]) + " here, " + shown(k, DEFAULTS[k]) +
                     " on the base :root. Change the override, not the base.");
        }
      }
    }
    if (!lines.length) return "Nothing moved — the sight-reading defaults are unchanged.";
    return "Update the sight-reading design defaults:\n\n" +
           lines.join("\n") +
           (notes.length ? "\n\nHeads up:\n" + notes.join("\n") : "") +
           "\n\nEverything else unchanged.";
  }

  // --- 4 · panel -----------------------------------------------------------
  var CSS =
    "#tw{position:fixed;top:12px;left:12px;z-index:200;width:262px;" +
      "font:500 12px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a1a;" +
      "background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.18)}" +
    "#tw-top{display:flex;align-items:center;gap:8px;padding:11px 12px}" +
    "#tw-top b{flex:1;font-size:11px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:#8e8e93}" +
    "#tw-top button{width:22px;height:22px;padding:0;border:none;border-radius:6px;background:#f0f0f3;" +
      "color:#1a1a1a;font-family:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer}" +
    "#tw-top button:hover{background:#e4e4e9;opacity:1}" +
    "#tw-top button:active{opacity:1}" +
    "#tw-body{padding:0 12px 12px;max-height:76vh;overflow-y:auto}" +
    "#tw.fold #tw-body{display:none}" +
    ".tw-set{border-top:1px solid #ececf0}" +
    ".tw-set:first-child{border-top:none}" +
    ".tw-h{display:flex;align-items:center;gap:6px;width:100%;padding:9px 0;border:none;" +
      "background:none;cursor:pointer;font-family:inherit;font-size:10px;font-weight:600;" +
      "letter-spacing:.6px;text-transform:uppercase;color:#8e8e93;text-align:left}" +
    ".tw-h:hover,.tw-h:active{color:#1a1a1a;opacity:1}" +
    ".tw-h i{font-style:normal;font-size:9px;width:9px}" +
    ".tw-in{display:none;padding-bottom:2px}" +
    ".tw-set.open .tw-in{display:block}" +
    ".tw-sw{width:34px;height:20px;flex-shrink:0;padding:0;border:none;border-radius:999px;" +
      "background:rgba(0,0,0,.16);cursor:pointer;position:relative;transition:background .15s}" +
    ".tw-sw::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;" +
      "border-radius:50%;background:#fff;transition:transform .15s}" +
    ".tw-sw.on{background:#0a84ff}" +
    ".tw-sw.on::after{transform:translateX(14px)}" +
    ".tw-sw:hover,.tw-sw:active{opacity:1}" +
    ".tw-c{margin-bottom:11px}" +
    ".tw-l{display:flex;justify-content:space-between;align-items:baseline;gap:8px}" +
    ".tw-l span:last-child{font-variant-numeric:tabular-nums;font-weight:700;color:#0a84ff}" +
    ".tw-n{display:block;color:#8e8e93;font-size:10px;margin-top:1px}" +
    ".tw-c input{-webkit-appearance:none;appearance:none;width:100%;height:18px;margin-top:3px;" +
      "background:transparent;cursor:pointer}" +
    ".tw-c input::-webkit-slider-runnable-track{height:4px;border-radius:9px;background:rgba(0,0,0,.16)}" +
    ".tw-c input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;" +
      "margin-top:-5px;border-radius:50%;background:#0a84ff}" +
    ".tw-c input::-moz-range-track{height:4px;border-radius:9px;background:rgba(0,0,0,.16)}" +
    ".tw-c input::-moz-range-thumb{width:14px;height:14px;border:none;border-radius:50%;background:#0a84ff}" +
    "#tw-foot{display:flex;gap:6px;margin-top:12px}" +
    "#tw-foot button{flex:1;padding:9px 6px;border:none;border-radius:8px;white-space:nowrap;" +
      "font-family:inherit;font-size:12px;font-weight:600;line-height:1;cursor:pointer}" +
    "#tw-foot button:hover,#tw-foot button:active{opacity:1}" +
    "#tw-copy{background:#0a84ff;color:#fff}" +
    "#tw-reset{background:#f0f0f3;color:#1a1a1a;flex:0 0 auto;padding:9px 12px}" +
    "#tw-reset:hover{background:#e4e4e9}";

  function build() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement("div");
    el.id = "tw";

    var top = document.createElement("div");
    top.id = "tw-top";
    var name = document.createElement("b");
    name.textContent = "Tweaks";
    var fold = document.createElement("button");
    fold.type = "button";
    fold.title = "Collapse";
    fold.textContent = "–";
    top.appendChild(name);
    top.appendChild(fold);

    var body = document.createElement("div");
    body.id = "tw-body";

    var syncers = [];   // pull each control back to state — used by Reset

    // Rendered from SETS — this loop never names an individual control. Sets
    // fold independently, which is what keeps twenty controls navigable: the
    // one you are working on is the only one open.
    var openSets = {};
    try { openSets = JSON.parse(localStorage.getItem(FOLD + ":sets") || "{}"); } catch (e) {}

    SETS.forEach(function (set) {
      var wrap = document.createElement("div");
      wrap.className = "tw-set";

      var h = document.createElement("button");
      h.type = "button";
      h.className = "tw-h";
      var caret = document.createElement("i");
      caret.textContent = "▸";
      var htxt = document.createElement("span");
      htxt.textContent = set.title;
      h.appendChild(caret);
      h.appendChild(htxt);

      var inner = document.createElement("div");
      inner.className = "tw-in";

      var isOpen = openSets[set.id] !== false;   // open unless folded before
      var draw = function () {
        wrap.classList.toggle("open", isOpen);
        caret.textContent = isOpen ? "▾" : "▸";
        h.setAttribute("aria-expanded", isOpen ? "true" : "false");
      };
      h.addEventListener("click", function () {
        isOpen = !isOpen;
        openSets[set.id] = isOpen;
        try { localStorage.setItem(FOLD + ":sets", JSON.stringify(openSets)); } catch (e) {}
        draw();
      });
      draw();

      set.controls.forEach(function (c) {
        var row = document.createElement("div");
        row.className = "tw-c";

        var lab = document.createElement("div");
        lab.className = "tw-l";
        var lname = document.createElement("span");
        lname.textContent = c.label;
        var lval = document.createElement("span");
        lval.textContent = shown(c.key, state[c.key]);
        lab.appendChild(lname);
        lab.appendChild(lval);
        row.appendChild(lab);

        var commit = function (v) {
          state[c.key] = v;
          lval.textContent = shown(c.key, state[c.key]);
          apply();
          save();
          if (c.re) nudge();
        };

        var input;
        if (c.kind === "switch") {
          input = document.createElement("button");
          input.type = "button";
          input.className = "tw-sw";
          input.setAttribute("aria-label", c.label);
          var paint = function () {
            input.classList.toggle("on", !!state[c.key]);
            input.setAttribute("aria-pressed", state[c.key] ? "true" : "false");
          };
          input.addEventListener("click", function () { commit(state[c.key] ? 0 : 1); paint(); });
          paint();
          lval.textContent = "";           // the switch *is* the readout
          lab.appendChild(input);          // and it sits on its label's row
          syncers.push(paint);
        } else {
          input = document.createElement("input");
          input.type = "range";
          input.min = c.min; input.max = c.max; input.step = c.step;
          input.value = state[c.key];
          input.setAttribute("aria-label", c.label);
          input.addEventListener("input", function () { commit(parseFloat(input.value)); });
          row.appendChild(input);
          syncers.push(function () {
            input.value = state[c.key];
            lval.textContent = shown(c.key, state[c.key]);
          });
        }

        if (c.note) {
          var n = document.createElement("small");
          n.className = "tw-n";
          n.textContent = c.note;
          row.appendChild(n);
        }
        inner.appendChild(row);
      });

      wrap.appendChild(h);
      wrap.appendChild(inner);
      body.appendChild(wrap);
    });

    var foot = document.createElement("div");
    foot.id = "tw-foot";
    var copy = document.createElement("button");
    copy.id = "tw-copy"; copy.type = "button"; copy.textContent = "Copy as prompt";
    var reset = document.createElement("button");
    reset.id = "tw-reset"; reset.type = "button"; reset.textContent = "Reset";
    foot.appendChild(copy);
    foot.appendChild(reset);
    body.appendChild(foot);

    el.appendChild(top);
    el.appendChild(body);
    document.body.appendChild(el);

    // --- behaviour ---
    fold.addEventListener("click", function () {
      var f = el.classList.toggle("fold");
      fold.textContent = f ? "+" : "–";
      try { localStorage.setItem(FOLD, f ? "1" : "0"); } catch (e) {}
    });
    try { if (localStorage.getItem(FOLD) === "1") { el.classList.add("fold"); fold.textContent = "+"; } } catch (e) {}

    copy.addEventListener("click", function () {
      var text = toPrompt(), done = function () {
        copy.textContent = "Copied — paste to Claude";
        setTimeout(function () { copy.textContent = "Copy as prompt"; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy this:", text); });
      } else {
        window.prompt("Copy this:", text);
      }
    });

    reset.addEventListener("click", function () {
      for (var k in DEFAULTS) state[k] = SHIPPED[k];   // back to what this screen ships
      apply(); save(); nudge();
      syncers.forEach(function (f) { f(); });
    });
  }

  apply();   // stored values land before first paint where possible
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
