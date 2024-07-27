import mongoose, { Types } from "mongoose"

interface ICrate {
  _id: Types.ObjectId
  user: Types.ObjectId
  name: string
  records: string[]
}

const crateSchema = new mongoose.Schema<ICrate>(
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

const Crate = mongoose.model("Crate", crateSchema)
export { ICrate, Crate }
