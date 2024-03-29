import { defineStore } from "pinia"
import { crateStore } from "@/stores/crateStore"
import { Track } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import demoRecords from "@/data/demo-records"
import Record from "@/interfaces/Record"
import recordService from "@/services/recordService"
import UnsavedRecord from "@/interfaces/UnsavedRecord"

export const recordStore = defineStore("record", {
  state: () => ({
    recordList: demoRecords as Record[],
    loading: false,
    errorMsg: "",
    feedbackMsg: "", // after update feedback msg
    checkAll: false, // watch from RecordSingle to select all record checkboxes
    addRecordModal: false, // displays AddRecordForm.vue
    toEdit: "", // id of record to be edited
    checkboxed: [] as string[], // record id(s) of records with checked checkboxes
    toDelete: [] as string[], // record id(s) to be deleted
    toCrate: [] as string[], // record id(s) to be added to the to be selected crate
    fromCrate: [] as string[], // record id(s) to be removed from to be selected crate
  }),
  actions: {
    async fetchRecords(): Promise<number | null> {
      try {
        const response = await recordService.getRecords(userStore().authd.token)
        if (response.status === 200) {
          const records = (await response.json()) as Record[]
          if (records) this.recordList = records
          trackStore().generateTrackLists()
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        return response.status
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async addRecord(record: UnsavedRecord): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await recordService.addRecord(
          record,
          userStore().authd.token
        )
        if (response.status === 201) {
          const newRecord = (await response.json()) as Record
          this.recordList.push(newRecord)
          this.addRecordModal = false
          trackStore().generateTrackLists()
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async updateRecord(record: Record): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await recordService.updateRecord(
          record,
          userStore().authd.token
        )
        if (response.status === 200) {
          const updatedRecord = (await response.json()) as Record
          const existingRecord = this.getById(record._id) as Record
          Object.assign(existingRecord, updatedRecord)
          trackStore().generateTrackLists()
          this.toEdit = ""
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
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
      if (this.toDelete.length) {
        try {
          const response = await recordService.deleteRecords(
            this.toDelete,
            userStore().authd.token
          )
          if (response.status === 200) {
            const res = await response.json()
            if (res.deletedCount === this.toDelete.length) {
              crates.removeDeletedFromCrates(this.toDelete)
              this.recordList = this.recordList.filter(
                (i) => !this.toDelete.includes(i._id)
              )
            } else {
              this.feedbackMsg = "<b>Error</b>: Some records were not deleted."
              this.fetchRecords()
              crates.fetchCrates()
            }
            this.toDelete = []
            recordStore().checkboxed = []
            trackStore().generateTrackLists()
          } else if (response.status === 401) {
            const error = await response.json()
            this.errorMsg = error.message ? error.message : "Unexpected error"
          }
          this.loading = false
          return response.status
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

    getRecordByTrackId: (state) => {
      return (_id: string): Record =>
        (state.recordList.find((record) =>
          record.tracks.find((track) => track._id === _id)
        ) as Record) || null
    },

    getTrackById: (state) => {
      return (_id: string): Track =>
        state.recordList.reduce<any>((prev: Record, curr: Record) => {
          return prev || curr.tracks.find((track) => track._id === _id)
        }, undefined) || null
    },
  },
})
