import path from "path"
import { fileURLToPath } from "node:url"
import express from "express"
import cors from "cors"
// import helmet from "helmet"
import dotenv from "dotenv"
import errorHandler from "./middleware/errorMiddleware.js"
import connectDB from "./config/db.js"
import crateRoutes from "./routes/crateRoutes.js"
import discogsRoutes from "./routes/discogsRoutes.js"
import recordRoutes from "./routes/recordRoutes.js"
import spotifyRoutes from "./routes/spotifyRoutes.js"
import trackRoutes from "./routes/trackRoutes.js"
import userRoutes from "./routes/userRoutes.js"
// import history from "connect-history-api-fallback"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const port = process.env.PORT || 5001

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
app.use("/api/records", recordRoutes)
app.use("/api/spotify", spotifyRoutes)
app.use("/api/tracks", trackRoutes)
app.use("/api/users", userRoutes)

app.use(errorHandler)

// serve frontend
app.use(express.static(path.join(__dirname, "../../client/dist/")))

app.listen(port, () => console.log(`Server started on port ${port}`))
