const API_URL = "http://localhost:5002/api/discogs/"

// todo: desc
const requestToken = async (token: string) => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "request_token")
  return response
}
const recordService = {
  requestToken,
}
export default recordService
