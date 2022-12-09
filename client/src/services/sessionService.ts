import globals from "@/globals"
import UnsavedHistory from "@/interfaces/UnsavedHistory"

// get histories
async function getHistories(token: string) {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_HISTORIES_URL, options)
  return response
}

// save new history
async function saveHistory(history: UnsavedHistory, token: string) {
  const body = new URLSearchParams()
  body.append("history", JSON.stringify(history))

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_HISTORIES_URL, options)
  return response
}

// Delete a history
async function deleteHistory(_id: string, token: string) {
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_HISTORIES_URL + _id, options)
  return response
}

const sessionService = {
  getHistories,
  saveHistory,
  deleteHistory,
}
export default sessionService
