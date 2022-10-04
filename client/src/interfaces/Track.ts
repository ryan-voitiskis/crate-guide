export default interface Track {
  _id: string
  title: string
  artists?: string // * optional to allow for artists to be inferred from record artists
  position?: string
  duration?: string
  bpm?: number
  rpm?: number
  genre?: string
  playable: boolean
}
