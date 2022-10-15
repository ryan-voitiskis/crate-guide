import { defineStore } from "pinia"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import DiscogsFolder from "@/interfaces/DiscogsFolder"
import DiscogsReleaseBasic from "@/interfaces/DiscogsReleaseBasic"
import discogsService from "@/services/discogsService"
import Record from "@/interfaces/Record"

export const discogsStore = defineStore("discogs", {
  state: () => ({
    folderList: [] as DiscogsFolder[],
    toImport: [] as DiscogsReleaseBasic[],
    unstagedImports: [] as number[],
    errorMsg: "",
    foldersErrorMsg: "",
    loading: false,
    loadingFolders: false,
    stageImport: false,
    revokeDiscogsForm: false, // displays RevokeDiscogsForm.vue
    selectDiscogsFolder: false, // displays SelectDiscogsFolder.vue
  }),
  actions: {
    // call and handle request that begins discogs OAuth flow
    async discogsRequestToken(): Promise<number | null> {
      const user = userStore()
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.requestToken(user.authd.token)
        // handle successful update
        if (response.status === 200) {
          const res = await response.json()
          window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${res}`
        }
        // handle 400 status code. see discogsController.ts
        else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
          this.loading = false // not for 200 res as redirect takes time
        }
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    // call and handle response to request that removes discogsToken, discogsTokenSecret,
    // discogsRequestToken and discogsRequestTokenSecret from user.
    async revokeDiscogsAuthorisation(): Promise<number | null> {
      const user = userStore()
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.revokeDiscogsAuthorisation(
          user.authd.token
        )
        // handle successful update
        if (response.status === 200) {
          user.authd.isDiscogsOAuthd = false
          user.authd.discogsUsername = ""
          this.revokeDiscogsForm = false
        }
        // handle 400 and 401 status codes. see userController.ts
        else {
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

    async getFolders(token: string) {
      this.loadingFolders = true
      this.errorMsg = ""
      try {
        const response = await discogsService.getFolders(token)

        // push returned crate to crateList
        if (response.status === 200) {
          const folders = (await response.json()) as DiscogsFolder[]
          if (folders !== null) this.folderList = folders

          // handle errors
        } else if (response.status === 400) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loadingFolders = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async getFolder(folder: string, token: string) {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.getFolder(folder, token)

        // push returned crate to crateList
        if (response.status === 200) {
          const folder = (await response.json()) as DiscogsReleaseBasic[]
          if (folder !== null) this.toImport = folder

          // handle errors
        } else if (response.status === 400) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async importStaged(token: string) {
      this.loading = true
      this.errorMsg = ""
      const stagedRecords = this.toImport.filter(
        (i) => !this.unstagedImports.includes(i.id)
      )
      const formattedRecords = stagedRecords.map((i) => i.id)

      try {
        const response = await discogsService.importRecords(
          formattedRecords,
          token
        )

        // push returned crate to crateList
        if (response.status === 201) {
          const records = recordStore()
          const retrievedRecords = (await response.json()) as Record[]
          if (retrievedRecords !== null) {
            retrievedRecords.forEach((record) =>
              records.recordList.push(record)
            )
          }

          // handle errors
        } else if (response.status === 400) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
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
