const mongoose = require("mongoose")
// const Track = require("./trackModel")

const recordSchema = mongoose.Schema(
  {
    discogsID: {
      type: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Record model: No user provided."],
      ref: "User",
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
    mixable: {
      type: Boolean,
    },
    // tracks: {
    //   type: [String],
    // },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model("Record", recordSchema)
