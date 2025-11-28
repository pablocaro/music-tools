# Radial Piano - One-Finger Music Tool

A prototype music instrument designed for single-finger interaction, featuring a radial interface that transforms touch gestures into musical notes. This is an evolving experimental project exploring innovative ways to make music accessible and intuitive on touch devices.

## Project Vision

The core concept is simple: **create a sound maker that works beautifully with just one finger**. Whether you're on a phone, tablet, or desktop, you can make music through natural touch interactions without needing musical training or complex controls.

This is a living prototype that evolves as we explore new interaction patterns, scales, and sonic possibilities.

## Current Features

### Core Interaction
- **One-finger playability** - Touch slices to play notes, drag across for fluid melodies
- **Radial layout** - Notes arranged in a circle for intuitive spatial navigation
- **Rotation grip** - Grab the center ring to rotate the entire instrument
- **Multi-touch drag** - Play multiple notes by dragging with multiple fingers
- **Drone lock** - Hold a note for 3 seconds to lock it as a sustained drone
- **Pinch gesture** - Pinch in the center ring to adjust the number of slices (6-72)

### Musical Features
- **C Major scale** - Currently using C major scale across multiple octaves
- **Polyphonic synthesis** - Play multiple notes simultaneously
- **Auto-lock drones** - Create ambient textures by locking sustained notes
- **Note markers** - Visual indicators for C notes to orient yourself

### Visual Customization
- **Adjustable slices** - From 6 to 72 slices for different note densities
- **Custom gradients** - Fully customizable gradient colors and angles
- **Rotation control** - Rotate the piano to any angle
- **Radius & positioning** - Adjust size and placement on screen
- **Grip ring effects** - Procedural noise textures on the rotation grip
- **Animated feedback** - Visual response to touch with smooth transitions
- **Dark/Light themes** - Switch between theme modes
- **Startup animation** - Elegant slice-by-slice reveal on load

### Preset System
- **Save slots** - 3 preset slots for saving configurations
- **Import/Export** - Share presets as JSON files
- **Factory reset** - Restore default settings

---

## Technical Architecture

### Technology Stack
- **Pure JavaScript (ES6+)** - No build tools, runs directly in browser
- **SVG** - Vector graphics for crisp rendering at any scale
- **Tone.js** - Web Audio API wrapper for sound synthesis
- **CSS3** - Hardware-accelerated animations and transitions

### Code Structure

The codebase follows a modular, class-based architecture with clear separation of concerns:

#### Core Classes

**StateManager** (`script.js:63-119`)
- Centralized application state with reactive updates
- Observer pattern for state changes
- Computed value caching for performance
- Manages all configuration: slices, colors, gradients, geometry, etc.

**GeometryEngine** (`script.js:124-233`)
- Calculates viewport dimensions and center points
- Generates slice paths and angles
- Handles coordinate transformations
- Point-to-slice index mapping
- Supports dynamic resizing

**AudioEngine** (`script.js:238-379`)
- Manages Tone.js PolySynth initialization
- Maps slice indices to musical notes
- Tracks active notes and locked drones
- Auto-lock timeout management
- Handles audio context lifecycle (iOS-compliant)

**RenderEngine** (`script.js:384-1150`)
- SVG rendering and manipulation
- Gradient generation per slice
- Grip ring with procedural noise textures
- Visual feedback for pressed/locked states
- Startup animation orchestration
- Gripper activation/deactivation animations

**InteractionManager** (`script.js:1155-1528`)
- Unified touch/mouse/keyboard event handling
- Drag state machine for complex gestures
- Rotation mode vs. slice play mode transitions
- Pinch-to-zoom for slice count adjustment
- Prevents race conditions on iOS touch events

**ControlsManager** (`script.js:1533-2037`)
- UI controls binding and synchronization
- Modal management
- Preset save/load/export system
- LocalStorage persistence
- Real-time slider updates with state sync

**Application** (`script.js:2042-2176`)
- Main orchestrator and lifecycle manager
- Initialization sequence
- Resize handling with debouncing
- Audio button setup
- Startup animation coordination

### Key Design Patterns

**State Management**
- Single source of truth via StateManager
- Reactive updates through observer subscriptions
- Computed values cached until dependencies change

**Event Flow**
```
User Input → InteractionManager → StateManager → Reactive Updates
                ↓                       ↓
          AudioEngine            RenderEngine
```

**SVG Architecture**
- One `<path>` element per slice
- Gradients defined in `<defs>` and referenced by ID
- Transform groups for rotation (no individual element rotation)
- Path morphing for press/release animations

**Audio Lifecycle** (iOS-compliant)
- No audio initialization until explicit user interaction
- Single "Start Audio" button that calls `Tone.start()` once
- Flag-based protection against duplicate initialization
- Defensive cleanup on window blur and visibility change

### Data Flow Examples

**Playing a Note**
1. User touches slice → `InteractionManager.handleStart()`
2. Determine slice index from coordinates → `GeometryEngine.getSliceIndexAtPoint()`
3. Update visual state → `RenderEngine.pressSlice(index)`
4. Play audio → `AudioEngine.playNote(index)`
5. Start auto-lock timer (3s default)
6. If held: auto-lock triggers → `RenderEngine.lockSlice(index)`

**Rotating the Piano**
1. User drags in grip ring → `InteractionManager.startRotation()`
2. Track angle delta → `GeometryEngine.getAngleFromPoint()`
3. Update state → `StateManager.set('rotation', newAngle)`
4. State observer fires → `RenderEngine.updateRotation()`
5. Apply SVG transform → `sliceGroup.setAttribute('transform', ...)`

**Changing Slice Count**
1. User pinches in grip ring → `InteractionManager.handlePinch()`
2. Calculate distance delta → convert to slice count change
3. Update state → `StateManager.set('sliceCount', newCount)`
4. Full re-render → `RenderEngine.render()`
5. All slices regenerated with new geometry

### Performance Optimizations

- **Debounced resize** - 100ms delay before re-render
- **Computed value caching** - Expensive calculations cached in StateManager
- **Path generator closures** - Reusable path functions per slice
- **Hardware acceleration** - CSS transforms with `translateZ(0)` for iOS
- **Fragment-based DOM insertion** - Batch slice creation
- **Event delegation** - Global listeners instead of per-slice handlers
- **Noise texture caching** - Pre-rendered noise stored as data URL

### Browser Compatibility

**Tested & Working**
- Chrome/Edge (desktop & mobile)
- Safari (iOS & macOS)
- Firefox (desktop & mobile)

**iOS-Specific Considerations**
- Explicit audio initialization required
- Touch event passive flags for scroll prevention
- Hardware-accelerated animations with `-webkit-` prefixes
- Context menu prevention for long-press
- Visibility change handlers to prevent stuck notes

---

## Future Expansion Ideas

### Musical
- [ ] Multiple scale support (minor, pentatonic, chromatic, etc.)
- [ ] Custom scale builder
- [ ] Different synth types (FM, AM, additive, etc.)
- [ ] Audio effects (reverb, delay, filter, distortion)
- [ ] Recording and playback
- [ ] MIDI output support
- [ ] Microtonality support

### Interaction
- [ ] Velocity sensitivity
- [ ] Pressure sensitivity (where supported)
- [ ] Gesture-based effects (tilt, shake)
- [ ] Multi-finger chords
- [ ] Haptic feedback
- [ ] Voice/breath input
- [ ] Distance-based effects

### Visual
- [ ] Real-time audio visualization
- [ ] Particle effects
- [ ] 3D transforms and depth
- [ ] Custom color schemes per scale degree
- [ ] Animation presets
- [ ] Video recording of performance

### Accessibility
- [ ] Screen reader support improvements
- [ ] High contrast modes
- [ ] Keyboard-only operation
- [ ] Simplified mode for reduced complexity
- [ ] Colorblind-friendly themes

---

## Development Notes

### File Structure
```
piano-experimental/
├── index.html          # UI structure and controls
├── styles.css          # Styling and animations
├── script.js           # Main application logic
└── README.md           # This file
```

### State Persistence
Settings are stored in browser LocalStorage using these keys:
- `radialPianoSlot1` - Preset slot 1
- `radialPianoSlot2` - Preset slot 2
- `radialPianoSlot3` - Preset slot 3

### Adding a New Control

1. Add HTML element to `index.html`
2. Add state property to `INITIAL_STATE` in `script.js`
3. Add element reference in `ControlsManager.getElements()`
4. Set up event listener in `ControlsManager.setupEventListeners()`
5. Implement handler logic (update state, trigger render if needed)

### Modifying Audio Behavior

The `AudioEngine` class encapsulates all audio logic:
- Synth configuration: `AudioEngine.init()`
- Note mapping: `AudioEngine.getNote(index)`
- Playback logic: `AudioEngine.playNote()` / `AudioEngine.stopNote()`

### Debugging

The codebase includes console logging for:
- Preset save/load operations
- Audio initialization errors
- Import/export operations

Open browser DevTools console to see debug output.

---

## License

This is an experimental prototype. License to be determined.

## Credits

Built with:
- [Tone.js](https://tonejs.github.io/) - Web Audio framework
- Procedural noise algorithms inspired by Perlin noise concepts
- Lots of experimentation and iteration
