import globals from "@/globals"
import UnsavedSet from "@/interfaces/UnsavedSet"

// get sets
async function getSets(token: string) {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_SETS_URL, options)
  return response
}

// save new history
async function saveSet(history: UnsavedSet, token: string) {
  const body = new URLSearchParams()
  body.append("set", JSON.stringify(history))

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_SETS_URL, options)
  return response
}

// Delete a history
async function deleteSet(_id: string, token: string) {
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_SETS_URL + _id, options)
  return response
}

const sessionService = {
  getSets,
  saveSet,
  deleteSet,
}
export default sessionService
