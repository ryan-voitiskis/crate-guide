import mongoose from "mongoose"
import env from "../env.js"

const connectDB = async () => {
  try {
    const conn =
      env.NODE_ENV === "production"
        ? await mongoose.connect(env.MONGO_URI_PROD)
        : await mongoose.connect(env.MONGO_URI_DEV)

    console.log(`MongoDB Connected: ${conn.connection.host}`)
  } catch (error) {
    console.log(error)
    process.exit(1)
  }
}

export default connectDB
