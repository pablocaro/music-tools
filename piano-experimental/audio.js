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
