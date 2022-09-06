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
      <FolderPlusIcon /> Add new
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
    title="Add crate"
  >
    <AddCrateForm @close="state.addCrate = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.deleteCrate"
    @close="state.deleteCrate = false"
    title="Delete crate"
  >
    <DeleteCrateForm @close="state.deleteCrate = false" />
  </ModalContainer>

  <ModalContainer
    v-if="state.duplicateCrate"
    @close="state.duplicateCrate = false"
    title="Duplicate crate"
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
  >
    <AddRecordForm @close="state.addRecord = false" />
  </ModalContainer>

  <ModalContainer
    v-if="records.toEdit !== ''"
    @close="records.toEdit = ''"
    title="Edit record"
  >
    <EditRecordForm />
  </ModalContainer>

  <ModalContainer
    v-if="records.toDelete.length"
    @close="records.toDelete = []"
    title="Delete record"
  >
    <DeleteRecordForm />
  </ModalContainer>

  <ModalContainer
    v-if="records.toCrate.length"
    @close="records.toCrate = []"
    title="Select crate"
  >
    <SelectCrateForm />
  </ModalContainer>

  <ModalContainer
    v-if="records.fromCrate.length"
    @close="records.fromCrate = []"
    title="Remove from crate"
  >
    <RemoveRecordForm />
  </ModalContainer>

  <ModalContainer
    v-if="records.addTrackTo !== ''"
    @close="records.addTrackTo = ''"
    title="Add track"
  >
    <AddTrackForm />
  </ModalContainer>

  <ModalContainer
    v-if="state.editTrack"
    @close="state.editTrack = false"
    title="Edit track"
  >
    <EditTrackForm @close="state.editTrack = false" />
  </ModalContainer>

  <ModalContainer
    v-if="records.feedbackMsg !== ''"
    @close="records.feedbackMsg = ''"
  >
    <UpdateFeedback :text="records.feedbackMsg" />
  </ModalContainer>

  <ModalContainer
    v-if="crates.feedbackMsg !== ''"
    @close="crates.feedbackMsg = ''"
  >
    <UpdateFeedback :text="crates.feedbackMsg" />
  </ModalContainer>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue"
import AddCrateForm from "@/components/forms/AddCrateForm.vue"
import DeleteCrateForm from "@/components/forms/DeleteCrateForm.vue"
import DeleteRecordForm from "@/components/forms/DeleteRecordForm.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import EditRecordForm from "@/components/forms/EditRecordForm.vue"
import RecordsList from "@/components/RecordsList.vue"
import ModalContainer from "@/components/ModalContainer.vue"
import DuplicateIcon from "@/components/svg/DuplicateIcon.vue"
import TrashIcon from "@/components/svg/TrashIcon.vue"
import FolderPlusIcon from "@/components/svg/FolderPlusIcon.vue"
import PlusCircleIcon from "@/components/svg/PlusCircleIcon.vue"
import CrateSelect from "@/components/forms/inputs/CrateSelect.vue"
import SelectCrateForm from "@/components/forms/SelectCrateForm.vue"
import FolderDownIcon from "@/components/svg/FolderDownIcon.vue"
import FolderMinusIcon from "@/components/svg/FolderMinusIcon.vue"
import RemoveRecordForm from "@/components/forms/RemoveRecordForm.vue"
import AddTrackForm from "@/components/forms/AddTrackForm.vue"
import EditTrackForm from "@/components/forms/EditTrackForm.vue"
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
  addTrack: false, // shows AddTrackForm
  editTrack: false, // shows EditTrackForm
})

// when selectedCrate changes, update db + clear checkboxed
watch(
  () => user.authd.settings.selectedCrate,
  () => {
    if (user.hasUser()) user.updateSettings() // hasUser() check to avoid call on logout
    records.checkboxed = []
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
