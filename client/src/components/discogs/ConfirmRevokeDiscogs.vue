<template>
  <div class="modal-header">
    <h2>Revoke discogs access</h2>
    <button
      class="close"
      type="button"
      @click="discogs.revokeDiscogsModal = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to revoke {{ appNamePossessive }} access to your
      Discogs collections? You can connect again at any time.
    </span>
    <ErrorFeedback :show="discogs.errorMsg !== ''" :msg="discogs.errorMsg" />
  </div>
  <div class="modal-footer-plain">
    <button
      class="close"
      type="button"
      @click="discogs.revokeDiscogsModal = false"
    >
      Cancel
    </button>
    <button
      @click="discogs.revokeAuthorisation()"
      class="primary delete"
      type="submit"
    >
      {{ discogs.loading ? null : "Revoke" }}
      <LoaderIcon v-show="discogs.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, inject } from "vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import XIcon from "@/components/icons/XIcon.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import { discogsStore } from "@/stores/discogsStore"
const discogs = discogsStore()
const appNamePossessive = inject("appNamePossessive")

onBeforeUnmount(() => {
  discogs.revokeDiscogsModal = false
})
</script>

<style scoped lang="scss"></style>
