export default interface Track {
  _id?: string // ? optional as not created yet for unsaved crate, is this a problem?
  title: string
  artist?: string
  position?: string
  duration?: string
  bpm?: number
  rpm?: number
  genre?: string
  playable: boolean
}
