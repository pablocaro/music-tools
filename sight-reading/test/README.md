# Browser test harnesses

Empirical checks against the running app — most of what matters here (chord-tone
rates, beat crossings, what the hide curtain actually erases) is invisible in a
diff, so these measure the rendered, playing page.

## Run

```sh
python3 -m http.server 8091 --directory sight-reading &   # from the repo root
node sight-reading/test/smoke.js       # page loads, palette + sheet populated
node sight-reading/test/sweep.js       # highlighter integrity, 4 presets x 4 meters
node sight-reading/test/harmony.js     # chord-tone adherence across the dial
node sight-reading/test/rhythm.js      # beat crossings + 2/4 gating of wide figures
node sight-reading/test/hide.js        # curtain lands on unit boundaries; count-in
node sight-reading/test/popovers.js    # header popover geometry + exclusivity
node sight-reading/test/voicemenu.js   # voice menu: pick, reload, translate
node sight-reading/test/ties.js        # ties: pitch, bar sums, curves, one attack
node sight-reading/test/range.js       # intervals too wide for the range: muted, and mute
```

Screenshots land in `test/out/` (gitignored). `PW` / `CHROMIUM` env vars
override the playwright and browser paths.

## Three rules, all paid for

- A hanging test is not evidence the app is broken. Check the page with
  smoke.js before debugging the app.
- Drive the visible controls, not the hidden form elements — poking the
  hidden `<select>`s directly bypasses the code path users take, and once
  reported working gating as broken. Setting `#key-mode` rather than
  clicking the mode cycle leaves the progression picker on the other
  mode's list, because the remap hangs off the click.
- A test encodes the rule it checks, so a rule change dates the test. When
  V gained its seventh, harmony.js was still scoring against a bare triad
  and counted every generated seventh as a wrong note — an ~8 point drop
  that read exactly like a regression. Check the expectation first.

`window.__srSession` exposes the live play state (melody, onsets, ink) for
the things only observable there — that a tied pair is one sounding event
rather than two cannot be seen in the rendered page at all.
