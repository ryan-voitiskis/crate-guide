interface key {
  pitchClass: number
  tone: string
  camelotMajor: number
  camelotMinor: number
  majorColour: string
  minorColour: string
}

const pitchClassMap: key[] = [
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

const getCamelotMajor = (pitchClass: number): number =>
  pitchClassMap.find((i) => i.pitchClass === pitchClass)!.camelotMajor

const getCamelotMinor = (pitchClass: number): number =>
  pitchClassMap.find((i) => i.pitchClass === pitchClass)!.camelotMinor

const getKeyString = (pitchClass: number, mode: number): string =>
  `${pitchClassMap.find((i) => i.pitchClass === pitchClass)?.tone} ${
    mode === 0 ? `Minor` : `Major`
  }`

const getKeyStringShort = (pitchClass: number, mode: number): string =>
  `${pitchClassMap
    .find((i) => i.pitchClass === pitchClass)
    ?.tone.slice(0, 2)} ${mode === 0 ? `Min` : `Maj`}`

const getCamelotString = (pitchClass: number, mode: number): string =>
  mode === 0
    ? `${getCamelotMinor(pitchClass)?.toString()}${mode === 0 ? `A` : `B`}`
    : `${getCamelotMajor(pitchClass)?.toString()}${mode === 0 ? `A` : `B`}`

const getKeyColour = (pitchClass: number, mode: number): string =>
  mode === 0
    ? pitchClassMap.find((i) => i.pitchClass === pitchClass)?.minorColour ||
      "#ddd"
    : pitchClassMap.find((i) => i.pitchClass === pitchClass)?.majorColour ||
      "#ddd"

const getSortableNotation = (pitchClass: number, mode: number): number =>
  mode === 1 ? getCamelotMajor(pitchClass) : getCamelotMinor(pitchClass) + 100

export {
  key,
  pitchClassMap,
  getCamelotMajor,
  getCamelotMinor,
  getKeyString,
  getKeyStringShort,
  getCamelotString,
  getKeyColour,
  getSortableNotation,
}
