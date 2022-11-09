<template>
  <div class="modal-header">
    <h2>Select folder</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="hint">Select the folder to import from Discogs.</span>
    <div v-if="discogs.folderList.length" class="modal-body inline-labels">
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
    </div>
    <LoaderCentered v-show="discogs.loadingFolders" class="modal-body" />
    <ErrorFeedback
      class="modal-body"
      :show="discogs.errorMsg !== ''"
      :msg="discogs.errorMsg"
    />
    <div class="modal-footer">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button
        class="primary"
        type="submit"
        :disabled="discogs.folderList.length === 0"
      >
        {{ discogs.loading ? null : "Stage import" }}
        <LoaderIcon v-show="discogs.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onMounted, onUnmounted, watch } from "vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import { discogsStore } from "@/stores/discogsStore"
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
const discogs = discogsStore()

const form = reactive({
  folder: "",
})

const submit = async () => {
  if (form.folder !== "") {
    const response = await discogs.getFolder(form.folder)
    if (response === 200) {
      discogs.selectDiscogsFolder = false
      discogs.stageImport = true
    }
  } else discogs.errorMsg = "No folder selected"
}

// when folder selected, remove "No folder selected" message
watch(
  () => form.folder !== "",
  () => (discogs.errorMsg = "")
)

onMounted(async () => await discogs.getFolders())

onUnmounted(() => (discogs.errorMsg = ""))
</script>

<style scoped lang="scss"></style>
