const mongoose = require("mongoose")

const userSchema = mongoose.Schema(
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
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model("User", userSchema)
