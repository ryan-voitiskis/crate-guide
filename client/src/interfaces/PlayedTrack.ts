export default interface PlayedTrack {
  _id: string
  timeAdded: number
  adjustedBpm: number | null // bpm of track when loaded
  transitionFromRating: number | null // star rating of transition FROM previous track, null for first or unrated
}
