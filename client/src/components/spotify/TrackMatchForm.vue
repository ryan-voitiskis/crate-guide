<template>
  <div class="modal-header">
    <h2>Inexact track match selection</h2>
    <button
      class="close"
      type="button"
      @click="spotify.trackMatchesModal = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <p>
      {{ appName }} couldn't find a perfect match on Spotify for
      <b>{{ spotify.inexactTrackMatches.length.toString() }}</b>
      {{ spotify.inexactTrackMatches.length > 1 ? "tracks" : "track" }}. The
      closest matches for each are listed here. Please select the correct tracks
      <b>if any</b> and submit this form to import their Spotify.
    </p>
    <div class="inexact-matches-list">
      <TrackMatchSelect
        v-for="trackMatch in spotify.inexactTrackMatches"
        v-bind="trackMatch"
        :key="trackMatch.trackID"
      />
    </div>
    <ErrorFeedback :show="spotify.errorMsg !== ''" :msg="spotify.errorMsg" />
  </div>
  <div class="modal-footer">
    <button
      class="close"
      type="button"
      @click="spotify.trackMatchesModal = false"
    >
      Close
    </button>
    <button
      @click="spotify.importSelectedInexactMatches()"
      class="primary"
      type="submit"
    >
      {{ spotify.loading ? null : "Next" }}
      <LoaderIcon v-show="spotify.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { spotifyStore } from "@/stores/spotifyStore"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "../icons/LoaderIcon.vue"
import TrackMatchSelect from "./TrackMatchSelect.vue"
import XIcon from "@/components/icons/XIcon.vue"

const appName = inject("appName")
const spotify = spotifyStore()
</script>

<style scoped lang="scss">
.inexact-matches-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
