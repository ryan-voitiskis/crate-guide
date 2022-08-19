import axios from "axios"
import Crate from "@/interfaces/Crate"
const API_URL = "http://localhost:5000/api/crates"

// add new crate
const addCrate = async (crate: Crate, token: string) => {
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
  try {
    const { data } = await axios.post<Crate>(API_URL, crate, config)
    return data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Crate service: ", error.message)
      return null
    } else {
      console.error("Crate service (unexpected error): ", error)
      return null
    }
  }
}

// Get user crates
const getCrates = async (token: string) => {
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
  try {
    const { data } = await axios.get<Crate[]>(API_URL, config)
    return data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Crate service: ", error.message)
      return null
    } else {
      console.error("Crate service (unexpected error): ", error)
      return null
    }
  }
}

// Delete user crate
const deleteCrate = async (id: string, token: string) => {
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
  try {
    const { data } = await axios.delete<any>(API_URL + "/" + id, config)
    return data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Crate service: ", error.message)
      return null
    } else {
      console.error("Crate service (unexpected error): ", error)
      return null
    }
  }
}

const crateService = {
  addCrate,
  getCrates,
  deleteCrate,
}
export default crateService
