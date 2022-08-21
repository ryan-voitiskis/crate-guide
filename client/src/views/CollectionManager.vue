<template>
  <p v-if="!user.hasUser()">Sign in to create collections.</p>
  <div id="crate_controls" v-if="user.hasUser()">
    <label for="crate_select"
      >Select crate
      <select v-model="user.loggedIn.settings.selectedCrate" id="crate_select">
        <option value="all">Collection (all)</option>
        <option
          v-for="crate in crates.crateList"
          :key="crate._id"
          :value="crate._id"
        >
          {{ crate.name }}
        </option>
      </select>
    </label>

    <button
      class="icon-button"
      @click="state.duplicateCrate = true"
      v-if="user.loggedIn.settings.selectedCrate !== 'all'"
    >
      <DuplicateIcon /> Duplicate
    </button>

    <button
      class="icon-button"
      @click="state.deleteCrate = true"
      v-if="user.loggedIn.settings.selectedCrate !== 'all'"
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
      :crate="user.loggedIn.settings.selectedCrate"
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
</template>

<script setup lang="ts">
import { reactive, watch } from "vue"
import AddCrateForm from "@/components/forms/AddCrateForm.vue"
import DeleteCrateForm from "@/components/forms/DeleteCrateForm.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import RecordsList from "@/components/RecordsList.vue"
import FormModal from "@/components/forms/FormModal.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import DuplicateIcon from "@/components/svg/DuplicateIcon.vue"
import TrashIcon from "@/components/svg/TrashIcon.vue"
import FolderAddIcon from "@/components/svg/FolderAddIcon.vue"
import PlusCircleIcon from "@/components/svg/PlusCircleIcon.vue"
const user = userStore()
const crates = crateStore()

const state = reactive({
  addCrate: false,
  duplicateCrate: false,
  deleteCrate: false,
  addRecord: false,
})

// when selectedCrate changes, update db
watch(
  () => user.loggedIn.settings.selectedCrate,
  () => user.updateSettings()
)
</script>

<style scoped lang="scss">
#crate_controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
  select,
  label {
    margin-bottom: 0;
  }
}
</style>
