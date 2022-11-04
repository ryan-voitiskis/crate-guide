import globals from "@/globals"

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
  const response = await fetch(
    globals.API_DISCOGS_URL + "request_token",
    options
  )
  return response
}

// request to removes discogs api credentials from user
const revokeAuthorisation = async (token: string) => {
  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(
    globals.API_DISCOGS_URL + "revoke_discogs",
    options
  )
  return response
}

const getFolders = async (token: string) => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_DISCOGS_URL + "folders", options)
  return response
}

const getFolder = async (folder: string, token: string) => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(
    globals.API_DISCOGS_URL + "folder/" + folder,
    options
  )
  return response
}

const recordService = {
  requestToken,
  revokeAuthorisation,
  getFolders,
  getFolder,
}
export default recordService
