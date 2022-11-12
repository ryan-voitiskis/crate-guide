<template>
  <p v-if="!user.hasUser()">Sign in to create collections.</p>
  <div class="controls" v-if="user.hasUser()">
    <button class="icon-button" @click="records.addRecordModal = true">
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
      <TrashIcon />Delete selected
    </button>
    <button
      class="icon-button"
      @click="spotify.importDataForSelectedRecords()"
      v-if="records.checkboxed.length && user.authd.isSpotifyOAuthd"
    >
      <SpotifyLogo class="spotify-logo" />Get Spotify data for selected
    </button>
    <DiscogsControls v-if="user.hasUser()" />
    <ListLayoutToggle class="list-layout" />
  </div>

  <KeepAlive>
    <RecordsList v-if="user.authd.settings.listLayout === 0" />
  </KeepAlive>
  <KeepAlive>
    <TracksList v-if="user.authd.settings.listLayout === 1" />
  </KeepAlive>

  <ModalBox v-if="crates.addCrateModal" @close="crates.addCrateModal = false">
    <AddCrateForm />
  </ModalBox>

  <ModalBox
    v-if="crates.deleteCrateModal"
    @close="crates.deleteCrateModal = false"
  >
    <ConfirmDeleteCrate @close="crates.deleteCrateModal = false" />
  </ModalBox>

  <ModalBox
    v-if="crates.duplicateCrateModal"
    @close="crates.duplicateCrateModal = false"
  >
    <DuplicateCrateForm @close="crates.duplicateCrateModal = false" />
  </ModalBox>

  <ModalBox
    v-if="records.addRecordModal"
    @close="records.addRecordModal = false"
  >
    <AddRecordForm @close="records.addRecordModal = false" />
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

  <ModalBox
    v-if="tracks.toShowFeatures"
    @close="tracks.toShowFeatures = ''"
    width="560px"
  >
    <AudioFeatures />
  </ModalBox>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
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
import DiscogsControls from "@/components/discogs/DiscogsControls.vue"
import DuplicateCrateForm from "@/components/forms/DuplicateCrateForm.vue"
import EditRecordForm from "@/components/forms/EditRecordForm.vue"
import EditTrackForm from "@/components/forms/EditTrackForm.vue"
import FolderDownIcon from "@/components/icons/FolderDownIcon.vue"
import FolderMinusIcon from "@/components/icons/FolderMinusIcon.vue"
import ModalBox from "@/components/utility/ModalBox.vue"
import PlusCircleIcon from "@/components/icons/PlusCircleIcon.vue"
import RecordsList from "@/components/collection/RecordsList.vue"
import RemoveRecordForm from "@/components/forms/ConfirmRemoveRecord.vue"
import SelectCrateForm from "@/components/forms/SelectCrateForm.vue"
import TrashIcon from "@/components/icons/TrashIcon.vue"
import UpdateFeedback from "@/components/feedbacks/UpdateFeedback.vue"
import SpotifyImportProgress from "@/components/spotify/SpotifyImportProgress.vue"
import SpotifyLogo from "@/components/icons/SpotifyLogo.vue"
import AlbumMatchForm from "@/components/spotify/AlbumMatchForm.vue"
import TrackMatchForm from "@/components/spotify/TrackMatchForm.vue"
import SpotifyCompletion from "@/components/spotify/SpotifyCompletion.vue"
import ListLayoutToggle from "@/components/collection/ListLayoutToggle.vue"
import TracksList from "@/components/collection/TracksList.vue"
import AudioFeatures from "@/components/collection/AudioFeatures.vue"

const crates = crateStore()
const records = recordStore()
const spotify = spotifyStore()
const tracks = trackStore()
const user = userStore()

onBeforeUnmount(() => {
  records.checkboxed = []
  records.checkAll = false
})
</script>

<style scoped lang="scss">
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.spotify-logo {
  color: var(--spotify-light-green);
}
.list-layout {
  margin-left: auto;
}
</style>
