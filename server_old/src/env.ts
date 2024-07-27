import dotenv from "dotenv"
dotenv.config()

export default process.env.NODE_ENV === "production"
  ? {
      NODE_ENV: process.env.NODE_ENV as string,
      PORT: process.env.PORT,
      SITE_URL: process.env.SITE_URL as string,
      MONGO_URI: process.env.MONGO_URI as string,
      JWT_SECRET: process.env.JWT_SECRET as string,
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID as string,
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET as string,
      DISCOGS_CONSUMER_KEY: process.env.DISCOGS_CONSUMER_KEY as string,
      DISCOGS_CONSUMER_SECRET: process.env.DISCOGS_CONSUMER_SECRET as string,
      ELASTICMAIL_KEY: process.env.ELASTICMAIL_KEY as string,
    }
  : {
      NODE_ENV: process.env.NODE_ENV as string,
      PORT: process.env.PORT_DEV,
      SITE_URL: process.env.SITE_URL_DEV as string,
      MONGO_URI: process.env.MONGO_URI_DEV as string,
      JWT_SECRET: process.env.JWT_SECRET as string,
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID as string,
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET as string,
      DISCOGS_CONSUMER_KEY: process.env.DISCOGS_CONSUMER_KEY as string,
      DISCOGS_CONSUMER_SECRET: process.env.DISCOGS_CONSUMER_SECRET as string,
      ELASTICMAIL_KEY: process.env.ELASTICMAIL_KEY as string,
    }
