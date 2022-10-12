<template>
  <div class="modal-header">
    <h2>Stage import of discogs folder</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div v-if="discogs.toImport.length" class="import-list">
    <DiscogsReleaseBasic
      v-for="record in discogs.toImport"
      v-bind="record"
      :key="record.id"
    />
  </div>
  <LoaderCentered v-else class="modal-body" />
  <!-- <form @submit.prevent="discogs.revokeDiscogsAuthorisation()">
    <span class="form-question">
      Are you sure you wish to revoke {{ appNamePossessive }} access to your
      discogs collections?
    </span>
    <span class="form-question">
      You can easily request access again later.
    </span>
    <div class="modal-body centered-btns">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Cancel
      </button>
      <button class="primary delete" type="submit" style="width: 12rem">
        {{ discogs.loading ? null : "Revoke" }}
        <LoaderIcon v-show="discogs.loading" />
      </button>
    </div>
    <div class="modal-body">
      <ErrorFeedback :show="discogs.errorMsg !== ''" :msg="discogs.errorMsg" />
    </div>
  </form> -->
</template>

<script setup lang="ts">
import { onBeforeUnmount, inject } from "vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import XIcon from "@/components/svg/XIcon.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import { discogsStore } from "@/stores/discogsStore"
import RecordSingle from "../collection/RecordSingle.vue"
import LoaderCentered from "../LoaderCentered.vue"
import DiscogsReleaseBasic from "../collection/DiscogsReleaseBasic.vue"
const discogs = discogsStore()
const appNamePossessive = inject("appNamePossessive")

onBeforeUnmount(() => {
  discogs.revokeDiscogsForm = false
})
</script>

<style scoped lang="scss">
.import-list {
  height: 80vh;
  overflow-y: scroll;
}
</style>
