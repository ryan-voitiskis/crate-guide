<template>
  <div class="modal-header">
    <h2>Authorisation successful</h2>
    <button
      class="close"
      type="button"
      @click="user.authd.justCompleteDiscogsOAuth = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <p>
      {{ appName }} has successfully been authorised to access data from your
      discogs account. You can now import your collection folders from discogs.
    </p>
    <p class="discogs-ip-statement">
      This application uses Discogs’ API but is not affiliated with, sponsored
      or endorsed by Discogs. ‘Discogs’ is a trademark of Zink Media, LLC.
    </p>
  </div>
  <div class="modal-footer">
    <button
      class="close"
      type="button"
      @click="user.authd.justCompleteDiscogsOAuth = false"
    >
      Close
    </button>
    <button
      @click="
        ;(discogs.selectDiscogsFolderModal = true),
          (user.authd.justCompleteDiscogsOAuth = false)
      "
      class="primary"
      type="submit"
    >
      Import a collection
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import { userStore } from "@/stores/userStore"
import XIcon from "@/components/icons/XIcon.vue"
const discogs = discogsStore()
const user = userStore()

const appName = inject("appName")
</script>

<style scoped lang="scss"></style>
