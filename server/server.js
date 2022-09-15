import path from "path"
import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import errorHandler from "./middleware/errorMiddleware.js"
import connectDB from "./config/db.js"
import crateRoutes from "./routes/crateRoutes.js"
import discogsRoutes from "./routes/discogsRoutes.js"
import recordRoutes from "./routes/recordRoutes.js"
import trackRoutes from "./routes/trackRoutes.js"
import userRoutes from "./routes/userRoutes.js"

const port = process.env.PORT || 5000
dotenv.config()
connectDB()

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cors())

app.use("/api/crates", crateRoutes)
app.use("/api/discogs", discogsRoutes)
app.use("/api/records", recordRoutes)
app.use("/api/tracks", trackRoutes)
app.use("/api/users", userRoutes)

// todo: serve frontend
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/build")))

  app.get("*", (req, res) =>
    res.sendFile(
      path.resolve(__dirname, "../", "frontend", "build", "index.html")
    )
  )
} else {
  app.get("/", (req, res) => res.send("Please set to production"))
}

app.use(errorHandler)

app.listen(port, () => console.log(`Server started on port ${port}`))
