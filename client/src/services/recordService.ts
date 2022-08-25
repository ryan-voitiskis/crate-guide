import Record from "@/interfaces/Record"
const API_URL = "http://localhost:5002/api/records"

// add new record
const addRecord = async (record: Record, token: string) => {
  const body = new URLSearchParams()
  body.append("user", record.user)
  body.append("catno", record.catno ? record.catno : "")
  body.append("title", record.title)
  body.append("artists", record.artists)
  body.append("label", record.label ? record.label : "")
  body.append("year", record.year ? record.year.toString() : "")
  body.append("mixable", record.mixable ? "1" : "0")
  // ? append tracks as well?

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

// Get user records
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

// todo: updateRecord()

// Delete user record
const deleteRecord = async (id: string, token: string) => {
  const options = {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = await fetch(API_URL + "/" + id, options)
  return response
}

// Delete user record
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
  addRecord,
  getRecords,
  deleteRecord,
  deleteRecords,
}
export default recordService
