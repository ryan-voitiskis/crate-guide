interface InexactTrackMatchOption {
  id: string
  name: string
  artists: string
  duration: number
  external_url: string
  levenshtein: number
  selected?: boolean
}

interface InexactTrackMatch {
  recordID: string
  trackID: string
  options: InexactTrackMatchOption[]
}

export { InexactTrackMatchOption, InexactTrackMatch }
