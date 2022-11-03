import MatchedTrack from "@/interfaces/MatchedTrack"
const API_URL = "http://localhost:5001/api/spotify/"

// request to server to then make request of OAuth token as per step 2 of:
// * https://www.spotify.com/developers/#page:authentication,header:authentication-oauth-flow
const authorisationRequest = async (token: string) => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "authorisation_request", options)
  return response
}

// request to removes spotify api credentials from user
const revokeAuthorisation = async (token: string) => {
  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "revoke", options)
  return response
}

// request to get and save a track's audio features for manually added spotifyID
const getTrackFeatures = async (matchedTrack: MatchedTrack, token: string) => {
  const body = new URLSearchParams()
  body.append("matchedTrack", JSON.stringify(matchedTrack))

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(API_URL + "get_track_features", options)
  return response
}

const recordService = {
  authorisationRequest,
  revokeAuthorisation,
  getTrackFeatures,
}
export default recordService
