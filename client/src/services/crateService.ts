import Crate from "@/interfaces/Crate"
import UnsavedCrate from "@/interfaces/UnsavedCrate"
const API_URL = "http://localhost:5001/api/crates"

// get user crates
const getCrates = async (token: string) => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL, options)
  return response
}

// add new crate
const addCrate = async (crate: UnsavedCrate, token: string) => {
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
  const response = await fetch(API_URL, options)
  return response
}

// update new crate
const updateCrate = async (crate: Crate, token: string) => {
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
  const response = await fetch(API_URL + "/" + crate._id, options)
  return response
}

// Delete user crate
const deleteCrate = async (_id: string, token: string) => {
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "/" + _id, options)
  return response
}

const crateService = {
  getCrates,
  addCrate,
  updateCrate,
  deleteCrate,
}
export default crateService
