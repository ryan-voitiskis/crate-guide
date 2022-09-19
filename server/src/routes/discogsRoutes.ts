import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  requestToken,
  captureVerifier,
  accessToken,
} from "../controllers/discogsController.js"

const router = express.Router()

router.route("/request_token").get(protect, requestToken)
router.route("/capture_verifier").get(captureVerifier)
router.route("/access_token").get(protect, accessToken)

export default router
