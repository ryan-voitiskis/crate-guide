import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  findAndImportRecordAudioFeatures,
  importRecordAudioFeatures,
} from "../controllers/spotifyController.js"

const router = express.Router()

router
  .route("/import_data_for_selected")
  .post(protect, findAndImportRecordAudioFeatures)
router.route("/import_data_for_client_matched").post(importRecordAudioFeatures)

export default router
