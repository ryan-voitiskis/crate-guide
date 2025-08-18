import globals from "@/globals"

// request to server to then make request of OAuth token as per step 2 of:
// * https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
async function requestToken(token: string) {
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
async function revokeAuthorisation(token: string) {
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

async function getFolders(token: string) {
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

async function getFolder(folder: string, token: string) {
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
