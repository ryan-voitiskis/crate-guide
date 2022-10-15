import mongoose from "mongoose"

const trackSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Track model: No title provided."],
  },
  artists: {
    type: String,
  },
  position: {
    type: String,
  },
  duration: {
    type: String,
  },
  bpm: {
    type: Number,
  },
  rpm: {
    type: Number,
  },
  genre: {
    type: String,
  },
  playable: {
    type: Boolean,
  },
})

const recordSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Record model: No user provided."],
      ref: "User",
    },
    discogsID: {
      type: Number,
    },
    catno: {
      type: String,
    },
    title: {
      type: String,
      required: [true, "Record model: No title provided."],
    },
    artists: {
      type: String,
      required: [true, "Record model: No artist provided."],
    },
    label: {
      type: String,
    },
    year: {
      type: Number,
    },
    cover: {
      type: String,
    },
    mixable: {
      type: Boolean,
    },
    tracks: {
      type: [trackSchema],
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model("Record", recordSchema)
