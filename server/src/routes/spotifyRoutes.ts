import { getTrackFeatures } from "../controllers/spotifyController.js"
import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  authorisationRequest,
  authorisationCallback,
  revokeAuthorisation,
} from "../controllers/spotifyOAuthController.js"

const router = express.Router()

router.route("/authorisation_request").get(protect, authorisationRequest)
router.route("/callback").get(authorisationCallback)
router.put("/revoke", protect, revokeAuthorisation)
router.put("/get_track_features", protect, getTrackFeatures)

export default router
