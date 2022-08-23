import { defineStore } from "pinia"
import Record from "@/interfaces/Record"
import recordService from "@/services/recordService"

export const recordStore = defineStore("record", {
  state: () => ({
    recordList: [] as Record[],
    loading: false,
    errorMsg: "",
    toDelete: "",
  }),
  actions: {
    async addRecord(record: Record, token: string): Promise<number | null> {
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

    async deleteRecord(token: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      if (this.toDelete) {
        try {
          const response = await recordService.deleteRecord(
            this.toDelete,
            token
          )

          // fetch records if record deleted successfully
          if (response.status === 200) {
            this.fetchRecords(token)
            this.loading = false
            this.toDelete = ""
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
  },
})
