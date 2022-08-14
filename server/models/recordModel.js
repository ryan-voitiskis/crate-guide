const mongoose = require("mongoose")

const recordSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Record model: No user provided."],
      ref: "User",
    },
    catno: {
      type: String,
    },
    artist: {
      type: String,
      required: [true, "Record model: No artist provided."],
    },
    title: {
      type: String,
      required: [true, "Record model: No title provided."],
    },
    label: {
      type: String,
    },
    year: {
      type: Number,
    },
    mixable: {
      type: Boolean,
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model("Record", recordSchema)
