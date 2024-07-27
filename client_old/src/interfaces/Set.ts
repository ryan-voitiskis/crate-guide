import PlayedTrack from "./PlayedTrack"

export default interface Set {
  _id: string
  user: string
  name?: string
  set: PlayedTrack[]
  createdAt?: string
}
