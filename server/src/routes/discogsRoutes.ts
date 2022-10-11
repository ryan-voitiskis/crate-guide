import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  requestTokenAndUpdateUser,
  captureVerifierAndUpdateUser,
  revokeDiscogsAuthorisation,
} from "../controllers/discogsOAuthController.js"
import { getFolders } from "../controllers/discogsController.js"

const router = express.Router()

router.route("/request_token").get(protect, requestTokenAndUpdateUser)
router.route("/capture_verifier").get(captureVerifierAndUpdateUser)
router.put("/revoke_discogs/:id", protect, revokeDiscogsAuthorisation)
router.get("/folders", protect, getFolders)

export default router
