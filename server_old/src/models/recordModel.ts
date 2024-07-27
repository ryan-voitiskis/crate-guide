import mongoose, { Types } from "mongoose"

interface ITrack {
  _id: Types.ObjectId
  spotifyID?: string
  title: string
  artists: string
  position: string
  duration?: number
  bpm?: number
  rpm: number
  key?: number
  mode?: number
  genre: string
  timeSignatureUpper?: number
  timeSignatureLower?: number
  playable: boolean
  audioFeatures?: {
    acousticness: number
    danceability: number
    duration_ms: number
    energy: number
    instrumentalness: number
    key: number
    liveness: number
    loudness: number
    mode: number
    speechiness: number
    tempo: number
    time_signature: number
    valence: number
  }
}

interface IRecord {
  _id: Types.ObjectId
  user: Types.ObjectId
  discogsID?: number
  spotifyID?: string
  catno: string
  title: string
  artists: string
  label: string
  year: number
  cover: string
  tracks: ITrack[]
}

const trackSchema = new mongoose.Schema<ITrack>({
  spotifyID: {
    type: String,
  },
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
    type: Number,
  },
  bpm: {
    type: Number,
  },
  rpm: {
    type: Number,
  },
  key: {
    type: Number,
  },
  mode: {
    type: Number,
  },
  genre: {
    type: String,
  },
  timeSignatureUpper: {
    type: Number,
  },
  timeSignatureLower: {
    type: Number,
  },
  playable: {
    type: Boolean,
  },
  audioFeatures: {
    acousticness: {
      type: Number,
    },
    danceability: {
      type: Number,
    },
    duration_ms: {
      type: Number,
    },
    energy: {
      type: Number,
    },
    instrumentalness: {
      type: Number,
    },
    key: {
      type: Number,
    },
    liveness: {
      type: Number,
    },
    loudness: {
      type: Number,
    },
    mode: {
      type: Number,
    },
    speechiness: {
      type: Number,
    },
    tempo: {
      type: Number,
    },
    time_signature: {
      type: Number,
    },
    valence: {
      type: Number,
    },
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
