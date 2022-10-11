import { defineStore } from "pinia"
import DiscogsFolder from "@/interfaces/DiscogsFolder"
import discogsService from "@/services/discogsService"

export const discogsStore = defineStore("discogs", {
  state: () => ({
    folderList: [] as DiscogsFolder[],
    toImport: [],
    errorMsg: "",
    loading: false,
    stageImport: false,
  }),
  actions: {
    async getFolders(token: string) {
      try {
        const response = await discogsService.getFolders(token)

        // push returned crate to crateList
        if (response.status === 200) {
          const folders = (await response.json()) as DiscogsFolder[]
          if (folders !== null) this.folderList = folders
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
    async getFolder(folder: string, token: string) {
      return true
      try {
        const response = await discogsService.getFolder(folder, token)

        // push returned crate to crateList
        if (response.status === 200) {
          const folders = (await response.json()) as DiscogsFolder[]
          if (folders !== null) this.folderList = folders
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
  },
  getters: {},
})
