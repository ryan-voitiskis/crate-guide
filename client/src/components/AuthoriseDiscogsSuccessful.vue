<template>
  <div class="modal-header">
    <h2>Authorisation successful</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
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
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Close
    </button>
    <button class="primary" type="submit" style="width: 20rem">
      Import a collection
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import XIcon from "@/components/svg/XIcon.vue"

const appName = inject("appName")
</script>

<style scoped lang="scss"></style>
