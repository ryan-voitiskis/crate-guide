import dotenv from "dotenv"
dotenv.config()

export default {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  SITE_URL: process.env.SITE_URL as string,
  MONGO_URI: process.env.MONGO_URI as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
}
