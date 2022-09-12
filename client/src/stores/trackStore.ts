import { defineStore } from "pinia"
import Track from "@/interfaces/Track"
import Record from "@/interfaces/Record"
import UnsavedTrack from "@/interfaces/UnsavedTrack"
import trackService from "@/services/trackService"
import { recordStore } from "@/stores/recordStore"

export const trackStore = defineStore("track", {
  state: () => ({
    loading: false,
    errorMsg: "",
    addTrackTo: "", // id of record to add track to, also serves as flag for opening AddTrackForm
    toEdit: "", // id of track to be edited
    toDelete: "", // id of track to be deleted
  }),
  actions: {
    async addTrack(
      track: UnsavedTrack,
      record: string,
      token: string
    ): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await trackService.addTrack(track, record, token)

        // overwrite exisiting record
        if (response.status === 201) {
          const recStore = recordStore()
          const updatedRecord = (await response.json()) as Record
          const existingRecord = recStore.getById(record) as Record
          Object.assign(existingRecord, updatedRecord)
          this.loading = false
          this.addTrackTo = ""
          return response.status

          // handle errors
        } else if (response.status === 400) {
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error"
        console.error(error)
        this.loading = false
        return null
      }
    },

    async updateTrack(track: Track, token: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await trackService.updateTrack(track, token)

        // update returned track in trackList
        if (response.status === 200) {
          const recStore = recordStore()
          const updatedRecord = (await response.json()) as Record
          const existingRecord = recStore.getById(updatedRecord.id) as Record
          Object.assign(existingRecord, updatedRecord)
          this.loading = false
          this.toEdit = ""
          return response.status

          // handle errors
        } else if (response.status === 400 || response.status === 401) {
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error"
        console.error(error)
        this.loading = false
        return null
      }
    },

    async deleteTrack(token: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      if (this.toDelete.length) {
        try {
          const response = await trackService.deleteTrack(this.toDelete, token)

          // handle track deleted successfully
          if (response.status === 200) {
            const recStore = recordStore()
            const updatedRecord = (await response.json()) as Record
            const existingRecord = recStore.getById(updatedRecord.id) as Record
            Object.assign(existingRecord, updatedRecord)
            this.loading = false
            this.toDelete = ""
            return response.status

            // handle errors
          } else if (response.status === 400) {
            const error = await response.json()
            const msg = error.message ? error.message : "Unexpected error"
            this.errorMsg = msg
          }
          this.loading = false
          return response.status

          // catch error, eg. NetworkError
        } catch (error) {
          this.errorMsg = "Unexpected error"
          console.error(error)
          this.loading = false
          return null
        }
      }
      this.loading = false
      return null
    },
  },
})
