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
  <hr />
  <div id="crate_manager" v-if="user.hasUser()">
    <button class="icon-button" @click="state.addRecord = true">
      <PlusCircleIcon /> Add new record
    </button>
    <button
      class="icon-button"
      @click="records.toCrate = records.checkboxed"
      v-if="records.checkboxed.length"
    >
      <FolderDownIcon />Add selected to
      {{ user.authd.settings.selectedCrate !== "all" ? "another " : "" }}crate
    </button>
    <button
      class="icon-button"
      @click="records.fromCrate = records.checkboxed"
      v-if="
        user.authd.settings.selectedCrate !== 'all' && records.checkboxed.length
      "
    >
      <FolderMinusIcon />Remove selected from crate
    </button>
    <button
      class="icon-button"
      @click="records.toDelete = records.checkboxed"
      v-if="records.checkboxed.length"
    >
      <TrashIcon />Delete Selected
    </button>
  </div>

  <RecordsList v-if="user.hasUser()" />

  <ModalContainer
    v-if="state.addCrate"
    @close="state.addCrate = false"
    title="Add new crate"
    modal-width="440px"
  >
    <AddCrateForm @close="state.addCrate = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.deleteCrate"
    @close="state.deleteCrate = false"
    title="Delete crate"
    modal-width="440px"
  >
    <DeleteCrateForm @close="state.deleteCrate = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.duplicateCrate"
    @close="state.duplicateCrate = false"
    title="Duplicate crate"
    modal-width="440px"
  >
    <DuplicateCrateForm
      @close="state.duplicateCrate = false"
      :crate="user.authd.settings.selectedCrate"
    />
  </ModalContainer>

  <ModalContainer
    v-if="state.addRecord"
    @close="state.addRecord = false"
    title="Add record"
    modal-width="440px"
  >
    <AddRecordForm @close="state.addRecord = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.deleteRecord"
    @close="state.deleteRecord = false"
    title="Delete record"
    modal-width="440px"
  >
    <DeleteRecordForm @close="state.deleteRecord = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.selectCrate"
    @close="state.selectCrate = false"
    title="Select crate"
    modal-width="440px"
  >
    <SelectCrateForm @close="state.selectCrate = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.removeRecord"
    @close="state.removeRecord = false"
    title="Remove from crate"
    modal-width="440px"
  >
    <RemoveRecordForm @close="state.removeRecord = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.feedbackMsg !== ''"
    @close="state.feedbackMsg = ''"
    modal-width="440px"
  >
    <UpdateFeedback :text="state.feedbackMsg" @close="state.feedbackMsg = ''" />
  </ModalContainer>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue"
import AddCrateForm from "@/components/forms/AddCrateForm.vue"
import DeleteCrateForm from "@/components/forms/DeleteCrateForm.vue"
import DeleteRecordForm from "@/components/forms/DeleteRecordForm.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import RecordsList from "@/components/RecordsList.vue"
import ModalContainer from "@/components/ModalContainer.vue"
import DuplicateIcon from "@/components/svg/DuplicateIcon.vue"
import TrashIcon from "@/components/svg/TrashIcon.vue"
import FolderAddIcon from "@/components/svg/FolderAddIcon.vue"
import PlusCircleIcon from "@/components/svg/PlusCircleIcon.vue"
import CrateSelect from "@/components/forms/inputs/CrateSelect.vue"
import SelectCrateForm from "@/components/forms/SelectCrateForm.vue"
import FolderDownIcon from "@/components/svg/FolderDownIcon.vue"
import FolderMinusIcon from "@/components/svg/FolderMinusIcon.vue"
import RemoveRecordForm from "@/components/forms/RemoveRecordForm.vue"
import UpdateFeedback from "@/components/forms/feedbacks/UpdateFeedback.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const records = recordStore()
const crates = crateStore()

const state = reactive({
  addCrate: false, // shows AddCrateForm
  duplicateCrate: false, // shows DuplicateCrateForm
  deleteCrate: false, // shows DeleteCrateForm
  addRecord: false, // shows AddRecordForm
  deleteRecord: false, // shows DeleteRecordForm
  selectCrate: false, // shows SelectCrateForm
  removeRecord: false, // shows RemoveRecordForm (from crate, not deleted)
  feedbackMsg: "", // text for the special use update feedback modal
})

// when selectedCrate changes, update db + clear checkboxed
watch(
  () => user.authd.settings.selectedCrate,
  () => {
    if (user.hasUser()) user.updateSettings() // hasUser() check to avoid call on logout
    records.checkboxed = []
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

// open RemoveRecordForm when records.fromCrate has id(s)
watch(
  () => records.fromCrate.length,
  () => {
    if (records.fromCrate.length) state.removeRecord = true
  }
)

// open UpdateFeedback when records.feedbackMsg
watch(
  () => records.feedbackMsg && crates.feedbackMsg,
  () => {
    if (records.feedbackMsg !== "") state.feedbackMsg = records.feedbackMsg
  }
)

// open UpdateFeedback when crates.feedbackMsg
watch(
  () => crates.feedbackMsg,
  () => {
    if (crates.feedbackMsg !== "") state.feedbackMsg = crates.feedbackMsg
  }
)
</script>

<style scoped lang="scss">
#crate_controls,
#crate_manager {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}
</style>
