import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  importRecordFeatures,
  importMatchedFeatures,
} from "../controllers/spotifyController.js"

const router = express.Router()

router.route("/import_data_for_selected").post(protect, importRecordFeatures)
router
  .route("/import_data_for_client_matched")
  .post(protect, importMatchedFeatures)

export default router
