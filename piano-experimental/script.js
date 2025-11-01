'use strict';

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const RESIZE_DEBOUNCE_MS = 100;
const INNER_CIRCLE_RADIUS_RATIO = 0.25;
const DRAGGABLE_RING_RATIO = 0.6;
const VIEWPORT_SAFETY_BUFFER = 1.2;
const C_MAJOR_SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const CORNER_COORDS = { 'bottom-right': { x: 100, y: 100 } };

const INITIAL_STATE = {
    sliceCount: 32,
    bgGray: 0,
    offsetX: 0,
    offsetY: 0,
    radius: 100,
    rotation: 58,
    gapSize: 0,
    gripThickness: 2,
    gripOpacity: 10,
    ticksPerEdge: 3,
    gripRingOpacity: 15,
    gripInset: 10,
    pressShrink: 2,
    pressBrightness: 30,
    theme: 'dark',
    // Gradient Settings
    defaultGradientAngle: 58,
    defaultGradientStartColor: '#383838',
    defaultGradientEndColor: '#bfbfbf',
    pressedGradientAngle: 0,
    pressedGradientStartColor: '#000000',
    pressedGradientEndColor: '#4d4d4d',
    // Grip Ring Appearance
    gripRingColor: '#000000',
    // Note Markers
    noteMarkerSize: 4,
    noteMarkerColor: '#999999',
    noteMarkerPosition: 108,
    // Experimental: Drone lock timing
    droneLockTime: 3000,
    // Experimental: Gripper animations
    notchGrowthFactor: 1.2,
    notchActivationSpeed: 200,
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
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    calculateCenter() {
        return this.state.getComputed('center', (state) => {
            const size = this.getViewportSize();
            const base = CORNER_COORDS['bottom-right'];
            const baseX = (base.x / 100) * size.width;
            const baseY = (base.y / 100) * size.height;
            const offsetXPixels = (state.offsetX / 100) * size.width;
            const offsetYPixels = (state.offsetY / 100) * size.width;

            return {
                x: baseX + offsetXPixels,
                y: baseY + offsetYPixels
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

    createPathGenerator(center, radii, startAngle, endAngle) {
        const { rx, ry } = radii;
        const r1 = this.getRadiusAtAngle(startAngle, rx, ry);
        const r2 = this.getRadiusAtAngle(endAngle, rx, ry);
        const avgRadius = (r1 + r2) / 2;

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const originalPoints = {
            x1: center.x + r1 * Math.cos(startRad),
            y1: center.y + r1 * Math.sin(startRad),
            x2: center.x + r2 * Math.cos(endRad),
            y2: center.y + r2 * Math.sin(endRad)
        };

        return (narrowFactor = 1) => {
            const midAngle = (startAngle + endAngle) / 2;
            const midRad = (midAngle * Math.PI) / 180;

            const x1 = originalPoints.x1 + (center.x + avgRadius * Math.cos(midRad) - originalPoints.x1) * (1 - narrowFactor);
            const y1 = originalPoints.y1 + (center.y + avgRadius * Math.sin(midRad) - originalPoints.y1) * (1 - narrowFactor);
            const x2 = originalPoints.x2 + (center.x + avgRadius * Math.cos(midRad) - originalPoints.x2) * (1 - narrowFactor);
            const y2 = originalPoints.y2 + (center.y + avgRadius * Math.sin(midRad) - originalPoints.y2) * (1 - narrowFactor);

            return `M ${center.x} ${center.y} L ${x1} ${y1} A ${avgRadius} ${avgRadius} 0 0 1 ${x2} ${y2} Z`;
        };
    }

    getAngleFromPoint(x, y, center) {
        const dx = x - center.x;
        const dy = y - center.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    isInDraggableRing(x, y, center, innerRadius) {
        const draggableRingStart = innerRadius * DRAGGABLE_RING_RATIO;
        const dx = x - center.x;
        const dy = y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance >= draggableRingStart && distance <= innerRadius;
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
        this.activeNotes = new Map(); // Maps index -> note
        this.lockedDrones = new Map(); // Maps index -> note (for locked drones)
        this.lockTimeouts = new Map(); // Maps index -> timeout ID for auto-lock
    }

    async init() {
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

        // Resume audio context for mobile browsers
        if (Tone.context.state !== 'running') {
            await Tone.context.resume();
            console.log('🔊 Audio context resumed');
        }
    }

    getNote(index) {
        const noteInScale = index % 7;
        const octave = 3 + Math.floor(index / 7);
        return C_MAJOR_SCALE[noteInScale] + octave;
    }

    async playNote(index, onAutoLock) {
        await this.init();
        const note = this.getNote(index);

        // Don't play if already locked (wait for toggle-off)
        if (this.lockedDrones.has(index)) {
            console.log(`🔒 Note ${note} is locked, skipping (index ${index})`);
            return;
        }

        if (!this.activeNotes.has(index)) {
            console.log(`🎵 Playing note ${note} (index ${index}) - Context state: ${Tone.context.state}`);
            this.synth.triggerAttack(note);
            this.activeNotes.set(index, note);

            // Set auto-lock timeout (Option C: auto-lock at threshold time)
            const lockTime = this.state.get('droneLockTime');
            const timeoutId = setTimeout(() => {
                console.log(`🔒 Auto-locking drone ${note} after ${lockTime}ms (index ${index})`);
                this.lockDrone(index);
                if (onAutoLock) onAutoLock(index);
            }, lockTime);
            this.lockTimeouts.set(index, timeoutId);
        } else {
            console.log(`⏭️ Note ${note} already playing (index ${index})`);
        }
    }

    stopNote(index, force = false) {
        // Don't stop if locked (unless forced)
        if (this.lockedDrones.has(index) && !force) {
            console.log(`🔒 Note at index ${index} is locked, not stopping`);
            return;
        }

        if (this.activeNotes.has(index)) {
            const note = this.activeNotes.get(index);
            console.log(`🛑 Stopping note ${note} (index ${index})`);
            if (this.synth) {
                this.synth.triggerRelease(note);
            }
            this.activeNotes.delete(index);

            // Clear the auto-lock timeout (user released before lock time)
            if (this.lockTimeouts.has(index)) {
                clearTimeout(this.lockTimeouts.get(index));
                this.lockTimeouts.delete(index);
            }
        } else {
            console.log(`⚠️ Tried to stop note at index ${index} but it wasn't active`);
        }
    }

    lockDrone(index) {
        if (this.activeNotes.has(index)) {
            const note = this.activeNotes.get(index);
            console.log(`🔒 Locking drone ${note} (index ${index})`);
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
            console.log(`🔓 Unlocking and stopping drone ${note} (index ${index})`);
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
        console.log(`🔇 Stopping ALL notes. Active: ${this.activeNotes.size}, Locked: ${this.lockedDrones.size}`);

        // Stop all active notes
        if (this.synth && this.activeNotes.size > 0) {
            this.activeNotes.forEach((note, index) => {
                console.log(`  - Releasing ${note} (index ${index})`);
                this.synth.triggerRelease(note);
            });
        }
        this.activeNotes.clear();

        // Stop all locked drones
        if (this.synth && this.lockedDrones.size > 0) {
            this.lockedDrones.forEach((note, index) => {
                console.log(`  - Releasing locked drone ${note} (index ${index})`);
                this.synth.triggerRelease(note);
            });
        }
        this.lockedDrones.clear();

        // Clear all auto-lock timeouts
        this.lockTimeouts.forEach((timeoutId) => {
            clearTimeout(timeoutId);
        });
        this.lockTimeouts.clear();

        console.log(`✅ All notes cleared`);
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
        // Calculate base angle for this slice
        const baseAngle = ((index + 0.5) * anglePerSlice);

        // Apply gradient angle offset
        const angleOffset = this.state.get('defaultGradientAngle');
        const gradientAngle = (baseAngle + angleOffset) * Math.PI / 180;
        const r = Math.max(radii.rx, radii.ry);

        const x2 = center.x + r * Math.cos(gradientAngle);
        const y2 = center.y + r * Math.sin(gradientAngle);

        const gradient = document.createElementNS(SVG_NS, 'linearGradient');
        gradient.setAttribute('id', `gradient${index}`);
        gradient.setAttribute('x1', center.x);
        gradient.setAttribute('y1', center.y);
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

        const startAngle = (index * anglePerSlice) + (gapSize / 2);
        const endAngle = ((index + 1) * anglePerSlice) - (gapSize / 2);

        const pathGenerator = this.geometry.createPathGenerator(center, radii, startAngle, endAngle);
        this.pathGenerators.set(index, pathGenerator);

        const slice = document.createElementNS(SVG_NS, 'path');
        slice.setAttribute('d', pathGenerator(1));
        slice.setAttribute('class', 'slice');
        slice.setAttribute('fill', `url(#gradient${index})`);
        slice.setAttribute('data-slice', index);
        slice.setAttribute('tabindex', '0');
        slice.setAttribute('role', 'button');
        slice.setAttribute('aria-label', `Slice ${index + 1} of ${sliceCount}`);

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
        const radii = this.geometry.calculateRadii();
        const avgRadius = (radii.rx + radii.ry) / 2;
        const innerRadius = avgRadius * INNER_CIRCLE_RADIUS_RATIO;

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

    renderGripRing(innerRadius) {
        const center = this.geometry.calculateCenter();
        const gripRingRadius = innerRadius * DRAGGABLE_RING_RATIO;
        const gripRingOpacity = this.state.get('gripRingOpacity');
        const gripRingColor = this.state.get('gripRingColor');

        const outerRadius = innerRadius;
        const innerRingRadius = gripRingRadius;

        // Store base radii for animation
        this.gripRingBaseRadii = { outerRadius, innerRingRadius };

        const pathData = this.createGripRingPath(center, outerRadius, innerRingRadius);

        const gripRing = document.createElementNS(SVG_NS, 'path');
        gripRing.setAttribute('class', 'grip-ring');
        gripRing.setAttribute('d', pathData);
        gripRing.setAttribute('fill', gripRingColor);
        gripRing.setAttribute('fill-rule', 'evenodd');  // Creates the donut hole
        gripRing.setAttribute('opacity', gripRingOpacity / 100);
        gripRing.style.pointerEvents = 'none';

        this.sliceGroup.appendChild(gripRing);
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
                const markerRadius = innerRadius * (markerPosition / 100);

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

    render() {
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

            if (stop1) {
                stop1.style.transition = 'stop-color 120ms cubic-bezier(0.4, 0.0, 0.2, 1)';
                stop1.setAttribute('stop-color', pressedStartColor);
            }
            if (stop2) {
                stop2.style.transition = 'stop-color 120ms cubic-bezier(0.4, 0.0, 0.2, 1)';
                stop2.setAttribute('stop-color', pressedEndColor);
            }
        }

        const slice = this.sliceElements.get(index);
        const pathGen = this.pathGenerators.get(index);
        if (slice && pathGen) {
            slice.style.transition = 'd 120ms cubic-bezier(0.4, 0.0, 0.2, 1)';
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

            if (stop1) {
                stop1.style.transition = 'stop-color 300ms ease-out';
                stop1.setAttribute('stop-color', defaultStartColor);
            }
            if (stop2) {
                stop2.style.transition = 'stop-color 300ms ease-out';
                stop2.setAttribute('stop-color', defaultEndColor);
            }
        }

        const slice = this.sliceElements.get(index);
        const pathGen = this.pathGenerators.get(index);
        if (slice && pathGen) {
            slice.style.transition = 'd 300ms ease-out';
            slice.setAttribute('d', pathGen(1));
        }
    }

    lockSlice(index) {
        this.lockedSlices.add(index);
        console.log(`🎨 Visually locking slice ${index}`);
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
        console.log(`🎨 Visually unlocking slice ${index}`);
        // Now release the visual
        this.releaseSlice(index);
    }

    isSliceLocked(index) {
        return this.lockedSlices.has(index);
    }

    clearAllLockedSlices() {
        console.log(`🎨 Clearing all ${this.lockedSlices.size} locked slices`);
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
        const radii = this.geometry.calculateRadii();
        const avgRadius = (radii.rx + radii.ry) / 2;
        const innerRadius = avgRadius * INNER_CIRCLE_RADIUS_RATIO;
        return { center, innerRadius };
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
            const gripRing = this.sliceGroup.querySelector('.grip-ring');
            if (gripRing) {
                const currentOpacity = parseFloat(gripRing.getAttribute('opacity'));
                const targetOpacity = Math.min(1, currentOpacity * 2);

                // Calculate thickened radii
                // Outer edge grows outward
                const thickenedOuterRadius = this.gripRingBaseRadii.outerRadius * ringThicknessBoost;
                // Inner edge shrinks inward (inverse relationship for true thickening)
                const thickenedInnerRadius = this.gripRingBaseRadii.innerRingRadius / ringThicknessBoost;

                // Get current and target paths
                const currentPath = gripRing.getAttribute('d');
                const thickenedPath = this.createGripRingPath(center, thickenedOuterRadius, thickenedInnerRadius);

                // Animate using Web Animations API
                const animationSpeed = this.state.get('notchActivationSpeed');
                gripRing.animate([
                    { d: currentPath, opacity: currentOpacity },
                    { d: thickenedPath, opacity: targetOpacity }
                ], {
                    duration: animationSpeed,
                    easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
                    fill: 'forwards'
                });

                // Update final state
                gripRing.setAttribute('d', thickenedPath);
                gripRing.setAttribute('opacity', targetOpacity);
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
            const gripRing = this.sliceGroup.querySelector('.grip-ring');
            if (gripRing) {
                const currentOpacity = parseFloat(gripRing.getAttribute('opacity'));
                const targetOpacity = gripRingOpacity / 100;

                // Get current and base paths
                const currentPath = gripRing.getAttribute('d');
                const center = this.geometry.calculateCenter();
                const basePath = this.createGripRingPath(
                    center,
                    this.gripRingBaseRadii.outerRadius,
                    this.gripRingBaseRadii.innerRingRadius
                );

                // Animate using Web Animations API
                const animationSpeed = this.state.get('notchDeactivationSpeed');
                gripRing.animate([
                    { d: currentPath, opacity: currentOpacity },
                    { d: basePath, opacity: targetOpacity }
                ], {
                    duration: animationSpeed,
                    easing: 'ease-out',
                    fill: 'forwards'
                });

                // Update final state
                gripRing.setAttribute('d', basePath);
                gripRing.setAttribute('opacity', targetOpacity);
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
        // Check if tapping a locked slice to unlock it
        if (e.target.classList.contains('slice')) {
            const index = parseInt(e.target.getAttribute('data-slice'));
            if (this.audio.isLocked(index)) {
                console.log(`👆 Tapping locked slice ${index} to unlock`);
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

            const touch1InGripper = this.geometry.isInDraggableRing(touch1Coords.x, touch1Coords.y, innerCircleData.center, innerCircleData.innerRadius);
            const touch2InGripper = this.geometry.isInDraggableRing(touch2Coords.x, touch2Coords.y, innerCircleData.center, innerCircleData.innerRadius);

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
        const inDraggableRing = this.geometry.isInDraggableRing(x, y, innerCircleData.center, innerCircleData.innerRadius);

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
        console.log('🤏 Pinch started, distance:', this.dragState.lastPinchDistance);
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
            console.log('🤏 → ☝️ Transition from pinch to single touch');
            this.dragState.isPinching = false;
            this.dragState.lastPinchDistance = 0;

            // Determine what the remaining touch is over and set up appropriate state
            const clientX = e.touches[0].clientX;
            const clientY = e.touches[0].clientY;
            const { x, y } = this.getSVGCoordinates(clientX, clientY);
            const innerCircleData = this.renderer.getInnerCircleData();
            const inGripperZone = this.geometry.isInDraggableRing(x, y, innerCircleData.center, innerCircleData.innerRadius);

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
        const inGripperZone = this.geometry.isInDraggableRing(x, y, innerCircleData.center, innerCircleData.innerRadius);

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
                console.log(`🤏 Pinch: ${currentSliceCount} → ${newSliceCount} slices`);
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

    activateSlice(index) {
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
        this.audio.playNote(index, (lockedIndex) => {
            console.log(`🎨 Auto-lock callback: visually locking slice ${lockedIndex}`);
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
        if (this.dragState.isDragging || this.dragState.isRotating || this.dragState.isPinching) {
            // Release all pressed slices (unless they're already locked by auto-lock)
            this.dragState.pressedSlices.forEach(slice => {
                const index = parseInt(slice.getAttribute('data-slice'));
                // Only release if not already locked
                if (!this.audio.isLocked(index)) {
                    this.renderer.releaseSlice(index);
                    this.audio.stopNote(index);
                }
            });

            if (this.dragState.lastRotationSlice !== null) {
                if (!this.audio.isLocked(this.dragState.lastRotationSlice)) {
                    this.renderer.releaseSlice(this.dragState.lastRotationSlice);
                    this.audio.stopNote(this.dragState.lastRotationSlice);
                }
            }

            // Deactivate gripper animation if rotating
            if (this.dragState.isRotating) {
                this.renderer.deactivateGripper();
            }

            // Reset drag state
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
            offsetXSlider: document.getElementById('offsetXSlider'),
            offsetXValue: document.getElementById('offsetXValue'),
            offsetYSlider: document.getElementById('offsetYSlider'),
            offsetYValue: document.getElementById('offsetYValue'),
            radiusSlider: document.getElementById('radiusSlider'),
            radiusValue: document.getElementById('radiusValue'),
            rotationSlider: document.getElementById('rotationSlider'),
            rotationValue: document.getElementById('rotationValue'),
            gapSizeSlider: document.getElementById('gapSizeSlider'),
            gapSizeValue: document.getElementById('gapSizeValue'),
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
            // Note Marker controls
            noteMarkerSizeSlider: document.getElementById('noteMarkerSizeSlider'),
            noteMarkerSizeValue: document.getElementById('noteMarkerSizeValue'),
            noteMarkerColor: document.getElementById('noteMarkerColor'),
            noteMarkerPositionSlider: document.getElementById('noteMarkerPositionSlider'),
            noteMarkerPositionValue: document.getElementById('noteMarkerPositionValue'),
            // Save slot buttons
            saveSlot1Btn: document.getElementById('saveSlot1Btn'),
            loadSlot1Btn: document.getElementById('loadSlot1Btn'),
            saveSlot2Btn: document.getElementById('saveSlot2Btn'),
            loadSlot2Btn: document.getElementById('loadSlot2Btn'),
            saveSlot3Btn: document.getElementById('saveSlot3Btn'),
            loadSlot3Btn: document.getElementById('loadSlot3Btn'),
            resetSettingsBtn: document.getElementById('resetSettingsBtn')
        };
    }

    setupEventListeners() {
        // Modal controls
        this.elements.toggleBtn.addEventListener('click', () => this.toggleModal());
        this.elements.darkThemeBtn.addEventListener('click', () => this.setTheme('dark'));
        this.elements.lightThemeBtn.addEventListener('click', () => this.setTheme('light'));
        this.elements.closeBtn.addEventListener('click', () => this.closeModal());
        this.elements.modalBackdrop.addEventListener('click', (e) => {
            if (e.target === this.elements.modalBackdrop) this.closeModal();
        });
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
        this.setupSlider('offsetXSlider', 'offsetX', 'offsetXValue', '%', () => this.renderer.render());
        this.setupSlider('offsetYSlider', 'offsetY', 'offsetYValue', '%', () => this.renderer.render());
        this.setupSlider('radiusSlider', 'radius', 'radiusValue', '%', () => this.renderer.render());
        this.setupSlider('rotationSlider', 'rotation', 'rotationValue', '°', () => this.renderer.updateRotation());
        this.setupSlider('gapSizeSlider', 'gapSize', 'gapSizeValue', '°', () => this.renderer.render());
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

        // Note Marker controls
        this.setupSlider('noteMarkerSizeSlider', 'noteMarkerSize', 'noteMarkerSizeValue', 'px', () => this.renderer.render());
        this.setupColorInput('noteMarkerColor', 'noteMarkerColor', () => this.renderer.render());
        this.setupSlider('noteMarkerPositionSlider', 'noteMarkerPosition', 'noteMarkerPositionValue', '%', () => this.renderer.render());

        // Save slot controls
        this.elements.saveSlot1Btn.addEventListener('click', () => this.saveToSlot(1));
        this.elements.loadSlot1Btn.addEventListener('click', () => this.loadFromSlot(1));
        this.elements.saveSlot2Btn.addEventListener('click', () => this.saveToSlot(2));
        this.elements.loadSlot2Btn.addEventListener('click', () => this.loadFromSlot(2));
        this.elements.saveSlot3Btn.addEventListener('click', () => this.saveToSlot(3));
        this.elements.loadSlot3Btn.addEventListener('click', () => this.loadFromSlot(3));
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

        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.state.set(stateKey, value);
            const displayValue = value % 1 !== 0 ? value.toFixed(1) : value;
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
    }

    closeModal() {
        this.elements.modalBackdrop.classList.remove('active');
        this.elements.toggleBtn.classList.remove('active');
        this.elements.toggleBtn.setAttribute('aria-label', 'Open controls');
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

    saveToSlot(slotNumber) {
        const state = this.state.getAll();
        try {
            localStorage.setItem(`radialPianoSlot${slotNumber}`, JSON.stringify(state));
            console.log(`✅ Settings saved to Slot ${slotNumber}!`);

            // Visual feedback
            const btn = this.elements[`saveSlot${slotNumber}Btn`];
            const originalText = btn.textContent;
            btn.textContent = '✓ Saved!';
            btn.style.background = '#28a745';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#007acc';
            }, 1500);
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Failed to save settings. Please check browser storage permissions.');
        }
    }

    loadFromSlot(slotNumber) {
        try {
            const savedSettings = localStorage.getItem(`radialPianoSlot${slotNumber}`);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                Object.keys(settings).forEach(key => {
                    if (INITIAL_STATE.hasOwnProperty(key)) {
                        this.state.set(key, settings[key]);
                    }
                });
                this.syncUIWithState();
                this.renderer.render();
                console.log(`✅ Loaded settings from Slot ${slotNumber}`);

                // Visual feedback
                const btn = this.elements[`loadSlot${slotNumber}Btn`];
                const originalText = btn.textContent;
                btn.textContent = '✓ Loaded!';
                btn.style.background = '#28a745';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '#5a5a5a';
                }, 1500);
            } else {
                alert(`Slot ${slotNumber} is empty!`);
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            alert('Failed to load settings. The save data might be corrupted.');
        }
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

    init() {
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

        // Initial render
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
    }
}

// ============================================
// START APPLICATION
// ============================================
new Application().init();
