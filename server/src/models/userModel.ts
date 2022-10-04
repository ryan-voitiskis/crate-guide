import mongoose from "mongoose"

const userSchema = new mongoose.Schema(
  {
    discogsUID: {
      type: String,
    },
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

export default mongoose.model("User", userSchema)
