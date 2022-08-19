import { defineStore } from "pinia"
import Crate from "@/interfaces/Crate"
import crateService from "@/services/crateService"

interface State {
  crateList: Crate[]
}

export const crateStore = defineStore("crate", {
  state: (): State => ({
    crateList: [] as Crate[],
  }),
  actions: {
    async fetchCrates(token: string) {
      const crates = (await crateService.getCrates(token)) as Crate[]
      if (crates !== null) this.crateList = crates
      else console.error("crateService.fetchCrates() returned null")
    },
    async addCrate(crate: Crate, token: string) {
      const newCrate = (await crateService.addCrate(crate, token)) as Crate
      if (newCrate !== null) this.crateList.push(newCrate)
      else console.error("crateService.addCrate() returned null")
    },
    async deleteCrate(id: string, token: string) {
      const response = await crateService.deleteCrate(id, token)
      if (response !== null) this.fetchCrates(token) // if deleted, fetchCrates
      else console.error("crateService.deleteCrate() returned null")
    },
  },
  getters: {
    // returns null if not found
    getById: (state) => {
      return (id: string) =>
        state.crateList.find((crate) => crate._id === id) || null
    },
  },
})
