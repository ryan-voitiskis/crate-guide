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
    authDiscogsModal: false, // displays AuthoriseDiscogs.vue
    stageImportModal: false, // displays StageDiscogsImport.vue
    revokeDiscogsModal: false, // displays RevokeDiscogsForm.vue
    selectDiscogsFolderModal: false, // displays SelectDiscogsFolder.vue
    importProgressModal: false, // displays DiscogsImportProgress.vue
    nothingStaged: false, // displays UpdateFeedback w msg
  }),
  actions: {
    async discogsRequestToken(): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.requestToken(
          userStore().authd.token
        )
        if (response.status === 200) {
          const token = await response.json()
          window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${token}`
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

    async revokeAuthorisation(): Promise<number | null> {
      const user = userStore()
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.revokeAuthorisation(
          user.authd.token
        )
        if (response.status === 200) {
          user.authd.isDiscogsOAuthd = false
          user.authd.discogsUsername = ""
          this.revokeDiscogsModal = false
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

    async getFolders() {
      this.unstagedImports = []
      this.toImport = []
      this.loadingFolders = true
      this.errorMsg = ""
      try {
        const response = await discogsService.getFolders(
          userStore().authd.token
        )
        if (response.status === 200) {
          const folders = (await response.json()) as DiscogsFolder[]
          if (folders) this.folderList = folders
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loadingFolders = false
        return response.status
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async getFolder(folder: string) {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.getFolder(
          folder,
          userStore().authd.token
        )
        if (response.status === 200) {
          const folder = (await response.json()) as DiscogsReleaseBasic[]
          if (folder) this.toImport = folder
          this.selectDiscogsFolderModal = false
          this.stageImportModal = true
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async importStaged() {
      this.stageImportModal = false
      this.importProgressModal = true
      this.loading = false
      this.errorMsg = ""
      const stagedRecords = this.toImport.filter(
        (i) => !this.unstagedImports.includes(i.id)
      )
      const formattedRecords = stagedRecords.map((i) => i.id)
      const body = new URLSearchParams()
      body.append("records", JSON.stringify(formattedRecords))
      const setProgress = (progress: number) => (this.importProgress = progress)
      const handleError = (msg: string) =>
        (this.errorMsg = msg ? msg.replace("Error: ", "") : "Unexpected error")
      const handleCompletion = async () => {
        this.loading = true
        await recordStore().fetchRecords()
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
                Authorization: `Bearer ${userStore().authd.token}`,
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
              openWhenHidden: true, //! request resent on tab activated if not specified
            }
          )
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
