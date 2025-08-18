<template>
  <div class="modal-header">
    <h2>Revoke spotify access</h2>
    <button
      class="close"
      type="button"
      @click="spotify.revokeSpotifyModal = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to revoke {{ appNamePossessive }} access to the
      Spotify API through your account? You can connect again at any time.
    </span>
    <ErrorFeedback :show="spotify.errorMsg !== ''" :msg="spotify.errorMsg" />
  </div>
  <div class="modal-footer-plain">
    <button
      class="close"
      type="button"
      @click="spotify.revokeSpotifyModal = false"
    >
      Cancel
    </button>
    <button
      @click="spotify.revokeAuthorisation()"
      class="primary delete"
      type="submit"
    >
      {{ spotify.loading ? null : "Revoke" }}
      <LoaderIcon v-show="spotify.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, inject } from "vue"
import { spotifyStore } from "@/stores/spotifyStore"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
const spotify = spotifyStore()
const appNamePossessive = inject("appNamePossessive")

onBeforeUnmount(() => {
  spotify.revokeSpotifyModal = false
})
</script>

<style scoped lang="scss"></style>
