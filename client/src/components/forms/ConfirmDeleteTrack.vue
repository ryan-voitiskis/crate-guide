<template>
  <div class="modal-header">
    <h2>Delete track</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to delete {{ trackTitle }}?
    </span>
    <ErrorFeedback :show="tracks.errorMsg !== ''" :msg="tracks.errorMsg" />
  </div>
  <div class="modal-footer-plain">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Cancel
    </button>
    <button @click="submit()" class="primary delete" type="submit">
      {{ tracks.loading ? null : "Delete" }}
      <LoaderIcon v-show="tracks.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
const user = userStore()
const records = recordStore()
const tracks = trackStore()

// title of track to be deleted
const trackTitle = records.getTrackById(tracks.toDelete).title

const submit = async () => {
  if (tracks.toDelete) await tracks.deleteTrack(user.authd.token)
}

onBeforeUnmount(() => {
  tracks.toDelete = ""
  tracks.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
