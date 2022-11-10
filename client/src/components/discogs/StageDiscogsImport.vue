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
    <button @click="discogs.importStaged()" class="primary" type="submit">
      {{ discogs.loading ? null : "Import staged records" }}
      <LoaderIcon v-show="discogs.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import XIcon from "@/components/icons/XIcon.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import { discogsStore } from "@/stores/discogsStore"
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
import DiscogsReleaseBasic from "@/components/discogs/DiscogsReleaseBasic.vue"
const discogs = discogsStore()

onBeforeUnmount(() => {
  discogs.revokeDiscogsForm = false
})
</script>

<style scoped lang="scss">
.import-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: scroll;
  width: 100%;
}
</style>
