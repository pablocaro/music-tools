# Sampled instruments

> Vibraphone was removed with Organ when the voice list came down to Piano,
> Marimba and Synth; its eleven samples went with it, ~197 KB of the file.
> Its VCSL path is in git if it is ever wanted back.

Source: **VCSL — Versilian Community Sample Library** (`sgossner/VCSL`).
License: **CC0 1.0** (public domain) — no attribution required; this note is courtesy.

All samples are embedded as **base64 AAC** in `instruments.js` (`window.SR_MARIMBA`,
`window.SR_PIANO`), so the app runs fully standalone from
`file://` with no `fetch` (which browsers block for local files). They're decoded and
peak-normalized at runtime (the VCSL recordings are very quiet, ~ -30 to -42 dB), and the
nearest sample is pitch-shifted to cover every note. See `loadSamples` / `scheduleSampled`
in app.js, and `SAMPLE_SETS` for each instrument's note list.

| Voice | VCSL path | notes |
|-------|-----------|-------|
| Marimba | `Idiophones/Struck Idiophones/Marimba` (Outrigger, med) | F1 C2 G2 B2 F3 C4 G4 B4 F5 C6 |
| Piano | `Chordophones/Zithers/Grand Piano, Steinway B/Sus` (vl3) | C2 F#2 C3 F#3 C4 F#4 C5 F#5 C6 |

To regenerate a set: download the original WAVs from its VCSL path, then per note
`afconvert -f WAVE -d LEI16@22050 -c 1 in.wav mono.wav` (downsample to mono 22 kHz),
optionally trim long sustains (piano was trimmed to ~4 s), `afconvert -f m4af -d aac -b 56000
mono.wav out.m4a`, base64-encode, and write into `instruments.js` as
`window.SR_<NAME> = { "<note>": "<base64>", ... }`.
