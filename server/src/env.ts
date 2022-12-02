import dotenv from "dotenv"
dotenv.config()

export default {
  NODE_ENV: process.env.NODE_ENV as string,
  PORT: process.env.PORT,
  SITE_URL: process.env.SITE_URL as string,
  MONGO_URI_DEV: process.env.MONGO_URI_DEV as string,
  MONGO_URI_PROD: process.env.MONGO_URI_PROD as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
}
