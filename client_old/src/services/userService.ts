import globals from "@/globals"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
import User from "@/interfaces/User"

// authenticate user
async function login(email: string, password: string) {
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
  const response = await fetch(globals.API_USERS_URL + "login", options)
  return response
}

// fetch user data using jwt. used when cookie exists but no user in userStore
async function fetchUser(token: string) {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_USERS_URL, options)
  return response
}

// add new user
async function addUser(user: UnregisteredUser) {
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
  const response = await fetch(globals.API_USERS_URL, options)
  return response
}

// update user settings
async function updateSettings(user: User) {
  const body = new URLSearchParams()
  body.append("settings", JSON.stringify(user.settings))

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_USERS_URL + user._id, options)
  return response
}

// update user settings
async function forgotPassword(email: string) {
  const body = new URLSearchParams()
  body.append("email", email)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  }
  const response = await fetch(
    globals.API_USERS_URL + "forgot-password",
    options
  )
  return response
}

async function resetPassword(password: string, token: string) {
  const body = new URLSearchParams()
  body.append("password", password)
  body.append("token", token)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  }
  const response = await fetch(
    globals.API_USERS_URL + "reset-password",
    options
  )
  return response
}

async function changePassword(
  currentPassword: string,
  password: string,
  user: User
) {
  const body = new URLSearchParams()
  body.append("currentPassword", currentPassword)
  body.append("password", password)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
    body: body,
  }
  const response = await fetch(
    globals.API_USERS_URL + "change-password",
    options
  )
  return response
}

const userService = {
  login,
  fetchUser,
  addUser,
  updateSettings,
  forgotPassword,
  resetPassword,
  changePassword,
}
export default userService
