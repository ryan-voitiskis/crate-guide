import { defineStore } from "pinia"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import Record from "@/interfaces/Record"
import { Track, TrackOfRecord } from "@/interfaces/Track"
import trackService from "@/services/trackService"
import UnsavedTrack from "@/interfaces/UnsavedTrack"

export const trackStore = defineStore("track", {
  state: () => ({
    trackList: [] as TrackOfRecord[],
    crateTrackList: [] as TrackOfRecord[],
    deck1Track: "",
    deck2Track: "",
    loadTrackTo: -1, // deck number to load track to
    loading: false,
    errorMsg: "",
    addTrackTo: "", // id of record to add track to, also serves as flag for opening AddTrackForm
    toEdit: "", // id of track to be edited
    toDelete: "", // id of track to be deleted
  }),
  actions: {
    async addTrack(
      track: UnsavedTrack,
      record: string
    ): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await trackService.addTrack(
          track,
          record,
          user.authd.token
        )

        // overwrite exisiting record
        if (response.status === 201) {
          const records = recordStore()
          const updatedRecord = (await response.json()) as Record
          const existingRecord = records.getById(record) as Record
          Object.assign(existingRecord, updatedRecord)
          this.generateTrackLists()
          this.loading = false
          this.addTrackTo = ""
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

    async updateTrack(track: Track): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await trackService.updateTrack(track, user.authd.token)

        // update returned track in trackList
        if (response.status === 200) {
          const records = recordStore()
          const updatedRecord = (await response.json()) as Record
          const existingRecord = records.getById(updatedRecord._id) as Record
          Object.assign(existingRecord, updatedRecord)
          this.generateTrackLists()
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

    async deleteTrack(): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      if (this.toDelete.length) {
        try {
          const response = await trackService.deleteTrack(
            this.toDelete,
            user.authd.token
          )

          // handle track deleted successfully
          if (response.status === 200) {
            const recStore = recordStore()
            const updatedRecord = (await response.json()) as Record
            const existingRecord = recStore.getById(updatedRecord._id) as Record
            Object.assign(existingRecord, updatedRecord)
            this.generateTrackLists()
            this.toDelete = ""
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
      }
      this.loading = false
      return null
    },

    generateTrackLists(): void {
      this.trackList = recordStore().recordList.flatMap((i) =>
        [...i.tracks].map((j) => ({ ...j, recordID: i._id, cover: i.cover }))
      )
      this.generateCrateTrackList()
    },

    generateCrateTrackList(): void {
      const selectedCrate = userStore().authd.settings.selectedCrate
      if (selectedCrate !== "all") {
        const crate = crateStore().crateList.find(
          (i) => i._id === selectedCrate
        )
        this.crateTrackList = this.trackList.filter((i) =>
          crate!.records.includes(i.recordID)
        )
      } else this.crateTrackList = this.trackList
    },

    // todo: if performance needed on large collections, add, update, delete of records update track list like this
    // addToTrackList(record: Record): void {
    //   this.trackList = this.trackList.concat(
    //     record.tracks.map((j) => ({ ...j, recordID: record._id }))
    //   )
    // },
  },
})
