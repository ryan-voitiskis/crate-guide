import UnsavedTrack from "@/interfaces/UnsavedTrack"
import Track from "@/interfaces/Track"
import globals from "@/globals"

// add new track
const addTrack = async (track: UnsavedTrack, record: string, token: string) => {
  const body = new URLSearchParams()
  body.append("track", JSON.stringify(track))
  body.append("recordID", record)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_TRACKS_URL, options)
  return response
}

// update track
const updateTrack = async (track: Track, token: string) => {
  const body = new URLSearchParams()
  body.append("track", JSON.stringify(track))

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_TRACKS_URL + track._id, options)

  return response
}

// delete single track
const deleteTrack = async (_id: string, token: string) => {
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_TRACKS_URL + _id, options)
  return response
}

const trackService = {
  addTrack,
  updateTrack,
  deleteTrack,
}
export default trackService
