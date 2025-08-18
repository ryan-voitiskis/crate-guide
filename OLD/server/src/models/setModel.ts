import mongoose, { Types } from "mongoose"

interface IPlayedTrack {
  _id: Types.ObjectId
  timeAdded: number
  adjustedBpm: number | null // bpm of track when loaded
  transitionRating: number | null // star rating of transition FROM previous track, null for first or unrated
}

interface ISet {
  _id: Types.ObjectId
  user: Types.ObjectId
  name?: string
  set: IPlayedTrack[]
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

const setSchema = new mongoose.Schema<ISet>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Set model: No user provided."],
      ref: "User",
    },
    name: {
      type: String,
    },
    set: {
      type: [playedTrackSchema],
      required: [true, "Set model: No history provided."],
    },
  },
  {
    timestamps: true,
  }
)

const Set = mongoose.model("Set", setSchema)

export { IPlayedTrack, ISet, Set }
