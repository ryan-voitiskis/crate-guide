import { defineStore } from "pinia"
import { crateStore } from "@/stores/crateStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import Record from "@/interfaces/Record"
import recordService from "@/services/recordService"
import { Track } from "@/interfaces/Track"
import UnsavedRecord from "@/interfaces/UnsavedRecord"

export const recordStore = defineStore("record", {
  state: () => ({
    recordList: [] as Record[],
    loading: false,
    errorMsg: "",
    feedbackMsg: "", // after update feedback msg
    checkAll: false, // watch from RecordSingle to select all record checkboxes
    addRecordModal: false, // add record modal
    toEdit: "", // id of record to be edited
    checkboxed: [] as string[], // record id(s) of records with checked checkboxes
    toDelete: [] as string[], // record id(s) to be deleted
    toCrate: [] as string[], // record id(s) to be added to the to be selected crate
    fromCrate: [] as string[], // record id(s) to be removed from to be selected crate
  }),
  actions: {
    async fetchRecords(): Promise<number | null> {
      const user = userStore()
      try {
        const response = await recordService.getRecords(user.authd.token)

        // push returned record to recordList
        if (response.status === 200) {
          const records = (await response.json()) as Record[]
          if (records !== null) this.recordList = records
          trackStore().generateTrackLists()

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

    async addRecord(record: UnsavedRecord): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await recordService.addRecord(record, user.authd.token)

        // push returned record to recordList
        if (response.status === 201) {
          const newRecord = (await response.json()) as Record
          this.recordList.push(newRecord)
          trackStore().generateTrackLists()
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

    async updateRecord(record: Record): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await recordService.updateRecord(
          record,
          user.authd.token
        )

        // update returned record in recordList
        if (response.status === 200) {
          const updatedRecord = (await response.json()) as Record
          const existingRecord = this.getById(record._id) as Record
          Object.assign(existingRecord, updatedRecord)
          trackStore().generateTrackLists()
          this.loading = false
          this.toEdit = ""
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

    async deleteRecords(): Promise<number | null> {
      const crates = crateStore()
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      if (this.toDelete.length) {
        try {
          const response = await recordService.deleteRecords(
            this.toDelete,
            user.authd.token
          )

          // handle records deleted successfully
          if (response.status === 200) {
            const res = await response.json()

            // if all records deleted successfully on server
            if (res.deletedCount === this.toDelete.length) {
              // remove deleted records from crates
              crates.removeFromCrates(this.toDelete)
              // remove deleted records in store
              this.recordList = this.recordList.filter(
                (i) => !this.toDelete.includes(i._id)
              )
            }

            // if not all records deleted, feedbackMsg + fetch records and crates from server
            else {
              this.feedbackMsg = "<b>Error</b>: Some records were not deleted."
              this.fetchRecords()
              crates.fetchCrates()
            }
            this.toDelete = []
            trackStore().generateTrackLists()
            this.loading = false
            return response.status

            // handle errors
          } else if (response.status === 401) {
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
      }
      this.loading = false
      return null
    },
  },

  getters: {
    // gets a record by id. returns null if not found
    getById: (state) => {
      return (_id: string): Record =>
        (state.recordList.find((record) => record._id === _id) as Record) ||
        null
    },
    // returns record catno, if no catno returns title
    getNameById: (state) => {
      return (_id: string): string => {
        const record =
          (state.recordList.find((record) => record._id === _id) as Record) ||
          null
        if (record) return record.catno ? record.catno : record.title
        else return ""
      }
    },
    // returns record catno, if no catno returns title. if no record returns ""
    getRecordNameByTrackId: (state) => {
      return (_id: string): string => {
        const record =
          (state.recordList.find((record) =>
            record.tracks.find((track) => track._id === _id)
          ) as Record) || null
        if (record) return record.catno ? record.catno : record.title
        else return ""
      }
    },
    // gets a record that contains track with id. returns null if not found
    getRecordByTrackId: (state) => {
      return (_id: string): Record =>
        (state.recordList.find((record) =>
          record.tracks.find((track) => track._id === _id)
        ) as Record) || null
    },
    // gets a track by id. returns null if not found
    getTrackById: (state) => {
      return (_id: string): Track =>
        state.recordList.reduce<any>((prev: Record, curr: Record) => {
          return prev || curr.tracks.find((track) => track._id === _id)
        }, undefined) || null
    },
  },
})
