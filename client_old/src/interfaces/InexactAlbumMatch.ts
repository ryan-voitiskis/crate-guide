interface SpotifyAlbumEdit {
  id: string
  levenshtein: number
  image: string
  name: string
  artists: string
  external_url: string
  release_date: string
  selected?: boolean
}

interface InexactAlbumMatch {
  recordID: string
  matches: SpotifyAlbumEdit[]
}

export { SpotifyAlbumEdit, InexactAlbumMatch }
