# iOS Audio Guide: Web Audio API + Tone.js

Complete guide for building audio applications that work reliably on iOS and web platforms.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Web Audio API Reference](#web-audio-api-reference)
3. [Tone.js API Reference](#tonejs-api-reference)
4. [The Four Approaches](#the-four-approaches)
5. [Complete Working Examples](#complete-working-examples)
6. [iOS Compatibility Techniques](#ios-compatibility-techniques)
7. [Troubleshooting](#troubleshooting)
8. [Testing Checklist](#testing-checklist)

---

## Quick Start

### I want the absolute simplest solution (5 minutes)
Use pure Web Audio API - no dependencies, works everywhere:

```javascript
const ctx = new (window.AudioContext || window.webkitAudioContext)();

function play() {
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 261.63; // C4
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
}

function stop() {
  // fade and stop
}

button.addEventListener('touchstart', play);
button.addEventListener('touchend', stop);
```

### I want to build something interesting (30 minutes)
Use Tone.js - higher-level abstractions, more features.

See "Pattern 1: Oscillator" below.

### I want complete reference
Read the entire guide below.

---

## Web Audio API Reference

### Core Concepts

```javascript
// Create audio context (singleton)
const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();

// Check state and resume if suspended (iOS requirement)
if (ctx.state === 'suspended') {
  ctx.resume();
}
```

### Main Nodes

```javascript
// Source nodes
ctx.createOscillator()      // Generate waveforms
ctx.createBufferSource()    // Play audio buffers
ctx.createMediaElementAudioSource() // Play <audio> element
ctx.createMediaStreamSource() // Microphone input

// Processing nodes
ctx.createGain()            // Volume control
ctx.createBiquadFilter()    // EQ/filtering
ctx.createConvolver()       // Convolution (impulse response)
ctx.createDelay()           // Delay effect
ctx.createWaveShaper()      // Distortion/saturation

// Output
ctx.destination             // System speakers
```

### Oscillator Setup

```javascript
const osc = ctx.createOscillator();
osc.type = 'sine';          // 'sine', 'square', 'triangle', 'sawtooth'
osc.frequency.value = 440;  // Hz
osc.start();
osc.stop();
```

### Gain (Volume) Control

```javascript
const gain = ctx.createGain();
gain.gain.value = 0.5;      // 0 to 1

// Fade in
gain.gain.setValueAtTime(0, ctx.currentTime);
gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1);

// Fade out
gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
```

### Connecting Nodes

```javascript
// Serial connection
oscillator.connect(gain);
gain.connect(ctx.destination);

// Parallel connection
oscillator.connect(gain1);
oscillator.connect(gain2);
gain1.connect(ctx.destination);
gain2.connect(ctx.destination);
```

### Common Frequencies

```javascript
261.63   // C4 (middle C)
293.66   // D4
329.63   // E4
349.23   // F4
392.00   // G4
440.00   // A4 (standard tuning)
493.88   // B4
523.25   // C5
```

---

## Tone.js API Reference

### Installation

**Via CDN:**
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"></script>
```

**Via NPM:**
```bash
npm install tone
import * as Tone from "tone";
```

### Initialization

```javascript
// Start audio context (required on iOS)
await Tone.start();

// Get/set context
const ctx = Tone.getContext();
Tone.setContext(newContext);

// Wait for samples to load
await Tone.loaded();
```

### Synth Types

```javascript
new Tone.Synth()              // Basic: oscillator + ADSR envelope
new Tone.MembraneSynth()      // Drum-like: struck membrane
new Tone.PluckSynth()         // String-like: plucked (Karplus-Strong)
new Tone.MetalSynth()         // Metal-like: struck metal
new Tone.FMSynth()            // Complex: frequency modulation
new Tone.AMSynth()            // Modulation: amplitude modulation
new Tone.PolySynth(Tone.Synth) // Play multiple notes simultaneously
```

### Sources

```javascript
new Tone.Oscillator()         // Generate waveforms
new Tone.Player(url)          // Play audio files
new Tone.Sampler()            // Pitch-shifted samples
new Tone.Noise()              // White/pink/brown noise
```

### Effects

```javascript
new Tone.Distortion()         // Distortion/overdrive
new Tone.Delay()              // Simple delay
new Tone.FeedbackDelay()      // Delay with feedback
new Tone.Reverb()             // Reverb effect
new Tone.Filter()             // Lowpass/highpass filter
new Tone.Chorus()             // Chorus effect
new Tone.Phaser()             // Phaser effect
new Tone.Tremolo()            // Volume tremor
new Tone.Vibrato()            // Pitch vibrato
```

### Synth Configuration

```javascript
new Tone.Synth({
  oscillator: { 
    type: "triangle"          // sine, square, triangle, sawtooth
  },
  envelope: {
    attack: 0.005,            // Time to peak (seconds)
    decay: 0.1,               // Time to sustain (seconds)
    sustain: 0.3,             // Hold level (0-1)
    release: 1                // Time to silent (seconds)
  },
  portamento: 0.1             // Pitch glide time (seconds)
}).toDestination();
```

### Playing Notes

```javascript
// One-shot note
synth.triggerAttackRelease("C4", "8n");

// Manual attack/release
synth.triggerAttack("C4");
synth.triggerRelease();

// Multiple notes (PolySynth)
const poly = new Tone.PolySynth(Tone.Synth).toDestination();
poly.triggerAttack(["C4", "E4", "G4"]);
poly.triggerRelease(["C4", "E4", "G4"]);
```

### Scheduling

```javascript
// Transport (global timeline)
Tone.Transport.start();
Tone.Transport.stop();
Tone.Transport.pause();
Tone.Transport.bpm.value = 120;

// Loop
new Tone.Loop((time) => {
  synth.triggerAttackRelease("C4", "8n", time);
}, "4n").start(0);

// Sequence
new Tone.Sequence((time, note) => {
  synth.triggerAttackRelease(note, "8n", time);
}, ["C4", "D4", "E4", "F4"], "4n").start(0);
```

### Connections

```javascript
// Serial (one after another)
synth.connect(filter).connect(reverb).toDestination();

// Parallel (multiple paths)
synth.connect(filter);
synth.connect(delay);
filter.toDestination();
delay.toDestination();

// Disconnect
synth.disconnect();
```

### Note Names

```javascript
"C4"   // Middle C
"D#4"  // D sharp (also "Ds4")
"Bb3"  // B flat
"F2"   // Low F
```

### Time Values

```javascript
"4n"   // Quarter note
"8n"   // Eighth note
"16n"  // Sixteenth note
"8t"   // Eighth triplet
"1m"   // One measure
0.5    // Also valid: 500ms
1      // 1 second
```

### Envelope Curves

```javascript
"linear"      // Straight line
"exponential" // Fast start, slow end (natural)
"sine"        // Smooth S-curve
"cosine"      // Inverted S-curve
```

### Common Methods

```javascript
synth.triggerAttack("C4")              // Start note
synth.triggerRelease()                 // Stop note
synth.triggerAttackRelease("C4", "8n") // Single note
synth.frequency.value = 440            // Set frequency
synth.volume.value = -12               // Set volume (dB)
synth.portamento = 0.1                 // Set portamento
Tone.Transport.start()                 // Start playback
Tone.Transport.stop()                  // Stop playback
Tone.now()                             // Current time
```

---

## The Four Approaches

### Approach 1: Pure Web Audio API (Simplest)

**Complexity:** Very Low  
**Dependencies:** None  
**iOS Compatible:** Excellent  
**Best for:** Learning, minimal prototypes  
**Code size:** ~15 lines  

**Pros:**
- Zero dependencies
- Works on muted iOS devices
- Direct control
- Minimal overhead

**Cons:**
- More manual setup
- No high-level abstractions
- Manual envelope shaping needed

**When to use:** Simplest prototypes, learning Web Audio API

---

### Approach 2: Tone.js Pattern 1 - Oscillator

**Complexity:** Minimal  
**Dependencies:** Tone.js  
**iOS Compatible:** Excellent  
**Best for:** Theremin-like instruments, parameter exploration  
**Code size:** ~5 lines (just the audio part)  

**Basic code:**
```javascript
const osc = new Tone.Oscillator({
  type: "square",
  frequency: 440,
  volume: -16,
}).toDestination();

button.addEventListener("mousedown", () => osc.start());
button.addEventListener("mouseup", () => osc.stop());
```

**Characteristics:**
- Continuous sound (starts and keeps running)
- Direct frequency control
- No envelope shaping
- Snappy touch response

**When to use:** Waveform exploration, theremin-like instruments, learning Tone.js

---

### Approach 3: Tone.js Pattern 2 - Envelope

**Complexity:** Low  
**Dependencies:** Tone.js  
**iOS Compatible:** Excellent  
**Best for:** Game sounds, musical notes, synth effects  
**Code size:** ~10 lines  

**Basic code:**
```javascript
const synth = new Tone.Synth().toDestination();

button.addEventListener("mousedown", () => {
  synth.triggerAttack("C4");
});

button.addEventListener("mouseup", () => {
  synth.triggerRelease();
});
```

**ADSR Envelope:**
```
Volume
  ^
  |     /\              
  |    /  \             
  |   /    \____        
  |  /          \       
  |_/            \___
  A  D   S      R
```

- **Attack** (0.005s) - fade in
- **Decay** (0.1s) - drop to sustain
- **Sustain** (0.3) - hold level
- **Release** (1s) - fade out

**When to use:** Game effects, drum machines, musical note sequences

---

### Approach 4: Tone.js Pattern 3 - SimpleSynth with Portamento

**Complexity:** Medium  
**Dependencies:** Tone.js  
**iOS Compatible:** Excellent  
**Best for:** Playable instruments, expressive pitch control  
**Code size:** ~20 lines  

**Basic code:**
```javascript
const synth = new Tone.Synth({
  portamento: 0.1  // 100ms smooth glide between notes
}).toDestination();

button.addEventListener("mousedown", () => {
  synth.triggerAttack("C4");
});

button.addEventListener("mouseup", () => {
  synth.triggerRelease();
});
```

**What is Portamento?**

Smooth pitch gliding between notes instead of instant jumps:
```
Without:  C → E (instant)
With:     C ~~~~~~→ E (100ms glide)
```

**When to use:** Playable keyboards, violin-like sounds, theremin variants

---

## Complete Working Examples

### Example 1: Simple C Note Button (Web Audio API)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>C Note</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      background: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .button {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #e8e8e8, #999999);
      border: none;
      cursor: pointer;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      transition: all 0.1s;
      user-select: none;
    }
    .button:active {
      transform: scale(0.98);
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
    }
  </style>
</head>
<body>
  <button class="button"></button>

  <script>
    const button = document.querySelector('.button');
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    
    let oscillator = null;
    let gainNode = null;

    function play() {
      if (oscillator) {
        oscillator.stop();
        gainNode.disconnect();
      }
      if (ctx.state === 'suspended') ctx.resume();

      oscillator = ctx.createOscillator();
      gainNode = ctx.createGain();
      oscillator.frequency.value = 261.63; // C4

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
    }

    function stop() {
      if (!oscillator) return;
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      oscillator.stop(ctx.currentTime + 0.1);
      oscillator = null;
    }

    const startEvent = (e) => { e.preventDefault(); play(); };
    const stopEvent = (e) => { e?.preventDefault(); stop(); };

    button.addEventListener('mousedown', startEvent);
    button.addEventListener('touchstart', startEvent);
    button.addEventListener('mouseup', stopEvent);
    button.addEventListener('mouseleave', stopEvent);
    button.addEventListener('touchend', stopEvent);
  </script>
</body>
</html>
```

**Why this works on iOS:**
- `ctx.resume()` - explicitly resumes suspended audio context
- No external dependencies
- Works on muted devices
- Event preventDefault() prevents default touch behavior

---

### Example 2: 8-Note Keyboard (Tone.js SimpleSynth)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Keyboard</title>
  <style>
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: system-ui;
      padding: 20px;
      min-height: 100vh;
      margin: 0;
    }
    .keyboard {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin: 20px auto;
      max-width: 400px;
    }
    .key {
      aspect-ratio: 1;
      background: white;
      border: none;
      border-radius: 12px;
      font-weight: 600;
      color: #667eea;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      user-select: none;
    }
    .key:active {
      background: #f39c12;
      color: white;
      transform: scale(0.95);
    }
  </style>
</head>
<body>
  <h1 style="text-align: center; color: white; margin-top: 0;">Keyboard</h1>
  <div class="keyboard">
    <button class="key" data-note="C4">C</button>
    <button class="key" data-note="D4">D</button>
    <button class="key" data-note="E4">E</button>
    <button class="key" data-note="F4">F</button>
    <button class="key" data-note="G4">G</button>
    <button class="key" data-note="A4">A</button>
    <button class="key" data-note="B4">B</button>
    <button class="key" data-note="C5">C</button>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"></script>
  <script>
    let synth;
    let audioStarted = false;

    async function initAudio() {
      if (audioStarted) return;
      audioStarted = true;
      await Tone.start();
      
      synth = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: {
          attack: 0.005,
          decay: 0.1,
          sustain: 0.3,
          release: 0.5
        },
        portamento: 0.1
      }).toDestination();
    }

    document.querySelectorAll('.key').forEach(button => {
      const startNote = async (e) => {
        e.preventDefault();
        await initAudio();
        synth.triggerAttack(button.dataset.note);
      };

      const endNote = (e) => {
        e.preventDefault();
        if (synth) synth.triggerRelease();
      };

      button.addEventListener('mousedown', startNote);
      button.addEventListener('mouseup', endNote);
      button.addEventListener('touchstart', startNote);
      button.addEventListener('touchend', endNote);
    });
  </script>
</body>
</html>
```

---

## iOS Compatibility Techniques

### 1. User Gesture Requirement

**Problem:** iOS Safari blocks audio until user interaction

**Solution:** Start audio inside event listener
```javascript
button.addEventListener('touchstart', async (e) => {
  e.preventDefault();
  await Tone.start();  // For Tone.js
  // OR
  ctx.resume();        // For Web Audio API
});
```

### 2. Audio Context Resume

**Problem:** iOS Safari suspends audio context

**Solution:** Resume it when needed
```javascript
const ctx = new AudioContext();
if (ctx.state === 'suspended') {
  ctx.resume();
}
```

### 3. Event Handling

**Problem:** Touch events have default behavior that interferes

**Solution:** Prevent defaults and handle both mouse/touch
```javascript
button.addEventListener('touchstart', (e) => {
  e.preventDefault();      // Stop defaults
  e.stopPropagation();     // Stop bubbling
  playAudio();
});

button.addEventListener('touchend', (e) => {
  e.preventDefault();
  stopAudio();
});
```

### 4. Muted Device Workaround (If Needed)

Some users might have device muted. Web Audio API bypasses this, but if using older Tone.js:

```javascript
async function unlockAudio() {
  try {
    const silentAudio = new Audio('/path/to/silent.mp3');
    await silentAudio.play();
  } catch (e) {
    // Blocked, continue anyway
  }
}

button.addEventListener('touchstart', async (e) => {
  await unlockAudio();
  await Tone.start();
  synth.triggerAttack("C4");
});
```

### 5. Safe Volume Levels

**Problem:** iOS audio can distort at high volumes

**Solution:** Use safe dB levels
```javascript
// Good (safe)
const synth = new Tone.Synth({
  volume: -16  // 16dB quieter than full
}).toDestination();

// Risky
const synth = new Tone.Synth({
  volume: 0    // Full volume - can distort
}).toDestination();
```

### 6. No Complex Scheduling on First Load

**Problem:** Transport scheduling can fail on iOS first interaction

**Solution:** Use direct method calls, not scheduling
```javascript
// ✅ Good for iOS
synth.triggerAttackRelease("C4", "8n");

// ❌ Avoid on iOS
Tone.Transport.schedule((time) => {
  synth.triggerAttackRelease("C4", "8n", time);
}, 0);
```

---

## Comparison Table

| Feature | Web Audio | Oscillator | Envelope | SimpleSynth |
|---------|-----------|-----------|----------|-----------|
| **Dependencies** | None | Tone.js | Tone.js | Tone.js |
| **Code lines** | ~15 | ~5 | ~10 | ~20 |
| **Latency** | ~5ms | ~10ms | ~10ms | ~10ms |
| **iOS Compat** | Excellent | Excellent | Excellent | Excellent |
| **Portamento** | Manual | No | No | Yes |
| **Envelope** | Manual | No | Auto (ADSR) | Auto (ADSR) |
| **Learning curve** | Medium | Easy | Easy | Easy |
| **Best for** | Learning | Exploration | Effects | Instruments |

---

## Troubleshooting

### No sound on iOS

1. Check if device is muted (Web Audio bypasses this, but good to check)
2. Verify `ctx.resume()` or `await Tone.start()` is in a user event
3. Check browser console for JavaScript errors
4. Try different browser (Safari vs Chrome)
5. Try actual device (simulator sometimes has issues)

### Audio distortion

1. Lower volume level (use `-16dB` or lower)
2. Wait a moment after audio context resume before playing
3. Check envelope attack time isn't too long

### Latency feels too high

1. Reduce portamento value (use `0.05` or lower)
2. Use `latencyHint: "interactive"` when creating Tone context
3. Test on actual device (simulator adds latency)

### Button touches feel unresponsive

1. Verify `e.preventDefault()` is called
2. Add CSS `user-select: none`
3. Add visual feedback on touch
4. Check button size (bigger buttons = easier to hit)

### "Uncaught Error: Script error" in console

1. Check Tone.js CDN is loading (check Network tab)
2. Try different CDN
3. Check for ad blockers blocking CDN
4. Verify script tag is correct

---

## Testing Checklist

- [ ] Test on actual iOS device (not simulator)
- [ ] Test on iPhone with Safari
- [ ] Test on iPad
- [ ] Test with device in silent mode
- [ ] Test with headphones connected
- [ ] Test with Bluetooth speaker
- [ ] Press and hold button - check latency
- [ ] Rapid taps - verify no glitches
- [ ] Long holds - check for artifacts
- [ ] Low battery mode - verify works
- [ ] Device rotation - verify layout adapts
- [ ] Different iOS versions (if targeting multiple)
- [ ] Try different browsers (Chrome, Firefox on iOS all use Safari engine)

---

## Key Principles

1. **User gesture is required** - Audio context must be started from user event
2. **Simple is reliable** - Fewer nodes, fewer moving parts, more stable
3. **iOS has quirks** - Test on real devices, not simulators
4. **Web Audio API works** - Pure browser APIs are solid starting point
5. **Tone.js adds value** - High-level abstractions for complex audio
6. **Start minimal** - Begin with Web Audio API or Oscillator pattern
7. **Progressive enhancement** - Move to Envelope or SimpleSynth as needed
8. **Clean code wins** - Readable code is easier to debug

---

## Installation

### Web Audio API
No installation needed - built into all browsers.

### Tone.js via CDN
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"></script>
```

### Tone.js via NPM
```bash
npm install tone
import * as Tone from "tone";
```

---

## Resources

- **Tone.js Docs:** https://tonejs.github.io/docs/
- **Tone.js Examples:** https://tonejs.github.io/examples/
- **Web Audio API MDN:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **Web Audio API Performance:** http://padenot.github.io/web-audio-perf/
- **Tone.js GitHub:** https://github.com/Tonejs/Tone.js

---

## Summary

**Start with:** Web Audio API (simplest) or Tone.js Oscillator (easiest)

**Progress to:** Tone.js Envelope (more musical) or SimpleSynth (expressive)

**Key to iOS:** User gesture requirement, context resume, event handling

**Test on:** Real iOS devices with actual browser

All four approaches work reliably. Pick based on your needs and complexity.
