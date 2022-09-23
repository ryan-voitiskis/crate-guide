import UnregisteredUser from "@/interfaces/UnregisteredUser"
import User from "@/interfaces/User"
const API_URL = "http://localhost:5001/api/users/"

// authenticate user
const login = async (email: string, password: string) => {
  const body = new URLSearchParams()
  body.append("email", email)
  body.append("password", password)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  }
  const response = await fetch(API_URL + "login", options)
  return response
}

// add new user
const addUser = async (user: UnregisteredUser) => {
  const body = new URLSearchParams()
  body.append("name", user.name)
  body.append("email", user.email)
  body.append("password", user.password)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/js0ation/x-www-form-urlencoded",
    },
    body: body,
  }
  const response = await fetch(API_URL, options)
  return response
}

// update user settings
const updateSettings = async (user: User) => {
  const body = new URLSearchParams()
  body.append("discogsUID", user.discogsUID)
  body.append("settings.selectedCrate", user.settings.selectedCrate)
  body.append("settings.theme", user.settings.theme)
  body.append("settings.turntableTheme", user.settings.turntableTheme)
  body.append("settings.turntablePitchRange", user.settings.turntablePitchRange)

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
    body: body,
  }
  const response = await fetch(API_URL + user._id, options)
  return response
}

// request to removes discogsToken, discogsTokenSecret, discogsRequestToken and discogsRequestTokenSecret from user.
const revokeDiscogsTokens = async (user: User) => {
  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
  }
  const response = await fetch(API_URL + "revoke_discogs/" + user._id, options)
  return response
}

const userService = {
  login,
  addUser,
  updateSettings,
  revokeDiscogsTokens,
}
export default userService
