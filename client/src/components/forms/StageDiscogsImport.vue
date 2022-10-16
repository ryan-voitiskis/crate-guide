<template>
  <div class="modal-header">
    <h2>Stage import of discogs folder</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div v-if="discogs.toImport.length" class="import-list modal-body">
    <DiscogsReleaseBasic
      v-for="record in discogs.toImport"
      v-bind="record"
      :key="record.id"
    />
  </div>
  <LoaderCentered v-else class="modal-body" />
  <div class="modal-footer">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Close
    </button>
    <button
      @click="discogs.importStaged(user.authd.token)"
      class="primary"
      type="submit"
      style="width: 24rem"
    >
      {{ discogs.loading ? null : "Import staged records" }}
      <LoaderIcon v-show="discogs.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import XIcon from "@/components/svg/XIcon.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
import { discogsStore } from "@/stores/discogsStore"
import LoaderCentered from "../LoaderCentered.vue"
import DiscogsReleaseBasic from "../collection/DiscogsReleaseBasic.vue"
const discogs = discogsStore()
const user = userStore()

onBeforeUnmount(() => {
  discogs.revokeDiscogsForm = false
})
</script>

<style scoped lang="scss">
.import-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 70vh;
  overflow-y: scroll;
  width: 100%;
}
</style>
