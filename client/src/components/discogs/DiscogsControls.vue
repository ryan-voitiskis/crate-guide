<template>
  <div class="discogs-controls-container" v-if="user.authd.isDiscogsOAuthd">
    <button
      class="icon-button"
      @click="discogs.selectDiscogsFolderModal = true"
    >
      <ImportIcon />Import from Discogs
    </button>
    <InfoDropout :text="authdTip" />
  </div>
  <div class="discogs-controls-container" v-else>
    <button
      @click=";(discogs.authDiscogsModal = true), $parent!.$emit('close')"
    >
      Connect to Discogs
    </button>
    <InfoDropout :text="unAuthdTip" />
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import { userStore } from "@/stores/userStore"
import InfoDropout from "@/components/utility/InfoDropout.vue"
import ImportIcon from "@/components/icons/ImportIcon.vue"
const discogs = discogsStore()

const user = userStore()
const appName = inject("appName")
const unAuthdTip = `Connect ${appName} to your Discogs account so you can import your collection.`
const authdTip = `Import a collection of records from your Discogs account.`
</script>

<style scoped lang="scss">
button {
  width: 22rem;
}
.discogs-controls-container {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

@media (max-width: 575.98px) {
  .discogs-controls-container {
    flex-direction: column;
  }
}
</style>
