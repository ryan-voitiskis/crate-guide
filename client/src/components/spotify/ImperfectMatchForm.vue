<template>
  <div class="modal-header">
    <h2>Imperfect match selection</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <p>
      {{ appName }} couldn't find a perfect match on Spotify for
      <b>{{ spotify.imperfectAlbumMatches.length.toString() }}</b>
      {{ spotify.imperfectAlbumMatches.length > 1 ? "records" : "record" }}. The
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
    <div class="imperfect-matches-list">
      <ImperfectMatchSelect
        v-for="imperfectMatch in spotify.imperfectAlbumMatches"
        v-bind="imperfectMatch"
        :key="imperfectMatch._id"
      />
    </div>
    <ErrorFeedback :show="spotify.errorMsg !== ''" :msg="spotify.errorMsg" />
  </div>
  <div class="modal-footer">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Close
    </button>
    <button
      @click="spotify.importSelectedImperfectMatches(user.authd.token)"
      class="primary"
      type="submit"
      style="width: 24rem"
    >
      {{ spotify.loading ? null : "Import selected records" }}
      <LoaderIcon v-show="spotify.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { spotifyStore } from "@/stores/spotifyStore"
import { userStore } from "@/stores/userStore"
import XIcon from "@/components/icons/XIcon.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import ImperfectMatchSelect from "./ImperfectMatchSelect.vue"
import LoaderIcon from "../icons/LoaderIcon.vue"
const user = userStore()

const appName = inject("appName")
const spotify = spotifyStore()
</script>

<style scoped lang="scss">
.imperfect-matches-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
