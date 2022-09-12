export default interface Track {
  id: string
  title: string
  artists?: string // * optional to allow for artists to be inferred from record artists
  position?: string // todo: get rid of ? if default is "", then adjust positionColour in TrackSingle
  duration?: string
  bpm?: number
  rpm?: number
  genre?: string
  playable: boolean
}
