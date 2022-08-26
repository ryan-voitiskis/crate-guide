export default interface Track {
  _id: string
  title: string
  artist?: string
  position?: string
  duration?: string
  bpm?: number
  rpm?: number
  genre?: string
  playable: boolean
}