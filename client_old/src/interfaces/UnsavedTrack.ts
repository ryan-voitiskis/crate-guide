export default interface UnsavedTrack {
  title: string
  artists?: string
  position?: string
  duration?: number | null
  bpm?: number
  rpm?: number
  key?: number
  mode?: number
  genre?: string
  timeSignatureUpper?: number | null
  timeSignatureLower?: number | null
  playable: boolean
}
