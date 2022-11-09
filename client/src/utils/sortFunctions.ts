import { Track } from "@/interfaces/Track"
import { getSortableNotation } from "@/utils/pitchClassMap"

// * https://stackoverflow.com/questions/74356048/typescript-declare-type-of-a-keyof-a-generic-object-param
type KeysOfType<O, T> = {
  [K in keyof O]: O[K] extends T ? K : never
}[keyof O]

// custom string sort function. sorts "" last
const sortStr = (field: KeysOfType<any, string>, reverse: boolean) => {
  return (a: any, b: any) =>
    a[field] !== "" && b[field] !== ""
      ? (reverse ? -1 : 1) *
        a[field].localeCompare(b[field], undefined, { sensitivity: "base" }) // both a + b defined
      : a[field] !== "" && b[field] === ""
      ? -1 // a is defined, b is empty: sort a before b
      : a[field] === "" && b[field] !== ""
      ? 1 // a is empty, b is defined: sort b before a
      : 0 // both a + b are empty: keep original order
}

// custom number sort function. sorts null last
const sortNumWithNull = (field: KeysOfType<any, number>, reverse: boolean) => {
  return (a: any, b: any) =>
    a[field] !== null && b[field] !== null
      ? (reverse ? -1 : 1) * ((a[field] as number) - (b[field] as number)) // both a + b defined: sort lowest before highest, unless reversed
      : a[field] !== null && b[field] === null
      ? -1 // a is defined, b is null: sort a before b
      : a[field] === null && b[field] !== null
      ? 1 // a is null, b is defined: sort b before a
      : 0 // both a + b null: keep original order
}

// custom number sort function. sorts null last
const sortNumWithUndefined = (
  field: KeysOfType<any, number>,
  reverse: boolean
) => {
  return (a: any, b: any) =>
    a[field] !== undefined && b[field] !== undefined
      ? (reverse ? -1 : 1) * ((a[field] as number) - (b[field] as number)) // both a + b defined: sort lowest before highest, unless reversed
      : a[field] !== undefined && b[field] === undefined
      ? -1 // a is defined, b is null: sort a before b
      : a[field] === undefined && b[field] !== undefined
      ? 1 // a is null, b is defined: sort b before a
      : 0 // both a + b null: keep original order
}

// custom key sort function. sorts null/undefined last
const sortKey = (reverse: boolean) => {
  return (a: Track, b: Track) => {
    const aKey = Number.isInteger(a.key)
      ? a.key
      : a.audioFeatures && a.audioFeatures.key !== -1
      ? a.audioFeatures.key
      : null
    const bKey = Number.isInteger(b.key)
      ? b.key
      : b.audioFeatures && b.audioFeatures.key !== -1
      ? b.audioFeatures.key
      : null
    const aMode = Number.isInteger(a.mode)
      ? a.mode
      : a.audioFeatures
      ? a.audioFeatures.mode
      : null
    const bMode = Number.isInteger(b.mode)
      ? b.mode
      : b.audioFeatures
      ? b.audioFeatures.mode
      : null
    const aSortable =
      typeof aKey === "number" && typeof aMode === "number"
        ? getSortableNotation(aKey, aMode)
        : null
    const bSortable =
      typeof bKey === "number" && typeof bMode === "number"
        ? getSortableNotation(bKey, bMode)
        : null
    return aSortable !== null && bSortable !== null
      ? (reverse ? -1 : 1) * (aSortable - bSortable) // both a + b defined: sort lowest before highest, unless reversed
      : aSortable !== null && bSortable === null
      ? -1 // a is defined, b is null: sort a before b
      : aSortable === null && bSortable !== null
      ? 1 // a is null, b is defined: sort b before a
      : 0 // both a + b null: keep original order
  }
}

export { sortStr, sortNumWithNull, sortNumWithUndefined, sortKey }
