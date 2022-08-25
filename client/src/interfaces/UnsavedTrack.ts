export default interface UnsavedTrack {
  title: string
  artist?: string
  position?: string
  duration?: string
  bpm?: number
  rpm?: number
  genre?: string
  playable: boolean
}
