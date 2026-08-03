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
    "sec.presets":     "Presets",
    "sec.tempo":       "Tempo",
    "sec.accomp":      "Play Along",
    "sec.hideAhead":   "Hide Ahead",
    "sec.rhythm":      "Rhythm",
    "sec.step":        "Intervals",
    "sec.notes":       "Notes",
    "sec.musicality":  "How Musical?",
    "sec.chunks":      "Highlight Patterns",
    "sec.staff":       "Clef & Key",
    "sec.measures":    "Measures",
    "sec.language":    "Language",

    // column headers and legend
    "col.up":     "up",
    "col.down":   "down",
    "legend.steps": "steps",
    "legend.leaps": "leaps",

    // values shown on controls
    "val.off":      "Off",
    "val.on":       "On",
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
    "preset.steps only":   "Steps Only",
    "preset.thirds drill": "Thirds Drill",
    "preset.wide leaps":   "Wide Leaps",

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
    "aria.chunks":       "Show chunk highlights",
    "aria.musicality":   "Musicality",
    "aria.octave":       "Octave",
    "aria.updatePreset": "Update with current settings",
    "aria.deletePreset": "Delete preset",

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
    "fig.ssss": "sixteenths",
    "fig.ess":  "eighth + 2 sixteenths",
    "fig.sse":  "2 sixteenths + eighth",
    "fig.ses":  "16th–8th–16th",
    "fig.des":  "dotted 8th + 16th",
    "fig.sde":  "16th + dotted 8th",
    "fig.qr":   "quarter rest",
    "fig.re":   "8th rest + eighth",
    "fig.er":   "eighth + 8th rest",
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
    "help.transport":   "Restart returns to the first bar. Play runs the piece at your tempo, after a one-bar count-in, and moves on to a fresh line when it reaches the end. The note button plays the melody with you; the metronome clicks the beat. Both can be on or off in any combination.",

    "help.g.presets":   "Presets",
    "help.presets":     "A preset holds the material — the intervals, the notes, the key, the clef and the length. It deliberately leaves tempo, metronome, accompaniment and rhythm alone, so you can change how you are practising without disturbing what you are practising. + save keeps the current setup under a name of your own.",

    "help.g.tempo":     "Tempo",
    "help.tempo":       "Beats per minute, plus two toggles: the metronome, and the eye, which shows or hides the cursor that follows the beat. Reading without the cursor is harder and worth doing.",

    "help.g.accomp":    "Play Along",
    "help.accomp":      "The voice that plays the line, and how loud. Useful for checking yourself; turn it off once you trust your ear.",

    "help.g.hide":      "Hide ahead",
    "help.hide":        "Empties each bar as you reach it, so you are forced to look further along the line than you are playing. Start at one beat. This is the whole point of the tool, and it will feel wrong before it feels useful.",

    "help.g.rhythm":    "Rhythm",
    "help.rhythm":      "The time signature pills set the meter — 2/4, 3/4, 4/4 or 6/8. Below it, which figures may appear: anything unchecked is never written, so you can drill one pattern at a time. 6/8 swaps in its own compound-time set, built around the dotted-quarter beat instead of the quarter.",

    "help.g.step":      "Intervals",
    "help.step":        "The melodic vocabulary. Tick an interval to let it appear, and set how often it is used going up and going down — a 4 turns up roughly four times as often as a 1. Untick everything but the third and you get thirds.",

    "help.g.notes":     "Notes",
    "help.notes":       "Which pitches the line may use. Tick a whole octave with the box on the left, or single notes in the grid.",

    "help.g.musicality": "How Musical?",
    "help.musicality":  "At zero the line is a plain random walk. Higher, it starts behaving like a melody — phrases turn back on themselves and leaps resolve instead of wandering.",

    "help.g.chunks":    "Highlight Patterns",
    "help.chunks":      "Highlights the patterns on the staff: cyan for stepwise runs, lime for leaps. Use it to check what your eye is catching, then switch it off and see whether you still catch them.",

    "help.g.staff":     "Clef & Key",
    "help.staff":       "Changing the clef moves the notes to that clef's octaves, so they sit on the staff rather than under a pile of ledger lines.",

    // onboarding \u2014 the first-run walkthrough, which doubles as a tour of the
    // settings panel: each page names a section the student will meet later
    "ob.pitch":       "Endless sight-reading exercises, built from the notes and rhythms you choose.",
    "ob.skip":        "Skip",
    "ob.next":        "Next",
    "ob.vocabTitle":  "Choose your starting point",
    "ob.vocabRhythm": "Rhythm",
    "ob.vocabSteps":  "Intervals",
    "ob.vocabNote":   "Steps only \u2014 add leaps whenever.",
    "ob.doneTitle":   "You\u2019re set.",
    "ob.doneChunks":  "Cyan marks steps, lime marks leaps.",
    "ob.doneWhere":   "Everything else lives behind \u2699 \u2014 tap \u21bb for a new line anytime.",
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
    "sec.presets":     "Presets",
    "sec.tempo":       "Tempo",
    "sec.accomp":      "Tocar contigo",
    "sec.hideAhead":   "Ocultar adelante",
    "sec.rhythm":      "Ritmo",
    "sec.step":        "Intervalos",
    "sec.notes":       "Notas",
    "sec.musicality":  "¿Qué tan musical?",
    "sec.chunks":      "Resaltar patrones",
    "sec.staff":       "Clave y tonalidad",
    "sec.measures":    "Compases",
    "sec.language":    "Idioma",

    "col.up":     "sube",
    "col.down":   "baja",
    "legend.steps": "grados",
    "legend.leaps": "saltos",

    "val.off":      "No",
    "val.on":       "Sí",
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
    "aria.chunks":       "Mostrar patrones",
    "aria.musicality":   "Musicalidad",
    "aria.octave":       "Octava",
    "aria.updatePreset": "Actualizar con los ajustes actuales",
    "aria.deletePreset": "Eliminar preset",

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
    "fig.ssss": "semicorcheas",
    "fig.ess":  "corchea + 2 semicorcheas",
    "fig.sse":  "2 semicorcheas + corchea",
    "fig.ses":  "semicorchea–corchea–semicorchea",
    "fig.des":  "corchea con puntillo + semicorchea",
    "fig.sde":  "semicorchea + corchea con puntillo",
    "fig.qr":   "silencio de negra",
    "fig.re":   "silencio de corchea + corchea",
    "fig.er":   "corchea + silencio de corchea",
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
    "help.transport":   "Reiniciar vuelve al primer compás. Reproducir toca la pieza a tu tempo, tras un compás de entrada, y sigue con una línea nueva al llegar al final. El botón de nota toca la melodía contigo; el metrónomo marca el pulso. Puedes usarlos en cualquier combinación.",

    "help.g.presets":   "Presets",
    "help.presets":     "Un preset guarda el material — los intervalos, las notas, la tonalidad, la clave y la duración. A propósito no toca el tempo, el metrónomo, el acompañamiento ni el ritmo, para que puedas cambiar cómo practicas sin alterar qué practicas. Con + guardar creas el tuyo con el nombre que quieras.",

    "help.g.tempo":     "Tempo",
    "help.tempo":       "Pulsos por minuto, más dos botones: el metrónomo y el ojo, que muestra u oculta el cursor que sigue el pulso. Leer sin cursor cuesta más y vale la pena.",

    "help.g.accomp":    "Tocar contigo",
    "help.accomp":      "El instrumento que toca la línea, y a qué volumen. Sirve para comprobarte; quítalo cuando te fíes de tu oído.",

    "help.g.hide":      "Ocultar adelante",
    "help.hide":        "Vacía cada compás según llegas a él, así te obliga a mirar más adelante de lo que estás tocando. Empieza por un tiempo. En esto consiste la herramienta, y te resultará incómodo antes de resultarte útil.",

    "help.g.rhythm":    "Ritmo",
    "help.rhythm":      "Las pastillas del compás fijan el metro — 2/4, 3/4, 4/4 o 6/8. Debajo, qué figuras pueden aparecer: lo que no marques no se escribe nunca, así puedes trabajar un patrón cada vez. En 6/8 cambia a su propio grupo de figuras, construido sobre el pulso de negra con puntillo en vez de la negra.",

    "help.g.step":      "Intervalos",
    "help.step":        "El vocabulario melódico. Marca un intervalo para que aparezca y ajusta con qué frecuencia se usa al subir y al bajar — un 4 sale unas cuatro veces más que un 1. Desmarca todo menos la tercera y tendrás terceras.",

    "help.g.notes":     "Notas",
    "help.notes":       "Qué alturas puede usar la línea. Marca una octava entera con la casilla de la izquierda, o notas sueltas en la cuadrícula.",

    "help.g.musicality": "¿Qué tan musical?",
    "help.musicality":  "En cero la línea es un recorrido al azar. Más arriba empieza a comportarse como una melodía: las frases se repliegan y los saltos se resuelven en vez de vagar.",

    "help.g.chunks":    "Resaltar patrones",
    "help.chunks":      "Resalta los patrones sobre el pentagrama: cian para grados conjuntos, verde lima para saltos. Úsalo para comprobar qué está viendo tu ojo, y luego quítalo para ver si los sigues viendo.",

    "help.g.staff":     "Clave y tonalidad",
    "help.staff":       "Al cambiar la clave, las notas se mueven a las octavas de esa clave, para que queden sobre el pentagrama y no bajo un montón de líneas adicionales.",

    "ob.pitch":       "Ejercicios de lectura a primera vista sin fin, construidos con las notas y los ritmos que elijas.",
    "ob.skip":        "Omitir",
    "ob.next":        "Siguiente",
    "ob.vocabTitle":  "Elige tu punto de partida",
    "ob.vocabRhythm": "Ritmo",
    "ob.vocabSteps":  "Intervalos",
    "ob.vocabNote":   "Empiezas solo con grados conjuntos \u2014 a\u00f1ade saltos cuando quieras.",
    "ob.doneTitle":   "Todo listo.",
    "ob.doneChunks":  "Cian marca los grados conjuntos, verde lima los saltos.",
    "ob.doneWhere":   "Todo lo dem\u00e1s vive detr\u00e1s de \u2699 \u2014 toca \u21bb para una l\u00ednea nueva cuando quieras.",
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
