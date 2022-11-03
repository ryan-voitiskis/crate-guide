import asyncHandler from "express-async-handler"
import { IUser } from "../models/userModel.js"
import { Record } from "../models/recordModel.js"
import { getAudioFeaturesSingle } from "./spotifyControllerUtils.js"
import { MatchedTrack } from "../types/spotifyController-types.js"

// @desc    gets and saves a track's audio features
// @route   GET /api/spotify/get_track_features
// @access  private
const getTrackFeatures = asyncHandler(async (req, res) => {
  const user = req.user! as IUser
  const matchedTrack: MatchedTrack = JSON.parse(req.body.matchedTrack)
  const retrievedFeatures = await getAudioFeaturesSingle(
    matchedTrack.spotifyTrackID,
    user
  )
  if (retrievedFeatures) {
    const updatedRecord = await Record.findOneAndUpdate(
      { _id: matchedTrack.recordID, "tracks._id": matchedTrack.trackID },
      {
        $set: {
          "tracks.$.audioFeatures": retrievedFeatures,
          "tracks.$.spotifyID": matchedTrack.spotifyTrackID,
        },
      },
      { new: true }
    )
    res.status(200).json(updatedRecord)
  } else {
    res.status(400)
    throw new Error("Audio Features not found for that ID.")
  }
})

export { getTrackFeatures }
