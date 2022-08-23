import { defineStore } from "pinia"
import Crate from "@/interfaces/Crate"
import crateService from "@/services/crateService"

export const crateStore = defineStore("crate", {
  state: () => ({
    crateList: [] as Crate[],
    loading: false,
    errorMsg: "",
  }),
  actions: {
    async addCrate(crate: Crate, token: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await crateService.addCrate(crate, token)

        // push returned crate to crateList
        if (response.status === 201) {
          const newCrate = (await response.json()) as Crate
          this.crateList.push(newCrate)
          this.loading = false
          return response.status

          // handle errors
        } else if (response.status === 400) {
          this.loading = false
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
        }
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error"
        this.loading = false
        console.error(error)
        return null
      }
    },

    async fetchCrates(token: string): Promise<number | null> {
      try {
        const response = await crateService.getCrates(token)

        // push returned crate to crateList
        if (response.status === 200) {
          const crates = (await response.json()) as Crate[]
          if (crates !== null) this.crateList = crates
          return response.status

          // handle errors
        } else if (response.status === 400) {
          const error = await response.json()
          if (error.message) console.error(error.message)
          else console.error("Unexpected error")
        }
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async deleteCrate(id: string, token: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await crateService.deleteCrate(id, token)

        // fetch crates if crate deleted successfully
        if (response.status === 200) {
          this.fetchCrates(token)
          this.loading = false
          return response.status

          // handle errors
        } else if (response.status === 400 || response.status === 401) {
          this.loading = false
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
        }
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error"
        this.loading = false
        console.error(error)
        return null
      }
    },
  },
  getters: {
    // gets a crate by id. returns null if not found
    getById: (state) => {
      return (id: string) =>
        state.crateList.find((crate) => crate._id === id) || null
    },
  },
})
