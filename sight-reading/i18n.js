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
    "sec.accomp":      "Accompaniment",
    "sec.hideAhead":   "Hide Ahead",
    "sec.rhythm":      "Rhythm",
    "sec.step":        "Step",
    "sec.notes":       "Notes",
    "sec.musicality":  "Musicality",
    "sec.chunks":      "Chunks",
    "sec.staff":       "Staff, Key and Length",
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
    "aria.chunks":       "Show chunk brackets",
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
    "sec.accomp":      "Acompañamiento",
    "sec.hideAhead":   "Ocultar adelante",
    "sec.rhythm":      "Ritmo",
    "sec.step":        "Intervalos",
    "sec.notes":       "Notas",
    "sec.musicality":  "Musicalidad",
    "sec.chunks":      "Patrones",
    "sec.staff":       "Pentagrama, tonalidad y duración",
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

    "msg.newPresetName": "Nombre del preset:",
    "msg.deletePreset":  "¿Eliminar el preset “{name}”?",
    "msg.updatePreset":  "¿Actualizar el preset “{name}” con los ajustes actuales?",
    "msg.loadFailed":    "Error al cargar: {detail}",
    "msg.noSamples":     "Muestras de {name} no disponibles.",
    "msg.badSamples":    "No se pudieron decodificar las muestras de {name}; se usa el órgano.",
    "msg.noCursor":      "Cursor no disponible."
  }
};
