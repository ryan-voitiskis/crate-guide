const mongoose = require("mongoose")

const crateSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Crate model: No user provided."],
      ref: "User",
    },
    name: {
      type: String,
    },
    records: {
      type: [String],
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model("Crate", crateSchema)
