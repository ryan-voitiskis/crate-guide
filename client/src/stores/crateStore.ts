import { defineStore } from "pinia"
import Crate from "@/interfaces/Crate"
import UnsavedCrate from "@/interfaces/UnsavedCrate"
import crateService from "@/services/crateService"
import { recordStore } from "@/stores/recordStore"

export const crateStore = defineStore("crate", {
  state: () => ({
    crateList: [] as Crate[],
    loading: false,
    errorMsg: "",
    feedbackMsg: "", // after update feedback msg
  }),
  actions: {
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
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async addCrate(crate: UnsavedCrate, token: string): Promise<number | null> {
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
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async deleteCrate(_id: string, token: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await crateService.deleteCrate(_id, token)

        // fetch crates if crate deleted successfully
        if (response.status === 200) {
          this.crateList = this.crateList.filter((i) => i._id !== _id)
          this.loading = false
          return response.status

          // handle errors
        } else if (response.status === 400 || response.status === 401) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
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
          const intersection = crate.records.filter((i) => records.includes(i)) // records already in crate
          const difference = records.filter((i) => !crate.records.includes(i)) // records not yet in crate

          if (difference.length) {
            const response = await crateService.updateCrate(crate, token)

            // handle success
            if (response.status === 200) {
              crate.records.push(...difference)
              // handle - successfully saved difference but some intersection
              if (intersection.length) {
                const difText =
                  difference.length < 12
                    ? difference.map((i) => this.getRecordName(i)).join(", ")
                    : `${difference.length} records`
                const intersectionText =
                  intersection.length < 12
                    ? intersection.map((i) => this.getRecordName(i)).join(", ")
                    : `${intersection.length} records`
                const intersectionJoinText =
                  intersection.length > 1 ? `were` : `was`
                this.feedbackMsg = `${difText} succesfully added.</br>
                  ${intersectionText} ${intersectionJoinText} already in crate.`
              }
              this.loading = false
              return response.status

              // handle errors
            } else if (response.status === 400 || response.status === 401) {
              const error = await response.json()
              this.errorMsg = error.message ? error.message : "Unexpected error"
            }
            this.loading = false
            return response.status

            // handle - all records already in crate
          } else if (intersection.length) {
            this.feedbackMsg =
              records.length > 1
                ? `All Records were already in crate.`
                : `Record was already in crate.`
          }
          this.loading = false
          return 1 //  <- returns 1 if all records already in crate
        } else {
          this.errorMsg = "No crate with that ID."
          this.loading = false
          return null
        }

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    // remove array or single record from crate locally and on server
    async removeFromCrate(
      records: string[],
      crateID: string,
      token: string
    ): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const crate = this.getById(crateID) as Crate

        // if crate, clone it, set its records to remainingRecords and send
        if (crate) {
          const clonedCrate = JSON.parse(JSON.stringify(this.getById(crateID)))
          const remainingRecords = crate.records.filter(
            (i) => !records.includes(i)
          )
          clonedCrate.records = remainingRecords
          const response = await crateService.updateCrate(clonedCrate, token)

          // handle success - if 200 update store with remaining records
          if (response.status === 200) {
            crate.records = remainingRecords // only updates locally if successful response

            // handle errors
          } else if (response.status === 400 || response.status === 401) {
            const error = await response.json()
            this.errorMsg = error.message ? error.message : "Unexpected error"
          }
          this.loading = false
          return response.status

          // handle no crate with id
        } else {
          this.errorMsg = "No crate with that ID."
          this.loading = false
          return null
        }

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    // remove array or single record from all crates locally only, used by deleteRecords in recordStore
    // * this operation is completed in the deleteRecords function in recordController on the server
    removeFromCrates(records: string[]) {
      this.crateList.forEach((crate) => {
        crate.records = crate.records.filter((i) => !records.includes(i))
      })
    },
  },
  getters: {
    // gets a crate by id. returns null if not found
    getById: (state) => {
      return (_id: string) =>
        state.crateList.find((crate) => crate._id === _id) || null
    },
    // returns array of record IDs in a crate
    getRecordsByCrate: (state) => {
      return (_id: string) =>
        state.crateList.find((crate) => crate._id === _id)?.records ||
        ([] as string[])
    },
    // get name by id from record store
    // todo: test this, changed recStore to records and removed state param
    getRecordName() {
      const records = recordStore()
      return records.getNameById
    },
  },
})
