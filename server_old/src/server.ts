import { fileURLToPath } from "node:url"
import connectDB from "./config/db.js"
import cors from "cors"
import crateRoutes from "./routes/crateRoutes.js"
import discogsRoutes from "./routes/discogsRoutes.js"
import discogsRoutesSSE from "./routes/discogsRoutesSSE.js"
import env from "./env.js"
import errorHandler from "./middleware/errorMiddleware.js"
import errorHandlerSSE from "./middleware/errorMiddlewareSSE.js"
import express from "express"
// import helmet from "helmet"
// import history from "connect-history-api-fallback"
import path from "path"
import recordRoutes from "./routes/recordRoutes.js"
import setRoutes from "./routes/setRoutes.js"
import spotifyRoutes from "./routes/spotifyRoutes.js"
import spotifyRoutesSSE from "./routes/spotifyRoutesSSE.js"
import trackRoutes from "./routes/trackRoutes.js"
import userRoutes from "./routes/userRoutes.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

connectDB()

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cors())
// app.use(helmet())

// can access route URLS, eg. /collection:
// * https://forum.vuejs.org/t/how-to-handle-vue-routes-with-express-ones/23522/2
// ! however prevented route handling of /api/discogs/capture_verifier during oauth development
// app.use(history())

app.use("/api/crates", crateRoutes)
app.use("/api/discogs", discogsRoutes)
app.use("/api/sets", setRoutes)
app.use("/api/records", recordRoutes)
app.use("/api/spotify", spotifyRoutes)
app.use("/api/tracks", trackRoutes)
app.use("/api/users", userRoutes)
app.use("/api/discogs_sse", discogsRoutesSSE)
app.use("/api/spotify_sse", spotifyRoutesSSE)

app.use("/api/crates", errorHandler)
app.use("/api/discogs", errorHandler)
app.use("/api/sets", errorHandler)
app.use("/api/records", errorHandler)
app.use("/api/spotify", errorHandler)
app.use("/api/tracks", errorHandler)
app.use("/api/users", errorHandler)
app.use("/api/discogs_sse", errorHandlerSSE)
app.use("/api/spotify_sse", errorHandlerSSE)

// serve frontend
app.use(express.static(path.join(__dirname, "../../client/dist/")))

app.listen(env.PORT, () => console.log(`Server started on port ${env.PORT}`))
