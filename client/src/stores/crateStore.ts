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
    // TODO: test loading svg and display errors
    async addCrate(name: string, user: string, token: string): Promise<number> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await crateService.addCrate(name, user, token)

        // push returned crate to crateList
        if (response.status === 201) {
          const newCrate = (await response.json()) as Crate
          this.crateList.push(newCrate)
          this.loading = false
          return response.status

          // handle errors
        } else if (response.status === 400) {
          this.errorMsg = "Unexpected error"
          this.loading = false
          const error = await response.json()
          console.error("crateStore.addCrate():", error.message)
        }
        return response.status

        // catch error, eg. TypeError: NetworkError when attempting to fetch resource.
      } catch (error) {
        this.errorMsg = "Unexpected error"
        this.loading = false
        console.error(error)
        return 400
      }
    },

    async fetchCrates(token: string) {
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
          console.error("crateStore.fetchCrates():", error.message)
        }
        return response.status

        // catch error, eg. TypeError: NetworkError when attempting to fetch resource.
      } catch (error) {
        console.error(error)
        return 400
      }
    },

    // TODO: test loading svg and display errors
    async deleteCrate(id: string, token: string) {
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
        } else if (response.status === 400) {
          this.errorMsg = "Unexpected error"
          this.loading = false
          const error = await response.json()
          console.error("crateStore.deleteCrate():", error.message)
        }
        return response.status

        // catch error, eg. TypeError: NetworkError when attempting to fetch resource.
      } catch (error) {
        console.error(error)
        return 400
      }
    },
  },
  getters: {
    // returns null if not found
    getById: (state) => {
      return (id: string) =>
        state.crateList.find((crate) => crate._id === id) || null
    },
  },
})
