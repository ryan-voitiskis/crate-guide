import { defineStore } from "pinia"
import { fetchEventSource } from "@microsoft/fetch-event-source"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import DiscogsFolder from "@/interfaces/DiscogsFolder"
import DiscogsReleaseBasic from "@/interfaces/DiscogsReleaseBasic"
import discogsService from "@/services/discogsService"
import globals from "@/globals"

export const discogsStore = defineStore("discogs", {
  state: () => ({
    folderList: [] as DiscogsFolder[],
    toImport: [] as DiscogsReleaseBasic[],
    unstagedImports: [] as number[],
    errorMsg: "",
    foldersErrorMsg: "",
    importProgress: 0,
    loading: false,
    loadingFolders: false,
    stageImport: false,
    revokeDiscogsForm: false, // displays RevokeDiscogsForm.vue
    selectDiscogsFolder: false, // displays SelectDiscogsFolder.vue
    importProgressModal: false, // displays DiscogsImportProgress.vue
    nothingStaged: false,
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
    async revokeAuthorisation(): Promise<number | null> {
      const user = userStore()
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.revokeAuthorisation(
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

    async getFolders() {
      this.unstagedImports = []
      this.toImport = []
      this.loadingFolders = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await discogsService.getFolders(user.authd.token)

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

    async getFolder(folder: string) {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await discogsService.getFolder(
          folder,
          user.authd.token
        )

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

    async importStaged() {
      this.stageImport = false
      this.importProgressModal = true
      this.loading = false
      this.errorMsg = ""
      const user = userStore()
      const stagedRecords = this.toImport.filter(
        (i) => !this.unstagedImports.includes(i.id)
      )
      const formattedRecords = stagedRecords.map((i) => i.id)
      const body = new URLSearchParams()
      body.append("records", JSON.stringify(formattedRecords))
      const records = recordStore()

      const setProgress = (progress: number) => (this.importProgress = progress)

      const handleError = (msg: string) =>
        (this.errorMsg = msg ? msg.replace("Error: ", "") : "Unexpected error")

      const handleCompletion = async () => {
        this.loading = true
        await records.fetchRecords()
        this.importProgressModal = false
        this.importProgress = 0
        this.loading = false
      }

      if (formattedRecords.length) {
        try {
          await fetchEventSource(
            globals.API_DISCOGS_SSE_URL + "import_records",
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Bearer ${user.authd.token}`,
              },
              body: body,
              onmessage(msg) {
                if (msg.data.includes("Error")) handleError(msg.data)
                const progress = parseFloat(msg.data)
                setProgress(progress)
                if (progress === 1) handleCompletion()
              },
              onerror(err) {
                console.error(err)
                handleError(err)
              },
            }
          )

          // catch error, eg. NetworkError. console.error(error) to debug
        } catch (error) {
          console.error(error)
        }
      } else {
        this.importProgressModal = false
        this.nothingStaged = true
      }
    },
  },
  getters: {},
})
