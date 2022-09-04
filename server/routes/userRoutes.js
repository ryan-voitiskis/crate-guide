const express = require("express")
const router = express.Router()

const {
  addUser,
  loginUser,
  getUser,
  updateUser,
} = require("../controllers/userController")

const { protect } = require("../middleware/authMiddleware")

router.post("/", addUser)
router.post("/login", loginUser)
router.get("/me", protect, getUser)
router.put("/:id", protect, updateUser)

module.exports = router
