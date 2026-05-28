'use strict';

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const RESIZE_DEBOUNCE_MS = 100;
const INNER_CIRCLE_RADIUS_RATIO = 0.25; // fallback only
const DRAGGABLE_RING_RATIO = 0.6; // fallback only
const VIEWPORT_SAFETY_BUFFER = 1.2;
const REFERENCE_RADIUS = 800; // pt reference for responsive scaling: all pt values are "at avgRadius=800"
const C_MAJOR_SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Maps letter + accidental mode to chromatic index
const NOTE_TO_CHROMATIC = {
    'C': { natural: 0, sharp: 1, flat: 11 },
    'D': { natural: 2, sharp: 3, flat: 1 },
    'E': { natural: 4, sharp: 5, flat: 3 },
    'F': { natural: 5, sharp: 6, flat: 4 },
    'G': { natural: 7, sharp: 8, flat: 6 },
    'A': { natural: 9, sharp: 10, flat: 8 },
    'B': { natural: 11, sharp: 0, flat: 10 }
};
// Major scale intervals (semitones from root)
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// Easing functions for hub/dim animations
const EASING_FUNCTIONS = {
    linear:         t => t,
    easeOutCubic:   t => 1 - Math.pow(1 - t, 3),
    easeOutQuart:   t => 1 - Math.pow(1 - t, 4),
    easeOutExpo:    t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t       : 1 - Math.pow(-2 * t + 2, 3) / 2,
    easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t   : 1 - Math.pow(-2 * t + 2, 4) / 2,
    easeInOutQuint: t => t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2,
    easeInOutExpo:  t => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        return t < 0.5
            ? Math.pow(2, 20 * t - 10) / 2
            : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    easeOutBack:    t => {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
};
const ANCHOR_POSITIONS = {
    'top-left': { x: 0, y: 0 },
    'top-center': { x: 50, y: 0 },
    'top-right': { x: 100, y: 0 },
    'center-left': { x: 0, y: 50 },
    'center': { x: 50, y: 50 },
    'center-right': { x: 100, y: 50 },
    'bottom-left': { x: 0, y: 100 },
    'bottom-center': { x: 50, y: 100 },
    'bottom-right': { x: 100, y: 100 }
};

// Angle (degrees) at which the visible arc begins for each anchor.
// computeDefaultRotation() places slice 0's trailing edge here so the
// root note sits at the natural entry corner of the visible arc.
const ANCHOR_ENTRY_ANGLES = {
    'top-left':      0,
    'top-center':    315,
    'top-right':     90,
    'center-left':   270,
    'center':        270,
    'center-right':  90,
    'bottom-left':   0,
    'bottom-center': 225,
    'bottom-right':  112.25, // tuned so rotation defaults to ~101° at sliceCount=32 (root in lower-visible)
};

function computeDefaultRotation(anchor, sliceCount) {
    const entryAngle = ANCHOR_ENTRY_ANGLES[anchor] ?? 270;
    const anglePerSlice = 360 / sliceCount;
    return (entryAngle - anglePerSlice + 360) % 360;
}

// Rotation is anchor/sliceCount-derived (see computeDefaultRotation), never persisted in presets.
function stripRotation(state) {
    const { rotation: _r, ...rest } = state;
    return rest;
}

const POWER_BTN_MARGIN_PT = 18;

const INITIAL_STATE = {
    sliceCount: 32,
    slicePartialFrac: 1.0,
    bgGray: 54,
    anchor: 'bottom-right',
    innerCircleSize: 155,
    grabberWidth: 48,  // pt — grip/tick zone width; hub resting radius = innerCircleSize - grabberWidth
    uiScale: 1,
    uiScaleMax: 1.5,
    // Key & Audio
    rootNote: 0,           // chromatic index 0-11 — used by AudioEngine (kept in sync with rootLetter+accidentalMode)
    rootLetter: 0,         // letter index 0-6 (C,D,E,F,G,A,B) — what the user PICKED, used by display ("dumb")
    rootOctave: 3,         // audio octave for the root note (slice 0)
    accidentalMode: 'natural',
    keyFontFamily: "'Rubik', system-ui, sans-serif",
    keyLabelFontSize: 49,
    keyLabelFontWeight: '600',
    keyLabelColor: '#ffffff',
    radius: 155,
    // rotation is not stored in presets; computed via computeDefaultRotation()
    rotation: 101,
    gapSize: 2.5,
    gripThickness: 2.5,
    gripOpacity: 25,
    ticksPerEdge: 3,
    gripInset: 0,
    pressShrink: 0,
    // Flat colours
    keyColor:        '#24292b', // flat fill for unpressed slices
    keyPressedColor:    '#7d8b8d', // pressed gradient — INNER stop. Outer stop = keyColor.
    pressedGradType:    'linear',  // 'linear' (per-slice along radial axis) or 'radial' (wheel-centered)
    pressedGradAngle:      180,    // degrees — linear only; rotation from radial axis (0 = inner→outer)
    pressedGradStop0:       76,    // % — inner-stop position on the gradient line
    pressedGradStop1:      100,    // % — outer-stop position on the gradient line
    // Note Markers
    noteMarkerSize: 5,
    noteMarkerColor: '#cccccc',
    noteMarkerOpacity: 90,
    noteMarkerPosition: 190,
    sliceOpacity: 100,
    // Experimental: Drone lock timing
    droneLockTime: 3000,
    // Experimental: Gripper animations
    notchGrowthFactor: 1.4,
    notchActivationSpeed: 120,
    notchDeactivationSpeed: 300,
    notchBrightnessBoost: 2.1,
    // Key circle — scale mode
    scaleMode: 'major',    // 'major' | 'minor'
    // Key label position (pt, relative to hub centre)
    keyLabelX:        -46,
    keyLabelY:        -54,
    keyLabelPickerX:  -70,
    keyLabelPickerY:  -54,
    keyLabelOpOff:    100, // %
    keyLabelOpOn:     100,
    keyLabelOpPicker: 100, // when picker open, label shows letter-only ("G") — useful, keep visible
    // Sublabel ("KEY")
    keySubLabelY:     -30,  // X always follows key label X
    keySubLabelFontSize: 12, // pt — independent of key label size
    keySubLabelFontWeight: '400',
    keySubOpOff:        0,  // %
    keySubOpOn:        33,  // % — when audio on, picker closed
    keySubOpPicker:     0,  // % — when picker is open (default: hide alongside label)
    // Modifiers (accidental ♯/♭ AND minor m) — separate elements stacked in same X column,
    // both fade out when picker opens.
    keyModOffsetX:     12,  // pt — X offset from letter center (shared by both)
    keyAccOffsetY:     -7,  // pt — Y offset for accidental (negative = up, superscript-ish)
    keyMinorOffsetY:    4,  // pt — Y offset for minor (positive = down, under accidental)
    keyModFontSize:    16,  // pt — shared font size for both modifier glyphs
    keyModFontWeight: '500',
    // Picker fan
    pickerRadius:     132,  // pt
    pickerSpacing:    12.5, // degrees between notes
    pickerFontSize:   20,   // pt
    pickerFontWeight: '600',
    // Acc / scale toggle pills
    toggleX:          30,  // pt right of active label
    toggleSpacing:    29,  // pt between pill centres
    togglePillR:      12,  // pt radius
    toggleFill:      '#55595b',
    toggleFillOpacity:  100, // %
    toggleStroke:    '#ffffff',
    toggleStrokeOpacity:  0, // %
    toggleStrokeW:     0.75,
    toggleTextColor: '#ffffff',
    accFontSize:       14, // pt
    accFontWeight:    '400',
    scaleFontSize:     11, // pt
    scaleFontWeight:  '500',
    // Hub open (picker expanded) state
    hubOpenColor:    '#353839', // hub fill when picker is open
    pickerDimColor:  '#101111', // dim overlay color when picker open
    pickerDimOpacity:  81,     // % — bg dim when picker open
    // Audio-off dim overlay
    offDimColor:     '#000000',
    offDimOpacity:     80,     // %
    // Animations — separate settings for expansion (open) and contraction (close)
    animOpenEasing:      'easeOutExpo',
    animOpenDuration:     620, // ms — open: picker fade, label slide, hub radius
    animOpenStagger:       40, // ms — open: per-letter stagger from F outward
    animOpenPillDelay:    100, // ms — open: pills appear this long after open starts
    animCloseEasing:     'easeOutExpo',
    animCloseDuration:    490, // ms — close: picker fade, label slide, hub radius
    animCloseStagger:       0, // ms — close: per-letter stagger (outer first)
    animClosePillDelay:     0, // ms — close: other elements wait this long after pills exit
    animOffDimDuration:   400, // ms — audio off/on dim overlay fade
    animBlinkDuration:    220, // ms — letter blink on picker note select (out + in)
    animBlinkScale:      0.80, // letter scale at midpoint of blink
    // Press states (mouse-down feedback)
    pressInDuration:       80, // ms — press-down transition
    pressOutDuration:     180, // ms — press-release transition
    pressHubScale:       1.00, // hub circle on press
    pressHubFill:    '#202222',
    pressPillScale:      0.80, // ♭♮♯ + M/m pills on press
    pressPillFill:   '#444648',
    pressPowerScale:     0.93, // power button on press
    pressPowerFill:  '#232323', // C1 (outer body) fill on press
    pressPowerC2Fill:'#444444', // C2 (central sphere) fill on press
    pressLetterScale:    0.84, // picker letters on press
    pressLetterFill: '#7d8080',
    // Power button
    powerBtnSize:      14,
    powerBtnPickerOpacity: 30,  // % — power button opacity while picker is open
    // Circle 1 — body
    c1GradFrom:        '#232323',
    c1GradTo:          '#1f1f1f',
    c1GradType:        'linear',
    c1GradAngle:       272,
    c1GradFocalOffset: 0,
    c1GradStop0: 0, c1GradStop1: 100,
    c1Stroke:          '#0b0b0b',
    c1StrokeWidth:     1.5,
    c1DropColor:       '#ffffff',
    c1DropBlur:        1.95, c1DropOpacity: 10,
    c1DropDx:          0,    c1DropDy:      1.95,
    c1InnerColor:      '#ffffff',
    c1InnerBlur:       1.46, c1InnerOpacity: 4,
    c1InnerDx:         0,    c1InnerDy:      1.46,
    // Circle 2 — sphere (full off/on gradient sets)
    c2SizeRatio:          0.3,
    c2GradFromOff:        '#7a7a7a',
    c2GradToOff:          '#606060',
    c2GradTypeOff:        'radial',
    c2GradAngleOff:       272,
    c2GradFocalOffsetOff: 50,
    c2GradStop0Off: 0, c2GradStop1Off: 100,
    c2GradFromOn:         '#00ff00',
    c2GradToOn:           '#19bb13',
    c2GradTypeOn:         'radial',
    c2GradAngleOn:        268,
    c2GradFocalOffsetOn:  65,
    c2GradStop0On: 25, c2GradStop1On: 100,
    c2Stroke:             '#151515',
    c2StrokeWidth:        1.5,
    c2DropColor:          '#ffffff',
    c2DropBlur:           2.44, c2DropOpacity: 9,
    c2DropDx:             0,    c2DropDy:      1.95,
    c2InnerColor:         '#000000',
    c2InnerBlur:          0,  c2InnerOpacity: 0,
    c2InnerDx:            0,  c2InnerDy:      0,
    // Circle 2 — glow (visible when audio is on)
    c2GlowColor:     '#00ff00',
    c2GlowBlur:      3.9,
    c2GlowOpacity:   29,
    c2GlowSpread:    1.22,
    c2GlowBlendMode: 'screen',
};

// ============================================
// STATE MANAGER
// ============================================
class StateManager {
    constructor(initialState) {
        this._state = { ...initialState };
        this._listeners = new Map();
        this._computedCache = new Map();
    }

    get(key) {
        return this._state[key];
    }

    getAll() {
        return { ...this._state };
    }

    set(key, value) {
        if (this._state[key] !== value) {
            this._state[key] = value;
            this._computedCache.clear();
            this._notify(key, value);
        }
    }

    subscribe(keys, callback) {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
            if (!this._listeners.has(key)) {
                this._listeners.set(key, new Set());
            }
            this._listeners.get(key).add(callback);
        });
        return () => {
            keyArray.forEach(key => {
                const listeners = this._listeners.get(key);
                if (listeners) listeners.delete(callback);
            });
        };
    }

    getComputed(key, computeFn) {
        if (!this._computedCache.has(key)) {
            this._computedCache.set(key, computeFn(this._state));
        }
        return this._computedCache.get(key);
    }

    invalidateComputed() {
        this._computedCache.clear();
    }

    _notify(key, value) {
        const listeners = this._listeners.get(key);
        if (listeners) {
            listeners.forEach(callback => callback(value, key));
        }
    }
}

// ============================================
// GEOMETRY ENGINE
// ============================================
class GeometryEngine {
    constructor(stateManager) {
        this.state = stateManager;
    }

    getViewportSize() {
        const svg = document.getElementById('pianoSvg');
        if (svg) {
            const rect = svg.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
        }
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    calculateCenter() {
        return this.state.getComputed('center', (state) => {
            const size = this.getViewportSize();
            const pos = ANCHOR_POSITIONS[state.anchor] || ANCHOR_POSITIONS['bottom-right'];
            return {
                x: (pos.x / 100) * size.width,
                y: (pos.y / 100) * size.height
            };
        });
    }

    calculateRadii() {
        return this.state.getComputed('radii', (state) => {
            const size = this.getViewportSize();
            const center = this.calculateCenter();

            const corners = [
                { x: 0, y: 0 },
                { x: size.width, y: 0 },
                { x: 0, y: size.height },
                { x: size.width, y: size.height }
            ];

            const maxDistance = Math.max(...corners.map(corner =>
                Math.sqrt((corner.x - center.x) ** 2 + (corner.y - center.y) ** 2)
            ));

            const safeDistance = maxDistance * VIEWPORT_SAFETY_BUFFER;
            const scaledRadius = (state.radius / 100) * safeDistance;

            return { rx: scaledRadius, ry: scaledRadius };
        });
    }

    getRadiusAtAngle(angle, rx, ry) {
        const rad = angle * Math.PI / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        return (rx * ry) / Math.sqrt((ry * cosA) ** 2 + (rx * sinA) ** 2);
    }

    createPathGenerator(center, radii, startAngle, endAngle, gapPx = 0) {
        const { rx, ry } = radii;
        const r = (rx + ry) / 2; // circles only
        const midAngle = (startAngle + endAngle) / 2;
        const halfAngle = (endAngle - startAngle) / 2;
        const halfRad = (halfAngle * Math.PI) / 180;
        const midRad = (midAngle * Math.PI) / 180;

        // Clamp gap so slices don't collapse
        const maxGap = Math.max(0, 2 * r * Math.sin(halfRad) * 0.95);
        const N = Math.max(0, Math.min(gapPx, maxGap));
        const halfN = N / 2;

        // Apex point: where the two parallel edges intersect (offset from true center)
        const apexDist = halfN > 0 ? halfN / Math.sin(halfRad) : 0;
        const apex = {
            x: center.x + apexDist * Math.cos(midRad),
            y: center.y + apexDist * Math.sin(midRad)
        };

        // Outer points: where parallel edges meet circle of radius r
        const t = Math.sqrt(Math.max(0, r * r - halfN * halfN));
        const u = t * Math.cos(halfRad) + halfN * Math.sin(halfRad);
        const v = t * Math.sin(halfRad) - halfN * Math.cos(halfRad);

        const cosM = Math.cos(midRad);
        const sinM = Math.sin(midRad);

        // Local-to-world rotation: world = center + (u*cosM - v*sinM, u*sinM + v*cosM)
        // Right edge: local v = -(t*sin(h) - halfN*cos(h))
        // Left edge:  local v = +(t*sin(h) - halfN*cos(h))
        const rightOuter = {
            x: center.x + u * cosM - (-v) * sinM,
            y: center.y + u * sinM + (-v) * cosM
        };
        const leftOuter = {
            x: center.x + u * cosM - (v) * sinM,
            y: center.y + u * sinM + (v) * cosM
        };

        // Effective radius of the arc connecting outer points
        const effR = Math.sqrt(u * u + v * v);

        return (narrowFactor = 1) => {
            const midOuterX = center.x + effR * cosM;
            const midOuterY = center.y + effR * sinM;

            const lerp = (p, q) => p + (q - p) * (1 - narrowFactor);
            const ax = lerp(apex.x, midOuterX);
            const ay = lerp(apex.y, midOuterY);
            const r1x = lerp(rightOuter.x, midOuterX);
            const r1y = lerp(rightOuter.y, midOuterY);
            const r2x = lerp(leftOuter.x, midOuterX);
            const r2y = lerp(leftOuter.y, midOuterY);

            return `M ${ax} ${ay} L ${r1x} ${r1y} A ${effR} ${effR} 0 0 1 ${r2x} ${r2y} Z`;
        };
    }

    getAngleFromPoint(x, y, center) {
        const dx = x - center.x;
        const dy = y - center.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    isInDraggableRing(x, y, center, innerRadius, gripRingRadius) {
        const dx = x - center.x;
        const dy = y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance >= gripRingRadius && distance <= innerRadius;
    }

    getSliceIndexAtPoint(x, y, center, sliceCount) {
        const rotation = this.state.get('rotation');
        let angle = this.getAngleFromPoint(x, y, center);
        angle = (angle + 360) % 360;
        angle = (angle - rotation + 360) % 360;
        const anglePerSlice = 360 / sliceCount;
        return Math.floor(angle / anglePerSlice);
    }
}

// ============================================
// AUDIO ENGINE
// ============================================
class AudioEngine {
    constructor(stateManager) {
        this.state = stateManager;
        this.synth = null;
        this.audioStarted = false; // Flag to ensure Tone.start() only runs once
        this.enabled = false; // Whether audio is currently active (not suspended)
        this.activeNotes = new Map(); // Maps index -> note
        this.lockedDrones = new Map(); // Maps index -> note (for locked drones)
        this.lockTimeouts = new Map(); // Maps index -> timeout ID for auto-lock
    }

    async init() {
        // Only initialize audio once (iOS requirement - from official Tone.js guide)
        if (this.audioStarted) return;

        await Tone.start();
        this.audioStarted = true; // Set AFTER Tone.start() succeeds
        this.enabled = true;

        // Create synth after Tone.start() completes
        if (!this.synth) {
            this.synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.05,
                    decay: 0.1,
                    sustain: 0.9,
                    release: 1
                }
            }).toDestination();
            this.synth.volume.value = -10;
        }
    }

    getNote(index) {
        const rootNote  = this.state.get('rootNote');
        const rootOctave = this.state.get('rootOctave') ?? 2;
        const scaleMode = this.state.get('scaleMode') ?? 'major';
        const intervals = scaleMode === 'minor' ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
        const noteInScale = index % 7;
        const baseOctave  = rootOctave + Math.floor(index / 7);
        const chromaticIndex = (rootNote + intervals[noteInScale]) % 12;
        const octave = baseOctave + (chromaticIndex < rootNote ? 1 : 0);
        return CHROMATIC_NOTES[chromaticIndex] + octave;
    }

    // 1-3-5 arpeggio preview (e.g. when switching keys). Scale-aware via slice indices:
    // slice 2 is a major or minor third depending on the active scaleMode.
    // Bumps notes up one octave so they sit in a more audible range than rootOctave.
    previewNote() {
        if (!this.audioStarted || !this.enabled || !this.synth) return;
        const indices = [0, 2, 4, 7];
        const stagger = 90;       // ms between onsets
        const duration = '16n';   // each note length
        indices.forEach((idx, k) => {
            const note = this.getNote(idx);
            const m = note.match(/^([A-G][#b]?)(-?\d+)$/);
            const noteUp = m ? `${m[1]}${parseInt(m[2], 10) + 1}` : note;
            setTimeout(() => {
                try { this.synth.triggerAttackRelease(noteUp, duration); } catch (e) {}
            }, k * stagger);
        });
    }

    async playNote(index, onAutoLock) {
        const note = this.getNote(index);

        // Don't play if audio not started or currently disabled
        if (!this.audioStarted || !this.enabled) return;

        // Don't play if already locked (wait for toggle-off)
        if (this.lockedDrones.has(index)) return;

        // Don't play if already active
        if (this.activeNotes.has(index)) return;

        // Defensive check: ensure synth is initialized
        if (!this.synth) {
            console.error('Synth not initialized');
            return;
        }

        // Add to active notes BEFORE triggering attack
        this.activeNotes.set(index, note);
        this.synth.triggerAttack(note);

        // Set auto-lock timeout
        const lockTime = this.state.get('droneLockTime');
        const timeoutId = setTimeout(() => {
            this.lockDrone(index);
            if (onAutoLock) onAutoLock(index);
        }, lockTime);
        this.lockTimeouts.set(index, timeoutId);
    }

    stopNote(index, force = false) {
        // Don't stop if locked (unless forced)
        if (this.lockedDrones.has(index) && !force) return;

        if (this.activeNotes.has(index)) {
            const note = this.activeNotes.get(index);
            if (this.synth) {
                this.synth.triggerRelease(note);
            }
            this.activeNotes.delete(index);

            // Clear the auto-lock timeout (user released before lock time)
            if (this.lockTimeouts.has(index)) {
                clearTimeout(this.lockTimeouts.get(index));
                this.lockTimeouts.delete(index);
            }
        }
    }

    lockDrone(index) {
        if (this.activeNotes.has(index)) {
            const note = this.activeNotes.get(index);
            this.lockedDrones.set(index, note);

            // Clear auto-lock timeout since it's now locked
            if (this.lockTimeouts.has(index)) {
                clearTimeout(this.lockTimeouts.get(index));
                this.lockTimeouts.delete(index);
            }
        }
    }

    unlockDrone(index) {
        if (this.lockedDrones.has(index)) {
            const note = this.lockedDrones.get(index);
            this.lockedDrones.delete(index);

            // Force stop the note
            if (this.synth) {
                this.synth.triggerRelease(note);
            }
            this.activeNotes.delete(index);
        }
    }

    isLocked(index) {
        return this.lockedDrones.has(index);
    }

    stopAllNotes() {
        // Stop all active notes
        if (this.synth && this.activeNotes.size > 0) {
            this.activeNotes.forEach((note) => {
                this.synth.triggerRelease(note);
            });
        }
        this.activeNotes.clear();

        // Stop all locked drones
        if (this.synth && this.lockedDrones.size > 0) {
            this.lockedDrones.forEach((note) => {
                this.synth.triggerRelease(note);
            });
        }
        this.lockedDrones.clear();

        // Clear all auto-lock timeouts
        this.lockTimeouts.forEach((timeoutId) => {
            clearTimeout(timeoutId);
        });
        this.lockTimeouts.clear();
    }
}

// ============================================
// RENDER ENGINE
// ============================================
class RenderEngine {
    constructor(svgElement, stateManager, geometryEngine) {
        this.svg = svgElement;
        this.state = stateManager;
        this.geometry = geometryEngine;
        this.sliceElements = new Map();
        this.pathGenerators = new Map();
        this.lockedSlices = new Set(); // Track locked drone slices
        this.sliceGroup = null;
        this.innerCircle = null;
        this.noiseTextureDataURL = null; // Cache for pre-rendered noise
        this.lastNoiseSettings = null; // Track settings to avoid unnecessary regeneration
        this.audioToggle = null;
        this.audioActive = false;
        this.keyPickerOpen = false;
        this._hubRAnimId = null;
        this.powerButton = null;
        this.pwrC2       = null;
        this.pwrGlow     = null;
        this.hubCircleOn = null;
    }

    updateViewBox() {
        const size = this.geometry.getViewportSize();
        this.svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    }

    clear() {
        this.svg.innerHTML = '';
        this.sliceElements.clear();
        this.pathGenerators.clear();
        this.sliceGroup = null;
        this.innerCircle = null;
    }

    createDefs() {
        let defs = this.svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            this.svg.insertBefore(defs, this.svg.firstChild);
        }
        return defs;
    }

    renderBackground() {
        const size = this.geometry.getViewportSize();
        const bgRect = document.createElementNS(SVG_NS, 'rect');
        bgRect.setAttribute('x', '0');
        bgRect.setAttribute('y', '0');
        bgRect.setAttribute('width', size.width);
        bgRect.setAttribute('height', size.height);

        const grayValue = Math.round((this.state.get('bgGray') / 100) * 255);
        const hexValue = grayValue.toString(16).padStart(2, '0');
        bgRect.setAttribute('fill', `#${hexValue}${hexValue}${hexValue}`);
        bgRect.style.pointerEvents = 'none';

        this.svg.appendChild(bgRect);
    }

    createSliceGroup() {
        const center = this.geometry.calculateCenter();
        const rotation = this.state.get('rotation');

        this.sliceGroup = document.createElementNS(SVG_NS, 'g');
        this.sliceGroup.setAttribute('id', 'sliceGroup');
        // Use CSS transform so the browser composites this group on the GPU during
        // rotation (smoother on mobile / ProMotion). transform-origin is set in
        // user-space pixels via style so it matches the SVG viewBox.
        this.sliceGroup.style.transformOrigin = `${center.x}px ${center.y}px`;
        // translateZ(0) forces a separate GPU compositing layer (smoother rotation)
        this.sliceGroup.style.transform = `translateZ(0) rotate(${rotation}deg)`;
        this.sliceGroup.style.willChange = 'transform';

        const defs = document.createElementNS(SVG_NS, 'defs');
        this.sliceGroup.appendChild(defs);

        return defs;
    }

    createSlice(index, center, radii, anglePerSlice) {
        const sliceCount = this.state.get('sliceCount');
        const partialFrac = this.state.get('slicePartialFrac') ?? 1.0;
        const widthMul = (index === sliceCount - 1) ? partialFrac : 1.0;

        const startAngle = index * anglePerSlice;
        const endAngle   = startAngle + anglePerSlice * widthMul;

        // Slices fill full wedges — the "gap" is rendered as a stroked line overlay (see _renderGapLines).
        const pathGenerator = this.geometry.createPathGenerator(center, radii, startAngle, endAngle, 0);
        this.pathGenerators.set(index, pathGenerator);

        const slice = document.createElementNS(SVG_NS, 'path');
        slice.setAttribute('d', pathGenerator(1));
        // Fill is permanently the slice's own gradient — both stops start at keyColor (looks flat).
        // pressSlice/releaseSlice mutate the inner stop's stop-color; CSS transitions handle the fade.
        slice.setAttribute('fill', `url(#sliceGrad-${index})`);
        slice.setAttribute('data-slice', index);
        slice.setAttribute('tabindex', '0');
        slice.setAttribute('role', 'button');
        slice.setAttribute('aria-label', `Slice ${index + 1} of ${sliceCount}`);

        // Set initial slice state
        if (this.audioActive) {
            slice.setAttribute('class', 'slice');
        } else {
            slice.setAttribute('class', 'slice skeleton');
        }

        this.sliceElements.set(index, slice);
        return slice;
    }

    // Fast path: mutate existing slice paths + add/remove slice DOM when count changes.
    // Avoids the full render() rebuild of hub/labels/audio-toggle/etc.
    updateSliceLive() {
        const sliceCount  = this.state.get('sliceCount');
        const partialFrac = this.state.get('slicePartialFrac') ?? 1.0;
        if (!this.sliceGroup) {
            this.render();
            return;
        }
        const center = this.geometry.calculateCenter();
        const radii  = this.geometry.calculateRadii();
        const anglePerSlice = 360 / (sliceCount - 1 + partialFrac);

        // Grow: add new slice elements + gradients, insert after existing slices
        const existing = this.sliceElements.size;
        if (sliceCount > existing) {
            const defs = this.sliceGroup.querySelector('defs');
            const lastSlice = existing > 0 ? this.sliceElements.get(existing - 1) : null;
            const insertBefore = lastSlice ? lastSlice.nextSibling : (defs ? defs.nextSibling : this.sliceGroup.firstChild);
            for (let i = existing; i < sliceCount; i++) {
                this._createSliceGradient(defs, i, center, radii, sliceCount);
                const slice = this.createSlice(i, center, radii, anglePerSlice);
                this.sliceGroup.insertBefore(slice, insertBefore);
            }
        }
        // Shrink: remove extra slice elements (highest indices first) and their gradients
        else if (sliceCount < existing) {
            for (let i = existing - 1; i >= sliceCount; i--) {
                const slice = this.sliceElements.get(i);
                if (slice) slice.remove();
                this.sliceElements.delete(i);
                this.pathGenerators.delete(i);
                const grad = this.sliceGroup.querySelector(`#sliceGrad-${i}`);
                if (grad) grad.remove();
            }
        }

        for (let i = 0; i < sliceCount; i++) {
            const slice = this.sliceElements.get(i);
            if (!slice) continue;
            const widthMul = (i === sliceCount - 1) ? partialFrac : 1.0;
            const s = i * anglePerSlice;
            const e = s + anglePerSlice * widthMul;
            const gen = this.geometry.createPathGenerator(center, radii, s, e, 0);
            this.pathGenerators.set(i, gen);
            slice.setAttribute('d', gen(1));
        }
        this.sliceGroup.querySelectorAll('line').forEach(l => l.remove());
        this.sliceGroup.querySelectorAll('.note-marker').forEach(m => m.remove());
        const fragment = document.createDocumentFragment();
        this._renderGapLines(fragment, center, radii, anglePerSlice, sliceCount);
        this.sliceGroup.appendChild(fragment);
        const innerRadius = this._getExpandedHubRadius();
        const gripRingRadius = Math.max(0, innerRadius - this.state.get('grabberWidth') * this.getUIScale());
        this.renderGripTicks(innerRadius, gripRingRadius);
        this.renderNoteMarkers(innerRadius);
    }

    renderSlices() {
        const center = this.geometry.calculateCenter();
        const radii = this.geometry.calculateRadii();
        const sliceCount = this.state.get('sliceCount');
        const partialFrac = this.state.get('slicePartialFrac') ?? 1.0;
        const anglePerSlice = 360 / (sliceCount - 1 + partialFrac);

        this.createSliceGroup();
        // Defs is the first child of sliceGroup (added in createSliceGroup)
        const defs = this.sliceGroup.querySelector('defs');
        this._renderPressedGradient(defs, center, radii);

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < sliceCount; i++) {
            fragment.appendChild(this.createSlice(i, center, radii, anglePerSlice));
        }
        // Radial gap lines — full-bg-color stroked lines between slices, with rounded caps
        this._renderGapLines(fragment, center, radii, anglePerSlice, sliceCount);

        this.sliceGroup.appendChild(fragment);
        this.svg.appendChild(this.sliceGroup);
    }

    // Per-slice gradients. Both stops start at keyColor so each slice looks flat.
    // On press, the INNER stop is mutated to keyPressedColor; CSS transitions the stop-color smoothly.
    // Type: 'linear' aligns each gradient along its slice's radial axis (angle = additional rotation).
    //       'radial' uses one wheel-centered radial gradient cross-section per slice.
    _renderPressedGradient(defs, center, radii) {
        if (!defs) return;
        const sliceCount = this.state.get('sliceCount');
        for (let i = 0; i < sliceCount; i++) {
            this._createSliceGradient(defs, i, center, radii, sliceCount);
        }
    }

    _createSliceGradient(defs, i, center, radii, sliceCount) {
        if (!defs) return;
        const outerR = (radii.rx + radii.ry) / 2;
        const innerR = this._getExpandedHubRadius();
        const keyColor = this.state.get('keyColor');
        const type = this.state.get('pressedGradType') || 'linear';
        const userAngle = (this.state.get('pressedGradAngle') || 0) * Math.PI / 180;
        const stop0 = (this.state.get('pressedGradStop0') ?? 0) / 100;
        const stop1 = (this.state.get('pressedGradStop1') ?? 100) / 100;
        const anglePerSlice = 360 / sliceCount;
        {
            let grad;
            if (type === 'linear') {
                const sliceMidAngle = ((i + 0.5) * anglePerSlice) * Math.PI / 180;
                const finalAngle = sliceMidAngle + userAngle;
                const sliceCenterDist = (innerR + outerR) / 2;
                const cx = center.x + sliceCenterDist * Math.cos(sliceMidAngle);
                const cy = center.y + sliceCenterDist * Math.sin(sliceMidAngle);
                const halfLen = (outerR - innerR) / 2;
                const x1 = cx - halfLen * Math.cos(finalAngle);
                const y1 = cy - halfLen * Math.sin(finalAngle);
                const x2 = cx + halfLen * Math.cos(finalAngle);
                const y2 = cy + halfLen * Math.sin(finalAngle);
                grad = document.createElementNS(SVG_NS, 'linearGradient');
                grad.setAttribute('x1', x1); grad.setAttribute('y1', y1);
                grad.setAttribute('x2', x2); grad.setAttribute('y2', y2);
            } else {
                grad = document.createElementNS(SVG_NS, 'radialGradient');
                grad.setAttribute('cx', center.x);
                grad.setAttribute('cy', center.y);
                grad.setAttribute('r',  outerR);
            }
            grad.setAttribute('id',           `sliceGrad-${i}`);
            grad.setAttribute('gradientUnits','userSpaceOnUse');
            const s1 = document.createElementNS(SVG_NS, 'stop');
            s1.setAttribute('class',      'slice-grad-inner');
            s1.setAttribute('offset',     String(stop0));
            s1.setAttribute('stop-color', keyColor);
            grad.appendChild(s1);
            const s2 = document.createElementNS(SVG_NS, 'stop');
            s2.setAttribute('offset',     String(stop1));
            s2.setAttribute('stop-color', keyColor);
            grad.appendChild(s2);
            defs.appendChild(grad);
        }
    }

    // Radial gap lines — drawn on top of slices, bg-colored, with rounded caps.
    // Replaces the old "carve-out circles" approach. Slices fill full wedges (no gap subtraction);
    // these lines visually create the gap with proper stroke-linecap: round terminals.
    // Lines extend from the hub edge (inner) through the grip ring to the wheel rim (outer).
    _renderGapLines(fragment, center, radii, anglePerSlice, sliceCount) {
        const gapPx = this.state.get('gapSize');
        if (gapPx <= 0) return;
        const outerR = (radii.rx + radii.ry) / 2;
        const innerR = this._getHubBaseRadius(); // start at hub circle's outer edge (grip's inner edge)
        const bg = this.getGrayColor(this.state.get('bgGray'));
        const half = gapPx / 2;
        // Small extra breathing room so the round caps aren't pinched by the hub edge / slice edge
        const capMargin = half + 1;

        for (let i = 0; i < sliceCount; i++) {
            const ang = (i * anglePerSlice * Math.PI) / 180;
            const cx = Math.cos(ang), sy = Math.sin(ang);
            const x1 = center.x + (innerR + capMargin) * cx;
            const y1 = center.y + (innerR + capMargin) * sy;
            const x2 = center.x + (outerR - capMargin) * cx;
            const y2 = center.y + (outerR - capMargin) * sy;
            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('stroke',         bg);
            line.setAttribute('stroke-width',   gapPx);
            line.setAttribute('stroke-linecap', 'round');
            // Seam between highest and lowest note: dashed so it visually distinguishes the wrap-around
            if (i === 0) {
                const dash = Math.max(2, gapPx * 1.5);
                const gap  = Math.max(2, gapPx * 1.2);
                line.setAttribute('stroke-dasharray', `${dash} ${gap}`);
                line.setAttribute('stroke-linecap', 'butt');
            }
            line.style.pointerEvents = 'none';
            fragment.appendChild(line);
        }
    }

    renderInnerCircle() {
        const center = this.geometry.calculateCenter();
        const innerRadius = this._getExpandedHubRadius();

        this.innerCircle = document.createElementNS(SVG_NS, 'circle');
        this.innerCircle.setAttribute('cx', center.x);
        this.innerCircle.setAttribute('cy', center.y);
        this.innerCircle.setAttribute('r', innerRadius);
        this.innerCircle.setAttribute('fill', 'transparent');
        this.innerCircle.setAttribute('stroke', 'var(--grip-color)');
        this.innerCircle.setAttribute('stroke-width', '0');
        this.innerCircle.setAttribute('id', 'innerRotationPlate');
        this.innerCircle.style.cursor = 'grab';
        this.innerCircle.style.pointerEvents = 'all';

        this.sliceGroup.appendChild(this.innerCircle);
        return innerRadius;
    }


    renderGripRing(innerRadius) {
        // No visual ring — ticks are the only grabber affordance.
        // This just computes the inner boundary of the tick/grab zone.
        const gripRingRadius = Math.max(0, innerRadius - this.state.get('grabberWidth') * this.getUIScale());
        this.gripRingBaseRadii = { outerRadius: innerRadius, innerRingRadius: gripRingRadius };
        return gripRingRadius;
    }

    renderGripTicks(innerRadius, gripRingRadius) {
        const center = this.geometry.calculateCenter();
        const sliceCount = this.state.get('sliceCount');
        const partialFrac = this.state.get('slicePartialFrac') ?? 1.0;
        const ticksPerEdge = this.state.get('ticksPerEdge');
        const gripThickness = this.state.get('gripThickness');
        const gripOpacity = this.state.get('gripOpacity');
        const gripInset = this.state.get('gripInset');

        const anglePerSlice = 360 / (sliceCount - 1 + partialFrac);
        const gripRingWidth = innerRadius - gripRingRadius;
        const insetAmount = (gripInset / 100) * gripRingWidth;
        // Pull endpoints in by stroke-radius so the round caps don't get clipped
        // by the hub circle (inner) or the slice edge (outer).
        const tickHalf = gripThickness / 2;
        const innerTickRadius = gripRingRadius + insetAmount + tickHalf;
        const outerTickRadius = innerRadius - insetAmount - tickHalf;

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < sliceCount; i++) {
            // Skip the partial slice during drag
            if (i === sliceCount - 1 && partialFrac < 1.0) continue;
            for (let k = 0; k < ticksPerEdge; k++) {
                const angle = (i + k / ticksPerEdge) * anglePerSlice;
                const angleRad = (angle * Math.PI) / 180;

                const x1 = center.x + innerTickRadius * Math.cos(angleRad);
                const y1 = center.y + innerTickRadius * Math.sin(angleRad);
                const x2 = center.x + outerTickRadius * Math.cos(angleRad);
                const y2 = center.y + outerTickRadius * Math.sin(angleRad);

                const centerX = (x1 + x2) / 2;
                const centerY = (y1 + y2) / 2;

                const tick = document.createElementNS(SVG_NS, 'line');
                tick.setAttribute('class', 'grip-tick');
                tick.setAttribute('x1', x1);
                tick.setAttribute('y1', y1);
                tick.setAttribute('x2', x2);
                tick.setAttribute('y2', y2);
                tick.setAttribute('stroke', 'var(--grip-color)');
                tick.setAttribute('stroke-width', gripThickness);
                tick.setAttribute('stroke-linecap', 'round');
                tick.setAttribute('opacity', gripOpacity / 100);
                tick.setAttribute('vector-effect', 'non-scaling-stroke');
                tick.style.pointerEvents = 'none';
                tick.style.transformOrigin = `${centerX}px ${centerY}px`;

                tick.setAttribute('data-x1', x1);
                tick.setAttribute('data-y1', y1);
                tick.setAttribute('data-x2', x2);
                tick.setAttribute('data-y2', y2);
                tick.setAttribute('data-center-x', centerX);
                tick.setAttribute('data-center-y', centerY);

                fragment.appendChild(tick);
            }
        }

        this.sliceGroup.appendChild(fragment);
    }

    renderNoteMarkers(innerRadius) {
        const center = this.geometry.calculateCenter();
        const sliceCount = this.state.get('sliceCount');
        const partialFrac = this.state.get('slicePartialFrac') ?? 1.0;
        const anglePerSlice = 360 / (sliceCount - 1 + partialFrac);
        const markerSize = this.state.get('noteMarkerSize');
        const markerColor = this.state.get('noteMarkerColor');
        const markerOpacity = this.state.get('noteMarkerOpacity') / 100;
        const markerRadius = this.state.get('noteMarkerPosition') * this.getUIScale();

        const fragment = document.createDocumentFragment();

        const makeMarker = (i, filled) => {
            // Skip the partial slice during drag
            if (i === sliceCount - 1 && partialFrac < 1.0) return;
            const midAngle = ((i + 0.5) * anglePerSlice) * Math.PI / 180;
            const marker = document.createElementNS(SVG_NS, 'circle');
            marker.setAttribute('class', 'note-marker');
            marker.setAttribute('cx', center.x + markerRadius * Math.cos(midAngle));
            marker.setAttribute('cy', center.y + markerRadius * Math.sin(midAngle));
            marker.setAttribute('r', markerSize);
            if (filled) {
                marker.setAttribute('fill', markerColor);
            } else {
                marker.setAttribute('fill', 'none');
                marker.setAttribute('stroke', markerColor);
                marker.setAttribute('stroke-width', 1);
            }
            marker.setAttribute('opacity', markerOpacity);
            marker.style.pointerEvents = 'none';
            fragment.appendChild(marker);
        };

        // Octave markers (filled circles) — root every 7 slices
        for (let i = 0; i < sliceCount; i += 7) makeMarker(i, true);

        // 5th-of-scale markers (stroked circles) — 5th degree is 4 slices after the root
        for (let i = 4; i < sliceCount; i += 7) makeMarker(i, false);

        this.sliceGroup.appendChild(fragment);
    }

    getKeyDisplayName() {
        // "Dumb" display: literal letter + accidental glyph (B♯ stays B♯, doesn't snap to C)
        const rootLetter = this.state.get('rootLetter');
        const mode       = this.state.get('accidentalMode');
        const letter     = NOTE_LETTERS[rootLetter] ?? 'C';
        if (mode === 'sharp') return letter + '♯';
        if (mode === 'flat')  return letter + '♭';
        return letter;
    }

    getDialFanParams() {
        const anchor = this.state.get('anchor');
        const fanMap = {
            'top-left':      { center: 45,  arc: 78 },
            'top-center':    { center: 90,  arc: 160 },
            'top-right':     { center: 135, arc: 78 },
            'center-left':   { center: 0,   arc: 160 },
            'center':        { center: 0,   arc: 360 },
            'center-right':  { center: 180, arc: 160 },
            'bottom-left':   { center: 315, arc: 78 },
            'bottom-center': { center: 270, arc: 160 },
            'bottom-right':  { center: 225, arc: 78 },
        };
        return fanMap[anchor] || { center: 225, arc: 90 };
    }

    getKeyLabelOffset(btnRadius) {
        // Position label in the visible quarter based on anchor
        const anchor = this.state.get('anchor');
        const offset = btnRadius * 0.35;
        const positions = {
            'top-left': { dx: offset, dy: offset },
            'top-center': { dx: 0, dy: offset },
            'top-right': { dx: -offset, dy: offset },
            'center-left': { dx: offset, dy: 0 },
            'center': { dx: 0, dy: 0 },
            'center-right': { dx: -offset, dy: 0 },
            'bottom-left': { dx: offset, dy: -offset },
            'bottom-center': { dx: 0, dy: -offset },
            'bottom-right': { dx: -offset, dy: -offset }
        };
        return positions[anchor] || { dx: 0, dy: 0 };
    }

    renderAudioToggle() {
        const center     = this.geometry.calculateCenter();
        const scale      = this.getUIScale();
        const btnRadius  = this._getHubBaseRadius();
        const expandedR  = this._getExpandedHubRadius();
        const pickerOpen = this.keyPickerOpen && this.audioActive;
        const st         = this.state;

        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'audio-toggle');
        group.style.cursor = this.audioActive ? 'pointer' : 'default';

        // BG circle — always matches key colour at full opacity
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx',   center.x);
        circle.setAttribute('cy',   center.y);
        circle.setAttribute('r',    pickerOpen ? expandedR : btnRadius);
        circle.setAttribute('fill', pickerOpen ? (st.get('hubOpenColor') ?? st.get('keyColor')) : (st.get('keyColor') ?? '#606060'));
        circle.setAttribute('class',   this.audioActive ? 'audio-toggle-circle active' : 'audio-toggle-circle');
        group.appendChild(circle);

        // Key label + sublabel
        const lx = center.x + (pickerOpen ? st.get('keyLabelPickerX') : st.get('keyLabelX')) * scale;
        const ly = center.y + (pickerOpen ? st.get('keyLabelPickerY') : st.get('keyLabelY')) * scale;
        const labelOp = pickerOpen
            ? st.get('keyLabelOpPicker') / 100
            : (this.audioActive ? st.get('keyLabelOpOn') / 100 : st.get('keyLabelOpOff') / 100);

        const fontFamily = st.get('keyFontFamily');
        const fontWeight = st.get('keyLabelFontWeight');
        const fontSize   = st.get('keyLabelFontSize');
        const labelColor = st.get('keyLabelColor');

        // LETTER element — always shows just the letter (no accidental, no minor)
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x',                 lx);
        label.setAttribute('y',                 ly);
        label.setAttribute('text-anchor',       'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('font-size',         fontSize);
        label.setAttribute('font-weight',       fontWeight);
        label.setAttribute('font-family',       fontFamily);
        label.setAttribute('fill',              labelColor);
        label.setAttribute('opacity',           labelOp);
        label.setAttribute('class',             'key-label');
        label.style.pointerEvents = 'none';
        label.style.userSelect    = 'none';
        label.textContent = NOTE_LETTERS[st.get('rootLetter')] ?? 'C';
        group.appendChild(label);

        // MODIFIER elements — accidental (♯/♭) and minor (m) as SEPARATE text elements,
        // stacked vertically in the same X column to the right of the letter.
        // Both fade out when picker opens (info is in the pills then).
        const accMode    = st.get('accidentalMode');
        const scaleMode  = st.get('scaleMode');
        const accGlyph   = accMode === 'sharp' ? '♯' : accMode === 'flat' ? '♭' : '';
        const minorGlyph = scaleMode === 'minor' ? 'm' : '';

        const modOffsetX    = st.get('keyModOffsetX')   * scale;
        const accOffsetY    = st.get('keyAccOffsetY')   * scale;
        const minOffsetY    = st.get('keyMinorOffsetY') * scale;
        const modFontSize   = st.get('keyModFontSize')  * scale;
        const modFontWeight = st.get('keyModFontWeight');
        const modOp = pickerOpen ? 0 : labelOp;

        const makeModEl = (cls, text, oy) => {
            const el = document.createElementNS(SVG_NS, 'text');
            el.setAttribute('x',                 lx + modOffsetX);
            el.setAttribute('y',                 ly + oy);
            el.setAttribute('text-anchor',       'start');
            el.setAttribute('dominant-baseline', 'central');
            el.setAttribute('font-size',         modFontSize);
            el.setAttribute('font-weight',       modFontWeight);
            el.setAttribute('font-family',       fontFamily);
            el.setAttribute('fill',              labelColor);
            el.setAttribute('opacity',           modOp);
            el.setAttribute('class',             'key-modifier ' + cls);
            el.style.pointerEvents = 'none';
            el.style.userSelect    = 'none';
            el.textContent = text;
            return el;
        };

        if (accGlyph)   group.appendChild(makeModEl('key-accidental', accGlyph,   accOffsetY));
        if (minorGlyph) group.appendChild(makeModEl('key-minor',      minorGlyph, minOffsetY));

        // Sublabel opacity tracks three states like the label
        const subOp = pickerOpen
            ? st.get('keySubOpPicker') / 100
            : (this.audioActive ? st.get('keySubOpOn') / 100 : st.get('keySubOpOff') / 100);
        const sublabel = document.createElementNS(SVG_NS, 'text');
        sublabel.setAttribute('x',                 lx);
        sublabel.setAttribute('y',                 center.y + st.get('keySubLabelY') * scale);
        sublabel.setAttribute('text-anchor',       'middle');
        sublabel.setAttribute('dominant-baseline', 'central');
        sublabel.setAttribute('font-size',         st.get('keySubLabelFontSize') * scale);
        sublabel.setAttribute('font-weight',       st.get('keySubLabelFontWeight'));
        sublabel.setAttribute('font-family',       fontFamily);
        sublabel.setAttribute('fill',              labelColor);
        sublabel.setAttribute('opacity',           subOp);
        sublabel.setAttribute('class',             'key-sublabel');
        sublabel.style.pointerEvents = 'none';
        sublabel.style.userSelect    = 'none';
        sublabel.textContent = 'KEY';
        group.appendChild(sublabel);

        if (pickerOpen) {
            this._renderKeyPicker(group, center, scale);
            this._renderAccidentalToggle(group, center, scale);
            this._renderScaleToggle(group, center, scale);
        }

        this.svg.appendChild(group);
        this.audioToggle = group;

        // Center the label cluster horizontally — must run AFTER group is in DOM so getBBox works.
        this._applyClusterCentering();
    }

    // Measure the cluster (letter + modifiers) bbox, compute the horizontal shift needed
    // to center it at the configured anchor (lx). Stores the shift in this._groupShift.
    // Only APPLIES the shift to elements when picker is closed; picker-open state keeps
    // the letter standalone-centered at lx.
    _applyClusterCentering() {
        const labelEl = this.audioToggle?.querySelector('.key-label');
        if (!labelEl) { this._groupShift = 0; return; }
        const accEl    = this.audioToggle?.querySelector('.key-accidental');
        const minEl    = this.audioToggle?.querySelector('.key-minor');

        // No modifiers → no shift needed
        if (!accEl && !minEl) { this._groupShift = 0; return; }

        // Measure combined bbox of letter + visible modifiers
        const els = [labelEl];
        if (accEl) els.push(accEl);
        if (minEl) els.push(minEl);

        let minX = Infinity, maxX = -Infinity;
        try {
            els.forEach(el => {
                const bb = el.getBBox();
                if (bb.x < minX) minX = bb.x;
                if (bb.x + bb.width > maxX) maxX = bb.x + bb.width;
            });
        } catch (e) {
            this._groupShift = 0;
            return;
        }
        if (!isFinite(minX) || !isFinite(maxX)) { this._groupShift = 0; return; }

        const letterX = parseFloat(labelEl.getAttribute('x'));
        const currentCenter = (minX + maxX) / 2;
        const shift = currentCenter - letterX; // positive = cluster center is RIGHT of letter, need to shift LEFT

        this._groupShift = shift;

        // Apply shift only in closed state. When picker open, letter is centered alone at lx.
        const pickerOpen = this.keyPickerOpen && this.audioActive;
        if (!pickerOpen && Math.abs(shift) > 0.5) {
            labelEl.setAttribute('x', letterX - shift);
            if (accEl) accEl.setAttribute('x', parseFloat(accEl.getAttribute('x')) - shift);
            if (minEl) minEl.setAttribute('x', parseFloat(minEl.getAttribute('x')) - shift);
        }
    }

    _renderKeyPicker(group, center, scale) {
        const st         = this.state;
        const spread     = st.get('pickerRadius')  * scale;
        const fontSize   = st.get('pickerFontSize') * scale;
        const spacing    = st.get('pickerSpacing');  // degrees, not scaled
        const anchorDeg  = 225;
        const anchorIdx  = 3; // F is index 3
        const rootLetter = st.get('rootLetter');

        for (let i = 0; i < NOTE_LETTERS.length; i++) {
            const letter   = NOTE_LETTERS[i];
            const angleDeg = anchorDeg + (i - anchorIdx) * spacing;
            const angle    = (angleDeg * Math.PI) / 180;
            const nx       = center.x + spread * Math.cos(angle);
            const ny       = center.y + spread * Math.sin(angle);
            const selected = (i === rootLetter);

            const noteGroup = document.createElementNS(SVG_NS, 'g');
            noteGroup.setAttribute('class', 'key-picker-note');
            noteGroup.dataset.letter = i;     // store letter index, not chromatic
            noteGroup.style.cursor = 'pointer';

            // Transparent hit area keeps existing click handler working
            const hit = document.createElementNS(SVG_NS, 'circle');
            hit.setAttribute('cx',   nx);
            hit.setAttribute('cy',   ny);
            hit.setAttribute('r',    fontSize * 0.8);
            hit.setAttribute('fill', 'transparent');
            noteGroup.appendChild(hit);

            const t = document.createElementNS(SVG_NS, 'text');
            t.setAttribute('x',                 nx);
            t.setAttribute('y',                 ny);
            t.setAttribute('text-anchor',       'middle');
            t.setAttribute('dominant-baseline', 'central');
            t.setAttribute('font-size',         fontSize);
            t.setAttribute('font-weight',       st.get('pickerFontWeight'));
            t.setAttribute('font-family',       st.get('keyFontFamily'));
            t.setAttribute('fill',              '#ffffff');
            t.setAttribute('opacity',           selected ? 1 : 0.45);
            t.style.pointerEvents = 'none';
            t.style.userSelect    = 'none';
            t.textContent = letter;
            noteGroup.appendChild(t);

            group.appendChild(noteGroup);
        }
    }

    _renderAccidentalToggle(group, center, scale) {
        const st     = this.state;
        const lx     = center.x + st.get('keyLabelPickerX') * scale;
        const ly     = center.y + st.get('keyLabelPickerY') * scale;
        const x      = lx + st.get('toggleX') * scale;
        const y      = ly - st.get('toggleSpacing') / 2 * scale;
        const r      = st.get('togglePillR') * scale;
        const glyphs = { flat: '♭', natural: '♮', sharp: '♯' };

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'acc-toggle');
        g.style.cursor = 'pointer';
        // Transparent hit area — larger than the visible pill for easier tapping
        const hit = document.createElementNS(SVG_NS, 'circle');
        hit.setAttribute('class', 'toggle-hit');
        hit.setAttribute('cx', x); hit.setAttribute('cy', y);
        hit.setAttribute('r', r * 1.7);
        hit.setAttribute('fill', 'transparent');
        g.appendChild(hit);
        g.appendChild(this._makePillCircle(x, y, r, st));

        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x',                 x);
        t.setAttribute('y',                 y);
        t.setAttribute('text-anchor',       'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-size',         st.get('accFontSize') * scale);
        t.setAttribute('font-weight',       st.get('accFontWeight'));
        t.setAttribute('font-family',       st.get('keyFontFamily'));
        t.setAttribute('fill',              st.get('toggleTextColor'));
        t.style.pointerEvents = 'none';
        t.textContent = glyphs[st.get('accidentalMode')];
        g.appendChild(t);

        group.appendChild(g);
    }

    _renderScaleToggle(group, center, scale) {
        const st     = this.state;
        const lx     = center.x + st.get('keyLabelPickerX') * scale;
        const ly     = center.y + st.get('keyLabelPickerY') * scale;
        const x      = lx + st.get('toggleX') * scale;
        const y      = ly + st.get('toggleSpacing') / 2 * scale;
        const r      = st.get('togglePillR') * scale;
        const labels = { major: 'M', minor: 'm' };

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'scale-toggle');
        g.style.cursor = 'pointer';
        // Transparent hit area — larger than the visible pill for easier tapping
        const hit = document.createElementNS(SVG_NS, 'circle');
        hit.setAttribute('class', 'toggle-hit');
        hit.setAttribute('cx', x); hit.setAttribute('cy', y);
        hit.setAttribute('r', r * 1.7);
        hit.setAttribute('fill', 'transparent');
        g.appendChild(hit);
        g.appendChild(this._makePillCircle(x, y, r, st));

        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x',                 x);
        t.setAttribute('y',                 y);
        t.setAttribute('text-anchor',       'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('font-size',         st.get('scaleFontSize') * scale);
        t.setAttribute('font-weight',       st.get('scaleFontWeight'));
        t.setAttribute('font-family',       st.get('keyFontFamily'));
        t.setAttribute('fill',              st.get('toggleTextColor'));
        t.style.pointerEvents = 'none';
        t.textContent = labels[st.get('scaleMode')];
        g.appendChild(t);

        group.appendChild(g);
    }

    _makePillCircle(x, y, r, st) {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx',           x);
        c.setAttribute('cy',           y);
        c.setAttribute('r',            r);
        c.setAttribute('fill',         this._hexToRgba(st.get('toggleFill'),   st.get('toggleFillOpacity')));
        c.setAttribute('stroke',       this._hexToRgba(st.get('toggleStroke'), st.get('toggleStrokeOpacity')));
        c.setAttribute('stroke-width', st.get('toggleStrokeW'));
        return c;
    }

    renderPowerButton() {
        const { width } = this.geometry.getViewportSize();
        const scale     = this.getUIScale();
        const r         = Math.max(14, this.state.get('powerBtnSize') * scale);
        const margin    = POWER_BTN_MARGIN_PT * scale;
        const cx        = width - r - margin;
        const cy        = r + margin;
        const c2r       = r * this.state.get('c2SizeRatio');

        const defs = this.createDefs();
        this._renderPowerBtnDefs(defs, cx, cy, r, c2r);

        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'power-button');
        group.style.cursor = 'pointer';
        // Dim power button while picker is open (modal state)
        if (this.keyPickerOpen && this.audioActive) {
            group.setAttribute('opacity', this.state.get('powerBtnPickerOpacity') / 100);
        }

        const c1 = document.createElementNS(SVG_NS, 'circle');
        c1.setAttribute('class', 'pwr-c1');
        c1.setAttribute('cx', cx); c1.setAttribute('cy', cy); c1.setAttribute('r', r);
        c1.setAttribute('fill',   'url(#pwrC1Grad)');
        c1.setAttribute('stroke', 'none');
        c1.setAttribute('filter', 'url(#pwrC1Filter)');
        group.appendChild(c1);

        const c1s = document.createElementNS(SVG_NS, 'circle');
        c1s.setAttribute('cx', cx); c1s.setAttribute('cy', cy); c1s.setAttribute('r', r);
        c1s.setAttribute('fill',         'none');
        c1s.setAttribute('stroke',       this.state.get('c1Stroke'));
        c1s.setAttribute('stroke-width', this.state.get('c1StrokeWidth'));
        group.appendChild(c1s);

        const c2 = document.createElementNS(SVG_NS, 'circle');
        c2.setAttribute('class', 'pwr-c2');
        c2.setAttribute('cx', cx); c2.setAttribute('cy', cy); c2.setAttribute('r', c2r);
        c2.setAttribute('fill',   this.audioActive ? 'url(#pwrC2GradOn)' : 'url(#pwrC2GradOff)');
        c2.setAttribute('stroke', 'none');
        c2.setAttribute('filter', 'url(#pwrC2Filter)');
        group.appendChild(c2);
        this.pwrC2 = c2;

        const c2s = document.createElementNS(SVG_NS, 'circle');
        c2s.setAttribute('cx', cx); c2s.setAttribute('cy', cy); c2s.setAttribute('r', c2r);
        c2s.setAttribute('fill',         'none');
        c2s.setAttribute('stroke',       this.state.get('c2Stroke'));
        c2s.setAttribute('stroke-width', this.state.get('c2StrokeWidth'));
        group.appendChild(c2s);

        const glow = document.createElementNS(SVG_NS, 'circle');
        const glowR = c2r + this.state.get('c2GlowSpread') * scale;
        glow.setAttribute('cx', cx); glow.setAttribute('cy', cy); glow.setAttribute('r', glowR);
        glow.setAttribute('fill',    this.state.get('c2GlowColor'));
        glow.setAttribute('opacity', this.audioActive ? this.state.get('c2GlowOpacity') / 100 : 0);
        glow.setAttribute('filter',  'url(#pwrC2GlowFilter)');
        glow.style.mixBlendMode  = this.state.get('c2GlowBlendMode');
        glow.style.pointerEvents = 'none';
        group.appendChild(glow);
        this.pwrGlow = glow;

        this.svg.appendChild(group);
        this.powerButton = group;
    }

    _renderPowerBtnDefs(defs, cx, cy, r, c2r) {
        ['pwrC1Grad','pwrC2GradOff','pwrC2GradOn','pwrC1Filter','pwrC2Filter','pwrC2GlowFilter'].forEach(id => {
            defs.querySelector(`#${id}`)?.remove();
        });

        const s = this.state;

        const addStops = (g, fromColor, toColor, stop0, stop1) => {
            const s1 = document.createElementNS(SVG_NS, 'stop');
            s1.setAttribute('offset', stop0 + '%'); s1.setAttribute('stop-color', fromColor);
            const s2 = document.createElementNS(SVG_NS, 'stop');
            s2.setAttribute('offset', stop1 + '%'); s2.setAttribute('stop-color', toColor);
            g.appendChild(s1); g.appendChild(s2);
        };

        const makeGrad = (id, fromColor, toColor, type, angleDeg, focalOffsetPct, cxp, cyp, rp, stop0, stop1) => {
            const aRad = (angleDeg * Math.PI) / 180;
            let g;
            if (type === 'linear') {
                g = document.createElementNS(SVG_NS, 'linearGradient');
                g.setAttribute('gradientUnits', 'userSpaceOnUse');
                g.setAttribute('x1', cxp + rp * Math.cos(aRad));
                g.setAttribute('y1', cyp + rp * Math.sin(aRad));
                g.setAttribute('x2', cxp - rp * Math.cos(aRad));
                g.setAttribute('y2', cyp - rp * Math.sin(aRad));
            } else {
                g = document.createElementNS(SVG_NS, 'radialGradient');
                g.setAttribute('gradientUnits', 'userSpaceOnUse');
                const fd = (focalOffsetPct / 100) * rp;
                g.setAttribute('cx', cxp); g.setAttribute('cy', cyp); g.setAttribute('r', rp);
                g.setAttribute('fx', cxp + fd * Math.cos(aRad));
                g.setAttribute('fy', cyp + fd * Math.sin(aRad));
            }
            g.setAttribute('id', id);
            addStops(g, fromColor, toColor, stop0, stop1);
            defs.appendChild(g);
        };

        makeGrad('pwrC1Grad',
            s.get('c1GradFrom'), s.get('c1GradTo'),
            s.get('c1GradType'), s.get('c1GradAngle'), s.get('c1GradFocalOffset'),
            cx, cy, r, s.get('c1GradStop0'), s.get('c1GradStop1'));

        makeGrad('pwrC2GradOff',
            s.get('c2GradFromOff'), s.get('c2GradToOff'),
            s.get('c2GradTypeOff'), s.get('c2GradAngleOff'), s.get('c2GradFocalOffsetOff'),
            cx, cy, c2r, s.get('c2GradStop0Off'), s.get('c2GradStop1Off'));

        makeGrad('pwrC2GradOn',
            s.get('c2GradFromOn'), s.get('c2GradToOn'),
            s.get('c2GradTypeOn'), s.get('c2GradAngleOn'), s.get('c2GradFocalOffsetOn'),
            cx, cy, c2r, s.get('c2GradStop0On'), s.get('c2GradStop1On'));

        const makeFilter = (id,
            dropBlur, dropOpacity, dropColor, dropDx, dropDy,
            innerBlur, innerOpacity, innerColor, innerDx, innerDy) => {

            const f = document.createElementNS(SVG_NS, 'filter');
            f.setAttribute('id', id);
            f.setAttribute('x', '-200%'); f.setAttribute('y', '-200%');
            f.setAttribute('width', '500%'); f.setAttribute('height', '500%');

            const el = (tag, attrs) => {
                const e = document.createElementNS(SVG_NS, tag);
                Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
                return e;
            };

            f.appendChild(el('feDropShadow', {
                dx: dropDx, dy: dropDy, stdDeviation: dropBlur,
                'flood-color': dropColor, 'flood-opacity': dropOpacity / 100,
                in: 'SourceGraphic', result: 'withDrop',
            }));

            f.appendChild(el('feFlood',     { 'flood-color': 'white', 'flood-opacity': 1, result: 'fullWhite' }));
            f.appendChild(el('feComposite', { in: 'fullWhite', in2: 'SourceAlpha', operator: 'out', result: 'inv' }));
            f.appendChild(el('feOffset',    { in: 'inv', dx: innerDx, dy: innerDy, result: 'offsetInv' }));
            f.appendChild(el('feGaussianBlur', { in: 'offsetInv', stdDeviation: innerBlur, result: 'blurredInv' }));
            f.appendChild(el('feComposite',    { in: 'blurredInv', in2: 'SourceAlpha', operator: 'in', result: 'innerShape' }));
            f.appendChild(el('feFlood',        { 'flood-color': innerColor, 'flood-opacity': innerOpacity / 100, result: 'innerFlood' }));
            f.appendChild(el('feComposite',    { in: 'innerFlood', in2: 'innerShape', operator: 'in', result: 'innerShadow' }));

            const merge = el('feMerge', {});
            merge.appendChild(el('feMergeNode', { in: 'withDrop' }));
            merge.appendChild(el('feMergeNode', { in: 'innerShadow' }));
            f.appendChild(merge);
            defs.appendChild(f);
        };

        makeFilter('pwrC1Filter',
            s.get('c1DropBlur'),  s.get('c1DropOpacity'),  s.get('c1DropColor'),  s.get('c1DropDx'),  s.get('c1DropDy'),
            s.get('c1InnerBlur'), s.get('c1InnerOpacity'), s.get('c1InnerColor'), s.get('c1InnerDx'), s.get('c1InnerDy'));
        makeFilter('pwrC2Filter',
            s.get('c2DropBlur'),  s.get('c2DropOpacity'),  s.get('c2DropColor'),  s.get('c2DropDx'),  s.get('c2DropDy'),
            s.get('c2InnerBlur'), s.get('c2InnerOpacity'), s.get('c2InnerColor'), s.get('c2InnerDx'), s.get('c2InnerDy'));

        const glowF = document.createElementNS(SVG_NS, 'filter');
        glowF.setAttribute('id', 'pwrC2GlowFilter');
        glowF.setAttribute('x', '-200%'); glowF.setAttribute('y', '-200%');
        glowF.setAttribute('width', '500%'); glowF.setAttribute('height', '500%');
        const glowBlur = document.createElementNS(SVG_NS, 'feGaussianBlur');
        glowBlur.setAttribute('stdDeviation', s.get('c2GlowBlur'));
        glowBlur.setAttribute('result', 'glow');
        glowF.appendChild(glowBlur);
        defs.appendChild(glowF);
    }

    setAudioToggleActive(active) {
        const wasActive = this.audioActive;
        this.audioActive = active;

        if (active && !wasActive) {
            // Awaken: animate slices from skeleton to full
            this.awakenSlices();
        } else if (!active && wasActive) {
            // Sleep: fade slices back to skeleton
            this.sleepSlices();
        }

        // Dim overlay transition — render() either adds or omits it;
        // fade-out needs a temporary overlay injected after render clears the old one.
        // We fade OUT the dim when turning audio ON (was off, now on).
        const fadingOut = active && !wasActive;

        // Power button sphere — instant gradient swap
        if (this.pwrC2) {
            this.pwrC2.setAttribute('fill', active ? 'url(#pwrC2GradOn)' : 'url(#pwrC2GradOff)');
        }
        // Glow — show only when active
        if (this.pwrGlow) {
            this.pwrGlow.setAttribute('opacity', active ? this.state.get('c2GlowOpacity') / 100 : 0);
        }

        // Re-render to show/hide key label and update toggle
        this.render();

        // After render, inject fade-out overlay if turning on (render already cleared the old one)
        if (fadingOut) {
            this._playDimFadeOut();
        }
    }

    awakenSlices() {
        this.sliceElements.forEach((slice, index) => {
            slice.classList.remove('skeleton', 'asleep');
            slice.classList.add('skeleton', 'awaken');
            const delay = `${index * 20}ms`;
            slice.style.webkitAnimationDelay = delay;
            slice.style.animationDelay = delay;
        });
        // Clean up after animation
        const sliceCount = this.state.get('sliceCount');
        const totalDuration = (sliceCount * 20) + 600;
        setTimeout(() => {
            this.sliceElements.forEach(slice => {
                slice.classList.remove('skeleton', 'awaken');
                slice.style.webkitAnimationDelay = '';
                slice.style.animationDelay = '';
            });
        }, totalDuration);
    }

    sleepSlices() {
        this.sliceElements.forEach(slice => {
            slice.classList.remove('awaken');
            slice.classList.add('skeleton', 'asleep');
        });
    }

    getUIScale() {
        const radii = this.geometry.calculateRadii();
        const avgRadius = (radii.rx + radii.ry) / 2;
        const raw = (avgRadius / REFERENCE_RADIUS) * this.state.get('uiScale');
        return Math.min(raw, this.state.get('uiScaleMax'));
    }

    // Hub resting radius = innerCircleSize - grabberWidth (grip/tick zone)
    _getHubBaseRadius() {
        const scale = this.getUIScale();
        const innerRadius = this.state.get('innerCircleSize') * scale;
        const grabberZone = this.state.get('grabberWidth') * scale;
        return Math.max(8, innerRadius - grabberZone);
    }

    // Hub expanded radius = full inner circle (covers grip zone)
    _getExpandedHubRadius() {
        return this.state.get('innerCircleSize') * this.getUIScale();
    }

    _hexToRgba(hex, opacityPct) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${opacityPct / 100})`;
    }

    setKeyPickerOpen(open) {
        if (!this.audioActive) {
            this.keyPickerOpen = open;
            return;
        }

        const btnR    = this._getHubBaseRadius();
        const expandR = this._getExpandedHubRadius();

        if (open) {
            // OPEN: update state, render at open state, then animate elements IN
            this.keyPickerOpen = true;
            this.render();
            const dur = this.state.get('animOpenDuration');
            const ease = this._getEase('open');
            const circle = this.audioToggle?.querySelector('.audio-toggle-circle');
            if (circle) {
                circle.setAttribute('r', btnR);
                this._animateHubR(circle, btnR, expandR, dur, ease);
                // Hub fill: keyColor → hubOpenColor
                circle.setAttribute('fill', this.state.get('keyColor'));
                this._animateColor(circle, this.state.get('keyColor'), this.state.get('hubOpenColor'), dur, ease);
            }
            this._animatePickerIn();
        } else {
            // CLOSE: animate existing (open) elements out, then render at closed state
            const dur = this.state.get('animCloseDuration');
            const ease = this._getEase('close');
            const circle = this.audioToggle?.querySelector('.audio-toggle-circle');
            if (circle) {
                this._animateHubR(circle, expandR, btnR, dur, ease);
                // Hub fill: hubOpenColor → keyColor
                this._animateColor(circle, this.state.get('hubOpenColor'), this.state.get('keyColor'), dur, ease);
            }
            this._animatePickerOut(() => {
                this.keyPickerOpen = false;
                this.render();
            });
        }
    }

    // Resolve a direction ('open' | 'close') to an easing fn from state.
    _getEase(direction) {
        const key = direction === 'close' ? 'animCloseEasing' : 'animOpenEasing';
        return EASING_FUNCTIONS[this.state.get(key)] || EASING_FUNCTIONS.easeInOutQuart;
    }

    _hexToRgb(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16),
        };
    }

    _animateColor(el, fromHex, toHex, duration, easeFn, attribute = 'fill', onDone) {
        const from = this._hexToRgb(fromHex);
        const to   = this._hexToRgb(toHex);
        const start = performance.now();
        const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const e = easeFn(t);
            const r = Math.round(from.r + (to.r - from.r) * e);
            const g = Math.round(from.g + (to.g - from.g) * e);
            const b = Math.round(from.b + (to.b - from.b) * e);
            el.setAttribute(attribute, `rgb(${r},${g},${b})`);
            if (t < 1) requestAnimationFrame(tick);
            else if (onDone) onDone();
        };
        requestAnimationFrame(tick);
    }

    _animatePickerIn() {
        const scale  = this.getUIScale();
        const center = this.geometry.calculateCenter();
        const DURATION   = this.state.get('animOpenDuration');
        const STAGGER    = this.state.get('animOpenStagger');
        const PILL_DELAY = this.state.get('animOpenPillDelay');
        const ease = this._getEase('open');

        // Picker dim overlay fade in
        const dim = this.svg.querySelector('.picker-dim-overlay');
        if (dim) {
            const target = this.state.get('pickerDimOpacity') / 100;
            this._setOpacity(dim, 0);
            this._animateOpacity(dim, 0, target, DURATION, ease);
        }

        // Letters: stagger fade in from F (index 3) outward — CSS transition (mobile-friendly)
        const letters = this.svg.querySelectorAll('.key-picker-note');
        const lettersData = [];
        letters.forEach((noteGroup, i) => {
            const textEl = noteGroup.querySelector('text');
            if (!textEl) return;
            const targetOp = parseFloat(textEl.getAttribute('opacity') || '1');
            // Snap to 0 with no transition
            textEl.style.transition = 'none';
            textEl.style.opacity = '0';
            textEl.setAttribute('opacity', '0');
            lettersData.push({ textEl, targetOp, delay: STAGGER * Math.abs(i - 3) });
        });
        // Force a reflow so the opacity:0 + transition:none state is committed
        void this.svg.getBoundingClientRect();
        // Now apply transition + target opacity in a new tick — CSS handles the animation
        requestAnimationFrame(() => {
            lettersData.forEach(({ textEl, targetOp, delay }) => {
                textEl.style.transition = `opacity ${DURATION}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`;
                textEl.style.opacity = String(targetOp);
                textEl.setAttribute('opacity', String(targetOp));
            });
        });

        // Label + sublabel slide from closed → picker position
        // Opening: FROM closed (cluster centered, letter shifted by groupShift) → TO picker (letter alone, no shift)
        this._animateLabelSlide(
            this.state.get('keyLabelX'),       this.state.get('keyLabelY'),
            this.state.get('keyLabelPickerX'), this.state.get('keyLabelPickerY'),
            scale, center, DURATION, ease,
            this._groupShift || 0, 0
        );

        // Label + sublabel: simple opacity tween on → picker
        const label    = this.audioToggle?.querySelector('.key-label');
        const sublabel = this.audioToggle?.querySelector('.key-sublabel');
        const modEl    = this.audioToggle?.querySelector('.key-modifier');
        if (label) {
            const fromOp = this.state.get('keyLabelOpOn')     / 100;
            const toOp   = this.state.get('keyLabelOpPicker') / 100;
            this._animateOpacity(label, fromOp, toOp, DURATION, ease);
        }
        if (sublabel) {
            const fromOp = this.state.get('keySubOpOn')     / 100;
            const toOp   = this.state.get('keySubOpPicker') / 100;
            this._animateOpacity(sublabel, fromOp, toOp, DURATION, ease);
        }
        // Modifiers (accidental + minor): fade from current "on" opacity → 0
        const modEls = this.audioToggle?.querySelectorAll('.key-modifier');
        if (modEls && modEls.length) {
            const fromOp = this.state.get('keyLabelOpOn') / 100;
            modEls.forEach(el => this._animateOpacity(el, fromOp, 0, DURATION, ease));
        }

        // Toggle pills (♭♮♯, M/m) — chained: appear AFTER the label settles
        const accToggle   = this.svg.querySelector('.acc-toggle');
        const scaleToggle = this.svg.querySelector('.scale-toggle');
        const pills = [accToggle, scaleToggle].filter(Boolean);
        pills.forEach(p => this._setOpacity(p, 0));
        setTimeout(() => {
            pills.forEach(p => this._animateOpacity(p, 0, 1, DURATION, ease));
        }, PILL_DELAY);

        // Power button: dim to modal state
        const powerBtn = this.svg.querySelector('.power-button');
        if (powerBtn) {
            const target = this.state.get('powerBtnPickerOpacity') / 100;
            this._setOpacity(powerBtn, 1);
            this._animateOpacity(powerBtn, 1, target, DURATION, ease);
        }
    }

    _animatePickerOut(onDone) {
        const scale  = this.getUIScale();
        const center = this.geometry.calculateCenter();
        const DURATION   = this.state.get('animCloseDuration');
        const STAGGER    = this.state.get('animCloseStagger');
        const PILL_DELAY = this.state.get('animClosePillDelay');
        const ease = this._getEase('close');

        // Phase 1: pills fade out FIRST
        const accToggle   = this.svg.querySelector('.acc-toggle');
        const scaleToggle = this.svg.querySelector('.scale-toggle');
        const pills = [accToggle, scaleToggle].filter(Boolean);
        pills.forEach(p => {
            const current = parseFloat(p.getAttribute('opacity') || '1');
            this._animateOpacity(p, current, 0, DURATION, ease);
        });

        // Power button: restore to full opacity in parallel with everything
        const powerBtn = this.svg.querySelector('.power-button');
        if (powerBtn) {
            const current = parseFloat(powerBtn.getAttribute('opacity')) || (this.state.get('powerBtnPickerOpacity') / 100);
            this._animateOpacity(powerBtn, current, 1, DURATION, ease);
        }

        // Phase 2 (after pills): dim, letters, label slide all together
        setTimeout(() => {
            // Picker dim overlay fade out
            const dim = this.svg.querySelector('.picker-dim-overlay');
            if (dim) {
                const current = parseFloat(dim.getAttribute('opacity')) ||
                                (this.state.get('pickerDimOpacity') / 100);
                this._animateOpacity(dim, current, 0, DURATION, ease);
            }

            // Letters: reverse stagger (outer first, F last) — CSS transition
            const letters = this.svg.querySelectorAll('.key-picker-note');
            letters.forEach((noteGroup, i) => {
                const textEl = noteGroup.querySelector('text');
                if (!textEl) return;
                const delay = STAGGER * (3 - Math.abs(i - 3));
                textEl.style.transition = `opacity ${DURATION}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`;
                textEl.style.opacity = '0';
                textEl.setAttribute('opacity', '0');
            });

            // Label slide back to closed position
            // Closing: FROM picker (letter alone, no shift) → TO closed (cluster centered, letter shifted)
            this._animateLabelSlide(
                this.state.get('keyLabelPickerX'), this.state.get('keyLabelPickerY'),
                this.state.get('keyLabelX'),       this.state.get('keyLabelY'),
                scale, center, DURATION, ease,
                0, this._groupShift || 0
            );

            // Label + sublabel: simple opacity tween picker → on
            const label    = this.audioToggle?.querySelector('.key-label');
            const sublabel = this.audioToggle?.querySelector('.key-sublabel');
            const modEl    = this.audioToggle?.querySelector('.key-modifier');
            if (label) {
                const fromOp = this.state.get('keyLabelOpPicker') / 100;
                const toOp   = this.state.get('keyLabelOpOn')     / 100;
                this._animateOpacity(label, fromOp, toOp, DURATION, ease);
            }
            if (sublabel) {
                const fromOp = this.state.get('keySubOpPicker') / 100;
                const toOp   = this.state.get('keySubOpOn')     / 100;
                this._animateOpacity(sublabel, fromOp, toOp, DURATION, ease);
            }
            // Modifiers (accidental + minor): fade from 0 → "on" opacity
            const modEls = this.audioToggle?.querySelectorAll('.key-modifier');
            if (modEls && modEls.length) {
                const toOp = this.state.get('keyLabelOpOn') / 100;
                modEls.forEach(el => this._animateOpacity(el, 0, toOp, DURATION, ease));
            }
        }, PILL_DELAY);

        // Fire onDone after the full chain: pill phase + (max letter stagger) + duration
        const total = PILL_DELAY + STAGGER * 3 + DURATION;
        setTimeout(onDone, total);
    }

    // fromLxPt/toLxPt are the VISUAL CENTER positions (where the cluster should be centered).
    // fromShift/toShift compensate for cluster vs letter-alone centering:
    //   when modifiers visible:   shift = computed group shift   (letter sits left of visual center)
    //   when letter alone:        shift = 0                       (letter at visual center)
    _animateLabelSlide(fromLxPt, fromLyPt, toLxPt, toLyPt, scale, center, duration, easeFn,
                      fromShift = 0, toShift = 0) {
        const label    = this.audioToggle?.querySelector('.key-label');
        const sublabel = this.audioToggle?.querySelector('.key-sublabel');
        const accEl    = this.audioToggle?.querySelector('.key-accidental');
        const minEl    = this.audioToggle?.querySelector('.key-minor');
        if (!label) return;

        const fromLx = center.x + fromLxPt * scale;
        const fromLy = center.y + fromLyPt * scale;
        const toLx   = center.x + toLxPt   * scale;
        const toLy   = center.y + toLyPt   * scale;
        const modOffsetX = this.state.get('keyModOffsetX')   * scale;
        const accOffsetY = this.state.get('keyAccOffsetY')   * scale;
        const minOffsetY = this.state.get('keyMinorOffsetY') * scale;

        // Snap to source position (letter offset by -fromShift; sublabel at visual center fromLx)
        const fromLetterX = fromLx - fromShift;
        label.setAttribute('x', fromLetterX);
        label.setAttribute('y', fromLy);
        if (sublabel) sublabel.setAttribute('x', fromLx);
        if (accEl) { accEl.setAttribute('x', fromLetterX + modOffsetX); accEl.setAttribute('y', fromLy + accOffsetY); }
        if (minEl) { minEl.setAttribute('x', fromLetterX + modOffsetX); minEl.setAttribute('y', fromLy + minOffsetY); }

        const start = performance.now();
        const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const e = easeFn(t);
            const lx    = fromLx    + (toLx    - fromLx)    * e;
            const ly    = fromLy    + (toLy    - fromLy)    * e;
            const shift = fromShift + (toShift - fromShift) * e;
            const letterX = lx - shift;
            label.setAttribute('x', letterX);
            label.setAttribute('y', ly);
            if (sublabel) sublabel.setAttribute('x', lx);
            if (accEl) { accEl.setAttribute('x', letterX + modOffsetX); accEl.setAttribute('y', ly + accOffsetY); }
            if (minEl) { minEl.setAttribute('x', letterX + modOffsetX); minEl.setAttribute('y', ly + minOffsetY); }
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // Blink the key LETTER only (not the modifiers) when changing notes via picker.
    // Fade-out + scale-down → swap value (onMid) → fade-in + scale-up.
    // Scale anchors at the letter's (x, y) via translate-scale-translate to avoid SVG text-bbox shift.
    blinkKeyLabel(onMid) {
        const total    = this.state.get('animBlinkDuration');
        const half     = total / 2;
        const minScale = this.state.get('animBlinkScale');
        const outEase  = this._getEase('close');
        const inEase   = this._getEase('open');

        const label = this.audioToggle?.querySelector('.key-label');
        if (!label) { if (onMid) onMid(); return; }

        const startOp = parseFloat(label.getAttribute('opacity') || '1');
        const lx = parseFloat(label.getAttribute('x'));
        const ly = parseFloat(label.getAttribute('y'));

        // Phase 1: fade-out + scale-down
        this._animateBlinkStep(label, 1, minScale, startOp, 0, lx, ly, half, outEase, () => {
            if (onMid) onMid(); // updates state + re-renders → creates fresh label element
            const newLabel = this.audioToggle?.querySelector('.key-label');
            if (!newLabel) return;
            const nx = parseFloat(newLabel.getAttribute('x'));
            const ny = parseFloat(newLabel.getAttribute('y'));
            // Snap to scaled-down + invisible starting state
            this._setOpacity(newLabel, 0);
            newLabel.setAttribute('transform',
                `translate(${nx},${ny}) scale(${minScale}) translate(${-nx},${-ny})`);
            // Phase 2: fade-in + scale-up
            this._animateBlinkStep(newLabel, minScale, 1, 0, startOp, nx, ny, half, inEase, () => {
                newLabel.removeAttribute('transform'); // settle to no-transform
            });
        });
    }

    _animateBlinkStep(el, fromScale, toScale, fromOp, toOp, cx, cy, duration, easeFn, onDone) {
        const start  = performance.now();
        const dScale = toScale - fromScale;
        const dOp    = toOp    - fromOp;
        const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const e = easeFn(t);
            const s  = fromScale + dScale * e;
            const op = fromOp    + dOp    * e;
            el.setAttribute('transform',
                `translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})`);
            this._setOpacity(el, op);
            if (t < 1) requestAnimationFrame(tick);
            else if (onDone) onDone();
        };
        requestAnimationFrame(tick);
    }

    _animateHubR(circle, fromR, toR, duration, easeFn) {
        if (this._hubRAnimId) cancelAnimationFrame(this._hubRAnimId);

        const start = performance.now();

        const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const r = fromR + (toR - fromR) * easeFn(t);
            circle.setAttribute('r', r);
            if (t < 1) {
                this._hubRAnimId = requestAnimationFrame(tick);
            } else {
                this._hubRAnimId = null;
            }
        };
        this._hubRAnimId = requestAnimationFrame(tick);
    }

    render() {
        if (this._hubRAnimId) {
            cancelAnimationFrame(this._hubRAnimId);
            this._hubRAnimId = null;
        }
        // Clear locked slices when re-rendering (slice indices change)
        this.lockedSlices.clear();

        this.updateViewBox();
        this.clear();
        // Refresh cached center after viewBox is up-to-date — used by updateRotation
        // (and anywhere else that needs the center without a layout flush)
        this._cachedCenter = this.geometry.calculateCenter();
        this.renderBackground();
        this.renderSlices();
        const innerRadius = this.renderInnerCircle();
        const gripRingRadius = this.renderGripRing(innerRadius);
        this.renderGripTicks(innerRadius, gripRingRadius);
        this.renderNoteMarkers(innerRadius);
        if (this.keyPickerOpen && this.audioActive) this.renderPickerDimOverlay();
        this.renderAudioToggle();
        if (!this.audioActive) this.renderDimOverlay();
        this.renderPowerButton();
    }

    renderPickerDimOverlay() {
        const { width, height } = this.geometry.getViewportSize();
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x',       0);
        rect.setAttribute('y',       0);
        rect.setAttribute('width',   width);
        rect.setAttribute('height',  height);
        rect.setAttribute('fill',    this.state.get('pickerDimColor'));
        rect.setAttribute('opacity', this.state.get('pickerDimOpacity') / 100);
        rect.setAttribute('class',   'picker-dim-overlay');
        rect.style.pointerEvents = 'all'; // blocks slices while picker is open
        this.svg.appendChild(rect);
    }

    renderDimOverlay() {
        const { width, height } = this.geometry.getViewportSize();
        const targetOpacity = this.state.get('offDimOpacity') / 100;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x',     0);
        rect.setAttribute('y',     0);
        rect.setAttribute('width',  width);
        rect.setAttribute('height', height);
        rect.setAttribute('fill',   this.state.get('offDimColor'));
        rect.setAttribute('class',  'dim-overlay');
        this._setOpacity(rect, 0);
        rect.style.pointerEvents = 'all';
        this.svg.appendChild(rect);
        this._animateOpacity(rect, 0, targetOpacity, this.state.get('animOffDimDuration'), this._getEase('open'));
    }

    _playDimFadeOut() {
        const { width, height } = this.geometry.getViewportSize();
        const startOpacity = this.state.get('offDimOpacity') / 100;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x',     0);
        rect.setAttribute('y',     0);
        rect.setAttribute('width',  width);
        rect.setAttribute('height', height);
        rect.setAttribute('fill',   this.state.get('offDimColor'));
        rect.setAttribute('class',  'dim-fadeout');
        this._setOpacity(rect, startOpacity);
        rect.style.pointerEvents = 'none';
        this.svg.appendChild(rect);
        this._animateOpacity(rect, startOpacity, 0, this.state.get('animOffDimDuration'), this._getEase('close'), () => rect.remove());
    }

    // Set both SVG attribute and CSS style so we render regardless of which the browser honors
    _setOpacity(el, value) {
        const v = String(value);
        el.setAttribute('opacity', v);
        el.style.opacity = v;
    }

    _animateOpacity(el, from, to, duration, easeFn, onDone) {
        const start = performance.now();
        const delta = to - from;
        const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            this._setOpacity(el, from + delta * easeFn(t));
            if (t < 1) {
                requestAnimationFrame(tick);
            } else if (onDone) {
                onDone();
            }
        };
        requestAnimationFrame(tick);
    }

    updateRotation() {
        if (!this.sliceGroup) return;
        const rotation = this.state.get('rotation');
        this.sliceGroup.style.transform = `translateZ(0) rotate(${rotation}deg)`;
    }

    getGrayColor(grayPercent) {
        const value = Math.round((grayPercent / 100) * 255);
        const hex = value.toString(16).padStart(2, '0');
        return `#${hex}${hex}${hex}`;
    }

    getPressNarrowFactor() {
        return 1 - (this.state.get('pressShrink') / 100);
    }

    pressSlice(index) {
        const slice = this.sliceElements.get(index);
        if (slice) {
            const activationSpeed = this.state.get('notchActivationSpeed');
            // ease-out (fast start, slow end) — snappy press response
            const pressEase = 'cubic-bezier(0.16, 1, 0.3, 1)';
            slice.style.transition = `d ${activationSpeed}ms ${pressEase}`;
            // Mutate the slice's gradient inner stop — CSS transition on stop-color (see styles.css)
            // smoothly fades the gradient in.
            const stop = this._getSliceInnerStop(index);
            if (stop) {
                stop.style.transition = `stop-color ${activationSpeed}ms ${pressEase}`;
                stop.setAttribute('stop-color', this.state.get('keyPressedColor'));
            }
        }

        const pathGen = this.pathGenerators.get(index);
        if (slice && pathGen) {
            slice.setAttribute('d', pathGen(this.getPressNarrowFactor()));
        }
    }

    releaseSlice(index) {
        // Don't release if locked
        if (this.lockedSlices.has(index)) {
            return;
        }

        const slice = this.sliceElements.get(index);
        const pathGen = this.pathGenerators.get(index);
        if (slice && pathGen) {
            const deactivationSpeed = this.state.get('notchDeactivationSpeed');
            slice.style.transition = `d ${deactivationSpeed}ms ease-out`;
            slice.setAttribute('d', pathGen(1));
            // Fade the inner stop back to keyColor (gradient becomes flat again)
            const stop = this._getSliceInnerStop(index);
            if (stop) {
                stop.style.transition = `stop-color ${deactivationSpeed}ms ease-out`;
                stop.setAttribute('stop-color', this.state.get('keyColor'));
            }
        }
    }

    _getSliceInnerStop(index) {
        const grad = this.svg?.querySelector(`#sliceGrad-${index}`);
        return grad?.querySelector('.slice-grad-inner');
    }

    lockSlice(index) {
        this.lockedSlices.add(index);
        // Slice stays in pressed state

        // Add visual feedback pulse
        this.pulseLockFeedback(index);
    }

    pulseLockFeedback(index) {
        const slice = this.sliceElements.get(index);
        const pathGen = this.pathGenerators.get(index);
        if (!slice || !pathGen) return;

        // Pulse by flashing the inner stop's stop-color between pressed and white.
        const pressedColor = this.state.get('keyPressedColor');
        const pulseColor = '#ffffff';
        const stop = this._getSliceInnerStop(index);
        if (stop) {
            stop.animate([
                { stopColor: pressedColor },
                { stopColor: pulseColor,   offset: 0.25 },
                { stopColor: pressedColor, offset: 0.5  },
                { stopColor: pulseColor,   offset: 0.75 },
                { stopColor: pressedColor }
            ], { duration: 600, easing: 'ease-in-out' });
        }

        const narrowFactor = this.getPressNarrowFactor();
        const pulseFactor  = narrowFactor * 0.92;
        slice.animate([
            { d: pathGen(narrowFactor) },
            { d: pathGen(pulseFactor),   offset: 0.25 },
            { d: pathGen(narrowFactor),  offset: 0.5  },
            { d: pathGen(pulseFactor),   offset: 0.75 },
            { d: pathGen(narrowFactor) }
        ], { duration: 600, easing: 'ease-in-out' });
    }

    unlockSlice(index) {
        this.lockedSlices.delete(index);
        // Now release the visual
        this.releaseSlice(index);
    }

    isSliceLocked(index) {
        return this.lockedSlices.has(index);
    }

    clearAllLockedSlices() {
        this.lockedSlices.forEach(index => {
            this.releaseSlice(index);
        });
        this.lockedSlices.clear();
    }

    getSliceElement(index) {
        return this.sliceElements.get(index);
    }

    getInnerCircleData() {
        const center = this.geometry.calculateCenter();
        const innerRadius = this._getExpandedHubRadius();
        const gripRingRadius = Math.max(0, innerRadius - this.state.get('grabberWidth') * this.getUIScale());
        return { center, innerRadius, gripRingRadius };
    }

    activateGripper() {
        if (this.sliceGroup && this.gripRingBaseRadii) {
            this.sliceGroup.classList.add('gripper-active');

            // Get state values for animation
            const notchBrightnessBoost = this.state.get('notchBrightnessBoost');
            const notchGrowthFactor = this.state.get('notchGrowthFactor');

            // Brighten and scale the grip ticks using CSS transforms
            const gripTicks = this.sliceGroup.querySelectorAll('.grip-tick');
            gripTicks.forEach(tick => {
                const currentOpacity = parseFloat(tick.getAttribute('opacity'));
                tick.setAttribute('opacity', Math.min(1, currentOpacity * notchBrightnessBoost));

                // Apply scale transform (CSS transition will animate it smoothly)
                tick.style.transform = `scale(${notchGrowthFactor})`;
            });
        }
    }

    deactivateGripper() {
        if (this.sliceGroup && this.gripRingBaseRadii) {
            this.sliceGroup.classList.remove('gripper-active');

            // Reset grip ticks to original scale and opacity
            const gripOpacity = this.state.get('gripOpacity');
            const gripTicks = this.sliceGroup.querySelectorAll('.grip-tick');
            gripTicks.forEach(tick => {
                tick.setAttribute('opacity', gripOpacity / 100);
                tick.style.transform = 'scale(1)';
            });
        }
    }
}

// ============================================
// INTERACTION MANAGER
// ============================================
class InteractionManager {
    constructor(svgElement, stateManager, geometryEngine, renderEngine, audioEngine) {
        this.svg = svgElement;
        this.state = stateManager;
        this.geometry = geometryEngine;
        this.renderer = renderEngine;
        this.audio = audioEngine;

        this.dragState = {
            isDragging: false,
            isRotating: false,
            isPinching: false,
            pressedSlices: new Set(),
            lastAngle: 0,
            lastRotationSlice: null,
            wasInGripperZone: false,
            startedFromSlice: false,
            lastTouchedSlice: null,
            lastPinchDistance: 0,
            pinchInitialDistance: 0,
            pinchAnchorN: 0,
            pinchMidpointAngle: 0,
            pinchF: 0,
            // Rotation inertia tracking — deg/ms, smoothed via EMA in handleRotation
            rotationVelocity: 0,
            lastRotationTime: 0,
            inertiaRAF: null,
        };

        this.controls = null;

        // Cached SVG bounding rect — invalidated on resize/scroll. Avoids forced layout
        // on every mousemove/touchmove (called via getSVGCoordinates).
        this._svgRect = null;
        const invalidateRect = () => { this._svgRect = null; };
        window.addEventListener('resize', invalidateRect);
        window.addEventListener('scroll', invalidateRect, { passive: true });

        this.setupEventListeners();
    }

    _getSVGRect() {
        if (!this._svgRect) this._svgRect = this.svg.getBoundingClientRect();
        return this._svgRect;
    }

    setupEventListeners() {
        // Slice interactions
        this.svg.addEventListener('mousedown', (e) => this.handleStart(e));
        this.svg.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });

        // Global movement and release
        document.addEventListener('mousemove', (e) => this.handleMove(e));
        document.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        document.addEventListener('mouseup', () => this.handleEnd());
        document.addEventListener('touchend', () => this.handleEnd());
        document.addEventListener('touchcancel', () => this.handleEnd());

        // Keyboard support
        this.svg.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    getSVGCoordinates(clientX, clientY) {
        const rect = this._getSVGRect();
        const viewBox = this.svg.viewBox.baseVal;
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    handleStart(e) {
        // Don't intercept taps on UI controls — let their native click handlers fire.
        // Calling preventDefault() on touchstart of these would suppress the synthetic click on iOS.
        if (e.target.closest('.audio-toggle, .power-button, .acc-toggle, .scale-toggle, .key-picker-note')) return;

        // Any new touch interrupts inertia spin and resets velocity tracking
        this._stopInertia();
        this.dragState.rotationVelocity = 0;
        this.dragState.lastRotationTime = performance.now();

        // Prevent default touch behavior (iOS requirement)
        e.preventDefault();

        // Check if tapping a locked slice to unlock it
        if (e.target.classList.contains('slice')) {
            const index = parseInt(e.target.getAttribute('data-slice'));
            if (this.audio.isLocked(index)) {
                this.audio.unlockDrone(index);
                this.renderer.unlockSlice(index);
                e.preventDefault();
                return; // Don't start new interaction
            }
        }

        // Multi-touch: pinch wins ONLY if at least one finger is in the gripper ring.
        // Otherwise the touches fall through to slice presses (multi-note play).
        if (e.touches && e.touches.length >= 2 && this.audio?.enabled) {
            const innerCircleData = this.renderer.getInnerCircleData();
            let anyInGripper = false;
            for (let i = 0; i < e.touches.length; i++) {
                const c = this.getSVGCoordinates(e.touches[i].clientX, e.touches[i].clientY);
                if (this.geometry.isInDraggableRing(c.x, c.y, innerCircleData.center, innerCircleData.innerRadius, innerCircleData.gripRingRadius)) {
                    anyInGripper = true;
                    break;
                }
            }
            if (anyInGripper) {
                if (!this.dragState.isPinching) {
                    this.startPinch(e.touches[0], e.touches[1]);
                }
                e.preventDefault();
                return;
            }
            // Both fingers on slices → fall through, let each touch press its slice
        }

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const { x, y } = this.getSVGCoordinates(clientX, clientY);

        const innerCircleData = this.renderer.getInnerCircleData();
        const isInnerCircle = e.target.id === 'innerRotationPlate';
        const inDraggableRing = this.geometry.isInDraggableRing(x, y, innerCircleData.center, innerCircleData.innerRadius, innerCircleData.gripRingRadius);

        if (isInnerCircle && inDraggableRing) {
            this.startRotation(x, y, innerCircleData);
            e.preventDefault();
        } else if (e.target.classList.contains('slice')) {
            this.startSliceDrag(e.target);
        }
    }

    attachControls(controlsManager) {
        this.controls = controlsManager;
    }

    startPinch(touch1, touch2) {
        this.dragState.isPinching = true;
        this.dragState.pinchInitialDistance = this.getTouchDistance(touch1, touch2);
        this.dragState.pinchAnchorN = this.state.get('sliceCount');

        // Midpoint in SVG space → screen angle from wheel center → fractional slice position
        const c1 = this.getSVGCoordinates(touch1.clientX, touch1.clientY);
        const c2 = this.getSVGCoordinates(touch2.clientX, touch2.clientY);
        const midX = (c1.x + c2.x) / 2;
        const midY = (c1.y + c2.y) / 2;
        const center = this.geometry.calculateCenter();
        let midAngle = Math.atan2(midY - center.y, midX - center.x) * 180 / Math.PI;
        midAngle = (midAngle + 360) % 360;
        this.dragState.pinchMidpointAngle = midAngle;

        const rotation = this.state.get('rotation');
        const wheelAngle = (midAngle - rotation + 360) % 360;
        const oldAps = 360 / this.dragState.pinchAnchorN;
        this.dragState.pinchF = wheelAngle / oldAps;

        // Pinch wins — cancel any in-progress note presses
        this.dragState.pressedSlices.forEach(slice => {
            const idx = parseInt(slice.getAttribute('data-slice'));
            if (!this.audio.isLocked(idx)) {
                this.renderer.releaseSlice(idx);
                this.audio.stopNote(idx);
            }
        });
        this.dragState.pressedSlices.clear();
        if (this.dragState.lastTouchedSlice) {
            const idx = parseInt(this.dragState.lastTouchedSlice.getAttribute('data-slice'));
            if (!this.audio.isLocked(idx)) {
                this.renderer.releaseSlice(idx);
                this.audio.stopNote(idx);
            }
            this.dragState.lastTouchedSlice = null;
        }
        this.dragState.isDragging = false;
    }

    startRotation(x, y, innerCircleData) {
        this.dragState.isRotating = true;
        this.dragState.wasInGripperZone = true;
        this.dragState.startedFromSlice = false;
        this.dragState.lastAngle = this.geometry.getAngleFromPoint(x, y, innerCircleData.center);
        this._stopInertia();
        this.dragState.rotationVelocity = 0;
        this.dragState.lastRotationTime = performance.now();
        this._beginRotationFollow();

        const innerCircle = document.getElementById('innerRotationPlate');
        if (innerCircle) innerCircle.style.cursor = 'grabbing';

        // Activate gripper animation
        this.renderer.activateGripper();
    }

    // Smooth-follow loop: the displayed rotation chases targetRotation each frame.
    // Gives the wheel a slight lag under the fingertip (sense of mass).
    _beginRotationFollow() {
        this.dragState.targetRotation = this.state.get('rotation');
        if (this.dragState.followRAF) cancelAnimationFrame(this.dragState.followRAF);
        const alphaPerFrame = 0.2;   // catch-up fraction per ~16ms frame (1.0 = no lag)
        let last = performance.now();
        const tick = (now) => {
            if (!this.dragState.isRotating) {
                this.dragState.followRAF = null;
                return;
            }
            const dt = Math.max(1, now - last);
            last = now;
            const factor = 1 - Math.pow(1 - alphaPerFrame, dt / 16);
            const cur = this.state.get('rotation');
            let delta = this.dragState.targetRotation - cur;
            if (delta > 180)  delta -= 360;
            if (delta < -180) delta += 360;
            const newRot = (cur + delta * factor + 360) % 360;
            const visualDelta = newRot - cur;
            // Track WHEEL velocity (not finger) so inertia carries on smoothly
            const instantV = visualDelta / dt;
            this.dragState.rotationVelocity = this.dragState.rotationVelocity * 0.6 + instantV * 0.4;
            this.dragState.lastRotationTime = now;
            this.state.set('rotation', newRot);
            this.dragState.followRAF = requestAnimationFrame(tick);
        };
        this.dragState.followRAF = requestAnimationFrame(tick);
    }

    _stopInertia() {
        if (this.dragState.inertiaRAF) {
            cancelAnimationFrame(this.dragState.inertiaRAF);
            this.dragState.inertiaRAF = null;
        }
    }

    _startInertia() {
        const friction = 0.8;           // velocity multiplier per frame
        const stopThreshold = 0.005;    // deg/ms ≈ 0.3 deg/s — when slower, stop
        let last = performance.now();
        const tick = (now) => {
            const dt = now - last;
            last = now;
            const v = this.dragState.rotationVelocity;
            if (Math.abs(v) < stopThreshold) {
                this.dragState.rotationVelocity = 0;
                this.dragState.inertiaRAF = null;
                return;
            }
            const rot = (this.state.get('rotation') + v * dt + 360) % 360;
            this.state.set('rotation', rot);
            // Frame-rate independent decay: friction is "per ~16ms frame"
            this.dragState.rotationVelocity *= Math.pow(friction, dt / 16);
            this.dragState.inertiaRAF = requestAnimationFrame(tick);
        };
        this.dragState.inertiaRAF = requestAnimationFrame(tick);
    }

    startSliceDrag(sliceElement) {
        this.dragState.isDragging = true;
        this.dragState.startedFromSlice = true;
        const index = parseInt(sliceElement.getAttribute('data-slice'));
        this.activateSlice(index);
    }

    handleMove(e) {
        // Handle pinch gesture
        if (this.dragState.isPinching && e.touches && e.touches.length >= 2) {
            this.handlePinch(e.touches[0], e.touches[1]);
            e.preventDefault();
            return;
        }

        // If we were pinching but now have less than 2 touches, reset pinch state
        // and transition to appropriate single-touch interaction
        if (this.dragState.isPinching && e.touches && e.touches.length < 2) {
            if (this._pinchRAF) { cancelAnimationFrame(this._pinchRAF); this._pinchRAF = null; }
            if (this.controls) this.controls.commitWidthScale();
            this.dragState.isPinching = false;
            this.dragState.lastPinchDistance = 0;
            this.dragState.pinchInitialDistance = 0;

            // Determine what the remaining touch is over and set up appropriate state
            const clientX = e.touches[0].clientX;
            const clientY = e.touches[0].clientY;
            const { x, y } = this.getSVGCoordinates(clientX, clientY);
            const innerCircleData = this.renderer.getInnerCircleData();
            const inGripperZone = this.geometry.isInDraggableRing(x, y, innerCircleData.center, innerCircleData.innerRadius, innerCircleData.gripRingRadius);

            if (inGripperZone) {
                // Start rotation from gripper
                this.dragState.isRotating = true;
                this.dragState.wasInGripperZone = true;
                this.dragState.lastAngle = this.geometry.getAngleFromPoint(x, y, innerCircleData.center);
                this.dragState.rotationVelocity = 0;
                this.dragState.lastRotationTime = performance.now();
                this._beginRotationFollow();
                const innerCircle = document.getElementById('innerRotationPlate');
                if (innerCircle) innerCircle.style.cursor = 'grabbing';
                this.renderer.activateGripper();
            } else {
                // Check if over a slice and start dragging
                const element = document.elementFromPoint(clientX, clientY);
                if (element && element.classList && element.classList.contains('slice')) {
                    this.dragState.isDragging = true;
                    this.dragState.startedFromSlice = true;
                    const index = parseInt(element.getAttribute('data-slice'));
                    this.activateSlice(index);
                } else {
                    // Not over anything specific, just mark as dragging to allow movement
                    this.dragState.isDragging = true;
                }
            }
        }

        if (!this.dragState.isDragging && !this.dragState.isRotating) return;

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const { x, y } = this.getSVGCoordinates(clientX, clientY);

        const innerCircleData = this.renderer.getInnerCircleData();
        const inGripperZone = this.geometry.isInDraggableRing(x, y, innerCircleData.center, innerCircleData.innerRadius, innerCircleData.gripRingRadius);

        // Transition to rotation mode if entering gripper zone
        if (inGripperZone && !this.dragState.wasInGripperZone) {
            // Release any currently touched slice when transitioning to rotation
            if (this.dragState.lastTouchedSlice) {
                const lastIndex = parseInt(this.dragState.lastTouchedSlice.getAttribute('data-slice'));
                this.deactivateSlice(lastIndex);
                this.dragState.lastTouchedSlice = null;
            }

            this.dragState.isRotating = true;
            this.dragState.wasInGripperZone = true;
            this.dragState.lastAngle = this.geometry.getAngleFromPoint(x, y, innerCircleData.center);
            this.dragState.rotationVelocity = 0;
            this.dragState.lastRotationTime = performance.now();
            this._beginRotationFollow();
            const innerCircle = document.getElementById('innerRotationPlate');
            if (innerCircle) innerCircle.style.cursor = 'grabbing';
            this.renderer.activateGripper();
        }

        if (this.dragState.isRotating) {
            this.handleRotation(x, y, innerCircleData);
        } else if (this.dragState.isDragging) {
            this.handleSliceDrag(clientX, clientY);
        }

        e.preventDefault();
    }

    handlePinch(touch1, touch2) {
        if (!this.controls) return;
        const currentDistance = this.getTouchDistance(touch1, touch2);
        if (this.dragState.pinchInitialDistance <= 0) return;
        const W = currentDistance / this.dragState.pinchInitialDistance;
        // Cache latest W and schedule a single render per animation frame.
        this._pendingPinchW = W;
        if (this._pinchRAF) return;
        this._pinchRAF = requestAnimationFrame(() => {
            this._pinchRAF = null;
            const w = this._pendingPinchW;
            this.controls.applyWidthScale(w, this.dragState.pinchAnchorN, {
                rotationAnchor: {
                    midpointAngle: this.dragState.pinchMidpointAngle,
                    f: this.dragState.pinchF,
                },
                syncSlider: true,
            });
        });
    }

    handleRotation(x, y, innerCircleData) {
        const currentAngle = this.geometry.getAngleFromPoint(x, y, innerCircleData.center);
        let angleDiff = currentAngle - this.dragState.lastAngle;

        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;

        // Update the TARGET rotation. The follow loop in _beginRotationFollow lerps
        // the displayed rotation toward this target each animation frame.
        this.dragState.targetRotation = (this.dragState.targetRotation + angleDiff + 360) % 360;
        this.dragState.lastAngle = currentAngle;

        if (this.dragState.startedFromSlice) {
            this.activateSliceAtPosition(x, y, innerCircleData);
        }
    }

    handleSliceDrag(clientX, clientY) {
        const element = document.elementFromPoint(clientX, clientY);

        if (this.dragState.lastTouchedSlice && this.dragState.lastTouchedSlice !== element) {
            const lastIndex = parseInt(this.dragState.lastTouchedSlice.getAttribute('data-slice'));
            this.deactivateSlice(lastIndex);
            this.dragState.lastTouchedSlice = null;
        }

        if (element && element.classList && element.classList.contains('slice')) {
            const index = parseInt(element.getAttribute('data-slice'));

            // Skip locked slices during drag
            if (this.audio.isLocked(index)) {
                return;
            }

            if (element !== this.dragState.lastTouchedSlice) {
                this.activateSlice(index);
                this.dragState.lastTouchedSlice = element;
            }
        }
    }

    activateSliceAtPosition(x, y, innerCircleData) {
        const sliceIndex = this.geometry.getSliceIndexAtPoint(x, y, innerCircleData.center, this.state.get('sliceCount'));

        if (this.dragState.lastRotationSlice !== null && this.dragState.lastRotationSlice !== sliceIndex) {
            this.deactivateSlice(this.dragState.lastRotationSlice);
        }

        if (sliceIndex !== this.dragState.lastRotationSlice) {
            this.activateSlice(sliceIndex);
            this.dragState.lastRotationSlice = sliceIndex;
        }
    }

    async activateSlice(index) {
        // Skip if this slice is locked
        if (this.audio.isLocked(index)) {
            return;
        }

        this.renderer.pressSlice(index);
        const sliceElement = this.renderer.getSliceElement(index);
        if (sliceElement) {
            this.dragState.pressedSlices.add(sliceElement);
        }

        // Pass callback to handle auto-lock visual update
        // IMPORTANT: Await playNote to prevent race conditions on iOS
        await this.audio.playNote(index, (lockedIndex) => {
            this.renderer.lockSlice(lockedIndex);
        });
    }

    deactivateSlice(index) {
        this.renderer.releaseSlice(index);
        const sliceElement = this.renderer.getSliceElement(index);
        if (sliceElement) {
            this.dragState.pressedSlices.delete(sliceElement);
        }
        this.audio.stopNote(index);
    }

    handleEnd() {
        // DEFENSIVE CLEANUP: Always clean up, even if drag state seems wrong
        // This prevents stuck notes if touch events fire out of order on iOS

        // Release all pressed slices (unless they're already locked by auto-lock)
        this.dragState.pressedSlices.forEach(slice => {
            const index = parseInt(slice.getAttribute('data-slice'));
            // Only release if not already locked
            if (!this.audio.isLocked(index)) {
                this.renderer.releaseSlice(index);
                this.audio.stopNote(index);
            }
        });

        // Release last rotation slice if any
        if (this.dragState.lastRotationSlice !== null) {
            if (!this.audio.isLocked(this.dragState.lastRotationSlice)) {
                this.renderer.releaseSlice(this.dragState.lastRotationSlice);
                this.audio.stopNote(this.dragState.lastRotationSlice);
            }
        }

        // Release last touched slice if any
        if (this.dragState.lastTouchedSlice) {
            const index = parseInt(this.dragState.lastTouchedSlice.getAttribute('data-slice'));
            if (!this.audio.isLocked(index)) {
                this.renderer.releaseSlice(index);
                this.audio.stopNote(index);
            }
        }

        // Deactivate gripper animation + start inertia if rotating
        if (this.dragState.isRotating) {
            this.renderer.deactivateGripper();
            if (Math.abs(this.dragState.rotationVelocity) > 0.02) {
                this._startInertia();
            }
        }

        // Commit any in-progress pinch before resetting state
        if (this.dragState.isPinching) {
            if (this._pinchRAF) { cancelAnimationFrame(this._pinchRAF); this._pinchRAF = null; }
            if (this.controls) this.controls.commitWidthScale();
        }

        // ALWAYS reset drag state to prevent stuck interactions
        this.dragState.isDragging = false;
        this.dragState.isRotating = false;
        this.dragState.isPinching = false;
        this.dragState.wasInGripperZone = false;
        this.dragState.startedFromSlice = false;
        this.dragState.lastRotationSlice = null;
        this.dragState.lastTouchedSlice = null;
        this.dragState.lastPinchDistance = 0;
        this.dragState.pinchInitialDistance = 0;
        this.dragState.pressedSlices.clear();

        const innerCircle = document.getElementById('innerRotationPlate');
        if (innerCircle) innerCircle.style.cursor = 'grab';
    }

    handleKeyboard(e) {
        if (e.target.classList.contains('slice') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            const index = parseInt(e.target.getAttribute('data-slice'));
            this.activateSlice(index);
            setTimeout(() => this.deactivateSlice(index), 350);
        }
    }
}

// ============================================
// CONTROLS MANAGER
// ============================================
class ControlsManager {
    constructor(stateManager, renderEngine) {
        this.state = stateManager;
        this.renderer = renderEngine;
        this.elements = this.getElements();
        this.setupEventListeners();
        this.syncUIWithState();
        this.updateAnimationSpeed(); // Initialize CSS variables for animation speeds
    }

    getElements() {
        return {
            toggleBtn: document.getElementById('toggleBtn'),
            modalBackdrop: document.getElementById('modalBackdrop'),
            sliceCount: document.getElementById('sliceCount'),
            sliceDecBtn: document.getElementById('sliceDecBtn'),
            sliceIncBtn: document.getElementById('sliceIncBtn'),
            sliceWidthSlider: document.getElementById('sliceWidthSlider'),
            sliceWidthValue:  document.getElementById('sliceWidthValue'),
            bgGraySlider: document.getElementById('bgGraySlider'),
            bgGrayValue: document.getElementById('bgGrayValue'),
            anchorBtns: document.querySelectorAll('.anchor-btn'),
            radiusSlider: document.getElementById('radiusSlider'),
            radiusValue: document.getElementById('radiusValue'),
            rotationSlider: document.getElementById('rotationSlider'),
            rotationValue: document.getElementById('rotationValue'),
            gapSizeSlider: document.getElementById('gapSizeSlider'),
            gapSizeValue: document.getElementById('gapSizeValue'),
            innerCircleSizeSlider: document.getElementById('innerCircleSizeSlider'),
            innerCircleSizeValue: document.getElementById('innerCircleSizeValue'),
            grabberWidthSlider: document.getElementById('grabberWidthSlider'),
            grabberWidthValue: document.getElementById('grabberWidthValue'),
            uiScaleSlider: document.getElementById('uiScaleSlider'),
            uiScaleValue: document.getElementById('uiScaleValue'),
            uiScaleMaxSlider: document.getElementById('uiScaleMaxSlider'),
            uiScaleMaxValue: document.getElementById('uiScaleMaxValue'),
            // Hub circle
            keyLabelXSlider:          document.getElementById('keyLabelXSlider'),
            keyLabelXValue:           document.getElementById('keyLabelXValue'),
            keyLabelYSlider:          document.getElementById('keyLabelYSlider'),
            keyLabelYValue:           document.getElementById('keyLabelYValue'),
            keyLabelPickerXSlider:    document.getElementById('keyLabelPickerXSlider'),
            keyLabelPickerXValue:     document.getElementById('keyLabelPickerXValue'),
            keyLabelPickerYSlider:    document.getElementById('keyLabelPickerYSlider'),
            keyLabelPickerYValue:     document.getElementById('keyLabelPickerYValue'),
            keyLabelOpOffSlider:      document.getElementById('keyLabelOpOffSlider'),
            keyLabelOpOffValue:       document.getElementById('keyLabelOpOffValue'),
            keyLabelOpOnSlider:       document.getElementById('keyLabelOpOnSlider'),
            keyLabelOpOnValue:        document.getElementById('keyLabelOpOnValue'),
            keyLabelOpPickerSlider:   document.getElementById('keyLabelOpPickerSlider'),
            keyLabelOpPickerValue:    document.getElementById('keyLabelOpPickerValue'),
            keyModFontSizeSlider:     document.getElementById('keyModFontSizeSlider'),
            keyModFontSizeValue:      document.getElementById('keyModFontSizeValue'),
            keyModFontWeight:         document.getElementById('keyModFontWeight'),
            keyModOffsetXSlider:      document.getElementById('keyModOffsetXSlider'),
            keyModOffsetXValue:       document.getElementById('keyModOffsetXValue'),
            keyAccOffsetYSlider:      document.getElementById('keyAccOffsetYSlider'),
            keyAccOffsetYValue:       document.getElementById('keyAccOffsetYValue'),
            keyMinorOffsetYSlider:    document.getElementById('keyMinorOffsetYSlider'),
            keyMinorOffsetYValue:     document.getElementById('keyMinorOffsetYValue'),
            keySubLabelYSlider:       document.getElementById('keySubLabelYSlider'),
            keySubLabelYValue:        document.getElementById('keySubLabelYValue'),
            keySubOpOffSlider:        document.getElementById('keySubOpOffSlider'),
            keySubOpOffValue:         document.getElementById('keySubOpOffValue'),
            keySubOpOnSlider:         document.getElementById('keySubOpOnSlider'),
            keySubOpOnValue:          document.getElementById('keySubOpOnValue'),
            keySubOpPickerSlider:     document.getElementById('keySubOpPickerSlider'),
            keySubOpPickerValue:      document.getElementById('keySubOpPickerValue'),
            pickerRadiusSlider:       document.getElementById('pickerRadiusSlider'),
            pickerRadiusValue:        document.getElementById('pickerRadiusValue'),
            pickerSpacingSlider:      document.getElementById('pickerSpacingSlider'),
            pickerSpacingValue:       document.getElementById('pickerSpacingValue'),
            pickerFontSizeSlider:     document.getElementById('pickerFontSizeSlider'),
            pickerFontSizeValue:      document.getElementById('pickerFontSizeValue'),
            toggleXSlider:            document.getElementById('toggleXSlider'),
            toggleXValue:             document.getElementById('toggleXValue'),
            toggleSpacingSlider:      document.getElementById('toggleSpacingSlider'),
            toggleSpacingValue:       document.getElementById('toggleSpacingValue'),
            togglePillRSlider:        document.getElementById('togglePillRSlider'),
            togglePillRValue:         document.getElementById('togglePillRValue'),
            toggleFillColor:          document.getElementById('toggleFillColor'),
            toggleTextColorInput:     document.getElementById('toggleTextColorInput'),
            toggleFillOpacitySlider:  document.getElementById('toggleFillOpacitySlider'),
            toggleFillOpacityValue:   document.getElementById('toggleFillOpacityValue'),
            accFontSizeSlider:        document.getElementById('accFontSizeSlider'),
            accFontSizeValue:         document.getElementById('accFontSizeValue'),
            scaleFontSizeSlider:      document.getElementById('scaleFontSizeSlider'),
            scaleFontSizeValue:       document.getElementById('scaleFontSizeValue'),
            keyFontFamily:            document.getElementById('keyFontFamily'),
            keyLabelFontWeight:       document.getElementById('keyLabelFontWeight'),
            keySubLabelFontSizeSlider:document.getElementById('keySubLabelFontSizeSlider'),
            keySubLabelFontSizeValue: document.getElementById('keySubLabelFontSizeValue'),
            keySubLabelFontWeight:    document.getElementById('keySubLabelFontWeight'),
            pickerFontWeight:         document.getElementById('pickerFontWeight'),
            accFontWeight:            document.getElementById('accFontWeight'),
            scaleFontWeight:          document.getElementById('scaleFontWeight'),
            hubOpenColor:             document.getElementById('hubOpenColor'),
            pickerDimColor:           document.getElementById('pickerDimColor'),
            pickerDimOpacitySlider:   document.getElementById('pickerDimOpacitySlider'),
            pickerDimOpacityValue:    document.getElementById('pickerDimOpacityValue'),
            offDimColor:              document.getElementById('offDimColor'),
            offDimOpacitySlider:      document.getElementById('offDimOpacitySlider'),
            offDimOpacityValue:       document.getElementById('offDimOpacityValue'),
            // Animation — open
            animOpenEasing:              document.getElementById('animOpenEasing'),
            animOpenDurationSlider:      document.getElementById('animOpenDurationSlider'),
            animOpenDurationValue:       document.getElementById('animOpenDurationValue'),
            animOpenStaggerSlider:       document.getElementById('animOpenStaggerSlider'),
            animOpenStaggerValue:        document.getElementById('animOpenStaggerValue'),
            animOpenPillDelaySlider:     document.getElementById('animOpenPillDelaySlider'),
            animOpenPillDelayValue:      document.getElementById('animOpenPillDelayValue'),
            // Animation — close
            animCloseEasing:             document.getElementById('animCloseEasing'),
            animCloseDurationSlider:     document.getElementById('animCloseDurationSlider'),
            animCloseDurationValue:      document.getElementById('animCloseDurationValue'),
            animCloseStaggerSlider:      document.getElementById('animCloseStaggerSlider'),
            animCloseStaggerValue:       document.getElementById('animCloseStaggerValue'),
            animClosePillDelaySlider:    document.getElementById('animClosePillDelaySlider'),
            animClosePillDelayValue:     document.getElementById('animClosePillDelayValue'),
            // Animation — off-dim
            animOffDimDurationSlider:    document.getElementById('animOffDimDurationSlider'),
            animOffDimDurationValue:     document.getElementById('animOffDimDurationValue'),
            // Animation — letter blink (picker note select)
            animBlinkDurationSlider:     document.getElementById('animBlinkDurationSlider'),
            animBlinkDurationValue:      document.getElementById('animBlinkDurationValue'),
            animBlinkScaleSlider:        document.getElementById('animBlinkScaleSlider'),
            animBlinkScaleValue:         document.getElementById('animBlinkScaleValue'),
            // Press states
            pressInDurationSlider:       document.getElementById('pressInDurationSlider'),
            pressInDurationValue:        document.getElementById('pressInDurationValue'),
            pressOutDurationSlider:      document.getElementById('pressOutDurationSlider'),
            pressOutDurationValue:       document.getElementById('pressOutDurationValue'),
            pressHubScaleSlider:         document.getElementById('pressHubScaleSlider'),
            pressHubScaleValue:          document.getElementById('pressHubScaleValue'),
            pressHubFill:                document.getElementById('pressHubFill'),
            pressPillScaleSlider:        document.getElementById('pressPillScaleSlider'),
            pressPillScaleValue:         document.getElementById('pressPillScaleValue'),
            pressPillFill:               document.getElementById('pressPillFill'),
            pressPowerScaleSlider:       document.getElementById('pressPowerScaleSlider'),
            pressPowerScaleValue:        document.getElementById('pressPowerScaleValue'),
            pressPowerFill:              document.getElementById('pressPowerFill'),
            pressPowerC2Fill:            document.getElementById('pressPowerC2Fill'),
            pressLetterScaleSlider:      document.getElementById('pressLetterScaleSlider'),
            pressLetterScaleValue:       document.getElementById('pressLetterScaleValue'),
            pressLetterFill:             document.getElementById('pressLetterFill'),
            keyLabelFontSizeSlider: document.getElementById('keyLabelFontSizeSlider'),
            keyLabelFontSizeValue: document.getElementById('keyLabelFontSizeValue'),
            keyLabelColor: document.getElementById('keyLabelColor'),
            // Hub Circle typography mirrors (same state keys, different panel elements)
            hubKeyFontSizeSlider: document.getElementById('hubKeyFontSizeSlider'),
            hubKeyFontSizeValue:  document.getElementById('hubKeyFontSizeValue'),
            hubKeyLabelColor:     document.getElementById('hubKeyLabelColor'),
            sectionHeaders: document.querySelectorAll('.section-header'),
            gripThicknessSlider: document.getElementById('gripThicknessSlider'),
            gripThicknessValue: document.getElementById('gripThicknessValue'),
            ticksPerEdgeSlider: document.getElementById('ticksPerEdgeSlider'),
            ticksPerEdgeValue: document.getElementById('ticksPerEdgeValue'),
            gripOpacitySlider: document.getElementById('gripOpacitySlider'),
            gripOpacityValue: document.getElementById('gripOpacityValue'),
            gripInsetSlider: document.getElementById('gripInsetSlider'),
            gripInsetValue: document.getElementById('gripInsetValue'),
            pressShrinkSlider: document.getElementById('pressShrinkSlider'),
            pressShrinkValue: document.getElementById('pressShrinkValue'),
            // Experimental controls
            rootOctaveSlider:   document.getElementById('rootOctaveSlider'),
            rootOctaveValue:    document.getElementById('rootOctaveValue'),
            droneLockTimeSlider: document.getElementById('droneLockTimeSlider'),
            droneLockTimeValue: document.getElementById('droneLockTimeValue'),
            notchGrowthFactorSlider: document.getElementById('notchGrowthFactorSlider'),
            notchGrowthFactorValue: document.getElementById('notchGrowthFactorValue'),
            notchActivationSpeedSlider: document.getElementById('notchActivationSpeedSlider'),
            notchActivationSpeedValue: document.getElementById('notchActivationSpeedValue'),
            notchDeactivationSpeedSlider: document.getElementById('notchDeactivationSpeedSlider'),
            notchDeactivationSpeedValue: document.getElementById('notchDeactivationSpeedValue'),
            notchBrightnessBoostSlider: document.getElementById('notchBrightnessBoostSlider'),
            notchBrightnessBoostValue: document.getElementById('notchBrightnessBoostValue'),
            // Gradient controls
            keyColorInput:        document.getElementById('keyColorInput'),
            keyPressedColorInput: document.getElementById('keyPressedColorInput'),
            pressedGradType:          document.getElementById('pressedGradType'),
            pressedGradAngleSlider:   document.getElementById('pressedGradAngleSlider'),
            pressedGradAngleValue:    document.getElementById('pressedGradAngleValue'),
            pressedGradStop0Slider:   document.getElementById('pressedGradStop0Slider'),
            pressedGradStop0Value:    document.getElementById('pressedGradStop0Value'),
            pressedGradStop1Slider:   document.getElementById('pressedGradStop1Slider'),
            pressedGradStop1Value:    document.getElementById('pressedGradStop1Value'),
            // Note Marker controls
            noteMarkerSizeSlider: document.getElementById('noteMarkerSizeSlider'),
            noteMarkerSizeValue: document.getElementById('noteMarkerSizeValue'),
            noteMarkerColor: document.getElementById('noteMarkerColor'),
            noteMarkerOpacitySlider: document.getElementById('noteMarkerOpacitySlider'),
            noteMarkerOpacityValue: document.getElementById('noteMarkerOpacityValue'),
            noteMarkerPositionSlider: document.getElementById('noteMarkerPositionSlider'),
            noteMarkerPositionValue: document.getElementById('noteMarkerPositionValue'),
            // Slice opacity
            sliceOpacitySlider: document.getElementById('sliceOpacitySlider'),
            sliceOpacityValue: document.getElementById('sliceOpacityValue'),
            // Power button
            powerBtnSizeSlider:           document.getElementById('powerBtnSizeSlider'),
            powerBtnSizeValue:            document.getElementById('powerBtnSizeValue'),
            powerBtnPickerOpacitySlider:  document.getElementById('powerBtnPickerOpacitySlider'),
            powerBtnPickerOpacityValue:   document.getElementById('powerBtnPickerOpacityValue'),
            c1GradFrom:              document.getElementById('c1GradFrom'),
            c1GradTo:                document.getElementById('c1GradTo'),
            c1GradType:              document.getElementById('c1GradType'),
            c1GradAngleSlider:       document.getElementById('c1GradAngleSlider'),
            c1GradAngleValue:        document.getElementById('c1GradAngleValue'),
            c1GradFocalOffsetSlider: document.getElementById('c1GradFocalOffsetSlider'),
            c1GradFocalOffsetValue:  document.getElementById('c1GradFocalOffsetValue'),
            c1GradStop0Slider:       document.getElementById('c1GradStop0Slider'),
            c1GradStop0Value:        document.getElementById('c1GradStop0Value'),
            c1GradStop1Slider:       document.getElementById('c1GradStop1Slider'),
            c1GradStop1Value:        document.getElementById('c1GradStop1Value'),
            c1Stroke:                document.getElementById('c1Stroke'),
            c1StrokeWidthSlider:     document.getElementById('c1StrokeWidthSlider'),
            c1StrokeWidthValue:      document.getElementById('c1StrokeWidthValue'),
            c1DropColor:             document.getElementById('c1DropColor'),
            c1DropBlurSlider:        document.getElementById('c1DropBlurSlider'),
            c1DropBlurValue:         document.getElementById('c1DropBlurValue'),
            c1DropOpacitySlider:     document.getElementById('c1DropOpacitySlider'),
            c1DropOpacityValue:      document.getElementById('c1DropOpacityValue'),
            c1InnerColor:            document.getElementById('c1InnerColor'),
            c1InnerBlurSlider:       document.getElementById('c1InnerBlurSlider'),
            c1InnerBlurValue:        document.getElementById('c1InnerBlurValue'),
            c1InnerOpacitySlider:    document.getElementById('c1InnerOpacitySlider'),
            c1InnerOpacityValue:     document.getElementById('c1InnerOpacityValue'),
            c2GradFromOff:              document.getElementById('c2GradFromOff'),
            c2GradToOff:                document.getElementById('c2GradToOff'),
            c2GradTypeOff:              document.getElementById('c2GradTypeOff'),
            c2GradAngleOffSlider:       document.getElementById('c2GradAngleOffSlider'),
            c2GradAngleOffValue:        document.getElementById('c2GradAngleOffValue'),
            c2GradFocalOffsetOffSlider: document.getElementById('c2GradFocalOffsetOffSlider'),
            c2GradFocalOffsetOffValue:  document.getElementById('c2GradFocalOffsetOffValue'),
            c2GradStop0OffSlider:       document.getElementById('c2GradStop0OffSlider'),
            c2GradStop0OffValue:        document.getElementById('c2GradStop0OffValue'),
            c2GradStop1OffSlider:       document.getElementById('c2GradStop1OffSlider'),
            c2GradStop1OffValue:        document.getElementById('c2GradStop1OffValue'),
            c2GradFromOn:               document.getElementById('c2GradFromOn'),
            c2GradToOn:                 document.getElementById('c2GradToOn'),
            c2GradTypeOn:               document.getElementById('c2GradTypeOn'),
            c2GradAngleOnSlider:        document.getElementById('c2GradAngleOnSlider'),
            c2GradAngleOnValue:         document.getElementById('c2GradAngleOnValue'),
            c2GradFocalOffsetOnSlider:  document.getElementById('c2GradFocalOffsetOnSlider'),
            c2GradFocalOffsetOnValue:   document.getElementById('c2GradFocalOffsetOnValue'),
            c2GradStop0OnSlider:        document.getElementById('c2GradStop0OnSlider'),
            c2GradStop0OnValue:         document.getElementById('c2GradStop0OnValue'),
            c2GradStop1OnSlider:        document.getElementById('c2GradStop1OnSlider'),
            c2GradStop1OnValue:         document.getElementById('c2GradStop1OnValue'),
            c2Stroke:                document.getElementById('c2Stroke'),
            c2StrokeWidthSlider:     document.getElementById('c2StrokeWidthSlider'),
            c2StrokeWidthValue:      document.getElementById('c2StrokeWidthValue'),
            c2DropColor:             document.getElementById('c2DropColor'),
            c2DropBlurSlider:        document.getElementById('c2DropBlurSlider'),
            c2DropBlurValue:         document.getElementById('c2DropBlurValue'),
            c2DropOpacitySlider:     document.getElementById('c2DropOpacitySlider'),
            c2DropOpacityValue:      document.getElementById('c2DropOpacityValue'),
            c2InnerColor:            document.getElementById('c2InnerColor'),
            c2InnerBlurSlider:       document.getElementById('c2InnerBlurSlider'),
            c2InnerBlurValue:        document.getElementById('c2InnerBlurValue'),
            c2InnerOpacitySlider:    document.getElementById('c2InnerOpacitySlider'),
            c2InnerOpacityValue:     document.getElementById('c2InnerOpacityValue'),
            c2InnerDxSlider:         document.getElementById('c2InnerDxSlider'),
            c2InnerDxValue:          document.getElementById('c2InnerDxValue'),
            c2InnerDySlider:         document.getElementById('c2InnerDySlider'),
            c2InnerDyValue:          document.getElementById('c2InnerDyValue'),
            c2SizeRatioSlider:       document.getElementById('c2SizeRatioSlider'),
            c2SizeRatioValue:        document.getElementById('c2SizeRatioValue'),
            // Save slot buttons
            presetNameInput: document.getElementById('presetNameInput'),
            savePresetBtn: document.getElementById('savePresetBtn'),
            presetList: document.getElementById('presetList'),
            importFileInput: document.getElementById('importFileInput'),
            resetSettingsBtn: document.getElementById('resetSettingsBtn'),
            copyStateBtn:     document.getElementById('copyStateBtn')
        };
    }

    setupEventListeners() {
        // Modal controls
        this.elements.toggleBtn.addEventListener('click', () => this.toggleModal());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.modalBackdrop.classList.contains('active')) {
                this.closeModal();
            }
        });

        // Slice count controls
        this.elements.sliceDecBtn.addEventListener('click', () => this.changeSliceCount(-1));
        this.elements.sliceIncBtn.addEventListener('click', () => this.changeSliceCount(1));
        this.elements.sliceCount.addEventListener('change', () => this.updateSliceCount());

        // Slice width slider — thin wrapper over applyWidthScale / commitWidthScale.
        const sws = this.elements.sliceWidthSlider;
        if (sws) {
            let anchorN = null;
            const capture = () => { if (anchorN === null) anchorN = this.state.get('sliceCount'); };
            sws.addEventListener('pointerdown', capture);
            sws.addEventListener('touchstart',  capture, { passive: true });
            sws.addEventListener('input', (e) => {
                capture();
                this.applyWidthScale(parseFloat(e.target.value) / 100, anchorN);
            });
            sws.addEventListener('change', () => {
                this.commitWidthScale();
                anchorN = null;
            });
        }

        // Slider controls
        this.setupSlider('bgGraySlider', 'bgGray', 'bgGrayValue', '%', (value) => this.updateBackgroundColor(value));
        this.elements.anchorBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.anchorBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.set('anchor', btn.dataset.anchor);
                this.renderer.render();
            });
        });
        this.setupSlider('radiusSlider', 'radius', 'radiusValue', '%', () => this.renderer.render());
        this.setupSlider('rotationSlider', 'rotation', 'rotationValue', '°', () => this.renderer.updateRotation());
        this.setupSlider('gapSizeSlider', 'gapSize', 'gapSizeValue', 'px', () => this.renderer.render());
        this.setupSlider('innerCircleSizeSlider', 'innerCircleSize', 'innerCircleSizeValue', 'pt', () => this.renderer.render());
        this.setupSlider('grabberWidthSlider', 'grabberWidth', 'grabberWidthValue', 'pt', () => this.renderer.render());
        this.setupSlider('uiScaleSlider', 'uiScale', 'uiScaleValue', '×', () => this.renderer.render());
        this.setupSlider('uiScaleMaxSlider', 'uiScaleMax', 'uiScaleMaxValue', '×', () => this.renderer.render());
        // Hub circle
        const re = () => this.renderer.render();
        this.setupSlider('keyLabelXSlider',        'keyLabelX',        'keyLabelXValue',        'pt', re);
        this.setupSlider('keyLabelYSlider',        'keyLabelY',        'keyLabelYValue',        'pt', re);
        this.setupSlider('keyLabelPickerXSlider',  'keyLabelPickerX',  'keyLabelPickerXValue',  'pt', re);
        this.setupSlider('keyLabelPickerYSlider',  'keyLabelPickerY',  'keyLabelPickerYValue',  'pt', re);
        this.setupSlider('keyLabelOpOffSlider',    'keyLabelOpOff',    'keyLabelOpOffValue',    '%',  re);
        this.setupSlider('keyLabelOpOnSlider',     'keyLabelOpOn',     'keyLabelOpOnValue',     '%',  re);
        this.setupSlider('keyLabelOpPickerSlider', 'keyLabelOpPicker', 'keyLabelOpPickerValue', '%',  re);
        this.setupSlider('keyModFontSizeSlider',   'keyModFontSize',   'keyModFontSizeValue',   'pt', re);
        this.setupDropdown('keyModFontWeight',     'keyModFontWeight', re);
        this.setupSlider('keyModOffsetXSlider',    'keyModOffsetX',    'keyModOffsetXValue',    'pt', re);
        this.setupSlider('keyAccOffsetYSlider',    'keyAccOffsetY',    'keyAccOffsetYValue',    'pt', re);
        this.setupSlider('keyMinorOffsetYSlider',  'keyMinorOffsetY',  'keyMinorOffsetYValue',  'pt', re);
        this.setupSlider('keySubLabelYSlider',     'keySubLabelY',     'keySubLabelYValue',     'pt', re);
        this.setupSlider('keySubOpOffSlider',      'keySubOpOff',      'keySubOpOffValue',      '%',  re);
        this.setupSlider('keySubOpOnSlider',       'keySubOpOn',       'keySubOpOnValue',       '%',  re);
        this.setupSlider('keySubOpPickerSlider',   'keySubOpPicker',   'keySubOpPickerValue',   '%',  re);
        this.setupSlider('pickerRadiusSlider',     'pickerRadius',     'pickerRadiusValue',     'pt', re);
        this.setupSlider('pickerSpacingSlider',    'pickerSpacing',    'pickerSpacingValue',    '°',  re);
        this.setupSlider('pickerFontSizeSlider',   'pickerFontSize',   'pickerFontSizeValue',   'pt', re);
        this.setupSlider('toggleXSlider',          'toggleX',          'toggleXValue',          'pt', re);
        this.setupSlider('toggleSpacingSlider',    'toggleSpacing',    'toggleSpacingValue',    'pt', re);
        this.setupSlider('togglePillRSlider',      'togglePillR',      'togglePillRValue',      'pt', re);
        this.setupColorInput('toggleFillColor',    'toggleFill',    re);
        this.setupColorInput('toggleTextColorInput','toggleTextColor',re);
        this.setupSlider('toggleFillOpacitySlider','toggleFillOpacity','toggleFillOpacityValue','%',  re);
        this.setupSlider('accFontSizeSlider',      'accFontSize',      'accFontSizeValue',      'pt', re);
        this.setupSlider('scaleFontSizeSlider',    'scaleFontSize',    'scaleFontSizeValue',    'pt', re);

        this.setupDropdown('keyFontFamily',         'keyFontFamily',         () => this.renderer.render());
        this.setupDropdown('keyLabelFontWeight',    'keyLabelFontWeight',    () => this.renderer.render());
        this.setupDropdown('keySubLabelFontWeight', 'keySubLabelFontWeight', () => this.renderer.render());
        this.setupSlider(  'keySubLabelFontSizeSlider', 'keySubLabelFontSize', 'keySubLabelFontSizeValue', 'pt', () => this.renderer.render());
        this.setupDropdown('pickerFontWeight',      'pickerFontWeight',      () => this.renderer.render());
        this.setupDropdown('accFontWeight',         'accFontWeight',         () => this.renderer.render());
        this.setupDropdown('scaleFontWeight',       'scaleFontWeight',       () => this.renderer.render());
        this.setupColorInput('hubOpenColor',        'hubOpenColor',          () => this.renderer.render());
        this.setupColorInput('pickerDimColor',      'pickerDimColor',        () => this.renderer.render());
        this.setupSlider('pickerDimOpacitySlider',  'pickerDimOpacity', 'pickerDimOpacityValue', '%', () => this.renderer.render());
        this.setupColorInput('offDimColor',         'offDimColor',           () => this.renderer.render());
        this.setupSlider('offDimOpacitySlider',     'offDimOpacity',    'offDimOpacityValue',    '%', () => this.renderer.render());
        // Animation controls — no re-render needed; values are read at animation-start time
        this.setupDropdown('animOpenEasing',         'animOpenEasing');
        this.setupSlider('animOpenDurationSlider',   'animOpenDuration',   'animOpenDurationValue',   'ms');
        this.setupSlider('animOpenStaggerSlider',    'animOpenStagger',    'animOpenStaggerValue',    'ms');
        this.setupSlider('animOpenPillDelaySlider',  'animOpenPillDelay',  'animOpenPillDelayValue',  'ms');
        this.setupDropdown('animCloseEasing',        'animCloseEasing');
        this.setupSlider('animCloseDurationSlider',  'animCloseDuration',  'animCloseDurationValue',  'ms');
        this.setupSlider('animCloseStaggerSlider',   'animCloseStagger',   'animCloseStaggerValue',   'ms');
        this.setupSlider('animClosePillDelaySlider', 'animClosePillDelay', 'animClosePillDelayValue', 'ms');
        this.setupSlider('animOffDimDurationSlider', 'animOffDimDuration', 'animOffDimDurationValue', 'ms');
        this.setupSlider('animBlinkDurationSlider',  'animBlinkDuration',  'animBlinkDurationValue',  'ms');
        this.setupSlider('animBlinkScaleSlider',     'animBlinkScale',     'animBlinkScaleValue',     '×');

        // Press states — sync state to CSS vars on every change
        const pressSync = () => this._syncPressVars();
        this.setupSlider('pressInDurationSlider',    'pressInDuration',  'pressInDurationValue',  'ms', pressSync);
        this.setupSlider('pressOutDurationSlider',   'pressOutDuration', 'pressOutDurationValue', 'ms', pressSync);
        this.setupSlider('pressHubScaleSlider',      'pressHubScale',    'pressHubScaleValue',    '×', pressSync);
        this.setupColorInput('pressHubFill',         'pressHubFill',     pressSync);
        this.setupSlider('pressPillScaleSlider',     'pressPillScale',   'pressPillScaleValue',   '×', pressSync);
        this.setupColorInput('pressPillFill',        'pressPillFill',    pressSync);
        this.setupSlider('pressPowerScaleSlider',    'pressPowerScale',  'pressPowerScaleValue',  '×', pressSync);
        this.setupColorInput('pressPowerFill',       'pressPowerFill',   pressSync);
        this.setupColorInput('pressPowerC2Fill',     'pressPowerC2Fill', pressSync);
        this.setupSlider('pressLetterScaleSlider',   'pressLetterScale', 'pressLetterScaleValue', '×', pressSync);
        this.setupColorInput('pressLetterFill',      'pressLetterFill',  pressSync);
        this.setupSlider('keyLabelFontSizeSlider', 'keyLabelFontSize', 'keyLabelFontSizeValue', 'pt', (v) => {
            // Keep Hub Circle typography in sync
            if (this.elements.hubKeyFontSizeSlider) this.elements.hubKeyFontSizeSlider.value = v;
            if (this.elements.hubKeyFontSizeValue)  this.elements.hubKeyFontSizeValue.textContent = v + 'pt';
            this.renderer.render();
        });
        this.setupSlider('hubKeyFontSizeSlider', 'keyLabelFontSize', 'hubKeyFontSizeValue', 'pt', (v) => {
            // Keep Key & Audio panel in sync
            if (this.elements.keyLabelFontSizeSlider) this.elements.keyLabelFontSizeSlider.value = v;
            if (this.elements.keyLabelFontSizeValue)  this.elements.keyLabelFontSizeValue.textContent = v + 'pt';
            this.renderer.render();
        });
        this.setupColorInput('keyLabelColor', 'keyLabelColor', () => {
            if (this.elements.hubKeyLabelColor) this.elements.hubKeyLabelColor.value = this.elements.keyLabelColor.value;
            this.renderer.render();
        });
        this.setupColorInput('hubKeyLabelColor', 'keyLabelColor', () => {
            if (this.elements.keyLabelColor) this.elements.keyLabelColor.value = this.elements.hubKeyLabelColor.value;
            this.renderer.render();
        });

        // Section toggling
        this.elements.sectionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('open');
            });
        });
        this.setupSlider('gripThicknessSlider', 'gripThickness', 'gripThicknessValue', 'px', () => this.renderer.render());
        this.setupSlider('ticksPerEdgeSlider', 'ticksPerEdge', 'ticksPerEdgeValue', '', () => this.renderer.render());
        this.setupSlider('gripOpacitySlider', 'gripOpacity', 'gripOpacityValue', '%', () => this.renderer.render());
        this.setupSlider('gripInsetSlider', 'gripInset', 'gripInsetValue', '%', () => this.renderer.render());
        this.setupSlider('pressShrinkSlider', 'pressShrink', 'pressShrinkValue', '%');

        // Experimental sliders
        this.setupSlider('rootOctaveSlider',     'rootOctave',     'rootOctaveValue',     '');
        this.setupSlider('droneLockTimeSlider', 'droneLockTime', 'droneLockTimeValue', 'ms');
        this.setupSlider('notchGrowthFactorSlider', 'notchGrowthFactor', 'notchGrowthFactorValue', 'x');
        this.setupSlider('notchActivationSpeedSlider', 'notchActivationSpeed', 'notchActivationSpeedValue', 'ms', (value) => this.updateAnimationSpeed());
        this.setupSlider('notchDeactivationSpeedSlider', 'notchDeactivationSpeed', 'notchDeactivationSpeedValue', 'ms', (value) => this.updateAnimationSpeed());
        this.setupSlider('notchBrightnessBoostSlider', 'notchBrightnessBoost', 'notchBrightnessBoostValue', 'x');

        // Power button
        const reRender = () => this.renderer.render();
        this.setupSlider('powerBtnSizeSlider', 'powerBtnSize', 'powerBtnSizeValue', 'pt', reRender);
        this.setupSlider('powerBtnPickerOpacitySlider', 'powerBtnPickerOpacity', 'powerBtnPickerOpacityValue', '%');
        this.setupColorInput('c1GradFrom', 'c1GradFrom', reRender);
        this.setupColorInput('c1GradTo',   'c1GradTo',   reRender);
        this.setupDropdown('c1GradType', 'c1GradType', (v) => {
            const row = document.getElementById('c1FocalRow');
            if (row) row.style.display = (v === 'radial') ? 'flex' : 'none';
            reRender();
        });
        this.setupSlider('c1GradAngleSlider',       'c1GradAngle',       'c1GradAngleValue',       '°',  reRender);
        this.setupSlider('c1GradFocalOffsetSlider', 'c1GradFocalOffset', 'c1GradFocalOffsetValue', '%',  reRender);
        this.setupSlider('c1GradStop0Slider', 'c1GradStop0', 'c1GradStop0Value', '%', reRender);
        this.setupSlider('c1GradStop1Slider', 'c1GradStop1', 'c1GradStop1Value', '%', reRender);
        this.setupColorInput('c1Stroke', 'c1Stroke', reRender);
        this.setupSlider('c1StrokeWidthSlider', 'c1StrokeWidth', 'c1StrokeWidthValue', 'px', reRender);
        this.setupColorInput('c1DropColor',  'c1DropColor',  reRender);
        this.setupSlider('c1DropBlurSlider',     'c1DropBlur',     'c1DropBlurValue',     'px', reRender);
        this.setupSlider('c1DropOpacitySlider',  'c1DropOpacity',  'c1DropOpacityValue',  '%',  reRender);
        this.setupColorInput('c1InnerColor', 'c1InnerColor', reRender);
        this.setupSlider('c1InnerBlurSlider',    'c1InnerBlur',    'c1InnerBlurValue',    'px', reRender);
        this.setupSlider('c1InnerOpacitySlider', 'c1InnerOpacity', 'c1InnerOpacityValue', '%',  reRender);
        this.setupColorInput('c2GradFromOff', 'c2GradFromOff', reRender);
        this.setupColorInput('c2GradToOff',   'c2GradToOff',   reRender);
        this.setupDropdown('c2GradTypeOff', 'c2GradTypeOff', (v) => {
            const row = document.getElementById('c2FocalOffRow');
            if (row) row.style.display = (v === 'radial') ? 'flex' : 'none';
            reRender();
        });
        this.setupSlider('c2GradAngleOffSlider',       'c2GradAngleOff',       'c2GradAngleOffValue',       '°', reRender);
        this.setupSlider('c2GradFocalOffsetOffSlider', 'c2GradFocalOffsetOff', 'c2GradFocalOffsetOffValue', '%', reRender);
        this.setupSlider('c2GradStop0OffSlider', 'c2GradStop0Off', 'c2GradStop0OffValue', '%', reRender);
        this.setupSlider('c2GradStop1OffSlider', 'c2GradStop1Off', 'c2GradStop1OffValue', '%', reRender);
        this.setupColorInput('c2GradFromOn', 'c2GradFromOn', reRender);
        this.setupColorInput('c2GradToOn',   'c2GradToOn',   reRender);
        this.setupDropdown('c2GradTypeOn', 'c2GradTypeOn', (v) => {
            const row = document.getElementById('c2FocalOnRow');
            if (row) row.style.display = (v === 'radial') ? 'flex' : 'none';
            reRender();
        });
        this.setupSlider('c2GradAngleOnSlider',       'c2GradAngleOn',       'c2GradAngleOnValue',       '°', reRender);
        this.setupSlider('c2GradFocalOffsetOnSlider', 'c2GradFocalOffsetOn', 'c2GradFocalOffsetOnValue', '%', reRender);
        this.setupSlider('c2GradStop0OnSlider', 'c2GradStop0On', 'c2GradStop0OnValue', '%', reRender);
        this.setupSlider('c2GradStop1OnSlider', 'c2GradStop1On', 'c2GradStop1OnValue', '%', reRender);
        this.setupColorInput('c2Stroke',      'c2Stroke',      reRender);
        this.setupSlider('c2StrokeWidthSlider',  'c2StrokeWidth',  'c2StrokeWidthValue',  'px', reRender);
        this.setupColorInput('c2DropColor',  'c2DropColor',  reRender);
        this.setupSlider('c2DropBlurSlider',     'c2DropBlur',     'c2DropBlurValue',     'px', reRender);
        this.setupSlider('c2DropOpacitySlider',  'c2DropOpacity',  'c2DropOpacityValue',  '%',  reRender);
        this.setupColorInput('c2InnerColor', 'c2InnerColor', reRender);
        this.setupSlider('c2InnerBlurSlider',    'c2InnerBlur',    'c2InnerBlurValue',    'px', reRender);
        this.setupSlider('c2InnerOpacitySlider', 'c2InnerOpacity', 'c2InnerOpacityValue', '%',  reRender);
        this.setupSlider('c2InnerDxSlider',      'c2InnerDx',      'c2InnerDxValue',      'px', reRender);
        this.setupSlider('c2InnerDySlider',      'c2InnerDy',      'c2InnerDyValue',      'px', reRender);
        this.setupSlider('c2SizeRatioSlider', 'c2SizeRatio', 'c2SizeRatioValue', '', reRender);

        // Gradient controls
        this.setupColorInput('keyColorInput',        'keyColor',        () => this.renderer.render());
        this.setupColorInput('keyPressedColorInput', 'keyPressedColor', () => this.renderer.render());
        this.setupDropdown('pressedGradType',        'pressedGradType',  () => this.renderer.render());
        this.setupSlider('pressedGradAngleSlider',   'pressedGradAngle', 'pressedGradAngleValue', '°', () => this.renderer.render());
        this.setupSlider('pressedGradStop0Slider',   'pressedGradStop0', 'pressedGradStop0Value', '%', () => this.renderer.render());
        this.setupSlider('pressedGradStop1Slider',   'pressedGradStop1', 'pressedGradStop1Value', '%', () => this.renderer.render());

        // Note Marker controls
        this.setupSlider('noteMarkerSizeSlider', 'noteMarkerSize', 'noteMarkerSizeValue', 'px', () => this.renderer.render());
        this.setupColorInput('noteMarkerColor', 'noteMarkerColor', () => this.renderer.render());
        this.setupSlider('noteMarkerOpacitySlider', 'noteMarkerOpacity', 'noteMarkerOpacityValue', '%', () => this.renderer.render());
        this.setupSlider('noteMarkerPositionSlider', 'noteMarkerPosition', 'noteMarkerPositionValue', 'pt', () => this.renderer.render());
        this.setupSlider('sliceOpacitySlider', 'sliceOpacity', 'sliceOpacityValue', '%', (value) => this.updateSliceOpacity(value));

        // Save slot controls
        this.elements.savePresetBtn.addEventListener('click', () => this.savePreset());
        this.elements.presetNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.savePreset(); });
        this.elements.importFileInput.addEventListener('change', (e) => this.importPreset(e));
        this.renderPresetList();
        this.elements.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        this.elements.copyStateBtn.addEventListener('click', () => this.copyState());

        // Subscribe to rotation changes from interaction
        // Transform updates run synchronously (visual smoothness); slider/label DOM
        // writes are batched to one per animation frame (mobile-friendly).
        let rotUIFrame = null;
        let rotLatest = 0;
        this.state.subscribe('rotation', (value) => {
            this.renderer.updateRotation();
            rotLatest = value;
            if (rotUIFrame) return;
            rotUIFrame = requestAnimationFrame(() => {
                rotUIFrame = null;
                const rounded = Math.round(rotLatest);
                this.elements.rotationSlider.value = rounded;
                this.elements.rotationValue.textContent = rounded;
            });
        });

        // Subscribe to slice count changes from pinch gesture
        this.state.subscribe('sliceCount', (value) => {
            this.elements.sliceCount.value = value;
        });
    }

    setupSlider(sliderKey, stateKey, valueKey, suffix, callback) {
        const slider = this.elements[sliderKey];
        const valueDisplay = this.elements[valueKey];
        if (!slider || !valueDisplay) {
            console.warn(`setupSlider: missing element for "${sliderKey}" / "${valueKey}"`);
            return;
        }

        // Infer decimal places from the slider's step attribute
        const step = slider.getAttribute('step') || '1';
        const decimals = step.includes('.') ? step.split('.')[1].length : 0;

        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.state.set(stateKey, value);
            const displayValue = decimals > 0 ? value.toFixed(decimals) : value;
            valueDisplay.textContent = displayValue + suffix;
            if (callback) callback(value);
        });
    }

    setupColorInput(inputKey, stateKey, callback) {
        const input = this.elements[inputKey];
        if (!input) {
            console.warn(`setupColorInput: missing element for "${inputKey}"`);
            return;
        }

        input.addEventListener('input', (e) => {
            const value = e.target.value;
            this.state.set(stateKey, value);
            if (callback) callback(value);
        });
    }

    setupDropdown(dropdownKey, stateKey, callback) {
        const dropdown = this.elements[dropdownKey];
        if (!dropdown) {
            console.warn(`setupDropdown: missing element for "${dropdownKey}"`);
            return;
        }

        dropdown.addEventListener('change', (e) => {
            const value = e.target.value;
            this.state.set(stateKey, value);
            if (callback) callback(value);
        });
    }

    changeSliceCount(delta) {
        const current = parseInt(this.elements.sliceCount.value);
        const newValue = Math.max(6, Math.min(72, current + delta));
        this.elements.sliceCount.value = newValue;
        this.updateSliceCount();
    }

    updateSliceCount() {
        const value = Math.max(6, Math.min(72, parseInt(this.elements.sliceCount.value)));
        this.elements.sliceCount.value = value;
        this.state.set('sliceCount', value);
        this.renderer.render();
    }

    // Apply a width-scale value (W) live. Called from the slider and (later) pinch handlers.
    //   anchorN: slice count at gesture start (so the math is stable through the gesture)
    //   opts.rotationAnchor: { midpointAngle, f } — rotate so fractional slice position `f`
    //                        sits at screen angle `midpointAngle` (used by pinch midpoint anchor)
    applyWidthScale(W, anchorN, opts = {}) {
        const Mcont = Math.max(6, Math.min(72, anchorN / W));
        const Mfull = Math.floor(Mcont);
        const frac  = Mcont - Mfull;
        const hasPartial = frac > 0.001 && Mfull < 72;
        const sc = hasPartial ? Mfull + 1 : Mfull;
        const pf = hasPartial ? frac : 1.0;

        const curSc = this.state.get('sliceCount');
        const curPf = this.state.get('slicePartialFrac') ?? 1.0;
        const countChanged = sc !== curSc;
        const pfChanged    = Math.abs(pf - curPf) > 0.001;

        let rotChanged = false;
        if (opts.rotationAnchor) {
            const { midpointAngle, f } = opts.rotationAnchor;
            const newAps = 360 / (sc - 1 + pf);
            const newRot = ((midpointAngle - f * newAps) % 360 + 360) % 360;
            const curRot = this.state.get('rotation');
            if (Math.abs(newRot - curRot) > 0.01) {
                this.state.set('rotation', newRot);
                rotChanged = true;
            }
        }

        if (countChanged || pfChanged) {
            this.state.set('sliceCount', sc);
            this.state.set('slicePartialFrac', pf);
            if (this.elements.sliceCount) this.elements.sliceCount.value = sc;
            this.renderer.updateSliceLive();
        }
        if (rotChanged) this.renderer.updateRotation();

        const pct = Math.max(10, Math.min(200, W * 100));
        if (opts.syncSlider && this.elements.sliceWidthSlider) {
            this.elements.sliceWidthSlider.value = pct;
        }
        if (this.elements.sliceWidthValue) {
            this.elements.sliceWidthValue.textContent = Math.round(pct) + '%';
        }
    }

    // Snap on release. Round the partial up or down, reset slider visual to 100%.
    commitWidthScale() {
        const pf = this.state.get('slicePartialFrac') ?? 1.0;
        if (pf < 1.0) {
            const cur = this.state.get('sliceCount');
            const finalCount = Math.max(6, Math.min(72, pf >= 0.5 ? cur : cur - 1));
            this.state.set('sliceCount', finalCount);
            this.state.set('slicePartialFrac', 1.0);
            if (this.elements.sliceCount) this.elements.sliceCount.value = finalCount;
        }
        // Always do a full render after a gesture so pressed-gradient orientations,
        // ticks, and markers are consistent with the final slice count.
        this.renderer.render();
        if (this.elements.sliceWidthSlider) this.elements.sliceWidthSlider.value = 100;
        if (this.elements.sliceWidthValue)  this.elements.sliceWidthValue.textContent = '100%';
    }

    updateBackgroundColor(value) {
        const grayValue = Math.round((value / 100) * 255);
        const hexValue = grayValue.toString(16).padStart(2, '0');
        document.documentElement.style.setProperty('--bg-primary', `#${hexValue}${hexValue}${hexValue}`);
        this.renderer.render();
    }

    updateSliceOpacity(value) {
        document.documentElement.style.setProperty('--slice-opacity', value / 100);
    }

    updateAnimationSpeed() {
        const activationSpeed = this.state.get('notchActivationSpeed');
        const deactivationSpeed = this.state.get('notchDeactivationSpeed');
        document.documentElement.style.setProperty('--notch-activation-speed', `${activationSpeed}ms`);
        document.documentElement.style.setProperty('--notch-deactivation-speed', `${deactivationSpeed}ms`);
    }

    // Push press-state values to CSS variables. Cheap — no SVG re-render needed.
    _syncPressVars() {
        const r = document.documentElement.style;
        const s = this.state;
        r.setProperty('--press-in-duration',  s.get('pressInDuration')  + 'ms');
        r.setProperty('--press-out-duration', s.get('pressOutDuration') + 'ms');
        r.setProperty('--press-hub-scale',    s.get('pressHubScale'));
        r.setProperty('--press-hub-fill',     s.get('pressHubFill'));
        r.setProperty('--press-pill-scale',   s.get('pressPillScale'));
        r.setProperty('--press-pill-fill',    s.get('pressPillFill'));
        r.setProperty('--press-power-scale',   s.get('pressPowerScale'));
        r.setProperty('--press-power-fill',    s.get('pressPowerFill'));
        r.setProperty('--press-power-c2-fill', s.get('pressPowerC2Fill'));
        r.setProperty('--press-letter-scale', s.get('pressLetterScale'));
        r.setProperty('--press-letter-fill',  s.get('pressLetterFill'));
    }

    toggleModal() {
        if (this.elements.modalBackdrop.classList.contains('active')) {
            this.closeModal();
        } else {
            this.openModal();
        }
    }

    openModal() {
        this.elements.modalBackdrop.classList.add('active');
        this.elements.toggleBtn.classList.add('active');
        this.elements.toggleBtn.setAttribute('aria-label', 'Close controls');
        this.elements.modalBackdrop.addEventListener('transitionend', () => window.dispatchEvent(new Event('resize')), { once: true });
    }

    closeModal() {
        this.elements.modalBackdrop.classList.remove('active');
        this.elements.toggleBtn.classList.remove('active');
        this.elements.toggleBtn.setAttribute('aria-label', 'Open controls');
        this.elements.modalBackdrop.addEventListener('transitionend', () => window.dispatchEvent(new Event('resize')), { once: true });
    }

    syncUIWithState() {
        const state = this.state.getAll();
        Object.keys(state).forEach(key => {
            const sliderElement = this.elements[key + 'Slider'];
            if (sliderElement) {
                sliderElement.value = state[key];
            }

            // Update value displays
            const valueElement = this.elements[key + 'Value'];
            if (valueElement) {
                valueElement.textContent = state[key];
            }

            // Update color inputs (direct element match)
            const colorElement = this.elements[key];
            if (colorElement && colorElement.type === 'color') {
                colorElement.value = state[key];
            }

            // Update dropdown/select elements
            const selectElement = this.elements[key];
            if (selectElement && selectElement.tagName === 'SELECT') {
                selectElement.value = state[key];
            }
        });

        // Sync anchor buttons
        this.elements.anchorBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.anchor === state.anchor);
        });

        // Sync CSS custom properties
        this.updateSliceOpacity(state.sliceOpacity);
        this._syncPressVars();
    }

    getPresets() {
        try {
            return JSON.parse(localStorage.getItem('radialPianoPresets') || '[]');
        } catch { return []; }
    }

    savePresets(presets) {
        localStorage.setItem('radialPianoPresets', JSON.stringify(presets));
    }

    savePreset() {
        const name = this.elements.presetNameInput.value.trim();
        if (!name) return;
        const presets = this.getPresets();
        const stateWithoutRotation = stripRotation(this.state.getAll());
        const existingIndex = presets.findIndex(p => p.name === name);
        if (existingIndex !== -1) {
            if (!confirm(`A preset named "${name}" already exists. Overwrite it?`)) return;
            presets[existingIndex] = { name, state: stateWithoutRotation, date: Date.now() };
        } else {
            presets.push({ name, state: stateWithoutRotation, date: Date.now() });
        }
        this.savePresets(presets);
        this.elements.presetNameInput.value = '';
        this.renderPresetList();
    }

    updatePreset(index) {
        const presets = this.getPresets();
        if (!presets[index]) return;
        if (!confirm(`Update "${presets[index].name}" with current settings?`)) return;
        const stateWithoutRotation = stripRotation(this.state.getAll());
        presets[index].state = stateWithoutRotation;
        presets[index].date = Date.now();
        this.savePresets(presets);
        this.renderPresetList();
    }

    loadPreset(index) {
        const presets = this.getPresets();
        const preset = presets[index];
        if (!preset) return;
        // Reset all state to defaults first, then apply preset values
        // This ensures new properties get defaults when loading old presets
        Object.keys(INITIAL_STATE).forEach(key => {
            this.state.set(key, INITIAL_STATE[key]);
        });
        Object.keys(preset.state).forEach(key => {
            if (key !== 'rotation' && INITIAL_STATE.hasOwnProperty(key)) {
                this.state.set(key, preset.state[key]);
            }
        });
        // Always compute rotation from anchor + sliceCount — never restore from preset
        this.state.set('rotation', computeDefaultRotation(
            this.state.get('anchor'),
            this.state.get('sliceCount')
        ));
        // Migration: old presets have rootNote (chromatic) but no rootLetter — derive letter from chromatic
        if (preset.state.rootNote !== undefined && preset.state.rootLetter === undefined) {
            const mode  = preset.state.accidentalMode || 'natural';
            const noteName = (mode === 'flat') ? CHROMATIC_FLATS[preset.state.rootNote]
                                                : CHROMATIC_NOTES[preset.state.rootNote];
            const letter = (noteName || 'C')[0];
            const li = NOTE_LETTERS.indexOf(letter);
            if (li >= 0) this.state.set('rootLetter', li);
        }
        this.syncUIWithState();
        this.renderer.render();
    }

    deletePreset(index) {
        const presets = this.getPresets();
        presets.splice(index, 1);
        this.savePresets(presets);
        this.renderPresetList();
    }

    async exportPreset(index, btn) {
        const presets = this.getPresets();
        const preset = presets[index];
        if (!preset) return;
        await navigator.clipboard.writeText(JSON.stringify(stripRotation(preset.state)));
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '✓';
            setTimeout(() => { btn.innerHTML = orig; }, 1200);
        }
    }

    renderPresetList() {
        const presets = this.getPresets();
        this.elements.presetList.innerHTML = presets.map((p, i) => `
            <div class="preset-item">
                <span class="preset-item-name" data-load="${i}">${p.name}</span>
                <button class="preset-item-update" data-update="${i}" title="Update with current settings">&#8635;</button>
                <button class="preset-item-export" data-export="${i}" title="Copy to clipboard">&#128203;</button>
                <button class="preset-item-delete" data-delete="${i}" title="Delete">&#10005;</button>
            </div>
        `).join('');

        this.elements.presetList.querySelectorAll('[data-load]').forEach(el => {
            el.addEventListener('click', () => this.loadPreset(parseInt(el.dataset.load)));
        });
        this.elements.presetList.querySelectorAll('[data-update]').forEach(el => {
            el.addEventListener('click', () => this.updatePreset(parseInt(el.dataset.update)));
        });
        this.elements.presetList.querySelectorAll('[data-export]').forEach(el => {
            el.addEventListener('click', () => this.exportPreset(parseInt(el.dataset.export), el));
        });
        this.elements.presetList.querySelectorAll('[data-delete]').forEach(el => {
            el.addEventListener('click', () => this.deletePreset(parseInt(el.dataset.delete)));
        });
    }

    importPreset(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);
                if (typeof settings !== 'object' || settings === null) throw new Error('Invalid');
                const name = file.name.replace('.json', '');
                const presets = this.getPresets();
                presets.push({ name, state: settings, date: Date.now() });
                this.savePresets(presets);
                this.renderPresetList();
                if (confirm(`Preset "${name}" imported. Load it now?`)) {
                    this.loadPreset(presets.length - 1);
                }
                event.target.value = '';
            } catch {
                alert('Failed to import preset.');
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    copyState() {
        const state = this.state.getAll();
        const text = JSON.stringify(state, null, 4);
        navigator.clipboard.writeText(text).then(() => {
            const btn = this.elements.copyStateBtn;
            const orig = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        });
    }

    resetSettings() {
        if (confirm('Reset all settings to factory defaults?')) {
            // Reset state to initial values
            Object.keys(INITIAL_STATE).forEach(key => {
                this.state.set(key, INITIAL_STATE[key]);
            });

            // Update all UI elements
            this.syncUIWithState();

            // Re-render
            this.renderer.render();

            console.log('↺ Settings reset to defaults');

            // Visual feedback
            const btn = this.elements.resetSettingsBtn;
            const originalText = btn.textContent;
            btn.textContent = '✓ Reset!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }

}

// ============================================
// APPLICATION
// ============================================
class Application {
    constructor() {
        this.svgElement = document.getElementById('pianoSvg');
        this.stateManager = new StateManager(INITIAL_STATE);
        this.geometryEngine = new GeometryEngine(this.stateManager);
        this.audioEngine = new AudioEngine(this.stateManager);
        this.renderEngine = new RenderEngine(this.svgElement, this.stateManager, this.geometryEngine);
        this.interactionManager = null;
        this.controlsManager = null;
    }

    async init() {
        // Prevent context menu on iOS and other touch devices
        this.svgElement.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.radial-piano')) {
                e.preventDefault();
            }
        });

        // Initialize background color
        const grayValue = Math.round((this.stateManager.get('bgGray') / 100) * 255);
        const hexValue = grayValue.toString(16).padStart(2, '0');
        document.documentElement.style.setProperty('--bg-primary', `#${hexValue}${hexValue}${hexValue}`);

        // Initialize slice opacity CSS variable
        document.documentElement.style.setProperty('--slice-opacity', this.stateManager.get('sliceOpacity') / 100);

        // Initial render (with startup animation)
        this.renderEngine.render();

        // Initialize managers
        this.interactionManager = new InteractionManager(
            this.svgElement,
            this.stateManager,
            this.geometryEngine,
            this.renderEngine,
            this.audioEngine
        );

        this.controlsManager = new ControlsManager(this.stateManager, this.renderEngine);
        this.interactionManager.attachControls(this.controlsManager);

        // Setup resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.stateManager.invalidateComputed();
                this.renderEngine.render();
            }, RESIZE_DEBOUNCE_MS);
        });

        // Add failsafe event listeners to prevent stuck notes
        window.addEventListener('blur', () => {
            this.audioEngine.stopAllNotes();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.audioEngine.stopAllNotes();
            }
        });

        // Add Escape key as panic button
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.audioEngine.stopAllNotes();
            }
        });

        // Setup audio start button
        this.setupAudioButton();
        this.setupPowerButton();

        // Remove startup overlay immediately (skeleton is the new idle state)
        const overlay = document.getElementById('startupOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }
    }

    setupPowerButton() {
        this.svgElement.addEventListener('click', async e => {
            if (!e.target.closest('.power-button')) return;

            // If picker is open, tap on power button closes the picker (modal behavior)
            // and does NOT toggle audio.
            if (this.keyPickerOpen) {
                this.keyPickerOpen = false;
                this.renderEngine.setKeyPickerOpen(false);
                return;
            }

            if (!this.audioEnabled) {
                if (!this.audioInitialized) {
                    try {
                        await this.audioEngine.init();
                        this.audioInitialized = true;
                    } catch (err) {
                        console.error('Audio init failed:', err);
                        return;
                    }
                }
                this.audioEngine.enabled = true;
                this.audioEnabled        = true;
                this.renderEngine.setAudioToggleActive(true);
            } else {
                this.turnOffAudio();
            }
        });
    }

    setupAudioButton() {
        this.audioEnabled = false;
        this.audioInitialized = false;
        this.keyPickerOpen = false;

        const getToggle = (e) => {
            const target = e.target || (e.touches && e.touches[0] && document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY));
            return target && target.closest('.audio-toggle');
        };

        // click: hub is only active when audio is on — toggles picker and sub-controls
        this.svgElement.addEventListener('click', (e) => {
            if (!getToggle(e)) return;
            if (!this.audioEnabled) return;  // power button handles on/off

            const target = e.target;

            // Accidental toggle (♭♮♯)
            if (target && target.closest('.acc-toggle')) {
                const order    = ['flat', 'natural', 'sharp'];
                const current  = this.stateManager.get('accidentalMode');
                const newMode  = order[(order.indexOf(current) + 1) % order.length];
                this.stateManager.set('accidentalMode', newMode);
                // Re-sync chromatic rootNote from letter + new accidental (for audio)
                const letterIdx = this.stateManager.get('rootLetter');
                const letter    = NOTE_LETTERS[letterIdx];
                this.stateManager.set('rootNote', NOTE_TO_CHROMATIC[letter][newMode]);
                this.renderEngine.render();
                this.audioEngine.previewNote();
                return;
            }

            // Scale mode toggle (M/m)
            if (target && target.closest('.scale-toggle')) {
                const current = this.stateManager.get('scaleMode');
                this.stateManager.set('scaleMode', current === 'major' ? 'minor' : 'major');
                this.renderEngine.render();
                this.audioEngine.previewNote();
                return;
            }

            // Tapping a picker note: always play the arpeggio. If the letter changed,
            // run it after the blink callback so it reflects the new key.
            if (target && target.closest('.key-picker-note')) {
                const letterIdx = parseInt(target.closest('.key-picker-note').dataset.letter);
                if (!isNaN(letterIdx)) {
                    if (letterIdx !== this.stateManager.get('rootLetter')) {
                        this.renderEngine.blinkKeyLabel(() => {
                            this.stateManager.set('rootLetter', letterIdx);
                            // Sync chromatic rootNote (audio) from letter + current accidental
                            const letter = NOTE_LETTERS[letterIdx];
                            const accMode = this.stateManager.get('accidentalMode');
                            this.stateManager.set('rootNote', NOTE_TO_CHROMATIC[letter][accMode]);
                            this.renderEngine.render();
                            this.audioEngine.previewNote();
                        });
                    } else {
                        // Same letter — state already correct, preview immediately
                        this.audioEngine.previewNote();
                    }
                }
                return;
            }

            // Hub tap: toggle picker open/closed
            this.keyPickerOpen = !this.keyPickerOpen;
            this.renderEngine.setKeyPickerOpen(this.keyPickerOpen);
        });

        // Close picker when clicking/tapping outside.
        // Uses pointerdown so it fires on both mouse and touch (mousedown doesn't fire on touch).
        // .power-button is excluded so its click handler can close picker without also toggling audio.
        document.addEventListener('pointerdown', (e) => {
            if (this.keyPickerOpen
                && !e.target.closest('.audio-toggle')
                && !e.target.closest('.power-button')
                && !e.target.closest('.side-panel')) {
                this.keyPickerOpen = false;
                this.renderEngine.setKeyPickerOpen(false);
            }
        });
    }

    turnOffAudio() {
        this.audioEngine.stopAllNotes();
        this.renderEngine.clearAllLockedSlices();
        this.audioEngine.enabled = false;
        this.audioEnabled = false;
        this.keyPickerOpen = false;
        this.renderEngine.setAudioToggleActive(false);
        this.renderEngine.setKeyPickerOpen(false);
    }

}

// ============================================
// START APPLICATION
// ============================================
new Application().init();
