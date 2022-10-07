import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  requestTokenAndUpdateUser,
  captureVerifierAndUpdateUser,
  revokeDiscogsAuthorisation,
} from "../controllers/discogsOAuthController.js"

const router = express.Router()

router.route("/request_token").get(protect, requestTokenAndUpdateUser)
router.route("/capture_verifier").get(captureVerifierAndUpdateUser)
router.put("/revoke_discogs/:id", protect, revokeDiscogsAuthorisation)

export default router
