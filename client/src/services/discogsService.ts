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
const revokeDiscogsAuthorisation = async (token: string) => {
  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "revoke_discogs", options)
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
  const response = await fetch(API_URL + "folders", options)
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
  const response = await fetch(API_URL + "folder/" + folder, options)
  return response
}

// add new records
const importRecords = async (records: number[], token: string) => {
  const body = new URLSearchParams()
  body.append("records", JSON.stringify(records))

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(API_URL + "import_records", options)
  return response
}

const recordService = {
  requestToken,
  revokeDiscogsAuthorisation,
  getFolders,
  getFolder,
  importRecords,
}
export default recordService
