import dotenv from "dotenv"
dotenv.config()

export default {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  SITE_URL: process.env.SITE_URL,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
}
