import PlayedTrack from "./PlayedTrack"

export default interface UnsavedSet {
  name: string
  set: PlayedTrack[] // for crate duplication
}
