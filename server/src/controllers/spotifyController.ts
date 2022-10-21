import asyncHandler from "express-async-handler"
import { User } from "../models/userModel.js"
import fetch from "node-fetch"
import genNonce from "../utils/genNonce.js"

// @desc    removes discogs API creds from user
// @route   GET /api/spotify/track
// @access  private
const getTrack = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id)
  if (user) {
    const options = {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${user.spotifyToken}`,
      },
    }
    const response = await fetch(
      "https://api.spotify.com/v1/albums/4aawyAB9vmqN3uQ7FjRGTy",
      options
    )
    const res2JSON = await response.json()
    // console.log(res2JSON)
    res.status(200).json()
  }
})

export { getTrack }
