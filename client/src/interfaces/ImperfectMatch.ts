interface ImperfectMatchOption {
  id: string
  levenshtein: number
  image: string
  title: string
  artist: string
  external_url: string
  release_date: string
  selected?: boolean
}

interface ImperfectMatch {
  _id: string
  matches: ImperfectMatchOption[]
}

export { ImperfectMatchOption, ImperfectMatch }