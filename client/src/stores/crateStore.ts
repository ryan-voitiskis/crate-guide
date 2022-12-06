import { defineStore } from "pinia"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import Crate from "@/interfaces/Crate"
import crateService from "@/services/crateService"
import UnsavedCrate from "@/interfaces/UnsavedCrate"

export const crateStore = defineStore("crate", {
  state: () => ({
    crateList: [] as Crate[],
    loading: false,
    errorMsg: "",
    addCrateModal: false, // displays AddCrateForm.vue
    actionsModal: false, // displays CrateActions.vue
    duplicateCrateModal: false, // displays DuplicateCrateForm.vue
    deleteCrateModal: false, // displays ConfirmDeleteCrate.vue
    feedbackMsg: "", // after update feedback msg
  }),
  actions: {
    async fetchCrates(): Promise<number | null> {
      try {
        const response = await crateService.getCrates(userStore().authd.token)
        if (response.status === 200) {
          const crates = (await response.json()) as Crate[]
          if (crates !== null) this.crateList = crates
          return response.status
        } else if (response.status === 400) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        return response.status
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async addCrate(crate: UnsavedCrate): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await crateService.addCrate(
          crate,
          userStore().authd.token
        )
        if (response.status === 201) {
          const newCrate = (await response.json()) as Crate
          this.crateList.push(newCrate)
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
    },

    async deleteCrate(_id: string): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await crateService.deleteCrate(
          _id,
          userStore().authd.token
        )
        if (response.status === 200) {
          this.crateList = this.crateList.filter((i) => i._id !== _id)
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

    async pushToCrate(
      records: string[],
      crateID: string
    ): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const crate = this.getById(crateID)
        const clonedCrate = JSON.parse(JSON.stringify(crate))
        if (crate) {
          const intersection = crate.records.filter((i) => records.includes(i))
          const difference = records.filter((i) => !crate.records.includes(i))
          clonedCrate.records = clonedCrate.records.concat(difference)
          if (difference.length) {
            const response = await crateService.updateCrate(
              clonedCrate,
              userStore().authd.token
            )
            if (response.status === 200) {
              crate.records.push(...difference)
              this.pushToCrateFeedback(intersection, difference)
              recordStore().checkboxed = []
              trackStore().generateTrackLists()
              this.loading = false
              return response.status
            } else if (response.status === 400 || response.status === 401) {
              const error = await response.json()
              this.errorMsg = error.message ? error.message : "Unexpected error"
            }
            this.loading = false
            return response.status
          } else if (intersection.length) {
            this.feedbackMsg =
              records.length > 1
                ? `All Records were already in crate.`
                : `Record was already in crate.`
          }
          this.loading = false
          return 1 // returns 1 if all records already in crate
        } else {
          this.errorMsg = "No crate with that ID."
          this.loading = false
          return null
        }
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async removeFromCrate(
      records: string[],
      crateID: string
    ): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const crate = this.getById(crateID) as Crate
        if (crate) {
          const clonedCrate = JSON.parse(JSON.stringify(this.getById(crateID)))
          const remainingRecords = crate.records.filter(
            (i) => !records.includes(i)
          )
          clonedCrate.records = remainingRecords
          const response = await crateService.updateCrate(
            clonedCrate,
            userStore().authd.token
          )
          if (response.status === 200) {
            crate.records = remainingRecords
            recordStore().checkboxed = []
            trackStore().generateTrackLists()
          } else if (response.status === 400 || response.status === 401) {
            const error = await response.json()
            this.errorMsg = error.message ? error.message : "Unexpected error"
          }
          this.loading = false
          return response.status
        } else {
          this.errorMsg = "No crate with that ID."
          this.loading = false
          return null
        }
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    pushToCrateFeedback(intersection: string[], difference: string[]) {
      if (intersection.length) {
        const difText =
          difference.length < 12
            ? difference.map((i) => this.getRecordName(i)).join(", ")
            : `${difference.length} records`
        const intersectionText =
          intersection.length < 12
            ? intersection.map((i) => this.getRecordName(i)).join(", ")
            : `${intersection.length} records`
        const intersectionJoinText = intersection.length > 1 ? `were` : `was`
        this.feedbackMsg = `${difText} succesfully added.</br>
          ${intersectionText} ${intersectionJoinText} already in crate.`
      }
    },

    // this is done by deleteRecords() in recordController on the server
    removeDeletedFromCrates(records: string[]) {
      this.crateList.forEach((crate) => {
        crate.records = crate.records.filter((i) => !records.includes(i))
      })
    },
  },
  getters: {
    getById: (state) => {
      return (_id: string): Crate | null =>
        state.crateList.find((crate) => crate._id === _id) || null
    },
    getRecordIDsByCrate: (state) => {
      return (_id: string): string[] =>
        state.crateList.find((crate) => crate._id === _id)?.records ||
        ([] as string[])
    },
    getRecordName() {
      const records = recordStore()
      return records.getNameById
    },
  },
})
