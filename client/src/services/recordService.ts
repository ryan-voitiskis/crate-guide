import UnsavedRecord from "@/interfaces/UnsavedRecord"
import Record from "@/interfaces/Record"
const API_URL = "http://localhost:5001/api/records"

// get user records
const getRecords = async (token: string) => {
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

// add new record
const addRecord = async (record: UnsavedRecord, token: string) => {
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
  const response = await fetch(API_URL, options)
  return response
}

// update record
const updateRecord = async (record: Record, token: string) => {
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
  const response = await fetch(API_URL + "/" + record._id, options)
  return response
}

// delete array of records
const deleteRecords = async (records: string[], token: string) => {
  const body = new URLSearchParams()
  body.append("records", JSON.stringify(records)) // send as string
  const options = {
    method: "DELETE",
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

const recordService = {
  getRecords,
  addRecord,
  updateRecord,
  deleteRecords,
}
export default recordService
