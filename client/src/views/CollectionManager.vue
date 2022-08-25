<template>
  <p v-if="!user.hasUser()">Sign in to create collections.</p>
  <div id="crate_controls" v-if="user.hasUser()">
    <CrateSelect selectID="crate_select" />
    <button
      class="icon-button"
      @click="state.duplicateCrate = true"
      v-if="user.authd.settings.selectedCrate !== 'all'"
    >
      <DuplicateIcon /> Duplicate
    </button>

    <button
      class="icon-button"
      @click="state.deleteCrate = true"
      v-if="user.authd.settings.selectedCrate !== 'all'"
    >
      <TrashIcon /> Delete
    </button>

    <button class="icon-button" @click="state.addCrate = true">
      <FolderAddIcon /> Add new
    </button>
  </div>

  <div id="crate_manager" v-if="user.hasUser()">
    <button class="icon-button" @click="state.addRecord = true">
      <PlusCircleIcon /> Add record
    </button>
  </div>

  <RecordsList v-if="user.hasUser()" />

  <FormModal
    v-if="state.addCrate"
    @close="state.addCrate = false"
    title="Add new crate"
    modal-width="440px"
  >
    <AddCrateForm @close="state.addCrate = false" />
  </FormModal>

  <FormModal
    v-if="state.deleteCrate"
    @close="state.deleteCrate = false"
    title="Delete crate"
    modal-width="440px"
  >
    <DeleteCrateForm @close="state.deleteCrate = false" />
  </FormModal>

  <FormModal
    v-if="state.duplicateCrate"
    @close="state.duplicateCrate = false"
    title="Duplicate crate"
    modal-width="440px"
  >
    <DuplicateCrateForm
      @close="state.duplicateCrate = false"
      :crate="user.authd.settings.selectedCrate"
    />
  </FormModal>

  <FormModal
    v-if="state.addRecord"
    @close="state.addRecord = false"
    title="Add record"
    modal-width="440px"
  >
    <AddRecordForm @close="state.addRecord = false" />
  </FormModal>

  <FormModal
    v-if="state.deleteRecord"
    @close="state.deleteRecord = false"
    title="Delete record"
    modal-width="440px"
  >
    <DeleteRecordForm @close="state.deleteRecord = false" />
  </FormModal>

  <FormModal
    v-if="state.selectCrate"
    @close="state.selectCrate = false"
    title="Select crate"
    modal-width="440px"
  >
    <SelectCrateForm @close="state.selectCrate = false" />
  </FormModal>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue"
import AddCrateForm from "@/components/forms/AddCrateForm.vue"
import DeleteCrateForm from "@/components/forms/DeleteCrateForm.vue"
import DeleteRecordForm from "@/components/forms/DeleteRecordForm.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import RecordsList from "@/components/RecordsList.vue"
import FormModal from "@/components/forms/FormModal.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import DuplicateIcon from "@/components/svg/DuplicateIcon.vue"
import TrashIcon from "@/components/svg/TrashIcon.vue"
import FolderAddIcon from "@/components/svg/FolderAddIcon.vue"
import PlusCircleIcon from "@/components/svg/PlusCircleIcon.vue"
import CrateSelect from "@/components/forms/CrateSelect.vue"
import SelectCrateForm from "@/components/forms/SelectCrateForm.vue"
const user = userStore()
const records = recordStore()

const state = reactive({
  addCrate: false,
  duplicateCrate: false,
  deleteCrate: false,
  addRecord: false,
  deleteRecord: false,
  selectCrate: false,
})

// when selectedCrate changes, update db
watch(
  () => user.authd.settings.selectedCrate,
  () => {
    if (user.hasUser()) user.updateSettings() // hasUser() check to avoid call on logout
  }
)

// open DeleteRecordForm when records.toDelete has id(s)
watch(
  () => records.toDelete.length,
  () => {
    if (records.toDelete.length) state.deleteRecord = true
  }
)

// open SelectCrateForm when records.toCrate has id(s)
watch(
  () => records.toCrate.length,
  () => {
    if (records.toCrate.length) state.selectCrate = true
  }
)
</script>

<style scoped lang="scss">
#crate_controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}
#crate_manager {
  margin-bottom: 1rem;
}
</style>
