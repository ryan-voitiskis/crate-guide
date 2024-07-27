import globals from "@/globals"
import MatchedTrack from "@/interfaces/MatchedTrack"

// request to server to then make request of OAuth token as per step 2 of:
// * https://www.spotify.com/developers/#page:authentication,header:authentication-oauth-flow
async function authorisationRequest(token: string) {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(
    globals.API_SPOTIFY_URL + "authorisation_request",
    options
  )
  return response
}

// request to removes spotify api credentials from user
async function revokeAuthorisation(token: string) {
  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_SPOTIFY_URL + "revoke", options)
  return response
}

// request to get and save a track's audio features for manually added spotifyID
async function getTrackFeatures(matchedTrack: MatchedTrack, token: string) {
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
  const response = await fetch(
    globals.API_SPOTIFY_URL + "get_track_features",
    options
  )
  return response
}

const recordService = {
  authorisationRequest,
  revokeAuthorisation,
  getTrackFeatures,
}
export default recordService
