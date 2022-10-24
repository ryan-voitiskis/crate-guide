import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  authorisationRequest,
  authorisationCallback,
  revokeSpotifyAuthorisation,
} from "../controllers/spotifyOAuthController.js"

import { importRecordAudioFeatures } from "../controllers/spotifyController.js"

const router = express.Router()

router.route("/authorisation_request").get(protect, authorisationRequest)
router.route("/callback").get(authorisationCallback)
router.put("/revoke_spotify", protect, revokeSpotifyAuthorisation)
router
  .route("/import_data_for_selected")
  .post(protect, importRecordAudioFeatures)

export default router
