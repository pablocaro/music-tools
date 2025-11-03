'use strict';

// ============================================
// AUDIO ENGINE
// ============================================
// Handles all sound synthesis using Tone.js
// Manages note playback, drone locking, and audio context

const C_MAJOR_SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

class AudioEngine {
    constructor(stateManager) {
        this.state = stateManager;
        this.synth = null;
        this.initPromise = null; // Cache initialization promise to prevent parallel inits
        this.pendingNotes = new Map(); // Maps index -> { shouldCancel: boolean, note: string }
        this.activeNotes = new Map(); // Maps index -> note
        this.lockedDrones = new Map(); // Maps index -> note (for locked drones)
        this.lockTimeouts = new Map(); // Maps index -> timeout ID for auto-lock
    }

    async init() {
        // Return cached promise if already initializing or initialized
        if (this.initPromise) {
            return this.initPromise;
        }

        // Cache the initialization promise
        this.initPromise = this._doInit();
        return this.initPromise;
    }

    async _doInit() {
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
        const note = this.getNote(index);

        // Don't play if already locked (wait for toggle-off)
        if (this.lockedDrones.has(index)) {
            console.log(`🔒 Note ${note} is locked, skipping (index ${index})`);
            return;
        }

        // Don't play if already active
        if (this.activeNotes.has(index)) {
            console.log(`⏭️ Note ${note} already playing (index ${index})`);
            return;
        }

        // IMMEDIATELY mark as pending (synchronous - happens before any async work)
        // This allows stopNote() to cancel us even if we haven't started playing yet
        this.pendingNotes.set(index, { shouldCancel: false, note });
        console.log(`⏳ Pending note ${note} (index ${index})`);

        // Now do the async initialization
        await this.init();

        // Check if we were cancelled while initializing
        const pendingState = this.pendingNotes.get(index);
        if (!pendingState || pendingState.shouldCancel) {
            console.log(`❌ Cancelled note ${note} before playing (index ${index})`);
            this.pendingNotes.delete(index);
            return;
        }

        // Not cancelled - proceed with playing
        console.log(`🎵 Playing note ${note} (index ${index}) - Context state: ${Tone.context.state}`);
        this.synth.triggerAttack(note);

        // Move from pending to active
        this.pendingNotes.delete(index);
        this.activeNotes.set(index, note);

        // Set auto-lock timeout
        const lockTime = this.state.get('droneLockTime');
        const timeoutId = setTimeout(() => {
            console.log(`🔒 Auto-locking drone ${note} after ${lockTime}ms (index ${index})`);
            this.lockDrone(index);
            if (onAutoLock) onAutoLock(index);
        }, lockTime);
        this.lockTimeouts.set(index, timeoutId);
    }

    stopNote(index, force = false) {
        // Don't stop if locked (unless forced)
        if (this.lockedDrones.has(index) && !force) {
            console.log(`🔒 Note at index ${index} is locked, not stopping`);
            return;
        }

        // Check if note is actively playing
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
        }
        // Check if note is still pending (initializing)
        else if (this.pendingNotes.has(index)) {
            const pendingState = this.pendingNotes.get(index);
            console.log(`🚫 Cancelling pending note ${pendingState.note} (index ${index})`);
            // Mark for cancellation - playNote will check this before attack
            pendingState.shouldCancel = true;
        }
        else {
            console.log(`⚠️ Tried to stop note at index ${index} but it wasn't active or pending`);
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
        console.log(`🔇 Stopping ALL notes. Pending: ${this.pendingNotes.size}, Active: ${this.activeNotes.size}, Locked: ${this.lockedDrones.size}`);

        // Cancel all pending notes (mark them so they won't play)
        this.pendingNotes.forEach((pendingState, index) => {
            console.log(`  - Cancelling pending ${pendingState.note} (index ${index})`);
            pendingState.shouldCancel = true;
        });
        this.pendingNotes.clear();

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
