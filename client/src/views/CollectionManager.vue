<template>
  <p v-if="!user.hasUser()">Sign in to create collections.</p>
  <div class="controls">
    <CrateSelect
      selectID="select_track_crate_select"
      label="Crate"
      width="240px"
    />
    <button
      class="crate-options"
      type="button"
      @click="crates.actionsModal = true"
    >
      <WrenchIcon />
    </button>
    <div class="input-wrapper">
      <BasicInput
        v-model="state.searchTitle"
        label="Search title"
        type="text"
        placeholder=""
        autocomplete="off"
        width="240px"
      />
    </div>
    <div class="input-wrapper">
      <BasicInput
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

  <ModalBox v-if="crates.addCrateModal">
    <AddCrateForm />
  </ModalBox>

  <ModalBox v-if="crates.deleteCrateModal">
    <ConfirmDeleteCrate />
  </ModalBox>

  <ModalBox v-if="crates.duplicateCrateModal">
    <DuplicateCrateForm />
  </ModalBox>

  <ModalBox v-if="records.addRecordModal">
    <AddRecordForm />
  </ModalBox>

  <ModalBox v-if="records.toEdit !== ''">
    <EditRecordForm />
  </ModalBox>

  <ModalBox v-if="records.toDelete.length">
    <DeleteRecordForm />
  </ModalBox>

  <ModalBox v-if="records.toCrate.length">
    <SelectCrateForm />
  </ModalBox>

  <ModalBox v-if="records.fromCrate.length">
    <RemoveRecordForm />
  </ModalBox>

  <ModalBox v-if="tracks.addTrackTo !== ''" width="480px">
    <AddTrackForm />
  </ModalBox>

  <ModalBox v-if="tracks.toEdit !== ''" width="480px">
    <EditTrackForm />
  </ModalBox>

  <ModalBox v-if="tracks.toDelete !== ''">
    <DeleteTrackForm />
  </ModalBox>

  <ModalBox v-if="records.feedbackMsg !== ''" @close="records.feedbackMsg = ''">
    <UpdateFeedback :text="records.feedbackMsg" />
  </ModalBox>

  <ModalBox v-if="crates.feedbackMsg !== ''" @close="crates.feedbackMsg = ''">
    <UpdateFeedback :text="crates.feedbackMsg" />
  </ModalBox>

  <ModalBox v-if="spotify.importProgressModal">
    <SpotifyImportProgress />
  </ModalBox>

  <ModalBox v-if="spotify.albumMatchesModal" width="880px">
    <AlbumMatchForm />
  </ModalBox>

  <ModalBox v-if="spotify.trackMatchesModal" width="880px">
    <TrackMatchForm />
  </ModalBox>

  <ModalBox v-if="spotify.completionModal" width="680px">
    <SpotifyCompletion />
  </ModalBox>

  <ModalBox v-if="crates.actionsModal"><CrateActions /></ModalBox>
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
import ConfirmDeleteCrate from "@/components/forms/ConfirmDeleteCrate.vue"
import DeleteRecordForm from "@/components/forms/ConfirmDeleteRecord.vue"
import DeleteTrackForm from "@/components/forms/ConfirmDeleteTrack.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import EditRecordForm from "@/components/forms/EditRecordForm.vue"
import EditTrackForm from "@/components/forms/EditTrackForm.vue"
import ModalBox from "@/components/utility/ModalBox.vue"
import RecordsList from "@/components/collection/RecordsList.vue"
import RemoveRecordForm from "@/components/forms/ConfirmRemoveRecord.vue"
import SelectCrateForm from "@/components/forms/SelectCrateForm.vue"
import UpdateFeedback from "@/components/feedbacks/UpdateFeedback.vue"
import SpotifyImportProgress from "@/components/spotify/SpotifyImportProgress.vue"
import AlbumMatchForm from "@/components/spotify/AlbumMatchForm.vue"
import TrackMatchForm from "@/components/spotify/TrackMatchForm.vue"
import SpotifyCompletion from "@/components/spotify/SpotifyCompletion.vue"
import TracksList from "@/components/collection/TracksList.vue"
import ListLayoutToggle from "@/components/collection/ListLayoutToggle.vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import FilterOffIcon from "@/components/icons/FilterOffIcon.vue"
import CrateSelect from "@/components/inputs/CrateSelect.vue"
import WrenchIcon from "@/components/icons/WrenchIcon.vue"
import CrateActions from "@/components/collection/CrateActions.vue"

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
.crate-options {
  width: 38px;
  margin-top: 29px;
  padding: 0 8px;
  svg {
    position: absolute;
  }
}
</style>
