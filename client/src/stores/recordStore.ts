import { defineStore } from "pinia"
import Record from "@/interfaces/Record"
import UnsavedRecord from "@/interfaces/UnsavedRecord"
import recordService from "@/services/recordService"

export const recordStore = defineStore("record", {
  state: () => ({
    recordList: [] as Record[],
    loading: false,
    errorMsg: "",
    toDelete: [] as string[], // record id(s) to be deleted
    toCrate: [] as string[], // record id(s) to be added to crate that is yet to be selected
  }),
  actions: {
    async addRecord(
      record: UnsavedRecord,
      token: string
    ): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await recordService.addRecord(record, token)

        // push returned record to recordList
        if (response.status === 201) {
          const newRecord = (await response.json()) as Record
          this.recordList.push(newRecord)
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

    async fetchRecords(token: string): Promise<number | null> {
      try {
        const response = await recordService.getRecords(token)

        // push returned record to recordList
        if (response.status === 200) {
          const records = (await response.json()) as Record[]
          if (records !== null) this.recordList = records
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

    async deleteRecords(token: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      if (this.toDelete.length) {
        try {
          const response = await recordService.deleteRecords(
            this.toDelete,
            token
          )

          // fetch records if record deleted successfully
          if (response.status === 200) {
            const res = await response.json()

            // if all records deleted: remove deleted records in store
            if (res.deletedCount === this.toDelete.length)
              this.recordList = this.recordList.filter(
                (i) => !this.toDelete.includes(i._id)
              )
            // if not all records deleted, alert + fetch from server
            else {
              alert("Error: Some records were not deleted.")
              this.fetchRecords(token)
            }

            // fetch crates.
            this.loading = false
            return response.status

            // handle errors
          } else if (response.status === 401) {
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
      }
      return null
    },
  },
  getters: {
    // gets a record by id. returns null if not found
    getById: (state) => {
      return (id: string) =>
        state.recordList.find((record) => record._id === id) || null
    },
    getCatno: (state) => {
      return (id: string) =>
        state.recordList.find((record) => record._id === id)?.catno
    },
  },
})
