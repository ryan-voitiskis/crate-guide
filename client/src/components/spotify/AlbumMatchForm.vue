<template>
  <div class="modal-header">
    <h2>Inexact record match selection</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <p>
      {{ appName }} couldn't find a perfect match on Spotify for
      <b>{{ spotify.inexactAlbumMatches.length.toString() }}</b>
      {{ spotify.inexactAlbumMatches.length > 1 ? "records" : "record" }}. The
      closest matches for each are listed here. Please select the correct
      records <b>if any</b> and submit this form to import the Spotify data for
      the tracks on those records.
    </p>
    <p>
      {{ appName }} will still check selected albums for the saved track names
      of the vinyl release.
    </p>
    <p>
      If no option is selected for a record, {{ appName }} will search for the
      individual track names.
    </p>
    <div class="inexact-matches-list">
      <AlbumMatchSelect
        v-for="albumMatch in spotify.inexactAlbumMatches"
        v-bind="albumMatch"
        :key="albumMatch.recordID"
      />
    </div>
    <ErrorFeedback :show="spotify.errorMsg !== ''" :msg="spotify.errorMsg" />
  </div>
  <div class="modal-footer">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Close
    </button>
    <button @click="submit()" class="primary" type="submit">
      {{ spotify.loading ? null : "Next" }}
      <LoaderIcon v-show="spotify.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { spotifyStore } from "@/stores/spotifyStore"
import XIcon from "@/components/icons/XIcon.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import AlbumMatchSelect from "./AlbumMatchSelect.vue"
import LoaderIcon from "../icons/LoaderIcon.vue"

const appName = inject("appName")
const spotify = spotifyStore()

const submit = () => {
  if (spotify.inexactTrackMatches.length) {
    spotify.albumMatchesModal = false
    spotify.trackMatchesModal = true
  } else spotify.importSelectedInexactMatches()
}
</script>

<style scoped lang="scss">
.inexact-matches-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
