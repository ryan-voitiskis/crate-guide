<template>
  <div class="controls">
    <CrateSelect
      selectID="select_track_crate_select"
      label="Crate"
      width="240px"
    />
    <button
      class="icon-only-button crate-actions-button"
      type="button"
      @click="crates.actionsModal = true"
      :disabled="!user.authd._id"
    >
      <WrenchIcon />
    </button>
    <div class="input-wrapper">
      <BasicInput
        id="search_title"
        v-model="state.searchTitle"
        label="Search title / catalog no."
        type="text"
        placeholder=""
        autocomplete="off"
        width="240px"
      />
    </div>
    <div class="input-wrapper">
      <BasicInput
        id="search_artists"
        v-model="state.searchArtists"
        label="Search artist"
        type="text"
        placeholder=""
        autocomplete="off"
        width="240px"
      />
    </div>
    <div class="input-wrapper" v-show="user.authd.settings.listLayout === 1">
      <BasicInput
        id="filter_genre"
        v-model="state.filterGenre"
        label="Filter genre"
        type="text"
        placeholder=""
        autocomplete="off"
        width="240px"
      />
    </div>
    <div class="input-wrapper">
      <BasicInput
        id="filter_year"
        v-model="state.filterYear"
        label="Filter year"
        type="text"
        placeholder="1990-2000"
        autocomplete="off"
        width="120px"
      />
    </div>
    <button class="clear-filters icon-button" @click="clearFilters()">
      <FilterOffIcon />Clear filters
    </button>
    <ListLayoutToggle class="list-layout" />
  </div>

  <span class="sign-in-message" v-if="!user.authd._id">
    This is a demo collection. Sign in to create your own.
  </span>
  <KeepAlive>
    <RecordsList
      v-if="user.authd.settings.listLayout === 0"
      :searchTitle="state.searchTitle"
      :searchArtists="state.searchArtists"
      :filterYear="state.filterYear"
    />
  </KeepAlive>
  <KeepAlive>
    <TracksList
      v-if="user.authd.settings.listLayout === 1"
      :searchTitle="state.searchTitle"
      :searchArtists="state.searchArtists"
      :filterGenre="state.filterGenre"
      :filterYear="state.filterYear"
    />
  </KeepAlive>

  <ModalBox v-if="crates.addCrateModal" @close="crates.addCrateModal = false">
    <AddCrateForm />
  </ModalBox>

  <ModalBox
    v-if="crates.deleteCrateModal"
    @close="crates.deleteCrateModal = false"
  >
    <ConfirmDeleteCrate />
  </ModalBox>

  <ModalBox
    v-if="crates.duplicateCrateModal"
    @close="crates.duplicateCrateModal = false"
  >
    <DuplicateCrateForm />
  </ModalBox>

  <ModalBox
    v-if="records.addRecordModal"
    @close="records.addRecordModal = false"
  >
    <AddRecordForm />
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

  <ModalBox
    v-if="tracks.addTrackTo !== ''"
    @close="tracks.addTrackTo = ''"
    width="480px"
  >
    <AddTrackForm />
  </ModalBox>

  <ModalBox
    v-if="tracks.toEdit !== ''"
    @close="tracks.toEdit = ''"
    width="480px"
  >
    <EditTrackForm />
  </ModalBox>

  <ModalBox v-if="tracks.toDelete !== ''" @close="tracks.toDelete = ''">
    <DeleteTrackForm />
  </ModalBox>

  <ModalBox v-if="records.feedbackMsg !== ''" @close="records.feedbackMsg = ''">
    <UpdateFeedback :text="records.feedbackMsg" />
  </ModalBox>

  <ModalBox v-if="crates.feedbackMsg !== ''" @close="crates.feedbackMsg = ''">
    <UpdateFeedback :text="crates.feedbackMsg" />
  </ModalBox>

  <ModalBox
    v-if="spotify.importProgressModal"
    @close="spotify.importProgressModal = false"
  >
    <SpotifyImportProgress />
  </ModalBox>

  <ModalBox
    v-if="spotify.albumMatchesModal"
    @close="spotify.albumMatchesModal = false"
    width="880px"
  >
    <AlbumMatchForm />
  </ModalBox>

  <ModalBox
    v-if="spotify.trackMatchesModal"
    @close="spotify.trackMatchesModal = false"
    width="880px"
  >
    <TrackMatchForm />
  </ModalBox>

  <ModalBox
    v-if="spotify.completionModal"
    @close="spotify.completionModal = false"
    width="680px"
  >
    <SpotifyCompletion />
  </ModalBox>

  <ModalBox v-if="crates.actionsModal" @close="crates.actionsModal = false">
    <CrateActions />
  </ModalBox>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { spotifyStore } from "@/stores/spotifyStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import AddCrateForm from "@/components/forms/AddCrateForm.vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import AddTrackForm from "@/components/forms/AddTrackForm.vue"
import AlbumMatchForm from "@/components/spotify/AlbumMatchForm.vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ConfirmDeleteCrate from "@/components/forms/ConfirmDeleteCrate.vue"
import CrateActions from "@/components/collection/CrateActions.vue"
import CrateSelect from "@/components/inputs/CrateSelect.vue"
import DeleteRecordForm from "@/components/forms/ConfirmDeleteRecord.vue"
import DeleteTrackForm from "@/components/forms/ConfirmDeleteTrack.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import EditRecordForm from "@/components/forms/EditRecordForm.vue"
import EditTrackForm from "@/components/forms/EditTrackForm.vue"
import FilterOffIcon from "@/components/icons/FilterOffIcon.vue"
import ListLayoutToggle from "@/components/collection/ListLayoutToggle.vue"
import ModalBox from "@/components/utility/ModalBox.vue"
import RecordsList from "@/components/collection/RecordsList.vue"
import RemoveRecordForm from "@/components/forms/ConfirmRemoveRecord.vue"
import SelectCrateForm from "@/components/forms/SelectCrateForm.vue"
import SpotifyCompletion from "@/components/spotify/SpotifyCompletion.vue"
import SpotifyImportProgress from "@/components/spotify/SpotifyImportProgress.vue"
import TrackMatchForm from "@/components/spotify/TrackMatchForm.vue"
import TracksList from "@/components/collection/TracksList.vue"
import UpdateFeedback from "@/components/feedbacks/UpdateFeedback.vue"
import WrenchIcon from "@/components/icons/WrenchIcon.vue"
const crates = crateStore()
const records = recordStore()
const spotify = spotifyStore()
const tracks = trackStore()
const user = userStore()

const clearFilters = () => {
  state.searchTitle = ""
  state.searchArtists = ""
  state.filterGenre = ""
  state.filterYear = ""
}

const state = reactive({
  searchTitle: "",
  searchArtists: "",
  filterGenre: "",
  filterYear: "",
})
</script>

<style scoped lang="scss">
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.list-layout {
  margin-left: auto;
  margin-top: 29px;
}

.clear-filters {
  justify-self: end;
  margin-top: 29px;
}

.crate-actions-button {
  margin-top: 29px;
}

.sign-in-message {
  width: 100%;
  margin: 20px;
  display: block;
  text-align: center;
  font-size: 22px;
}
</style>
