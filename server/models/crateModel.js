import mongoose from "mongoose"

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

export default mongoose.model("Crate", crateSchema)
