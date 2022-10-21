import mongoose from "mongoose"

interface IUser {
  name: string
  email: string
  password: string
  createdAt?: string
  updatedAt?: string
  discogsUID?: string
  discogsToken: string
  discogsTokenSecret: string
  discogsRequestToken: string
  discogsRequestTokenSecret: string
  justCompleteDiscogsOAuth: boolean
  discogsUsername: string
  spotifyToken: string
  spotifyRefreshToken: string
  spotifyNonce: string
  spotifyAuthReqTimestamp: number
  settings: {
    theme: string
    turntableTheme: string
    turntablePitchRange: string
    selectedCrate: string
  }
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
    },
    discogsUsername: {
      type: String,
    },
    discogsToken: {
      type: String,
    },
    discogsTokenSecret: {
      type: String,
    },
    // for oauth flow only. use discogsToken for discogs API calls
    discogsRequestToken: {
      type: String,
    },
    // for oauth flow only. use discogsTokenSecret for discogs API calls
    discogsRequestTokenSecret: {
      type: String,
    },
    // flag to communicate to front end that OAuth flow successfully complete
    justCompleteDiscogsOAuth: {
      type: Boolean,
      default: false,
    },
    // authorization_code OAuth token, valid for 1 minute
    spotifyToken: {
      type: String,
    },
    // token provided during OAuth for refreshing token when spotifyToken expires
    spotifyRefreshToken: {
      type: String,
    },
    // nonce (state) used to find user in DB from OAuth callback function
    spotifyNonce: {
      type: String,
    },
    // once user is found with nonce, check authorisationRequest was made recently with this
    spotifyAuthReqTimestamp: {
      type: Number,
    },
    settings: {
      theme: {
        type: String,
        default: "light",
      },
      turntableTheme: {
        type: String,
        default: "silver",
      },
      turntablePitchRange: {
        type: String,
        default: "8",
      },
      selectedCrate: {
        type: String,
        default: "all",
      },
    },
  },
  {
    timestamps: true,
  }
)

const User = mongoose.model("User", userSchema)
export { User, IUser }
