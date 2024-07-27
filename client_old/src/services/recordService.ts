import globals from "@/globals"
import Record from "@/interfaces/Record"
import UnsavedRecord from "@/interfaces/UnsavedRecord"

// get user records
async function getRecords(token: string) {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(globals.API_RECORDS_URL, options)
  return response
}

// add new record
async function addRecord(record: UnsavedRecord, token: string) {
  const body = new URLSearchParams()
  body.append("record", JSON.stringify(record))

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_RECORDS_URL, options)
  return response
}

// update record
async function updateRecord(record: Record, token: string) {
  const body = new URLSearchParams()
  body.append("record", JSON.stringify(record))

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_RECORDS_URL + record._id, options)
  return response
}

// delete array of records
async function deleteRecords(records: string[], token: string) {
  const body = new URLSearchParams()
  body.append("records", JSON.stringify(records))
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  }
  const response = await fetch(globals.API_RECORDS_URL, options)
  return response
}

const recordService = {
  getRecords,
  addRecord,
  updateRecord,
  deleteRecords,
}
export default recordService
