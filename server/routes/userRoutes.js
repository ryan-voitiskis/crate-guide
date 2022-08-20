const express = require("express")
const router = express.Router()

const {
  addUser,
  loginUser,
  getMe,
  updateUser,
} = require("../controllers/userController")

const { protect } = require("../middleware/authMiddleware")

router.post("/", addUser)
router.post("/login", loginUser)
router.get("/me", protect, getMe)
router.put("/:id", protect, updateUser)

module.exports = router
