<template>
  <div class="modal-header">
    <h2>Stage import of discogs folder</h2>
    <button
      class="close"
      type="button"
      @click="discogs.stageImportModal = false"
    >
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
    <button
      class="close"
      type="button"
      @click="discogs.stageImportModal = false"
    >
      Close
    </button>
    <button @click="discogs.importStaged()" class="primary" type="submit">
      {{ discogs.loading ? null : "Import staged records" }}
      <LoaderIcon v-show="discogs.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import DiscogsReleaseBasic from "@/components/discogs/DiscogsReleaseBasic.vue"
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
const discogs = discogsStore()

onBeforeUnmount(() => {
  discogs.revokeDiscogsModal = false
})
</script>

<style scoped lang="scss">
.import-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: scroll;
  width: 100%;
}
</style>
