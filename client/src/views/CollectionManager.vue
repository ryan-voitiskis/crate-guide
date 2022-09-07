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

  <ModalBox v-if="state.addCrate" @close="state.addCrate = false">
    <AddCrateForm @close="state.addCrate = false" />
  </ModalBox>

  <ModalBox v-if="state.deleteCrate" @close="state.deleteCrate = false">
    <DeleteCrateForm @close="state.deleteCrate = false" />
  </ModalBox>

  <ModalBox v-if="state.duplicateCrate" @close="state.duplicateCrate = false">
    <DuplicateCrateForm @close="state.duplicateCrate = false" />
  </ModalBox>

  <ModalBox v-if="state.addRecord" @close="state.addRecord = false">
    <AddRecordForm @close="state.addRecord = false" />
  </ModalBox>

  <ModalBox v-if="records.toEdit !== ''" @close="records.toEdit = ''">
    <EditRecordForm />
  </ModalBox>

  <ModalBox v-if="records.toDelete.length" @close="records.toDelete = []">
    <DeleteRecordForm />
  </ModalBox>

  <ModalBox v-if="records.toCrate.length" @close="records.toCrate = []">
    <SelectCrateForm />
  </ModalBox>

  <ModalBox v-if="records.fromCrate.length" @close="records.fromCrate = []">
    <RemoveRecordForm />
  </ModalBox>

  <ModalBox v-if="tracks.addTrackTo !== ''" @close="tracks.addTrackTo = ''">
    <AddTrackForm />
  </ModalBox>

  <ModalBox v-if="tracks.toEdit !== ''" @close="tracks.toEdit = ''">
    <EditTrackForm />
  </ModalBox>

  <ModalBox v-if="records.feedbackMsg !== ''" @close="records.feedbackMsg = ''">
    <UpdateFeedback :text="records.feedbackMsg" />
  </ModalBox>

  <ModalBox v-if="crates.feedbackMsg !== ''" @close="crates.feedbackMsg = ''">
    <UpdateFeedback :text="crates.feedbackMsg" />
  </ModalBox>
</template>

<script setup lang="ts">
import { crateStore } from "@/stores/crateStore"
import { reactive, watch } from "vue"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import AddCrateForm from "@/components/forms/AddCrateForm.vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import AddTrackForm from "@/components/forms/AddTrackForm.vue"
import CrateSelect from "@/components/forms/inputs/CrateSelect.vue"
import DeleteCrateForm from "@/components/forms/DeleteCrateForm.vue"
import DeleteRecordForm from "@/components/forms/DeleteRecordForm.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import DuplicateIcon from "@/components/svg/DuplicateIcon.vue"
import EditRecordForm from "@/components/forms/EditRecordForm.vue"
import EditTrackForm from "@/components/forms/EditTrackForm.vue"
import FolderDownIcon from "@/components/svg/FolderDownIcon.vue"
import FolderMinusIcon from "@/components/svg/FolderMinusIcon.vue"
import FolderPlusIcon from "@/components/svg/FolderPlusIcon.vue"
import ModalBox from "@/components/ModalBox.vue"
import PlusCircleIcon from "@/components/svg/PlusCircleIcon.vue"
import RecordsList from "@/components/RecordsList.vue"
import RemoveRecordForm from "@/components/forms/RemoveRecordForm.vue"
import SelectCrateForm from "@/components/forms/SelectCrateForm.vue"
import TrashIcon from "@/components/svg/TrashIcon.vue"
import UpdateFeedback from "@/components/forms/feedbacks/UpdateFeedback.vue"

const crates = crateStore()
const records = recordStore()
const tracks = trackStore()
const user = userStore()

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
