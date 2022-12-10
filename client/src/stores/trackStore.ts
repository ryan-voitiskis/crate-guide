import { defineStore } from "pinia"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import Record from "@/interfaces/Record"
import { Track, TrackPlus } from "@/interfaces/Track"
import trackService from "@/services/trackService"
import UnsavedTrack from "@/interfaces/UnsavedTrack"
import {
  getKeyStringShort,
  getCamelotString,
  getKeyColour,
} from "@/utils/keyFunctions"

export const trackStore = defineStore("track", {
  state: () => ({
    trackList: [] as TrackPlus[],
    crateTrackList: [] as TrackPlus[],
    loading: false,
    errorMsg: "",
    addTrackTo: "", // id of record to add track to
    toEdit: "", // id of track to be edited
    toDelete: "", // id of track to be deleted
    toShowFeatures: "", // id of track to show AudioFeatures modal for
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
        if (response.status === 201) {
          const updatedRecord = (await response.json()) as Record
          const existingRecord = recordStore().getById(record) as Record
          Object.assign(existingRecord, updatedRecord)
          this.generateTrackLists()
          this.loading = false
          this.addTrackTo = ""
          return response.status
        } else if (response.status === 400) {
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

    async updateTrack(track: Track): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await trackService.updateTrack(track, user.authd.token)
        if (response.status === 200) {
          const updatedRecord = (await response.json()) as Record
          const existingRecord = recordStore().getById(
            updatedRecord._id
          ) as Record
          Object.assign(existingRecord, updatedRecord)
          this.generateTrackLists()
          this.loading = false
          return response.status
        } else if (response.status === 400 || response.status === 401) {
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
          if (response.status === 200) {
            const updatedRecord = (await response.json()) as Record
            const existingRecord = recordStore().getById(
              updatedRecord._id
            ) as Record
            Object.assign(existingRecord, updatedRecord)
            this.generateTrackLists()
            this.toDelete = ""
            this.loading = false
            return response.status
          } else if (response.status === 400) {
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

    generateTrackLists(): void {
      this.trackList = recordStore().recordList.flatMap((i) =>
        [...i.tracks].map((j) => {
          const keyMode =
            typeof j.key === "number" && typeof j.mode === "number"
              ? { key: j.key, mode: j.mode }
              : j.audioFeatures && j.audioFeatures.key !== -1
              ? { key: j.audioFeatures.key, mode: j.audioFeatures.mode }
              : null
          return {
            ...j,
            recordID: i._id,
            cover: i.cover,
            label: i.label,
            year: i.year,
            catno: i.catno,
            bpmFinal: j.bpm
              ? j.bpm
              : j.audioFeatures?.tempo
              ? Math.round(j.audioFeatures.tempo)
              : undefined,
            artistsFinal: j.artists ? j.artists : i.artists ? i.artists : "",
            durationFinal: j.duration
              ? j.duration
              : j.audioFeatures
              ? j.audioFeatures.duration_ms
              : undefined,
            keyFinal: keyMode
              ? {
                  key: keyMode.key,
                  mode: keyMode.mode,
                  keyString: getKeyStringShort(keyMode.key, keyMode.mode),
                  camelotString: getCamelotString(keyMode.key, keyMode.mode),
                  colour: getKeyColour(keyMode.key, keyMode.mode),
                }
              : null,
            timeSignature:
              j.timeSignatureUpper && j.timeSignatureLower
                ? [j.timeSignatureUpper, j.timeSignatureLower]
                : j.audioFeatures
                ? [j.audioFeatures.time_signature, 4]
                : null,
          }
        })
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

    // * if performance needed on large collections, add, update, delete of records update track list like this
    // * probably significantly faster than generating whole list, however that assumption may be wrong, test if perf req'd
    // addToTrackList(record: Record): void {
    //   this.trackList = this.trackList.concat(
    //     record.tracks.map((j) => ({ ...j, recordID: record._id }))
    //   )
    // },
  },

  getters: {
    getTrackByIdFromTrackList: (state) => {
      return (_id: string): TrackPlus | null =>
        state.trackList.find((i) => i._id === _id) || null
    },
    // slight optimisation on getTrackByIdFromTrackList, may be significant for huge collections
    getTrackByIdFromCrateTrackList: (state) => {
      return (_id: string): TrackPlus | null =>
        state.crateTrackList.find((i) => i._id === _id) || null
    },
  },
})
