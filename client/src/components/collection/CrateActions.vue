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
    <table class="crate-details">
      <tr>
        <td>Record count</td>
        <td>{{ crate ? crate.records.length : records.recordList.length }}</td>
      </tr>
      <tr>
        <td>Track count</td>
        <td>
          {{ trackCount }}
        </td>
      </tr>
    </table>
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
import { computed } from "vue"
import XIcon from "@/components/icons/XIcon.vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import TrashIcon from "../icons/TrashIcon.vue"
import FolderPlusIcon from "../icons/FolderPlusIcon.vue"
import DuplicateIcon from "../icons/DuplicateIcon.vue"
import CrateSelect from "../inputs/CrateSelect.vue"
const crates = crateStore()
const records = recordStore()
const user = userStore()

const crate = computed(() => crates.getById(user.authd.settings.selectedCrate))

const trackCount = computed(() => {
  let count = 0
  crate.value
    ? crate.value?.records.forEach(
        (i) => (count += records.getById(i).tracks.length)
      )
    : records.recordList.forEach((i) => (count += i.tracks.length))
  return count
})
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

table.crate-details {
  margin-top: 20px;
  width: 100%;
  gap: 10px;
  border-collapse: collapse;
  tr {
    border: none;
  }
  td {
    padding: 0;
    height: 38px;
    line-height: 38px;
    border: none;
  }
  td:first-child {
    color: var(--darker-text);
    width: 30px;
    svg {
      vertical-align: middle;
      height: 30px;
      width: 30px;
    }
  }
  td:nth-child(2) {
    padding: 0 16px;
    width: auto;
  }
  td:last-child {
    width: 100px;
  }
}
</style>
