/**
 * i18n.js — the interface in English and Spanish.
 *
 * Keys are grouped by where the string appears. Anything the student reads
 * lives here; note letters (C–B) and the clef glyphs deliberately do not,
 * since the app keeps English letter names in both languages.
 *
 * Spanish is pitched at a student who knows basic theory, addressed as tú.
 */
window.SR_I18N = {

  en: {
    // section headings
    // Platter titles. Presets and Rhythm reuse their section headings; these
    // four name a group that only existed as an HTML comment before.
    "band.music":      "Music",
    "band.reading":    "Reading",
    "band.staff":      "Staff & Length",
    "band.setup":      "Setup",
    "intro.blurb":     "A fresh sight-reading line every time you ask, built from the notes and rhythms you choose.",
    "intro.more":      "Learn more",
    "val.apart":       "Apart",
    "sec.presets":     "Presets",
    "sec.tempo":       "Tempo",
    "sec.accomp":      "Play Along",
    "sec.hideAhead":   "Hide Ahead",
    "sec.rhythm":      "Rhythm",
    "grp.basic":       "Basic",
    "lbl.slurs":       "Slurs",
    "lbl.ties":        "Ties",
    "grp.more":        "More",
    "sec.step":        "Intervals",
    "sec.notes":       "Notes",
    "sec.musicality":  "How Musical?",
    "sec.chroma":      "How Chromatic?",
    "sec.chordNames":  "Chord Names",
    "sec.chunks":      "Highlight Patterns",
    "sec.staff":       "Clef & Key",
    "sec.measures":    "Measures",
    "sec.instrument":  "Instrument",
    "sec.language":    "Language",
    "instr.violin":    "Violin",
    "instr.viola":     "Viola",
    "instr.cello":     "Cello",
    "instr.flute":     "Flute",
    "instr.clarinet":  "Clarinet",
    "instr.sax":       "Saxophone",
    "instr.trumpet":   "Trumpet",
    "instr.trombone":  "Trombone",
    "instr.voice":     "Voice",
    "instr.guitar":    "Guitar",
    "instr.other":     "Other",

    // chunk legend
    "legend.steps": "steps",
    "legend.leaps": "leaps",

    // values shown on controls
    "val.off":      "Off",
    "val.on":       "On",
    "val.some":     "Some",
    "val.lots":     "Lots",
    "val.beats":    "Beats",
    "val.measures": "Measures",
    "val.save":     "+ save",
    "val.custom":   "Custom",
    "val.bars":     "Bars",

    // instruments
    "inst.organ":      "Organ",
    "inst.piano":      "Piano",
    "inst.marimba":    "Marimba",
    "inst.vibraphone": "Vibraphone",
    "inst.synth":      "Synth",

    // key modes
    "mode.major": "Major",
    "mode.minor": "Minor",

    // clefs (the pill shows a glyph; this names it)
    "clef.treble": "Treble",
    "clef.alto":   "Alto",
    "clef.tenor":  "Tenor",
    "clef.bass":   "Bass",

    // built-in presets, keyed by their stable id
    // Preset labels name what is IN the exercise, never what you do with it:
    // "Thirds", not "Thirds Drill". Three systems used to run here at once —
    // content (Wide Leaps), format (Drill, Workout) and tradition (Long Tones,
    // from wind practice) — and a row of them could not be compared because
    // the reader could not tell which question the row was asking. The rule is
    // the app's own: the vocabulary is explicit, so a name states vocabulary.
    // Jig is the one deliberate exception, kept because it is the only label
    // that says how something feels, and it is what sells 6/8 to someone who
    // would never pick "Compound Time".
    // These are labels only. BUILTIN keys stay as they were, so nothing stored
    // migrates and no saved setup moves.
    "preset.steps only":   "Steps Only",
    "preset.thirds drill": "Thirds",
    "preset.wide leaps":   "Wide Leaps",
    "preset.arpeggios":    "Arpeggios",
    "preset.long tones":      "Long Notes",
    "preset.rhythm workout":  "Mixed Rhythms",
    "preset.jig":             "Jig",
    "preset.chromatic steps": "Chromatic Steps",
    "preset.minor cadences":  "Minor Cadences",

    // control names, used for aria-label and therefore the hover tooltip
    "aria.settings":     "Settings",
    "aria.fromTop":      "From the top",
    "aria.play":         "Play",
    "aria.pause":        "Pause",
    "aria.accomp":       "Accompaniment on/off",
    "aria.metronome":    "Metronome on/off",
    "aria.newExercise":  "New exercise",
    "aria.cursor":       "Cursor on/off",
    "aria.tempo":        "Tempo",
    "aria.slower":       "Slower",
    "aria.faster":       "Faster",
    "aria.less":         "Less",
    "aria.more":         "More",
    "aria.volume":       "Volume",
    "aria.voice":        "Voice",
    "aria.hideUnit":     "Hide ahead unit",
    "aria.clef":         "Clef",
    "aria.key":          "Key",
    "aria.mode":         "Mode",
    "aria.accidental":   "Accidental",
    "aria.chroma":       "Chromaticism",
    "aria.chordNames":   "Show chord names",
    "aria.chunks":       "Show chunk highlights",
    "aria.musicality":   "Musicality",
    "lbl.click":         "Click",
    "lbl.cursor":        "Cursor",
    "lbl.sound":         "Sound",
    "lbl.voice":         "Voice",
    "lbl.volume":        "Volume",
    "aria.octave":       "Octave",
    "aria.updatePreset": "Update with current settings",
    "aria.deletePreset": "Delete preset",

    // the Intervals rows: short label, and the axis its sliders run along
    "step.0": "uni",
    "step.1": "2nd",
    "step.2": "3rd",
    "step.3": "4th",
    "step.4": "5th",
    "step.5": "6th",
    "step.6": "7th",
    "step.7": "8ve",
    "col.less": "less",
    "col.more": "more",

    // intervals, in the Step matrix
    "interval.0": "unison",
    "interval.1": "2nd",
    "interval.2": "3rd",
    "interval.3": "4th",
    "interval.4": "5th",
    "interval.5": "6th",
    "interval.6": "7th",
    "interval.7": "octave",

    // rhythm figures
    "fig.w":    "whole",
    "fig.h":    "half",
    "fig.q":    "quarter",
    "fig.ee":   "eighths",
    "fig.trip": "triplet eighths",
    "fig.ssss": "sixteenths",
    "fig.ess":  "eighth + 2 sixteenths",
    "fig.sse":  "2 sixteenths + eighth",
    "fig.ses":  "16th–8th–16th",
    "fig.des":  "dotted 8th + 16th",
    "fig.sde":  "16th + dotted 8th",
    "fig.qr":   "quarter rest",
    "fig.re":   "8th rest + eighth",
    "fig.er":   "eighth + 8th rest",
    "fig.eqe":  "eighth + quarter + eighth",
    "fig.dqe":  "dotted quarter + eighth",
    "fig.edq":  "eighth + dotted quarter",
    "fig.req":  "8th rest + eighth + quarter",
    // compound (6/8-family) figures
    "fig.dq":   "dotted quarter",
    "fig.eee":  "three eighths",
    "fig.qe":   "quarter + eighth",
    "fig.eq":   "eighth + quarter",
    "fig.dh":   "dotted half",
    "fig.dqr":  "dotted quarter rest",
    "fig.ree":  "8th rest + 2 eighths",
    "fig.eer":  "2 eighths + 8th rest",

    // help — the guide behind the ? on the Presets heading
    "help.open":     "How this works",
    "help.close":    "Close",
    "help.title":    "How this works",
    "help.intro":    "This trains you to read in chunks instead of note by note. You set the vocabulary — which intervals and rhythms may appear — and it writes you an endless supply of fresh lines from it. Nothing is memorised, so you are always reading, never recalling.",

    "help.g.exercise":  "The exercise",
    "help.exercise":    "The title is whichever preset is loaded, with its key and length beneath. Tap ↻ for another line built from the same settings — take a new one as soon as the old one starts to feel familiar.",

    "help.g.transport": "Along the bottom",
    "help.transport":   "Restart returns to the first bar, Play runs the piece after a one-bar count-in and moves on to a fresh line at the end, and the circular arrow fetches a new exercise. The metronome and play-along buttons sit up in the header instead, each opening a small panel.",

    "help.g.presets":   "Presets",
    "help.presets":     "A preset holds the material — the intervals, the notes, the key, the clef and the length. It deliberately leaves tempo, metronome, accompaniment and rhythm alone, so you can change how you are practising without disturbing what you are practising. + save keeps the current setup under a name of your own.",

    "help.g.tempo":     "Tempo",
    "help.tempo":       "Behind the metronome button in the header: beats per minute, the click itself, and the eye, which shows or hides the cursor that follows the beat. Reading without the cursor is harder and worth doing.",

    "help.g.accomp":    "Play Along",
    "help.accomp":      "Behind the second header button: the voice that plays the line with you, and how loud. Useful for checking yourself; turn it off once you trust your ear.",

    "help.g.hide":      "Hide ahead",
    "help.hide":        "Empties each bar as you reach it, so you are forced to look further along the line than you are playing. Start at one beat. This is the whole point of the tool, and it will feel wrong before it feels useful.",

    "help.g.rhythm":    "Rhythm",
    "help.rhythm":      "The time signature pills set the meter — 2/4, 3/4, 4/4 or 6/8. Below it, which figures may appear: anything unchecked is never written, so you can drill one pattern at a time. 6/8 swaps in its own compound-time set, built around the dotted-quarter beat instead of the quarter.",

    "help.g.step":      "Intervals",
    "help.step":        "The melodic vocabulary. Tick an interval to let it appear, and set how often it is used — a 4 turns up roughly four times as often as a 1. Untick everything but the third and you get thirds.",

    "help.g.notes":     "Notes",
    "help.notes":       "Which pitches the line may use. Tick a whole octave with the box on the left, or single notes in the grid.",

    "help.g.musicality": "How Musical?",
    "help.musicality":  "At zero the line is a plain random walk. Higher, it starts shaping itself — leaps resolve, phrases arch and settle. Past halfway it also begins landing on the bar’s chord: first on downbeats, then on every beat, until a chord-shaped set of intervals comes out as pure arpeggios. What you tick under Intervals decides whether that reads as a scale study or an arpeggio study.",

    "help.g.chroma":    "How Chromatic?",
    "help.chroma":      "At zero everything stays in the key. Higher, chromatic passing tones start filling whole steps and neighbour notes dip a semitone and return \u2014 the accidentals you actually meet on real pages. Minor keys raise their 7th in dominant bars regardless: that one is what makes a cadence lean.",
    "help.g.chunks":    "Highlight Patterns",
    "help.chunks":      "Highlights the patterns on the staff: cyan for stepwise runs, lime for leaps. Use it to check what your eye is catching, then switch it off and see whether you still catch them.",

    "help.g.staff":     "Clef & Key",
    "help.staff":       "Changing the clef moves the notes to that clef's octaves, so they sit on the staff rather than under a pile of ledger lines.",

    // onboarding \u2014 the first-run walkthrough, which doubles as a tour of the
    // settings panel: each page names a section the student will meet later
    "ob.pitch":       "This is a tool that writes you a new sight-reading exercise every time you ask \u2014 built from the notes and rhythms you choose.",
    "ob.skip":        "Skip",
    "ob.next":        "Next",
    "ob.instrTitle":  "What do you play?",
    "ob.instrNote":   "Sets your clef and range — both can be changed later.",
    "ob.vocabTitle":  "Pick something to read",
    // {icon} is replaced with the real settings glyph, so the sentence points
    // at the button the student will actually look for.
    "ob.vocabNote":   "Change any of it later in {icon}.",
    "ob.go":          "Start practicing",

    // prompts and messages
    "msg.newPresetName": "New preset name:",
    "msg.deletePreset":  "Delete preset “{name}”?",
    "msg.updatePreset":  "Update preset “{name}” with the current settings?",
    "msg.loadFailed":    "Load failed: {detail}",
    "msg.noSamples":     "{name} samples unavailable.",
    "msg.badSamples":    "{name} samples failed to decode — using the organ instead.",
    "msg.noCursor":      "Cursor unavailable."
  },

  es: {
    "band.music":      "M\u00fasica",
    "band.reading":    "Lectura",
    "band.staff":      "Pentagrama y duraci\u00f3n",
    "band.setup":      "Configuraci\u00f3n",
    "intro.blurb":     "Una l\u00ednea de lectura a primera vista nueva cada vez que la pidas, construida con las notas y los ritmos que elijas.",
    "intro.more":      "Saber m\u00e1s",
    "val.apart":       "Sueltas",
    "sec.presets":     "Presets",
    "sec.tempo":       "Tempo",
    "sec.accomp":      "Tocar contigo",
    "sec.hideAhead":   "Ocultar adelante",
    "sec.rhythm":      "Ritmo",
    "grp.basic":       "Básico",
    "lbl.slurs":       "Ligaduras",
    "lbl.ties":        "Ligaduras de unión",
    "grp.more":        "Más",
    "sec.step":        "Intervalos",
    "sec.notes":       "Notas",
    "sec.musicality":  "¿Qué tan musical?",
    "sec.chroma":      "\u00bfQu\u00e9 tan crom\u00e1tico?",
    "sec.chordNames":  "Nombres de acordes",
    "sec.chunks":      "Resaltar patrones",
    "sec.staff":       "Clave y tonalidad",
    "sec.measures":    "Compases",
    "sec.instrument":  "Instrumento",
    "sec.language":    "Idioma",
    "instr.violin":    "Violín",
    "instr.viola":     "Viola",
    "instr.cello":     "Violonchelo",
    "instr.flute":     "Flauta",
    "instr.clarinet":  "Clarinete",
    "instr.sax":       "Saxofón",
    "instr.trumpet":   "Trompeta",
    "instr.trombone":  "Trombón",
    "instr.voice":     "Voz",
    "instr.guitar":    "Guitarra",
    "instr.other":     "Otro",

    "legend.steps": "grados",
    "legend.leaps": "saltos",

    "val.off":      "No",
    "val.on":       "Sí",
    "val.some":     "Algunas",
    "val.lots":     "Muchas",
    "val.beats":    "Tiempos",
    "val.measures": "Compases",
    "val.save":     "+ guardar",
    "val.custom":   "Personalizado",
    "val.bars":     "Compases",

    "inst.organ":      "Órgano",
    "inst.piano":      "Piano",
    "inst.marimba":    "Marimba",
    "inst.vibraphone": "Vibráfono",
    "inst.synth":      "Sinte",

    "mode.major": "Mayor",
    "mode.minor": "Menor",

    "clef.treble": "Sol",
    "clef.alto":   "Do en 3ª",
    "clef.tenor":  "Do en 4ª",
    "clef.bass":   "Fa",

    "preset.steps only":   "Solo grados",
    "preset.thirds drill": "Terceras",
    "preset.wide leaps":   "Saltos amplios",
    "preset.arpeggios":    "Arpegios",
    "preset.long tones":      "Notas largas",
    "preset.rhythm workout":  "Ritmos variados",
    "preset.jig":             "Giga",
    "preset.chromatic steps": "Grados crom\u00e1ticos",
    "preset.minor cadences":  "Cadencias menores",

    "aria.settings":     "Ajustes",
    "aria.fromTop":      "Desde el principio",
    "aria.play":         "Reproducir",
    "aria.pause":        "Pausa",
    "aria.accomp":       "Acompañamiento",
    "aria.metronome":    "Metrónomo",
    "aria.newExercise":  "Ejercicio nuevo",
    "aria.cursor":       "Cursor",
    "aria.tempo":        "Tempo",
    "aria.slower":       "Más lento",
    "aria.faster":       "Más rápido",
    "aria.less":         "Menos",
    "aria.more":         "Más",
    "aria.volume":       "Volumen",
    "aria.voice":        "Instrumento",
    "aria.hideUnit":     "Unidad",
    "aria.clef":         "Clave",
    "aria.key":          "Tonalidad",
    "aria.mode":         "Modo",
    "aria.accidental":   "Alteración",
    "aria.chroma":       "Cromatismo",
    "aria.chordNames":   "Mostrar nombres de acordes",
    "aria.chunks":       "Mostrar patrones",
    "aria.musicality":   "Musicalidad",
    "lbl.click":         "Clic",
    "lbl.cursor":        "Cursor",
    "lbl.sound":         "Sonido",
    "lbl.voice":         "Voz",
    "lbl.volume":        "Volumen",
    "aria.octave":       "Octava",
    "aria.updatePreset": "Actualizar con los ajustes actuales",
    "aria.deletePreset": "Eliminar preset",

    "step.0": "uni",
    "step.1": "2ª",
    "step.2": "3ª",
    "step.3": "4ª",
    "step.4": "5ª",
    "step.5": "6ª",
    "step.6": "7ª",
    "step.7": "8ª",
    "col.less": "menos",
    "col.more": "más",

    "interval.0": "unísono",
    "interval.1": "2ª",
    "interval.2": "3ª",
    "interval.3": "4ª",
    "interval.4": "5ª",
    "interval.5": "6ª",
    "interval.6": "7ª",
    "interval.7": "octava",

    "fig.w":    "redonda",
    "fig.h":    "blanca",
    "fig.q":    "negra",
    "fig.ee":   "corcheas",
    "fig.trip": "tresillo de corcheas",
    "fig.ssss": "semicorcheas",
    "fig.ess":  "corchea + 2 semicorcheas",
    "fig.sse":  "2 semicorcheas + corchea",
    "fig.ses":  "semicorchea–corchea–semicorchea",
    "fig.des":  "corchea con puntillo + semicorchea",
    "fig.sde":  "semicorchea + corchea con puntillo",
    "fig.qr":   "silencio de negra",
    "fig.re":   "silencio de corchea + corchea",
    "fig.er":   "corchea + silencio de corchea",
    "fig.eqe":  "corchea + negra + corchea",
    "fig.dqe":  "negra con puntillo + corchea",
    "fig.edq":  "corchea + negra con puntillo",
    "fig.req":  "silencio de corchea + corchea + negra",
    "fig.dq":   "negra con puntillo",
    "fig.eee":  "tres corcheas",
    "fig.qe":   "negra + corchea",
    "fig.eq":   "corchea + negra",
    "fig.dh":   "blanca con puntillo",
    "fig.dqr":  "silencio de negra con puntillo",
    "fig.ree":  "silencio de corchea + 2 corcheas",
    "fig.eer":  "2 corcheas + silencio de corchea",

    "help.open":     "Cómo funciona",
    "help.close":    "Cerrar",
    "help.title":    "Cómo funciona",
    "help.intro":    "Esto te entrena para leer por grupos y no nota a nota. Tú defines el vocabulario — qué intervalos y qué ritmos pueden aparecer — y la app te escribe líneas nuevas sin parar a partir de ahí. No se memoriza nada: siempre estás leyendo, nunca recordando.",

    "help.g.exercise":  "El ejercicio",
    "help.exercise":    "El título es el preset cargado, con su tonalidad y duración debajo. Toca ↻ para otra línea con los mismos ajustes — cambia en cuanto la anterior empiece a resultarte familiar.",

    "help.g.transport": "Abajo",
    "help.transport":   "Reiniciar vuelve al primer compás, Reproducir toca la pieza tras un compás de entrada y sigue con una línea nueva al final, y la flecha circular trae un ejercicio nuevo. El metrónomo y el acompañamiento están arriba, en la cabecera, y cada uno abre su propio panel.",

    "help.g.presets":   "Presets",
    "help.presets":     "Un preset guarda el material — los intervalos, las notas, la tonalidad, la clave y la duración. A propósito no toca el tempo, el metrónomo, el acompañamiento ni el ritmo, para que puedas cambiar cómo practicas sin alterar qué practicas. Con + guardar creas el tuyo con el nombre que quieras.",

    "help.g.tempo":     "Tempo",
    "help.tempo":       "Detrás del botón de metrónomo, en la cabecera: pulsaciones por minuto, el clic, y el ojo, que muestra u oculta el cursor que sigue el pulso. Leer sin cursor es más difícil y vale la pena.",

    "help.g.accomp":    "Tocar contigo",
    "help.accomp":      "Detrás del segundo botón de la cabecera: la voz que toca la línea contigo, y a qué volumen. Útil para comprobarte; quítalo cuando te fíes de tu oído.",

    "help.g.hide":      "Ocultar adelante",
    "help.hide":        "Vacía cada compás según llegas a él, así te obliga a mirar más adelante de lo que estás tocando. Empieza por un tiempo. En esto consiste la herramienta, y te resultará incómodo antes de resultarte útil.",

    "help.g.rhythm":    "Ritmo",
    "help.rhythm":      "Las pastillas del compás fijan el metro — 2/4, 3/4, 4/4 o 6/8. Debajo, qué figuras pueden aparecer: lo que no marques no se escribe nunca, así puedes trabajar un patrón cada vez. En 6/8 cambia a su propio grupo de figuras, construido sobre el pulso de negra con puntillo en vez de la negra.",

    "help.g.step":      "Intervalos",
    "help.step":        "El vocabulario melódico. Marca un intervalo para que aparezca y ajusta con qué frecuencia se usa — un 4 sale unas cuatro veces más que un 1. Desmarca todo menos la tercera y tendrás terceras.",

    "help.g.notes":     "Notas",
    "help.notes":       "Qué alturas puede usar la línea. Marca una octava entera con la casilla de la izquierda, o notas sueltas en la cuadrícula.",

    "help.g.musicality": "¿Qué tan musical?",
    "help.musicality":  "En cero la línea es un recorrido al azar. Más arriba empieza a tomar forma: los saltos se resuelven y las frases trazan un arco. Pasada la mitad también empieza a apoyarse en el acorde del compás: primero en el primer tiempo, luego en cada uno, hasta que un conjunto de intervalos con forma de acorde sale como puro arpegio. Lo que marques en Intervalos decide si eso suena a estudio de escalas o de arpegios.",

    "help.g.chroma":    "\u00bfQu\u00e9 tan crom\u00e1tico?",
    "help.chroma":      "En cero todo queda dentro de la tonalidad. M\u00e1s arriba aparecen notas de paso crom\u00e1ticas entre tonos enteros y bordaduras que bajan medio tono y vuelven \u2014 las alteraciones que de verdad encuentras en una partitura. En menor, el 7\u00ba grado se eleva en los compases de dominante siempre: eso es lo que hace que la cadencia se apoye.",
    "help.g.chunks":    "Resaltar patrones",
    "help.chunks":      "Resalta los patrones sobre el pentagrama: cian para grados conjuntos, verde lima para saltos. Úsalo para comprobar qué está viendo tu ojo, y luego quítalo para ver si los sigues viendo.",

    "help.g.staff":     "Clave y tonalidad",
    "help.staff":       "Al cambiar la clave, las notas se mueven a las octavas de esa clave, para que queden sobre el pentagrama y no bajo un montón de líneas adicionales.",

    "ob.pitch":       "Esta es una herramienta que te escribe un ejercicio de lectura a primera vista nuevo cada vez que se lo pides \u2014 construido con las notas y los ritmos que elijas.",
    "ob.skip":        "Omitir",
    "ob.next":        "Siguiente",
    "ob.instrTitle":  "¿Qué tocas?",
    "ob.instrNote":   "Define tu clave y tu registro — ambos se pueden cambiar después.",
    "ob.vocabTitle":  "Elige algo para leer",
    "ob.vocabNote":   "Puedes cambiar cualquier cosa despu\u00e9s en {icon}.",
    "ob.go":          "Empezar a practicar",

    "msg.newPresetName": "Nombre del preset:",
    "msg.deletePreset":  "¿Eliminar el preset “{name}”?",
    "msg.updatePreset":  "¿Actualizar el preset “{name}” con los ajustes actuales?",
    "msg.loadFailed":    "Error al cargar: {detail}",
    "msg.noSamples":     "Muestras de {name} no disponibles.",
    "msg.badSamples":    "No se pudieron decodificar las muestras de {name}; se usa el órgano.",
    "msg.noCursor":      "Cursor no disponible."
  }
};
