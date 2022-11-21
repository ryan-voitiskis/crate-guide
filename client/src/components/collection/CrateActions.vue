<template>
  <div class="modal-header">
    <h2>Crate actions</h2>
    <button class="close" type="button" @click="crates.actionsModal = false">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <CrateSelect
      selectID="select_track_crate_select"
      label="Crate"
      width="100%"
    />
    <hr />
    <div class="options">
      <button
        class="icon-button"
        @click="
          ;(crates.actionsModal = false), (crates.duplicateCrateModal = true)
        "
        v-if="user.authd.settings.selectedCrate !== 'all'"
      >
        <DuplicateIcon /> Duplicate
      </button>
      <button
        class="icon-button"
        @click="
          ;(crates.actionsModal = false), (crates.deleteCrateModal = true)
        "
        v-if="user.authd.settings.selectedCrate !== 'all'"
      >
        <TrashIcon /> Delete
      </button>
      <button
        class="icon-button"
        @click=";(crates.actionsModal = false), (crates.addCrateModal = true)"
      >
        <FolderPlusIcon /> Add new
      </button>
    </div>
  </div>
  <div class="modal-footer">
    <button class="close" type="button" @click="crates.actionsModal = false">
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import XIcon from "@/components/icons/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import TrashIcon from "../icons/TrashIcon.vue"
import FolderPlusIcon from "../icons/FolderPlusIcon.vue"
import DuplicateIcon from "../icons/DuplicateIcon.vue"
import CrateSelect from "../inputs/CrateSelect.vue"
const user = userStore()
const crates = crateStore()
</script>

<style scoped lang="scss">
.options {
  button {
    width: 100%;
    margin-bottom: 10px;
  }
}
hr {
  margin: 20px 0;
}
</style>
