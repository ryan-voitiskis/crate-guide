import { HarmonyScore } from "@/interfaces/Track"
import { sortNum } from "@/utils/sortFunctions"
import Option from "@/interfaces/SelectOption"

interface KeyAndMode {
  key: number
  mode: number
}

interface Key {
  pitchClass: number
  tone: string
  camelotMajor: number
  camelotMinor: number
  majorColour: string
  minorColour: string
}

const keyCombinations = [
  "Same key",
  "Up a fifth",
  "Down a fifth",
  "Minor to Major",
  "Major to Minor",
]

const pitchClassMap: Key[] = [
  {
    pitchClass: 0,
    tone: "C",
    camelotMajor: 8,
    camelotMinor: 5,
    majorColour: "#EE82D9",
    minorColour: "#FDBFA7",
  },
  {
    pitchClass: 1,
    tone: "C♯ / D♭",
    camelotMajor: 3,
    camelotMinor: 12,
    majorColour: "#86F24F",
    minorColour: "#55F0F0",
  },
  {
    pitchClass: 2,
    tone: "D",
    camelotMajor: 10,
    camelotMinor: 7,
    majorColour: "#9FB6FF",
    minorColour: "#FDAACC",
  },
  {
    pitchClass: 3,
    tone: "D♯ / E♭",
    camelotMajor: 5,
    camelotMinor: 2,
    majorColour: "#FFA07C",
    minorColour: "#7DF2AA",
  },
  {
    pitchClass: 4,
    tone: "E",
    camelotMajor: 12,
    camelotMinor: 9,
    majorColour: "#00EBEB",
    minorColour: "#DDB4FD",
  },
  {
    pitchClass: 5,
    tone: "F",
    camelotMajor: 7,
    camelotMinor: 4,
    majorColour: "#FF81B4",
    minorColour: "#E8DAA1",
  },
  {
    pitchClass: 6,
    tone: "F♯ / G♭",
    camelotMajor: 2,
    camelotMinor: 11,
    majorColour: "#3CEE81",
    minorColour: "#8EE4F9",
  },
  {
    pitchClass: 7,
    tone: "G",
    camelotMajor: 9,
    camelotMinor: 6,
    majorColour: "#CE8FFF",
    minorColour: "#FDAFB7",
  },
  {
    pitchClass: 8,
    tone: "G♯ / A♭",
    camelotMajor: 4,
    camelotMinor: 1,
    majorColour: "#DFCA73",
    minorColour: "#56F1DA",
  },
  {
    pitchClass: 9,
    tone: "A",
    camelotMajor: 11,
    camelotMinor: 8,
    majorColour: "#56D9F9",
    minorColour: "#F2ABE4",
  },
  {
    pitchClass: 10,
    tone: "A♯ / B♭",
    camelotMajor: 6,
    camelotMinor: 3,
    majorColour: "#FF8894",
    minorColour: "#AEF589",
  },
  {
    pitchClass: 11,
    tone: "B",
    camelotMajor: 1,
    camelotMinor: 10,
    majorColour: "#01EDCA",
    minorColour: "#BECDFD",
  },
]

function getCamelotMajor(pitchClass: number): number {
  return pitchClassMap.find((i) => i.pitchClass === pitchClass)!.camelotMajor
}

function getCamelotMinor(pitchClass: number): number {
  return pitchClassMap.find((i) => i.pitchClass === pitchClass)!.camelotMinor
}

function getMajorColour(pitchClass: number): string {
  return pitchClassMap.find((i) => i.pitchClass === pitchClass)!.majorColour
}

function getMinorColour(pitchClass: number): string {
  return pitchClassMap.find((i) => i.pitchClass === pitchClass)!.minorColour
}

function getKeyString(pitchClass: number, mode: number): string {
  return `${pitchClassMap.find((i) => i.pitchClass === pitchClass)?.tone} ${
    mode === 0 ? `Minor` : `Major`
  }`
}

function getKeyStringShort(pitchClass: number, mode: number): string {
  return `${pitchClassMap
    .find((i) => i.pitchClass === pitchClass)
    ?.tone.slice(0, 2)} ${mode === 0 ? `Min` : `Maj`}`
}

function getCamelotString(pitchClass: number, mode: number): string {
  return mode === 0
    ? `${getCamelotMinor(pitchClass)?.toString()}${mode === 0 ? `A` : `B`}`
    : `${getCamelotMajor(pitchClass)?.toString()}${mode === 0 ? `A` : `B`}`
}

function getKeyColour(pitchClass: number, mode: number): string {
  return mode === 0 ? getMinorColour(pitchClass) : getMajorColour(pitchClass)
}

function getSortableNotation(pitchClass: number, mode: number): number {
  return mode === 1
    ? getCamelotMajor(pitchClass)
    : getCamelotMinor(pitchClass) + 100
}

function keyOptionsMapFn(mode: number) {
  return (i: Key) => ({
    id: `${mode.toString()}${i.pitchClass.toString()}`,
    name: `${i.tone} ${mode === 1 ? "Major" : "Minor"}`,
  })
}

function camelotOptionsMapFn(mode: number) {
  return (i: Key): Option => ({
    id: `${mode.toString()}${i.pitchClass.toString()}`,
    name: mode === 1 ? `${i.camelotMajor}B` : `${i.camelotMinor}A`,
  })
}

const getKeyOptions = (keyFormat: "key" | "camelot"): Option[] => {
  const keyOptionsMajor: Option[] =
    keyFormat === "key"
      ? pitchClassMap.map(keyOptionsMapFn(1))
      : pitchClassMap.sort(sortNum("camelotMajor")).map(camelotOptionsMapFn(1))
  const keyOptionsMinor: Option[] =
    keyFormat === "key"
      ? pitchClassMap.map(keyOptionsMapFn(0))
      : pitchClassMap.sort(sortNum("camelotMinor")).map(camelotOptionsMapFn(0))
  return [{ id: "", name: "--- optional ---" }]
    .concat(keyOptionsMinor)
    .concat(keyOptionsMajor)
}

// % operator returns wrong results for negative nominator in JS, hence workaround fn
// * https://stackoverflow.com/a/17323608/7259172
function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

// * https://music.stackexchange.com/a/118424/89457
function adjustKey(key: number, factor: number): number {
  return mod(key + 12 * (Math.log(factor) / Math.log(2)), 12)
}

// scoring some of the key combinations from:
// * http://blog.dubspot.com/harmonic-mixing-w-dj-endo-part-1/
function scoreHarmony(a: KeyAndMode, b: KeyAndMode): HarmonyScore {
  if (a.mode === b.mode) {
    if (Math.abs(a.key - b.key) < 0.5)
      return {
        harmonicAffinity: 1 - Math.abs(a.key - b.key),
        keyCombination: 0,
      }
    if (Math.abs(mod(a.key + 5, 12) - b.key) < 0.5)
      return {
        harmonicAffinity: 1 - Math.abs(mod(a.key + 5, 12) - b.key),
        keyCombination: 2,
      }
    if (Math.abs(mod(a.key - 5, 12) - b.key) < 0.5)
      return {
        harmonicAffinity: 1 - Math.abs(mod(a.key - 5, 12) - b.key),
        keyCombination: 1,
      }
  } else {
    if (Math.abs(a.key - b.key) < 0.5)
      return {
        harmonicAffinity: 1 - Math.abs(a.key - b.key),
        keyCombination: a.mode < b.mode ? 3 : 4,
      }
  }
  return {
    harmonicAffinity: 0,
    keyCombination: -1,
  }
}

export {
  Key,
  keyCombinations,
  pitchClassMap,
  getKeyString,
  getKeyStringShort,
  getCamelotString,
  getKeyColour,
  getSortableNotation,
  getKeyOptions,
  adjustKey,
  scoreHarmony,
}
