<template>
  <div class="modal-header">
    <h2>Revoke discogs access</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to revoke {{ appNamePossessive }} access to your
      discogs collections?
    </span>
    <ErrorFeedback :show="discogs.errorMsg !== ''" :msg="discogs.errorMsg" />
  </div>
  <div class="modal-footer-plain">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Cancel
    </button>
    <button
      @click="discogs.revokeDiscogsAuthorisation()"
      class="primary delete"
      type="submit"
      style="width: 12rem"
    >
      {{ discogs.loading ? null : "Delete" }}
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
  discogs.revokeDiscogsForm = false
})
</script>

<style scoped lang="scss"></style>
