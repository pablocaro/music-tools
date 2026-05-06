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
    'bottom-right':  270,
};

function computeDefaultRotation(anchor, sliceCount) {
    const entryAngle = ANCHOR_ENTRY_ANGLES[anchor] ?? 270;
    const anglePerSlice = 360 / sliceCount;
    return (entryAngle - anglePerSlice + 360) % 360;
}

const INITIAL_STATE = {
    sliceCount: 32,
    bgGray: 20,
    anchor: 'bottom-right',
    innerCircleSize: 170,
    grabberWidth: 500,
    uiScale: 1.0,
    uiScaleMax: 1.5,
    // Key & Audio
    audioToggleColor: '#919191',
    audioToggleOpacity: 100,
    audioToggleSize: 100,
    rootNote: 0,
    accidentalMode: 'natural',
    keyFontFamily: 'system-ui, -apple-system, sans-serif',
    keyFontWeight: '600',
    keyLabelFontSize: 40,
    keyLabelColor: '#ffffff',
    keyLabelOpacity: 100,
    keyPickerSize: 14,
    keyPickerSpread: 145,
    // Key picker appearance
    keyPickerFontSize: 17,
    keyPickerCircleColor: '#929292',
    keyPickerCircleOpacity: 100,
    keyPickerLabelColor: '#ffffff',
    keyPickerLabelOpacity: 100,
    keyPickerActiveCircleColor: '#ffffff',
    keyPickerActiveCircleOpacity: 100,
    keyPickerActiveLabelColor: '#444444',
    keyPickerActiveLabelOpacity: 100,
    radius: 155,
    // rotation is not stored in presets; computed via computeDefaultRotation()
    rotation: 258.75, // = computeDefaultRotation('bottom-right', 32)
    gapSize: 2,
    gripThickness: 2,
    gripOpacity: 10,
    ticksPerEdge: 4,
    gripRingOpacity: 0,
    gripInset: 10,
    pressShrink: 3,
    pressBrightness: 30,
    theme: 'dark',
    // Gradient Settings
    defaultGradientAngle: 28,
    defaultGradientStartColor: '#000000',
    defaultGradientEndColor: '#606060',
    pressedGradientAngle: 0,
    pressedGradientStartColor: '#000000',
    pressedGradientEndColor: '#4d4d4d',
    // Grip Ring Appearance
    gripRingColor: '#ffffff',
    gripRingBlend: 'overlay',
    gripRingNoiseEnabled: false,
    gripRingNoiseFrequency: 0,
    gripRingNoiseOctaves: 3,
    gripRingNoiseType: 'fractalNoise',
    gripRingNoiseColor: '#ffffff',
    gripRingNoiseIntensity: 0,
    gripRingNoiseBlend: 'overlay',
    // Note Markers
    noteMarkerSize: 6,
    noteMarkerColor: '#7a7a7a',
    noteMarkerPosition: 195,
    // Experimental: Drone lock timing
    droneLockTime: 3000,
    // Experimental: Gripper animations
    notchGrowthFactor: 1.2,
    notchActivationSpeed: 50,
    notchDeactivationSpeed: 300,
    notchBrightnessBoost: 1.5,
    ringThicknessBoost: 1.02
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
        const rootNote = this.state.get('rootNote');
        const noteInScale = index % 7;
        const baseOctave = 3 + Math.floor(index / 7);
        // Apply root transposition; notes that wrap past 12 are one octave higher
        const chromaticIndex = (rootNote + MAJOR_SCALE_INTERVALS[noteInScale]) % 12;
        const octave = baseOctave + (chromaticIndex < rootNote ? 1 : 0);
        return CHROMATIC_NOTES[chromaticIndex] + octave;
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
        this.isFirstRender = true; // Track if this is the initial startup render
        this.audioToggle = null;
        this.audioActive = false;
        this.keyPickerOpen = false;
        this._hubRAnimId = null;
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
        this.sliceGroup.setAttribute('transform', `rotate(${rotation} ${center.x} ${center.y})`);

        const defs = document.createElementNS(SVG_NS, 'defs');
        this.sliceGroup.appendChild(defs);

        return defs;
    }

    createGradient(defs, index, center, radii, anglePerSlice) {
        const r = Math.max(radii.rx, radii.ry);
        const startAngleDeg = index * anglePerSlice;
        const endAngleDeg = (index + 1) * anglePerSlice;
        const baseAngleDeg = (startAngleDeg + endAngleDeg) / 2;

        // Gradient direction
        const angleOffset = this.state.get('defaultGradientAngle');
        const gradientDirDeg = baseAngleDeg + angleOffset;
        const gradientDirRad = gradientDirDeg * Math.PI / 180;
        const dirX = Math.cos(gradientDirRad);
        const dirY = Math.sin(gradientDirRad);

        // Find extrema of slice along gradient direction so full range is visible
        let minDot = 0; // center point contributes 0
        let maxDot = 0;

        const checkPoint = (px, py) => {
            const dot = px * dirX + py * dirY;
            if (dot < minDot) minDot = dot;
            if (dot > maxDot) maxDot = dot;
        };

        // Outer arc corners
        const startRad = startAngleDeg * Math.PI / 180;
        const endRad = endAngleDeg * Math.PI / 180;
        checkPoint(r * Math.cos(startRad), r * Math.sin(startRad));
        checkPoint(r * Math.cos(endRad), r * Math.sin(endRad));

        // If the gradient direction (or its opposite) lies within the slice arc, the extreme point is on the arc at that angle
        const normalizeAngle = (a) => ((a % 360) + 360) % 360;
        const inArcRange = (a) => {
            const aN = normalizeAngle(a);
            const sN = normalizeAngle(startAngleDeg);
            const eN = normalizeAngle(endAngleDeg);
            return sN <= eN ? (aN >= sN && aN <= eN) : (aN >= sN || aN <= eN);
        };
        if (inArcRange(gradientDirDeg)) maxDot = Math.max(maxDot, r);
        if (inArcRange(gradientDirDeg + 180)) minDot = Math.min(minDot, -r);

        const x1 = center.x + minDot * dirX;
        const y1 = center.y + minDot * dirY;
        const x2 = center.x + maxDot * dirX;
        const y2 = center.y + maxDot * dirY;

        const gradient = document.createElementNS(SVG_NS, 'linearGradient');
        gradient.setAttribute('id', `gradient${index}`);
        gradient.setAttribute('x1', x1);
        gradient.setAttribute('y1', y1);
        gradient.setAttribute('x2', x2);
        gradient.setAttribute('y2', y2);
        gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

        // Get colors from state
        const startColor = this.state.get('defaultGradientStartColor');
        const endColor = this.state.get('defaultGradientEndColor');

        const stop1 = document.createElementNS(SVG_NS, 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', startColor);

        const stop2 = document.createElementNS(SVG_NS, 'stop');
        stop2.setAttribute('class', `stop2-${index}`);
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', endColor);

        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
    }

    createSlice(index, center, radii, anglePerSlice) {
        const gapSize = this.state.get('gapSize');
        const sliceCount = this.state.get('sliceCount');

        const startAngle = index * anglePerSlice;
        const endAngle = (index + 1) * anglePerSlice;

        const pathGenerator = this.geometry.createPathGenerator(center, radii, startAngle, endAngle, gapSize);
        this.pathGenerators.set(index, pathGenerator);

        const slice = document.createElementNS(SVG_NS, 'path');
        slice.setAttribute('d', pathGenerator(1));
        slice.setAttribute('fill', `url(#gradient${index})`);
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

    renderSlices() {
        const center = this.geometry.calculateCenter();
        const radii = this.geometry.calculateRadii();
        const sliceCount = this.state.get('sliceCount');
        const anglePerSlice = 360 / sliceCount;

        const defs = this.createSliceGroup();

        // Create gradients and slices
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < sliceCount; i++) {
            this.createGradient(defs, i, center, radii, anglePerSlice);
            fragment.appendChild(this.createSlice(i, center, radii, anglePerSlice));
        }

        this.sliceGroup.appendChild(fragment);
        this.svg.appendChild(this.sliceGroup);
    }

    renderInnerCircle() {
        const center = this.geometry.calculateCenter();
        const innerRadius = this.state.get('innerCircleSize') * this.getUIScale();

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

    createGripRingPath(center, outerRadius, innerRingRadius) {
        // Create donut-shaped path
        // Draw outer circle clockwise, then inner circle counter-clockwise
        return [
            `M ${center.x},${center.y - outerRadius}`,  // Move to top of outer circle
            `A ${outerRadius},${outerRadius} 0 1,1 ${center.x},${center.y + outerRadius}`,  // Outer arc (half circle)
            `A ${outerRadius},${outerRadius} 0 1,1 ${center.x},${center.y - outerRadius}`,  // Complete outer circle
            `M ${center.x},${center.y - innerRingRadius}`,  // Move to top of inner circle
            `A ${innerRingRadius},${innerRingRadius} 0 1,0 ${center.x},${center.y + innerRingRadius}`,  // Inner arc (half circle, counter-clockwise)
            `A ${innerRingRadius},${innerRingRadius} 0 1,0 ${center.x},${center.y - innerRingRadius}`,  // Complete inner circle (counter-clockwise)
        ].join(' ');
    }

    // Simple Perlin-like noise generator
    generateNoiseTexture() {
        const frequency = this.state.get('gripRingNoiseFrequency');
        const octaves = this.state.get('gripRingNoiseOctaves');
        const type = this.state.get('gripRingNoiseType');
        const noiseColor = this.state.get('gripRingNoiseColor');

        // Check if we need to regenerate
        const currentSettings = `${frequency}-${octaves}-${type}-${noiseColor}`;
        if (this.lastNoiseSettings === currentSettings && this.noiseTextureDataURL) {
            return this.noiseTextureDataURL; // Use cached version
        }

        // Create canvas for noise generation
        const size = 1024; // Texture resolution - higher = sharper
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;

        // Parse noise color
        const hexColor = noiseColor.replace('#', '');
        const r = parseInt(hexColor.substr(0, 2), 16);
        const g = parseInt(hexColor.substr(2, 2), 16);
        const b = parseInt(hexColor.substr(4, 2), 16);

        // Generate noise
        const scale = frequency * 10; // Scale frequency to useful range

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;

                let value = 0;
                let amplitude = 1;
                let maxAmplitude = 0;

                // Multi-octave noise
                for (let octave = 0; octave < octaves; octave++) {
                    const freq = scale * Math.pow(2, octave);
                    const nx = x / size * freq;
                    const ny = y / size * freq;

                    // Simple noise based on type
                    let noise;
                    if (type === 'turbulence') {
                        // More chaotic
                        noise = Math.abs(Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453);
                        noise = (noise - Math.floor(noise)) * 2 - 1;
                        noise = Math.abs(noise);
                    } else {
                        // Smoother fractal
                        noise = Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453;
                        noise = noise - Math.floor(noise);
                    }

                    value += noise * amplitude;
                    maxAmplitude += amplitude;
                    amplitude *= 0.5; // Each octave contributes less
                }

                // Normalize
                value = value / maxAmplitude;

                // Apply noise color
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = Math.floor(value * 255); // Use as alpha
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Convert to data URL
        this.noiseTextureDataURL = canvas.toDataURL('image/png');
        this.lastNoiseSettings = currentSettings;

        return this.noiseTextureDataURL;
    }

    renderGripRing(innerRadius) {
        const center = this.geometry.calculateCenter();
        const gripRingRadius = Math.max(0, innerRadius - this.state.get('grabberWidth') * this.getUIScale());
        const gripRingOpacity = this.state.get('gripRingOpacity');
        const gripRingColor = this.state.get('gripRingColor');
        const noiseIntensity = this.state.get('gripRingNoiseIntensity');

        const outerRadius = innerRadius;
        const innerRingRadius = gripRingRadius;

        // Store base radii for animation
        this.gripRingBaseRadii = { outerRadius, innerRingRadius };

        const pathData = this.createGripRingPath(center, outerRadius, innerRingRadius);

        // LAYER 1: Base colored ring (solid fill)
        const baseRing = document.createElementNS(SVG_NS, 'path');
        baseRing.setAttribute('class', 'grip-ring-base');
        baseRing.setAttribute('d', pathData);
        baseRing.setAttribute('fill', gripRingColor);
        baseRing.setAttribute('fill-rule', 'evenodd');
        baseRing.setAttribute('opacity', gripRingOpacity / 100);
        baseRing.style.pointerEvents = 'none';
        baseRing.style.mixBlendMode = this.state.get('gripRingBlend');

        this.sliceGroup.appendChild(baseRing);

        // LAYER 2: Noise texture overlay (if enabled and intensity > 0)
        const noiseEnabled = this.state.get('gripRingNoiseEnabled');
        if (noiseEnabled && noiseIntensity > 0) {
            // Generate or retrieve cached noise texture
            const noiseDataURL = this.generateNoiseTexture();

            // Create pattern for noise texture
            const defs = this.sliceGroup.querySelector('defs');

            // Remove old pattern if exists
            const oldPattern = defs.querySelector('#gripRingNoisePattern');
            if (oldPattern) oldPattern.remove();

            const pattern = document.createElementNS(SVG_NS, 'pattern');
            pattern.setAttribute('id', 'gripRingNoisePattern');
            pattern.setAttribute('patternUnits', 'userSpaceOnUse');
            pattern.setAttribute('width', outerRadius * 2);
            pattern.setAttribute('height', outerRadius * 2);
            pattern.setAttribute('x', center.x - outerRadius);
            pattern.setAttribute('y', center.y - outerRadius);

            const patternImage = document.createElementNS(SVG_NS, 'image');
            patternImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', noiseDataURL);
            patternImage.setAttribute('width', outerRadius * 2);
            patternImage.setAttribute('height', outerRadius * 2);
            patternImage.setAttribute('preserveAspectRatio', 'none');

            pattern.appendChild(patternImage);
            defs.appendChild(pattern);

            // Create noise overlay ring
            const noiseRing = document.createElementNS(SVG_NS, 'path');
            noiseRing.setAttribute('class', 'grip-ring-noise');
            noiseRing.setAttribute('d', pathData);
            noiseRing.setAttribute('fill', 'url(#gripRingNoisePattern)');
            noiseRing.setAttribute('fill-rule', 'evenodd');
            noiseRing.setAttribute('opacity', noiseIntensity / 100);
            noiseRing.style.pointerEvents = 'none';
            noiseRing.style.mixBlendMode = this.state.get('gripRingNoiseBlend');

            this.sliceGroup.appendChild(noiseRing);
        }

        return gripRingRadius;
    }

    renderGripTicks(innerRadius, gripRingRadius) {
        const center = this.geometry.calculateCenter();
        const sliceCount = this.state.get('sliceCount');
        const ticksPerEdge = this.state.get('ticksPerEdge');
        const gripThickness = this.state.get('gripThickness');
        const gripOpacity = this.state.get('gripOpacity');
        const gripInset = this.state.get('gripInset');

        const totalTicks = sliceCount * ticksPerEdge;
        const gripRingWidth = innerRadius - gripRingRadius;
        const insetAmount = (gripInset / 100) * gripRingWidth;
        const innerTickRadius = gripRingRadius + insetAmount;
        const outerTickRadius = innerRadius - insetAmount;

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < totalTicks; i++) {
            const angle = (i / totalTicks) * 360;
            const angleRad = (angle * Math.PI) / 180;

            const x1 = center.x + innerTickRadius * Math.cos(angleRad);
            const y1 = center.y + innerTickRadius * Math.sin(angleRad);
            const x2 = center.x + outerTickRadius * Math.cos(angleRad);
            const y2 = center.y + outerTickRadius * Math.sin(angleRad);

            // Calculate center point of the tick
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
            tick.setAttribute('opacity', gripOpacity / 100);
            tick.setAttribute('vector-effect', 'non-scaling-stroke');
            tick.style.pointerEvents = 'none';
            tick.style.transformOrigin = `${centerX}px ${centerY}px`;

            // Store original positions for animation
            tick.setAttribute('data-x1', x1);
            tick.setAttribute('data-y1', y1);
            tick.setAttribute('data-x2', x2);
            tick.setAttribute('data-y2', y2);
            tick.setAttribute('data-center-x', centerX);
            tick.setAttribute('data-center-y', centerY);

            fragment.appendChild(tick);
        }

        this.sliceGroup.appendChild(fragment);
    }

    renderNoteMarkers(innerRadius) {
        const center = this.geometry.calculateCenter();
        const sliceCount = this.state.get('sliceCount');
        const anglePerSlice = 360 / sliceCount;

        // Get values from state
        const markerSize = this.state.get('noteMarkerSize');
        const markerColor = this.state.get('noteMarkerColor');
        const markerPosition = this.state.get('noteMarkerPosition');

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < sliceCount; i++) {
            if (i % 7 === 0) {
                const midAngle = ((i + 0.5) * anglePerSlice) * Math.PI / 180;
                const markerRadius = markerPosition * this.getUIScale();

                const markerX = center.x + markerRadius * Math.cos(midAngle);
                const markerY = center.y + markerRadius * Math.sin(midAngle);

                const marker = document.createElementNS(SVG_NS, 'circle');
                marker.setAttribute('cx', markerX);
                marker.setAttribute('cy', markerY);
                marker.setAttribute('r', markerSize);
                marker.setAttribute('fill', markerColor);
                marker.style.pointerEvents = 'none';

                fragment.appendChild(marker);
            }
        }

        this.sliceGroup.appendChild(fragment);
    }

    getKeyDisplayName() {
        const rootNote = this.state.get('rootNote');
        const mode = this.state.get('accidentalMode');
        if (mode === 'flat') return CHROMATIC_FLATS[rootNote];
        return CHROMATIC_NOTES[rootNote];
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
        const center = this.geometry.calculateCenter();
        const btnRadius = this._getHubBaseRadius();
        const color = this.state.get('audioToggleColor');
        const opacity = this.state.get('audioToggleOpacity') / 100;
        const bgGray = this.state.get('bgGray');
        const bgHex = Math.round((bgGray / 100) * 255).toString(16).padStart(2, '0');
        const bgColor = `#${bgHex}${bgHex}${bgHex}`;

        const labelColor = this.state.get('keyLabelColor');
        const labelOpacity = this.state.get('keyLabelOpacity') / 100;
        const fontFamily = this.state.get('keyFontFamily');
        const fontWeight = this.state.get('keyFontWeight');

        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'audio-toggle');
        group.style.cursor = 'pointer';

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', center.x);
        circle.setAttribute('cy', center.y);
        const pickerOpen = this.keyPickerOpen && this.audioActive;
        circle.setAttribute('r', pickerOpen ? this._getExpandedHubRadius() : btnRadius);
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', pickerOpen ? 1 : opacity);
        circle.setAttribute('class', this.audioActive ? 'audio-toggle-circle active' : 'audio-toggle-circle');
        group.appendChild(circle);

        // Key label (only shown when audio is active)
        if (this.audioActive) {
            const labelOffset = this.getKeyLabelOffset(btnRadius);
            const fontSize = this.state.get('keyLabelFontSize');

            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', center.x + labelOffset.dx);
            label.setAttribute('y', center.y + labelOffset.dy);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'central');
            label.setAttribute('font-size', fontSize);
            label.setAttribute('font-weight', fontWeight);
            label.setAttribute('font-family', fontFamily);
            label.setAttribute('fill', labelColor);
            label.setAttribute('opacity', labelOpacity);
            label.setAttribute('class', 'key-label');
            label.style.pointerEvents = 'none';
            label.style.userSelect = 'none';
            label.textContent = this.getKeyDisplayName();
            group.appendChild(label);
        }

        // Key picker (shown when picker is open)
        if (this.keyPickerOpen && this.audioActive) {
            const scale = this.getUIScale();
            const pickerCircleRadius = this.state.get('keyPickerSize') * scale;
            const spreadDistance     = this.state.get('keyPickerSpread') * scale;
            const rootNote = this.state.get('rootNote');
            const accMode = this.state.get('accidentalMode');

            // Picker appearance state
            const pickerFontSize          = this.state.get('keyPickerFontSize') * scale;
            const inactiveCircleColor     = this.state.get('keyPickerCircleColor');
            const inactiveCircleOpacity   = this.state.get('keyPickerCircleOpacity') / 100;
            const inactiveLabelColor      = this.state.get('keyPickerLabelColor');
            const inactiveLabelOpacity    = this.state.get('keyPickerLabelOpacity') / 100;
            const activeCircleColor       = this.state.get('keyPickerActiveCircleColor');
            const activeCircleOpacity     = this.state.get('keyPickerActiveCircleOpacity') / 100;
            const activeLabelColor        = this.state.get('keyPickerActiveLabelColor');
            const activeLabelOpacity      = this.state.get('keyPickerActiveLabelOpacity') / 100;

            const { center: fanDeg, arc: arcDeg } = this.getDialFanParams();
            const fanCenter = (fanDeg * Math.PI) / 180;
            const fanArc   = (arcDeg * Math.PI) / 180;

            // 7 note letters fanned into the visible screen area
            for (let i = 0; i < NOTE_LETTERS.length; i++) {
                const letter = NOTE_LETTERS[i];
                const chromaticIndex = NOTE_TO_CHROMATIC[letter][accMode];
                let angle;
                if (arcDeg === 360) {
                    angle = (i / NOTE_LETTERS.length) * Math.PI * 2;
                } else {
                    const step = fanArc / (NOTE_LETTERS.length - 1);
                    angle = fanCenter - fanArc / 2 + i * step;
                }
                const nx = center.x + spreadDistance * Math.cos(angle);
                const ny = center.y + spreadDistance * Math.sin(angle);

                const noteGroup = document.createElementNS(SVG_NS, 'g');
                noteGroup.setAttribute('class', 'key-picker-note');
                noteGroup.dataset.note = chromaticIndex;
                noteGroup.style.cursor = 'pointer';

                const isSelected = chromaticIndex === rootNote;

                const noteCircle = document.createElementNS(SVG_NS, 'circle');
                noteCircle.setAttribute('cx', nx);
                noteCircle.setAttribute('cy', ny);
                noteCircle.setAttribute('r', pickerCircleRadius);
                noteCircle.setAttribute('fill', isSelected ? activeCircleColor : inactiveCircleColor);
                noteCircle.setAttribute('opacity', isSelected ? activeCircleOpacity : inactiveCircleOpacity);
                noteCircle.setAttribute('class', isSelected ? 'picker-circle selected' : 'picker-circle');
                noteGroup.appendChild(noteCircle);

                const noteLabel = document.createElementNS(SVG_NS, 'text');
                noteLabel.setAttribute('x', nx);
                noteLabel.setAttribute('y', ny);
                noteLabel.setAttribute('text-anchor', 'middle');
                noteLabel.setAttribute('dominant-baseline', 'central');
                noteLabel.setAttribute('font-size', pickerFontSize);
                noteLabel.setAttribute('font-weight', fontWeight);
                noteLabel.setAttribute('font-family', fontFamily);
                noteLabel.setAttribute('fill', isSelected ? activeLabelColor : inactiveLabelColor);
                noteLabel.setAttribute('opacity', isSelected ? activeLabelOpacity : inactiveLabelOpacity);
                noteLabel.style.pointerEvents = 'none';
                noteLabel.style.userSelect = 'none';
                noteLabel.textContent = letter;
                noteGroup.appendChild(noteLabel);

                group.appendChild(noteGroup);
            }

        }

        // Append directly to SVG (not sliceGroup) so it doesn't rotate
        this.svg.appendChild(group);
        this.audioToggle = group;
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

        // Re-render to show/hide key label and update toggle
        this.render();
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

    _getHubBaseRadius() {
        return Math.max(8, this.state.get('audioToggleSize') * this.getUIScale());
    }

    _getExpandedHubRadius() {
        return this.state.get('innerCircleSize') * this.getUIScale();
    }

    setKeyPickerOpen(open) {
        this.keyPickerOpen = open;

        const btnR    = this._getHubBaseRadius();
        const expandR = this._getExpandedHubRadius();

        this.render(); // renders at expandR if open, btnR if closed

        if (!this.audioActive || !this.audioToggle) return;
        const circle = this.audioToggle.querySelector('.audio-toggle-circle');
        if (!circle) return;

        // Snap to fromR synchronously (before browser paints) then animate to toR
        if (open) {
            circle.setAttribute('r', btnR);   // snap small, paint will show this
            this._animateHubR(circle, btnR, expandR, 280, 'easeOut');
        } else {
            circle.setAttribute('r', expandR);
            this._animateHubR(circle, expandR, btnR, 220, 'easeOut');
        }
    }

    _animateHubR(circle, fromR, toR, duration) {
        if (this._hubRAnimId) cancelAnimationFrame(this._hubRAnimId);

        const start = performance.now();

        const easeFn = t => 1 - Math.pow(1 - t, 3); // easeOutCubic

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
        this.renderBackground();
        this.renderSlices();
        const innerRadius = this.renderInnerCircle();
        const gripRingRadius = this.renderGripRing(innerRadius);
        this.renderGripTicks(innerRadius, gripRingRadius);
        this.renderNoteMarkers(innerRadius);
        this.renderAudioToggle();
    }

    updateRotation() {
        if (this.sliceGroup) {
            const center = this.geometry.calculateCenter();
            const rotation = this.state.get('rotation');
            this.sliceGroup.setAttribute('transform', `rotate(${rotation} ${center.x} ${center.y})`);
        }
    }

    getGrayColor(grayPercent) {
        const value = Math.round((grayPercent / 100) * 255);
        const hex = value.toString(16).padStart(2, '0');
        return `#${hex}${hex}${hex}`;
    }

    getPressColor() {
        const endGray = this.state.get('pressedGradientEndGray');
        return this.getGrayColor(endGray);
    }

    getPressNarrowFactor() {
        return 1 - (this.state.get('pressShrink') / 100);
    }

    pressSlice(index) {
        // Update gradient colors when pressed
        const gradient = document.querySelector(`#gradient${index}`);
        if (gradient) {
            const stop1 = gradient.querySelector('stop:first-child');
            const stop2 = gradient.querySelector('stop:last-child');

            const pressedStartColor = this.state.get('pressedGradientStartColor');
            const pressedEndColor = this.state.get('pressedGradientEndColor');

            const activationSpeed = this.state.get('notchActivationSpeed');
            if (stop1) {
                stop1.style.transition = `stop-color ${activationSpeed}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
                stop1.setAttribute('stop-color', pressedStartColor);
            }
            if (stop2) {
                stop2.style.transition = `stop-color ${activationSpeed}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
                stop2.setAttribute('stop-color', pressedEndColor);
            }
        }

        const slice = this.sliceElements.get(index);
        const pathGen = this.pathGenerators.get(index);
        if (slice && pathGen) {
            const activationSpeed = this.state.get('notchActivationSpeed');
            slice.style.transition = `d ${activationSpeed}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
            slice.setAttribute('d', pathGen(this.getPressNarrowFactor()));
        }
    }

    releaseSlice(index) {
        // Don't release if locked
        if (this.lockedSlices.has(index)) {
            return;
        }

        // Reset gradient colors to default
        const gradient = document.querySelector(`#gradient${index}`);
        if (gradient) {
            const stop1 = gradient.querySelector('stop:first-child');
            const stop2 = gradient.querySelector('stop:last-child');

            const defaultStartColor = this.state.get('defaultGradientStartColor');
            const defaultEndColor = this.state.get('defaultGradientEndColor');

            const deactivationSpeed = this.state.get('notchDeactivationSpeed');
            if (stop1) {
                stop1.style.transition = `stop-color ${deactivationSpeed}ms ease-out`;
                stop1.setAttribute('stop-color', defaultStartColor);
            }
            if (stop2) {
                stop2.style.transition = `stop-color ${deactivationSpeed}ms ease-out`;
                stop2.setAttribute('stop-color', defaultEndColor);
            }
        }

        const slice = this.sliceElements.get(index);
        const pathGen = this.pathGenerators.get(index);
        if (slice && pathGen) {
            const deactivationSpeed = this.state.get('notchDeactivationSpeed');
            slice.style.transition = `d ${deactivationSpeed}ms ease-out`;
            slice.setAttribute('d', pathGen(1));
        }
    }

    lockSlice(index) {
        this.lockedSlices.add(index);
        // Slice stays in pressed state

        // Add visual feedback pulse
        this.pulseLockFeedback(index);
    }

    pulseLockFeedback(index) {
        const slice = this.sliceElements.get(index);
        const stop2 = document.querySelector(`.stop2-${index}`);
        const pathGen = this.pathGenerators.get(index);

        if (!slice || !stop2 || !pathGen) return;

        const pressBrightness = this.state.get('pressBrightness');
        const normalBrightness = pressBrightness / 100;
        const pulseBrightness = Math.min(1, normalBrightness * 1.8); // 80% brighter pulse

        const normalValue = Math.round(normalBrightness * 255);
        const pulseValue = Math.round(pulseBrightness * 255);

        const normalHex = normalValue.toString(16).padStart(2, '0');
        const pulseHex = pulseValue.toString(16).padStart(2, '0');

        const normalColor = `#${normalHex}${normalHex}${normalHex}`;
        const pulseColor = `#${pulseHex}${pulseHex}${pulseHex}`;

        // Quick pulse animation: bright -> normal -> bright -> normal
        stop2.animate([
            { stopColor: normalColor },
            { stopColor: pulseColor, offset: 0.25 },
            { stopColor: normalColor, offset: 0.5 },
            { stopColor: pulseColor, offset: 0.75 },
            { stopColor: normalColor }
        ], {
            duration: 600,
            easing: 'ease-in-out'
        });

        // Quick scale pulse
        const narrowFactor = this.getPressNarrowFactor();
        const pulseFactor = narrowFactor * 0.92; // Slightly smaller for pulse

        slice.animate([
            { d: pathGen(narrowFactor) },
            { d: pathGen(pulseFactor), offset: 0.25 },
            { d: pathGen(narrowFactor), offset: 0.5 },
            { d: pathGen(pulseFactor), offset: 0.75 },
            { d: pathGen(narrowFactor) }
        ], {
            duration: 600,
            easing: 'ease-in-out'
        });
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
        const scale = this.getUIScale();
        const innerRadius = this.state.get('innerCircleSize') * scale;
        const gripRingRadius = Math.max(0, innerRadius - this.state.get('grabberWidth') * scale);
        return { center, innerRadius, gripRingRadius };
    }

    completeStartupAnimation() {
        // Remove animation classes from all slices
        this.sliceElements.forEach((slice) => {
            slice.classList.remove('startup-animation');
            slice.style.webkitAnimationDelay = '';
            slice.style.animationDelay = '';
        });
        this.isFirstRender = false;
    }

    activateGripper() {
        if (this.sliceGroup && this.gripRingBaseRadii) {
            this.sliceGroup.classList.add('gripper-active');

            // Get state values for animation
            const ringThicknessBoost = this.state.get('ringThicknessBoost');
            const notchBrightnessBoost = this.state.get('notchBrightnessBoost');
            const notchGrowthFactor = this.state.get('notchGrowthFactor');

            const center = this.geometry.calculateCenter();

            // Thicken the grip ring by expanding outer radius and contracting inner radius
            const gripRingBase = this.sliceGroup.querySelector('.grip-ring-base');
            const gripRingNoise = this.sliceGroup.querySelector('.grip-ring-noise');

            if (gripRingBase) {
                const targetOpacity = Math.min(1, parseFloat(gripRingBase.getAttribute('opacity')) * 2);

                // Calculate thickened radii
                const thickenedOuterRadius = this.gripRingBaseRadii.outerRadius * ringThicknessBoost;
                const thickenedInnerRadius = this.gripRingBaseRadii.innerRingRadius / ringThicknessBoost;
                const thickenedPath = this.createGripRingPath(center, thickenedOuterRadius, thickenedInnerRadius);

                // Use CSS transitions for reliable d + opacity animation
                const animationSpeed = this.state.get('notchActivationSpeed');
                const easing = 'cubic-bezier(0.4, 0.0, 0.2, 1)';
                gripRingBase.style.transition = `d ${animationSpeed}ms ${easing}, opacity ${animationSpeed}ms ${easing}`;
                gripRingBase.setAttribute('d', thickenedPath);
                gripRingBase.setAttribute('opacity', targetOpacity);

                // Animate noise ring if it exists
                if (gripRingNoise) {
                    const noiseTargetOpacity = Math.min(1, parseFloat(gripRingNoise.getAttribute('opacity')) * 1.5);
                    gripRingNoise.style.transition = `d ${animationSpeed}ms ${easing}, opacity ${animationSpeed}ms ${easing}`;
                    gripRingNoise.setAttribute('d', thickenedPath);
                    gripRingNoise.setAttribute('opacity', noiseTargetOpacity);
                }
            }

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

            // Reset the grip ring to original opacity and radii
            const gripRingOpacity = this.state.get('gripRingOpacity');
            const noiseIntensity = this.state.get('gripRingNoiseIntensity');
            const gripRingBase = this.sliceGroup.querySelector('.grip-ring-base');
            const gripRingNoise = this.sliceGroup.querySelector('.grip-ring-noise');

            if (gripRingBase) {
                const targetOpacity = gripRingOpacity / 100;
                const center = this.geometry.calculateCenter();
                const basePath = this.createGripRingPath(
                    center,
                    this.gripRingBaseRadii.outerRadius,
                    this.gripRingBaseRadii.innerRingRadius
                );

                // Use CSS transitions for reliable d + opacity animation
                const animationSpeed = this.state.get('notchDeactivationSpeed');
                gripRingBase.style.transition = `d ${animationSpeed}ms ease-out, opacity ${animationSpeed}ms ease-out`;
                gripRingBase.setAttribute('d', basePath);
                gripRingBase.setAttribute('opacity', targetOpacity);

                // Animate noise ring if it exists
                if (gripRingNoise) {
                    const noiseTargetOpacity = noiseIntensity / 100;
                    gripRingNoise.style.transition = `d ${animationSpeed}ms ease-out, opacity ${animationSpeed}ms ease-out`;
                    gripRingNoise.setAttribute('d', basePath);
                    gripRingNoise.setAttribute('opacity', noiseTargetOpacity);
                }
            }

            // Reset grip ticks to original scale and opacity
            const gripOpacity = this.state.get('gripOpacity');
            const gripTicks = this.sliceGroup.querySelectorAll('.grip-tick');
            gripTicks.forEach(tick => {
                tick.setAttribute('opacity', gripOpacity / 100);

                // Reset transform to scale(1) - CSS transition will animate it smoothly
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
            lastPinchDistance: 0
        };

        this.setupEventListeners();
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
        const rect = this.svg.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const viewBox = this.svg.viewBox.baseVal;
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;
        return { x: x * scaleX, y: y * scaleY };
    }

    getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    handleStart(e) {
        // Don't intercept clicks on the audio toggle
        if (e.target.closest('.audio-toggle')) return;

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

        // Check for multi-touch (pinch gesture)
        // Only enable pinch if BOTH touches are in the gripper area
        if (e.touches && e.touches.length >= 2) {
            const touch1Coords = this.getSVGCoordinates(e.touches[0].clientX, e.touches[0].clientY);
            const touch2Coords = this.getSVGCoordinates(e.touches[1].clientX, e.touches[1].clientY);
            const innerCircleData = this.renderer.getInnerCircleData();

            const touch1InGripper = this.geometry.isInDraggableRing(touch1Coords.x, touch1Coords.y, innerCircleData.center, innerCircleData.innerRadius, innerCircleData.gripRingRadius);
            const touch2InGripper = this.geometry.isInDraggableRing(touch2Coords.x, touch2Coords.y, innerCircleData.center, innerCircleData.innerRadius, innerCircleData.gripRingRadius);

            if (touch1InGripper && touch2InGripper) {
                this.startPinch(e.touches[0], e.touches[1]);
                e.preventDefault();
                return;
            }
            // Otherwise fall through to allow multi-touch on slices
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

    startPinch(touch1, touch2) {
        this.dragState.isPinching = true;
        this.dragState.lastPinchDistance = this.getTouchDistance(touch1, touch2);
    }

    startRotation(x, y, innerCircleData) {
        this.dragState.isRotating = true;
        this.dragState.wasInGripperZone = true;
        this.dragState.startedFromSlice = false;
        this.dragState.lastAngle = this.geometry.getAngleFromPoint(x, y, innerCircleData.center);

        const innerCircle = document.getElementById('innerRotationPlate');
        if (innerCircle) innerCircle.style.cursor = 'grabbing';

        // Activate gripper animation
        this.renderer.activateGripper();
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
            this.dragState.isPinching = false;
            this.dragState.lastPinchDistance = 0;

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
        const currentDistance = this.getTouchDistance(touch1, touch2);
        const distanceDelta = currentDistance - this.dragState.lastPinchDistance;

        // Sensitivity: ~20px change = 1 slice (more sensitive for smoother feel)
        const sliceChange = Math.round(distanceDelta / 20);

        if (sliceChange !== 0) {
            const currentSliceCount = this.state.get('sliceCount');
            // Pinch in (smaller distance) = MORE slices
            // Expand out (larger distance) = FEWER slices
            const newSliceCount = Math.max(6, Math.min(72, currentSliceCount - sliceChange));

            if (newSliceCount !== currentSliceCount) {
                this.state.set('sliceCount', newSliceCount);
                this.renderer.render();
                this.dragState.lastPinchDistance = currentDistance;
            }
        }
    }

    handleRotation(x, y, innerCircleData) {
        const currentAngle = this.geometry.getAngleFromPoint(x, y, innerCircleData.center);
        let angleDiff = currentAngle - this.dragState.lastAngle;

        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;

        const newRotation = (this.state.get('rotation') + angleDiff + 360) % 360;
        this.state.set('rotation', newRotation);
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

        // No longer need interaction tracking for manual lock detection
        // Auto-lock handles it via timeout
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

        // Deactivate gripper animation if rotating
        if (this.dragState.isRotating) {
            this.renderer.deactivateGripper();
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
            darkThemeBtn: document.getElementById('darkThemeBtn'),
            lightThemeBtn: document.getElementById('lightThemeBtn'),
            closeBtn: document.getElementById('closeBtn'),
            modalBackdrop: document.getElementById('modalBackdrop'),
            sliceCount: document.getElementById('sliceCount'),
            sliceDecBtn: document.getElementById('sliceDecBtn'),
            sliceIncBtn: document.getElementById('sliceIncBtn'),
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
            audioToggleColor: document.getElementById('audioToggleColor'),
            audioToggleOpacitySlider: document.getElementById('audioToggleOpacitySlider'),
            audioToggleOpacityValue: document.getElementById('audioToggleOpacityValue'),
            audioToggleSizeSlider: document.getElementById('audioToggleSizeSlider'),
            audioToggleSizeValue: document.getElementById('audioToggleSizeValue'),
            keyFontFamily: document.getElementById('keyFontFamily'),
            keyFontWeight: document.getElementById('keyFontWeight'),
            keyLabelFontSizeSlider: document.getElementById('keyLabelFontSizeSlider'),
            keyLabelFontSizeValue: document.getElementById('keyLabelFontSizeValue'),
            keyLabelColor: document.getElementById('keyLabelColor'),
            keyLabelOpacitySlider: document.getElementById('keyLabelOpacitySlider'),
            keyLabelOpacityValue: document.getElementById('keyLabelOpacityValue'),
            keyPickerSizeSlider: document.getElementById('keyPickerSizeSlider'),
            keyPickerSizeValue: document.getElementById('keyPickerSizeValue'),
            keyPickerSpreadSlider: document.getElementById('keyPickerSpreadSlider'),
            keyPickerSpreadValue: document.getElementById('keyPickerSpreadValue'),
            keyPickerFontSizeSlider: document.getElementById('keyPickerFontSizeSlider'),
            keyPickerFontSizeValue: document.getElementById('keyPickerFontSizeValue'),
            keyPickerCircleColor: document.getElementById('keyPickerCircleColor'),
            keyPickerCircleOpacitySlider: document.getElementById('keyPickerCircleOpacitySlider'),
            keyPickerCircleOpacityValue: document.getElementById('keyPickerCircleOpacityValue'),
            keyPickerLabelColor: document.getElementById('keyPickerLabelColor'),
            keyPickerLabelOpacitySlider: document.getElementById('keyPickerLabelOpacitySlider'),
            keyPickerLabelOpacityValue: document.getElementById('keyPickerLabelOpacityValue'),
            keyPickerActiveCircleColor: document.getElementById('keyPickerActiveCircleColor'),
            keyPickerActiveCircleOpacitySlider: document.getElementById('keyPickerActiveCircleOpacitySlider'),
            keyPickerActiveCircleOpacityValue: document.getElementById('keyPickerActiveCircleOpacityValue'),
            keyPickerActiveLabelColor: document.getElementById('keyPickerActiveLabelColor'),
            keyPickerActiveLabelOpacitySlider: document.getElementById('keyPickerActiveLabelOpacitySlider'),
            keyPickerActiveLabelOpacityValue: document.getElementById('keyPickerActiveLabelOpacityValue'),
            sectionHeaders: document.querySelectorAll('.section-header'),
            gripThicknessSlider: document.getElementById('gripThicknessSlider'),
            gripThicknessValue: document.getElementById('gripThicknessValue'),
            ticksPerEdgeSlider: document.getElementById('ticksPerEdgeSlider'),
            ticksPerEdgeValue: document.getElementById('ticksPerEdgeValue'),
            gripOpacitySlider: document.getElementById('gripOpacitySlider'),
            gripOpacityValue: document.getElementById('gripOpacityValue'),
            gripRingOpacitySlider: document.getElementById('gripRingOpacitySlider'),
            gripRingOpacityValue: document.getElementById('gripRingOpacityValue'),
            gripInsetSlider: document.getElementById('gripInsetSlider'),
            gripInsetValue: document.getElementById('gripInsetValue'),
            pressShrinkSlider: document.getElementById('pressShrinkSlider'),
            pressShrinkValue: document.getElementById('pressShrinkValue'),
            pressBrightnessSlider: document.getElementById('pressBrightnessSlider'),
            pressBrightnessValue: document.getElementById('pressBrightnessValue'),
            // Experimental controls
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
            ringThicknessBoostSlider: document.getElementById('ringThicknessBoostSlider'),
            ringThicknessBoostValue: document.getElementById('ringThicknessBoostValue'),
            // Gradient controls
            defaultGradientAngleSlider: document.getElementById('defaultGradientAngleSlider'),
            defaultGradientAngleValue: document.getElementById('defaultGradientAngleValue'),
            defaultGradientStartColor: document.getElementById('defaultGradientStartColor'),
            defaultGradientEndColor: document.getElementById('defaultGradientEndColor'),
            pressedGradientAngleSlider: document.getElementById('pressedGradientAngleSlider'),
            pressedGradientAngleValue: document.getElementById('pressedGradientAngleValue'),
            pressedGradientStartColor: document.getElementById('pressedGradientStartColor'),
            pressedGradientEndColor: document.getElementById('pressedGradientEndColor'),
            // Grip Ring Appearance controls
            gripRingColor: document.getElementById('gripRingColor'),
            gripRingBlendSelect: document.getElementById('gripRingBlendSelect'),
            gripRingNoiseEnabledToggle: document.getElementById('gripRingNoiseEnabledToggle'),
            noiseSubgroup: document.getElementById('noiseSubgroup'),
            gripRingNoiseFrequencySlider: document.getElementById('gripRingNoiseFrequencySlider'),
            gripRingNoiseFrequencyValue: document.getElementById('gripRingNoiseFrequencyValue'),
            gripRingNoiseOctavesSlider: document.getElementById('gripRingNoiseOctavesSlider'),
            gripRingNoiseOctavesValue: document.getElementById('gripRingNoiseOctavesValue'),
            gripRingNoiseTypeSelect: document.getElementById('gripRingNoiseTypeSelect'),
            gripRingNoiseColor: document.getElementById('gripRingNoiseColor'),
            gripRingNoiseIntensitySlider: document.getElementById('gripRingNoiseIntensitySlider'),
            gripRingNoiseIntensityValue: document.getElementById('gripRingNoiseIntensityValue'),
            gripRingNoiseBlendSelect: document.getElementById('gripRingNoiseBlendSelect'),
            // Note Marker controls
            noteMarkerSizeSlider: document.getElementById('noteMarkerSizeSlider'),
            noteMarkerSizeValue: document.getElementById('noteMarkerSizeValue'),
            noteMarkerColor: document.getElementById('noteMarkerColor'),
            noteMarkerPositionSlider: document.getElementById('noteMarkerPositionSlider'),
            noteMarkerPositionValue: document.getElementById('noteMarkerPositionValue'),
            // Save slot buttons
            presetNameInput: document.getElementById('presetNameInput'),
            savePresetBtn: document.getElementById('savePresetBtn'),
            presetList: document.getElementById('presetList'),
            importFileInput: document.getElementById('importFileInput'),
            resetSettingsBtn: document.getElementById('resetSettingsBtn')
        };
    }

    setupEventListeners() {
        // Modal controls
        this.elements.toggleBtn.addEventListener('click', () => this.toggleModal());
        this.elements.darkThemeBtn.addEventListener('click', () => this.setTheme('dark'));
        this.elements.lightThemeBtn.addEventListener('click', () => this.setTheme('light'));
        this.elements.closeBtn.addEventListener('click', () => this.closeModal());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.modalBackdrop.classList.contains('active')) {
                this.closeModal();
            }
        });

        // Slice count controls
        this.elements.sliceDecBtn.addEventListener('click', () => this.changeSliceCount(-1));
        this.elements.sliceIncBtn.addEventListener('click', () => this.changeSliceCount(1));
        this.elements.sliceCount.addEventListener('change', () => this.updateSliceCount());

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
        this.setupColorInput('audioToggleColor', 'audioToggleColor', () => this.renderer.render());
        this.setupSlider('audioToggleOpacitySlider', 'audioToggleOpacity', 'audioToggleOpacityValue', '%', () => this.renderer.render());
        this.setupSlider('audioToggleSizeSlider', 'audioToggleSize', 'audioToggleSizeValue', 'pt', () => this.renderer.render());
        this.setupDropdown('keyFontFamily', 'keyFontFamily', () => this.renderer.render());
        this.setupDropdown('keyFontWeight', 'keyFontWeight', () => this.renderer.render());
        this.setupSlider('keyLabelFontSizeSlider', 'keyLabelFontSize', 'keyLabelFontSizeValue', 'px', () => this.renderer.render());
        this.setupColorInput('keyLabelColor', 'keyLabelColor', () => this.renderer.render());
        this.setupSlider('keyLabelOpacitySlider', 'keyLabelOpacity', 'keyLabelOpacityValue', '%', () => this.renderer.render());
        this.setupSlider('keyPickerSizeSlider', 'keyPickerSize', 'keyPickerSizeValue', '', () => this.renderer.render());
        this.setupSlider('keyPickerSpreadSlider', 'keyPickerSpread', 'keyPickerSpreadValue', '', () => this.renderer.render());
        this.setupSlider('keyPickerFontSizeSlider', 'keyPickerFontSize', 'keyPickerFontSizeValue', 'px', () => this.renderer.render());
        this.setupColorInput('keyPickerCircleColor', 'keyPickerCircleColor', () => this.renderer.render());
        this.setupSlider('keyPickerCircleOpacitySlider', 'keyPickerCircleOpacity', 'keyPickerCircleOpacityValue', '%', () => this.renderer.render());
        this.setupColorInput('keyPickerLabelColor', 'keyPickerLabelColor', () => this.renderer.render());
        this.setupSlider('keyPickerLabelOpacitySlider', 'keyPickerLabelOpacity', 'keyPickerLabelOpacityValue', '%', () => this.renderer.render());
        this.setupColorInput('keyPickerActiveCircleColor', 'keyPickerActiveCircleColor', () => this.renderer.render());
        this.setupSlider('keyPickerActiveCircleOpacitySlider', 'keyPickerActiveCircleOpacity', 'keyPickerActiveCircleOpacityValue', '%', () => this.renderer.render());
        this.setupColorInput('keyPickerActiveLabelColor', 'keyPickerActiveLabelColor', () => this.renderer.render());
        this.setupSlider('keyPickerActiveLabelOpacitySlider', 'keyPickerActiveLabelOpacity', 'keyPickerActiveLabelOpacityValue', '%', () => this.renderer.render());

        // Section toggling
        this.elements.sectionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('open');
            });
        });
        this.setupSlider('gripThicknessSlider', 'gripThickness', 'gripThicknessValue', 'px', () => this.renderer.render());
        this.setupSlider('ticksPerEdgeSlider', 'ticksPerEdge', 'ticksPerEdgeValue', '', () => this.renderer.render());
        this.setupSlider('gripOpacitySlider', 'gripOpacity', 'gripOpacityValue', '%', () => this.renderer.render());
        this.setupSlider('gripRingOpacitySlider', 'gripRingOpacity', 'gripRingOpacityValue', '%', () => this.renderer.render());
        this.setupSlider('gripInsetSlider', 'gripInset', 'gripInsetValue', '%', () => this.renderer.render());
        this.setupSlider('pressShrinkSlider', 'pressShrink', 'pressShrinkValue', '%');
        this.setupSlider('pressBrightnessSlider', 'pressBrightness', 'pressBrightnessValue', '%');

        // Experimental sliders
        this.setupSlider('droneLockTimeSlider', 'droneLockTime', 'droneLockTimeValue', 'ms');
        this.setupSlider('notchGrowthFactorSlider', 'notchGrowthFactor', 'notchGrowthFactorValue', 'x');
        this.setupSlider('notchActivationSpeedSlider', 'notchActivationSpeed', 'notchActivationSpeedValue', 'ms', (value) => this.updateAnimationSpeed());
        this.setupSlider('notchDeactivationSpeedSlider', 'notchDeactivationSpeed', 'notchDeactivationSpeedValue', 'ms', (value) => this.updateAnimationSpeed());
        this.setupSlider('notchBrightnessBoostSlider', 'notchBrightnessBoost', 'notchBrightnessBoostValue', 'x');
        this.setupSlider('ringThicknessBoostSlider', 'ringThicknessBoost', 'ringThicknessBoostValue', 'x');

        // Gradient controls
        this.setupSlider('defaultGradientAngleSlider', 'defaultGradientAngle', 'defaultGradientAngleValue', '°', () => this.renderer.render());
        this.setupColorInput('defaultGradientStartColor', 'defaultGradientStartColor', () => this.renderer.render());
        this.setupColorInput('defaultGradientEndColor', 'defaultGradientEndColor', () => this.renderer.render());
        this.setupSlider('pressedGradientAngleSlider', 'pressedGradientAngle', 'pressedGradientAngleValue', '°');
        this.setupColorInput('pressedGradientStartColor', 'pressedGradientStartColor');
        this.setupColorInput('pressedGradientEndColor', 'pressedGradientEndColor');

        // Grip Ring Appearance controls
        this.setupColorInput('gripRingColor', 'gripRingColor', () => this.renderer.render());
        this.setupDropdown('gripRingBlendSelect', 'gripRingBlend', () => this.renderer.render());
        this.elements.gripRingNoiseEnabledToggle.addEventListener('change', (e) => {
            this.state.set('gripRingNoiseEnabled', e.target.checked);
            this.elements.noiseSubgroup.classList.toggle('disabled', !e.target.checked);
            this.renderer.render();
        });
        this.setupSlider('gripRingNoiseFrequencySlider', 'gripRingNoiseFrequency', 'gripRingNoiseFrequencyValue', '', () => this.renderer.render());
        this.setupSlider('gripRingNoiseOctavesSlider', 'gripRingNoiseOctaves', 'gripRingNoiseOctavesValue', '', () => this.renderer.render());
        this.setupDropdown('gripRingNoiseTypeSelect', 'gripRingNoiseType', () => this.renderer.render());
        this.setupColorInput('gripRingNoiseColor', 'gripRingNoiseColor', () => this.renderer.render());
        this.setupSlider('gripRingNoiseIntensitySlider', 'gripRingNoiseIntensity', 'gripRingNoiseIntensityValue', '%', () => this.renderer.render());
        this.setupDropdown('gripRingNoiseBlendSelect', 'gripRingNoiseBlend', () => this.renderer.render());

        // Note Marker controls
        this.setupSlider('noteMarkerSizeSlider', 'noteMarkerSize', 'noteMarkerSizeValue', 'px', () => this.renderer.render());
        this.setupColorInput('noteMarkerColor', 'noteMarkerColor', () => this.renderer.render());
        this.setupSlider('noteMarkerPositionSlider', 'noteMarkerPosition', 'noteMarkerPositionValue', 'pt', () => this.renderer.render());

        // Save slot controls
        this.elements.savePresetBtn.addEventListener('click', () => this.savePreset());
        this.elements.presetNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.savePreset(); });
        this.elements.importFileInput.addEventListener('change', (e) => this.importPreset(e));
        this.renderPresetList();
        this.elements.resetSettingsBtn.addEventListener('click', () => this.resetSettings());

        // Subscribe to rotation changes from interaction
        this.state.subscribe('rotation', (value) => {
            this.elements.rotationSlider.value = Math.round(value);
            this.elements.rotationValue.textContent = Math.round(value);
            this.renderer.updateRotation();
        });

        // Subscribe to slice count changes from pinch gesture
        this.state.subscribe('sliceCount', (value) => {
            this.elements.sliceCount.value = value;
        });
    }

    setupSlider(sliderKey, stateKey, valueKey, suffix, callback) {
        const slider = this.elements[sliderKey];
        const valueDisplay = this.elements[valueKey];

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

        input.addEventListener('input', (e) => {
            const value = e.target.value;
            this.state.set(stateKey, value);
            if (callback) callback(value);
        });
    }

    setupDropdown(dropdownKey, stateKey, callback) {
        const dropdown = this.elements[dropdownKey];

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

    updateBackgroundColor(value) {
        const grayValue = Math.round((value / 100) * 255);
        const hexValue = grayValue.toString(16).padStart(2, '0');
        document.documentElement.style.setProperty('--bg-primary', `#${hexValue}${hexValue}${hexValue}`);
        this.renderer.render();
    }

    updateAnimationSpeed() {
        const activationSpeed = this.state.get('notchActivationSpeed');
        const deactivationSpeed = this.state.get('notchDeactivationSpeed');
        document.documentElement.style.setProperty('--notch-activation-speed', `${activationSpeed}ms`);
        document.documentElement.style.setProperty('--notch-deactivation-speed', `${deactivationSpeed}ms`);
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

        // Sync noise toggle
        this.elements.gripRingNoiseEnabledToggle.checked = state.gripRingNoiseEnabled;
        this.elements.noiseSubgroup.classList.toggle('disabled', !state.gripRingNoiseEnabled);

        // Sync theme buttons
        this.updateThemeButtons(state.theme);
    }

    setTheme(theme) {
        this.state.set('theme', theme);

        // Update the document theme
        document.documentElement.setAttribute('data-theme', theme);

        // Update button states
        this.updateThemeButtons(theme);

        // Update slice colors
        this.updateSliceColors(theme);
    }

    updateThemeButtons(theme) {
        if (theme === 'dark') {
            this.elements.darkThemeBtn.classList.add('active');
            this.elements.lightThemeBtn.classList.remove('active');
        } else {
            this.elements.lightThemeBtn.classList.add('active');
            this.elements.darkThemeBtn.classList.remove('active');
        }
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
        const { rotation: _r, ...stateWithoutRotation } = this.state.getAll();
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
        const { rotation: _r, ...stateWithoutRotation } = this.state.getAll();
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
        const { rotation: _r, ...stateWithoutRotation } = preset.state;
        await navigator.clipboard.writeText(JSON.stringify(stateWithoutRotation));
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

    updateSliceColors(theme) {
        const sliceColor = theme === 'dark' ? '#000' : '#fff';
        const sliceCount = this.state.get('sliceCount');

        // Update all gradient stop colors
        for (let i = 0; i < sliceCount; i++) {
            const stop1 = document.querySelector(`#gradient${i} stop:first-child`);
            const stop2 = document.querySelector(`#gradient${i} stop:last-child`);
            if (stop1) stop1.setAttribute('stop-color', sliceColor);
            if (stop2 && !stop2.style.transition) {
                stop2.setAttribute('stop-color', sliceColor);
            }
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
        // Note: Auto-load removed - users now manually load from slots

        // Prevent context menu on iOS and other touch devices
        this.svgElement.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.radial-piano')) {
                e.preventDefault();
            }
        });

        // Initialize theme
        const theme = this.stateManager.get('theme');
        document.documentElement.setAttribute('data-theme', theme);

        // Initialize background color
        const grayValue = Math.round((this.stateManager.get('bgGray') / 100) * 255);
        const hexValue = grayValue.toString(16).padStart(2, '0');
        document.documentElement.style.setProperty('--bg-primary', `#${hexValue}${hexValue}${hexValue}`);

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

        // Remove startup overlay immediately (skeleton is the new idle state)
        const overlay = document.getElementById('startupOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }
    }

    setupAudioButton() {
        this.audioEnabled = false;
        this.audioInitialized = false;
        this.keyPickerOpen = false;
        this._holdTimer = null;
        this._holdTriggered = false;

        const HOLD_DURATION = 1000;

        const getToggle = (e) => {
            const target = e.target || (e.touches && e.touches[0] && document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY));
            return target && target.closest('.audio-toggle');
        };

        // touchstart: start hold timer (passive — don't preventDefault so click fires on iOS)
        this.svgElement.addEventListener('touchstart', (e) => {
            if (!getToggle(e)) return;
            this._holdTriggered = false;
            if (this.audioEnabled) {
                this._holdTimer = setTimeout(() => {
                    this._holdTriggered = true;
                    this.turnOffAudio();
                }, HOLD_DURATION);
            }
        }, { passive: true });

        // touchend: clear hold timer (passive)
        this.svgElement.addEventListener('touchend', (e) => {
            if (!getToggle(e)) return;
            clearTimeout(this._holdTimer);
        }, { passive: true });

        // mousedown: hold timer for desktop
        this.svgElement.addEventListener('mousedown', (e) => {
            if (!getToggle(e)) return;
            this._holdTriggered = false;
            if (this.audioEnabled) {
                this._holdTimer = setTimeout(() => {
                    this._holdTriggered = true;
                    this.turnOffAudio();
                }, HOLD_DURATION);
            }
        });

        // mouseup: clear hold timer for desktop
        this.svgElement.addEventListener('mouseup', (e) => {
            if (!getToggle(e)) return;
            clearTimeout(this._holdTimer);
        });

        // click: handle the tap action — fires on both desktop mouse and iOS touch
        // Safari recognises 'click' as a user gesture through async/await chains
        this.svgElement.addEventListener('click', async (e) => {
            if (!getToggle(e)) return;
            if (this._holdTriggered) return;

            const target = e.target;

            // Tapping a dial note: select key, keep picker open
            if (target && target.closest('.key-picker-note')) {
                const noteIndex = parseInt(target.closest('.key-picker-note').dataset.note);
                if (!isNaN(noteIndex)) {
                    this.stateManager.set('rootNote', noteIndex);
                    this.renderEngine.render();
                }
                return;
            }

            if (!this.audioInitialized) {
                try {
                    await this.audioEngine.init();
                    this.audioInitialized = true;
                    this.audioEnabled = true;
                    this.audioEngine.enabled = true;
                    this.renderEngine.setAudioToggleActive(true);
                } catch (err) {
                    console.error('Audio init failed:', err);
                }
            } else if (!this.audioEnabled) {
                this.audioEngine.enabled = true;
                this.audioEnabled = true;
                this.renderEngine.setAudioToggleActive(true);
            } else {
                this.keyPickerOpen = !this.keyPickerOpen;
                this.renderEngine.setKeyPickerOpen(this.keyPickerOpen);
            }
        });

        // Close picker when clicking outside
        document.addEventListener('mousedown', (e) => {
            if (this.keyPickerOpen
                && !e.target.closest('.audio-toggle')
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

    async handleStartupAnimation() {
        // Calculate animation duration
        // Last slice starts at: sliceCount * 20ms
        // Animation duration: 600ms
        // Total: (sliceCount * 20) + 600
        const sliceCount = this.stateManager.get('sliceCount');
        const staggerDelay = 20; // ms per slice
        const animationDuration = 600; // ms
        const totalDuration = (sliceCount * staggerDelay) + animationDuration;

        // Wait for animation to complete
        await new Promise(resolve => setTimeout(resolve, totalDuration));

        // Remove overlay
        const overlay = document.getElementById('startupOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            // Wait for fade-out transition
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }

        // Clean up animation classes
        this.renderEngine.completeStartupAnimation();
    }
}

// ============================================
// START APPLICATION
// ============================================
new Application().init();
