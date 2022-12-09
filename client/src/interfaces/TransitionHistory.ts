import PlayedTrack from "./PlayedTrack"

export default interface TransitionHistory {
  _id: string
  user: string
  name?: string
  history: PlayedTrack[]
}
