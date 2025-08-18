import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  addUser,
  loginUser,
  getUser,
  updateUser,
  sendResetPasswordEmail,
  resetPassword,
  changePassword,
} from "../controllers/userController.js"

const router = express.Router()

router.post("/", addUser)
router.post("/login", loginUser)
router.get("/", protect, getUser)
router.put("/:id", protect, updateUser)
router.post("/forgot-password", sendResetPasswordEmail)
router.post("/reset-password/", resetPassword)
router.post("/change-password/", protect, changePassword)

export default router
