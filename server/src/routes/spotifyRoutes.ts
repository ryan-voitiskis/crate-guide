import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  authorisationRequest,
  authorisationCallback,
  revokeSpotifyAuthorisation,
} from "../controllers/spotifyOAuthController.js"

const router = express.Router()

router.route("/authorisation_request").get(protect, authorisationRequest)
router.route("/callback").get(authorisationCallback)
router.put("/revoke_spotify", protect, revokeSpotifyAuthorisation)

export default router
