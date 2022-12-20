<template>
  <div class="modal-header">
    <h2>Select folder</h2>
    <button
      class="close"
      type="button"
      @click="discogs.selectDiscogsFolderModal = false"
    >
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="hint">Select the folder to import from Discogs.</span>
    <div v-if="discogs.folderList.length" class="modal-body inline-labels">
      <SelectInput
        id="select_folder"
        v-model="form.folder"
        label="Select folder"
        :options="folders"
      />
    </div>
    <LoaderCentered v-show="discogs.loadingFolders" class="modal-body" />
    <ErrorFeedback
      class="modal-body"
      :show="discogs.errorMsg !== ''"
      :msg="discogs.errorMsg"
    />
    <div class="modal-footer">
      <button
        class="close"
        type="button"
        @click="discogs.selectDiscogsFolderModal = false"
      >
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
import { reactive, onMounted, onUnmounted, watch, computed } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import Option from "@/interfaces/SelectOption"
import SelectInput from "../inputs/SelectInput.vue"
import XIcon from "@/components/icons/XIcon.vue"
const discogs = discogsStore()

const form = reactive({
  folder: "",
})

const folders = computed((): Option[] =>
  discogs.folderList.map((i) => ({
    id: i.id.toString(),
    name: `${i.name} (${i.count})`,
  }))
)

function submit() {
  if (form.folder !== "") {
    discogs.getFolder(form.folder)
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
