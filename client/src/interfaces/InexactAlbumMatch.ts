interface InexactAlbumMatchOption {
  id: string
  levenshtein: number
  image: string
  title: string
  artist: string
  external_url: string
  release_date: string
  selected?: boolean
}

interface InexactAlbumMatch {
  _id: string
  matches: InexactAlbumMatchOption[]
}

export { InexactAlbumMatchOption, InexactAlbumMatch }
