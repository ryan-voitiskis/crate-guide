import mongoose from "mongoose"

const userSchema = mongoose.Schema(
  {
    discogsUID: {
      type: String,
    },
    discogsToken: {
      type: String,
    },
    discogsTokenSecret: {
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
