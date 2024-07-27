import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  requestTokenAndUpdateUser,
  captureVerifierAndUpdateUser,
  revokeAuthorisation,
} from "../controllers/discogsOAuthController.js"
import { getFolders, getFolder } from "../controllers/discogsController.js"

const router = express.Router()

router.route("/request_token").get(protect, requestTokenAndUpdateUser)
router.route("/capture_verifier").get(captureVerifierAndUpdateUser)
router.put("/revoke_discogs", protect, revokeAuthorisation)
router.get("/folders", protect, getFolders)
router.get("/folder/:id", protect, getFolder)

export default router
