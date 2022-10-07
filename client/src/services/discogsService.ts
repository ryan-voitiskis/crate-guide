import User from "@/interfaces/User"
const API_URL = "http://localhost:5001/api/discogs/"

// request to server to then make request of OAuth token as per step 2 of:
// * https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
const requestToken = async (token: string) => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "request_token", options)
  return response
}

// request to removes discogs api credentials from user
const revokeDiscogsAuthorisation = async (user: User) => {
  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
  }
  const response = await fetch(API_URL + "revoke_discogs/" + user._id, options)
  return response
}

const recordService = {
  requestToken,
  revokeDiscogsAuthorisation,
}
export default recordService
