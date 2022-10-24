import mongoose, { Types } from "mongoose"

interface ITrack {
  title: string
  artists: string
  position: string
  duration?: string
  bpm: number
  rpm: number
  genre: string
  playable: boolean
}

interface IRecord {
  user: Types.ObjectId
  discogsID: number
  spotifyID: string
  catno: string
  title: string
  artists: string
  label: string
  year: number
  cover: string
  mixable: boolean
  tracks: ITrack[]
}

const trackSchema = new mongoose.Schema<ITrack>({
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

const recordSchema = new mongoose.Schema<IRecord>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Record model: No user provided."],
      ref: "User",
    },
    discogsID: {
      type: Number,
    },
    spotifyID: {
      type: String,
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

const Record = mongoose.model("Record", recordSchema)
export { ITrack, IRecord, Record }
