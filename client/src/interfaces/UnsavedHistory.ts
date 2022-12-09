import PlayedTrack from "./PlayedTrack"

export default interface UnsavedHistory {
  name: string
  history: PlayedTrack[] // for crate duplication
}
