import UnsavedTrack from "@/interfaces/UnsavedTrack"
import Track from "@/interfaces/Track"
const API_URL = "http://localhost:5001/api/tracks"

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
  const response = await fetch(API_URL, options)
  return response
}

// update track
// ! copied and untested
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
  const response = await fetch(API_URL + "/" + track._id, options)
  return response
}

// delete array of tracks
// ! copied and untested
const deleteTrack = async (tracks: string, token: string) => {
  const body = new URLSearchParams()
  body.append("tracks", JSON.stringify(tracks)) // send as string
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(API_URL, options)
  return response
}

const trackService = {
  addTrack,
  updateTrack,
  deleteTrack,
}
export default trackService
