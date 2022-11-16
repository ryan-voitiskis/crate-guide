import Option from "@/interfaces/SelectOption"

interface TimeSignature {
  string: string
  upper: number
  lower: number
}

const timeSignatures: TimeSignature[] = [
  {
    string: "4/4",
    upper: 4,
    lower: 4,
  },
  {
    string: "3/4",
    upper: 3,
    lower: 4,
  },
  {
    string: "6/8",
    upper: 6,
    lower: 8,
  },
  {
    string: "2/2",
    upper: 2,
    lower: 2,
  },
  {
    string: "2/4",
    upper: 2,
    lower: 4,
  },
  {
    string: "4/2",
    upper: 4,
    lower: 2,
  },
  {
    string: "3/8",
    upper: 3,
    lower: 8,
  },
  {
    string: "9/8",
    upper: 9,
    lower: 8,
  },
  {
    string: "12/8",
    upper: 12,
    lower: 8,
  },
  {
    string: "5/4",
    upper: 5,
    lower: 4,
  },
  {
    string: "6/4",
    upper: 6,
    lower: 4,
  },
  {
    string: "7/4",
    upper: 7,
    lower: 4,
  },
]

const getTimeSignatureOptions = (): Option[] =>
  [{ id: "", name: "--- optional ---" }].concat(
    timeSignatures.map((i) => ({ id: i.string, name: i.string }))
  )

const getTimeSignatureString = (upper: number, lower: number): string =>
  timeSignatures.find((i) => i.upper === upper && i.lower === lower)?.string ||
  ""

const getTimeSignatureNumbers = (
  string: string
): [number | null, number | null] => {
  const signature = timeSignatures.find((i) => i.string === string)
  return signature ? [signature.upper, signature.lower] : [null, null]
}
export {
  TimeSignature,
  timeSignatures,
  getTimeSignatureOptions,
  getTimeSignatureString,
  getTimeSignatureNumbers,
}
