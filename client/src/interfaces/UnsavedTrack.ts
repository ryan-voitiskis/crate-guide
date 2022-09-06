export default interface UnsavedTrack {
  title: string
  artists?: string
  position?: string
  duration?: string
  bpm?: number
  rpm?: number
  genre?: string
  playable: boolean
}
