const API_URL = "http://localhost:5000/api/discogs/"

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
const recordService = {
  requestToken,
}
export default recordService
