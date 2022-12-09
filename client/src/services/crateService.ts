import Crate from "@/interfaces/Crate"
import UnsavedCrate from "@/interfaces/UnsavedCrate"
import globals from "@/globals"

// get user crates
async function getCrates(token: string) {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_CRATES_URL, options)
  return response
}

// add new crate
async function addCrate(crate: UnsavedCrate, token: string) {
  const body = new URLSearchParams()
  body.append("crate", JSON.stringify(crate))

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_CRATES_URL, options)
  return response
}

// update new crate
async function updateCrate(crate: Crate, token: string) {
  const body = new URLSearchParams()
  body.append("crate", JSON.stringify(crate))

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_CRATES_URL + crate._id, options)
  return response
}

// Delete user crate
async function deleteCrate(_id: string, token: string) {
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_CRATES_URL + _id, options)
  return response
}

const crateService = {
  getCrates,
  addCrate,
  updateCrate,
  deleteCrate,
}
export default crateService
