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
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
          this.loading = false
        }
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error"
        console.error(error)
        this.loading = false
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
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
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
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
          this.loading = false
        }
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error"
        console.error(error)
        this.loading = false
        return null
      }
    },

    // push array or single record to crate
    async pushToCrate(
      records: string[],
      crateID: string,
      token: string
    ): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const crate = this.getById(crateID) as Crate
        if (crate) {
          const intersection = crate.records?.filter((i) => records.includes(i)) // records already in crate
          const difference = records.filter((i) => !crate.records?.includes(i)) // records not yet in crate

          if (difference.length) {
            crate.records?.push(...records)
            const response = await crateService.updateCrate(crate, token)

            // handle success
            if (response.status === 200) {
              // this.fetchCrates(token) // ? would something like this ensure concurrency, probably not req'd
              this.loading = false

              // handle - successfully saved difference but some intersection
              if (intersection?.length) {
                // todo: test this works when group add implemented, maybe better ui than alert
                alert(`
                Records ${difference.join(", ")} succesfully added.
                Records ${intersection.join(", ")} were already in crate.`)
              }
              return response.status

              // handle errors
            } else if (response.status === 400 || response.status === 401) {
              const error = await response.json()
              const msg = error.message ? error.message : "Unexpected error"
              this.errorMsg = msg
              this.loading = false
            }
            return response.status

            // handle - all records already in crate
          } else if (intersection?.length) {
            const msg =
              records.length > 1
                ? `All Records were already in crate.` // todo: test this works when group add implemented
                : `Record was already in crate.`
            alert(msg)
          }
          this.loading = false
          return 1
        } else throw new Error("No crate with that ID") // ? unlikely/impossible? is this req'd?

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error"
        console.error(error)
        this.loading = false
        return null
      }
    },
  },
  getters: {
    // gets a crate by id. returns null if not found
    getById: (state) => {
      return (id: string) =>
        state.crateList.find((crate) => crate._id === id) || null // todo: test this
    },
  },
})
