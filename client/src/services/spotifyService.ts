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
const revokeSpotifyAuthorisation = async (token: string) => {
  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "revoke_spotify", options)
  return response
}

const recordService = {
  authorisationRequest,
  revokeSpotifyAuthorisation,
}
export default recordService
