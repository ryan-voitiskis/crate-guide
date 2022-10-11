<template>
  <div class="modal-header">
    <h2>Select folder</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="form-hint">Select the folder to import from Discogs.</span>
    <div v-if="state.foldersFetched" class="modal-body inline-labels">
      <label for="folder_select">Select folder </label>
      <select v-model="form.folder" id="folder_select">
        <option value="">---</option>
        <option
          v-for="folder in discogs.folderList"
          :key="folder.id"
          :value="folder.id"
        >
          {{ folder.name }} ({{ folder.count }})
        </option>
      </select>
      <ErrorFeedback :show="state.noneSelected" msg="No folder selected" />
      <ErrorFeedback :show="discogs.errorMsg !== ''" :msg="discogs.errorMsg" />
    </div>
    <LoaderCentered v-else class="modal-body" />
    <div class="modal-footer">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 16rem">
        {{ discogs.loading ? null : "Import" }}
        <LoaderIcon v-show="discogs.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch } from "vue"
import ErrorFeedback from "./feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import XIcon from "@/components/svg/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import { discogsStore } from "@/stores/discogsStore"
import LoaderCentered from "../LoaderCentered.vue"
const user = userStore()
const records = recordStore()
const discogs = discogsStore()

const state = reactive({
  noneSelected: false, // only true after a submit attempt
  foldersFetched: false,
})

const form = reactive({
  folder: "",
})

const submit = async () => {
  if (form.folder) {
    if (records.toCrate.length) {
      const response = await discogs.getFolder(form.folder, user.authd.token)
      if (response === 200) discogs.stageImport = true
    }
  } else state.noneSelected = true
}

// when folder selected, remove "no crate selected" message
watch(
  () => form.folder !== "",
  () => (state.noneSelected = false)
)

// when no crate selected, clear existing error msg for "no crate selected"
watch(
  () => state.noneSelected,
  () => (discogs.errorMsg = "")
)

onMounted(async () => {
  const response = await discogs.getFolders(user.authd.token)
  if (response === 200) state.foldersFetched = true
})
</script>

<style scoped lang="scss"></style>
