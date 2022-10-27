import express from "express"
import protect from "../middleware/authMiddleware.js"
import { importRecordAudioFeatures } from "../controllers/spotifyController.js"

const router = express.Router()

router
  .route("/import_data_for_selected")
  .post(protect, importRecordAudioFeatures)

export default router
