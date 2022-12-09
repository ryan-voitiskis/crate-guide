import mongoose, { Types } from "mongoose"

interface IPlayedTrack {
  _id: Types.ObjectId
  timeAdded: number
  adjustedBpm: number | null // bpm of track when loaded
  transitionRating: number | null // star rating of transition FROM previous track, null for first or unrated
}

interface ITransitionHistory {
  _id: Types.ObjectId
  user: Types.ObjectId
  name?: string
  history: IPlayedTrack[]
}

const playedTrackSchema = new mongoose.Schema<IPlayedTrack>({
  timeAdded: {
    type: Number,
  },
  adjustedBpm: {
    type: Number,
  },
  transitionRating: {
    type: Number,
  },
})

const transitionHistorySchema = new mongoose.Schema<ITransitionHistory>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "History model: No user provided."],
      ref: "User",
    },
    name: {
      type: String,
    },
    history: {
      type: [playedTrackSchema],
      required: [true, "History model: No history provided."],
    },
  },
  {
    timestamps: true,
  }
)

const TransitionHistory = mongoose.model(
  "TransitionHistory",
  transitionHistorySchema
)

export { IPlayedTrack, ITransitionHistory, TransitionHistory }
