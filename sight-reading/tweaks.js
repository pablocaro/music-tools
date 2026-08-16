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

  var KEY = "sr_tweaks:v1";      // versioned: a schema change resets cleanly
  var FOLD = "sr_tweaks_fold";

  // 1 · Defaults — one flat object, one entry per decision.
  var DEFAULTS = {
    typeScale: 1,
    titleSize: 28,
    density:   1,
    controlH:  40,
    headerGap: 12
  };

  // 2 · Specs — the panel renders from this.
  var SETS = [
    { title: "Typography", controls: [
      { key: "typeScale", label: "Type scale",  min: 0.85, max: 1.25, step: 0.01, unit: "×",
        note: "every step of the scale at once" },
      { key: "titleSize", label: "Drill title", min: 18,   max: 40,   step: 1,    unit: "px",
        note: "display type, riding over the scale" }
    ] },
    { title: "Spacing", controls: [
      { key: "density",   label: "Panel density", min: 0.7, max: 1.4, step: 0.05, unit: "×",
        note: "the settings panel's gaps and padding" },
      { key: "controlH",  label: "Control size",  min: 32,  max: 54,  step: 1,    unit: "px",
        note: "pills and toggles; round buttons follow at +8" },
      { key: "headerGap", label: "Header gap",    min: 6,   max: 28,  step: 1,    unit: "px",
        note: "between the three buttons top right" }
    ] }
  ];

  // The token each control drives. In the pasted block so what comes back names
  // the variable to edit rather than describing it in prose.
  var TOKEN = {
    typeScale: "--type-scale",
    titleSize: "--fs-4-base",
    density:   "--density",
    controlH:  "--ctl-h",
    headerGap: "--tb-gap"
  };

  // --- state ---------------------------------------------------------------
  var state = load();

  function load() {
    var v = {}, k;
    for (k in DEFAULTS) v[k] = DEFAULTS[k];
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      for (k in DEFAULTS) if (typeof raw[k] === "number") v[k] = raw[k];
    } catch (e) {}
    return v;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  // 3 · Wiring — the one place a value becomes a CSS variable. Set on <html>,
  //     so these inline properties beat the stylesheet's :root, including the
  //     mobile media query (deliberate: on a phone the sliders still bite).
  function apply() {
    var r = document.documentElement.style;
    r.setProperty("--type-scale", String(state.typeScale));
    r.setProperty("--fs-4-base",  state.titleSize + "px");
    r.setProperty("--density",    String(state.density));
    r.setProperty("--ctl-h",      state.controlH + "px");
    r.setProperty("--tb-gap",     state.headerGap + "px");
  }

  function ctl(key) {
    for (var i = 0; i < SETS.length; i++)
      for (var j = 0; j < SETS[i].controls.length; j++)
        if (SETS[i].controls[j].key === key) return SETS[i].controls[j];
    return null;
  }
  function shown(key, val) {
    var c = ctl(key);
    return (c.unit === "px" ? Math.round(val) : val) + c.unit;
  }

  // 5 · The block you paste back — only what moved, named by its token.
  function toPrompt() {
    var lines = [], k;
    for (k in DEFAULTS) {
      if (state[k] !== DEFAULTS[k]) {
        lines.push("  " + TOKEN[k] + ": " + shown(k, state[k]) +
                   "   (was " + shown(k, DEFAULTS[k]) + ", " + ctl(k).label.toLowerCase() + ")");
      }
    }
    if (!lines.length) return "Nothing moved — the sight-reading defaults are unchanged.";
    return "Update the sight-reading design defaults in style.css:\n\n" +
           lines.join("\n") + "\n\nEverything else unchanged.";
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
    "#tw-body{padding:0 12px 12px;max-height:78vh;overflow-y:auto}" +
    "#tw.fold #tw-body{display:none}" +
    ".tw-set{margin-top:6px}" +
    ".tw-set>h4{font-size:10px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;" +
      "color:#8e8e93;margin:10px 0 7px}" +
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

    // Rendered from SETS — this loop never names an individual control.
    SETS.forEach(function (set) {
      var wrap = document.createElement("div");
      wrap.className = "tw-set";
      var h = document.createElement("h4");
      h.textContent = set.title;
      wrap.appendChild(h);

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

        var slider = document.createElement("input");
        slider.type = "range";
        slider.min = c.min; slider.max = c.max; slider.step = c.step;
        slider.value = state[c.key];
        slider.setAttribute("aria-label", c.label);
        slider.addEventListener("input", function () {
          state[c.key] = parseFloat(slider.value);
          lval.textContent = shown(c.key, state[c.key]);
          apply();
          save();
        });

        syncers.push(function () {
          slider.value = state[c.key];
          lval.textContent = shown(c.key, state[c.key]);
        });

        row.appendChild(lab);
        row.appendChild(slider);
        if (c.note) {
          var n = document.createElement("small");
          n.className = "tw-n";
          n.textContent = c.note;
          row.appendChild(n);
        }
        wrap.appendChild(row);
      });
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
      for (var k in DEFAULTS) state[k] = DEFAULTS[k];
      apply(); save();
      syncers.forEach(function (f) { f(); });
    });
  }

  apply();   // stored values land before first paint where possible
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
