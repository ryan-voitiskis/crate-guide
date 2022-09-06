export default interface Track {
  _id: string
  title: string
  artists?: string
  position?: string // todo: get rid of ? if default is "", then adjust positionColour in TrackSingle
  duration?: string
  bpm?: number
  rpm?: number
  genre?: string
  playable: boolean
}
