<template>
  <div class="modal-header">
    <h2>Delete track</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="form-question">
      Are you sure you wish to delete {{ trackTitle }}?
    </span>
    <div class="modal-body centered-btns">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Cancel
      </button>
      <button class="primary delete" type="submit" style="width: 12rem">
        {{ records.loading ? null : "Delete" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
    <div class="modal-body">
      <ErrorFeedback :show="tracks.errorMsg !== ''" :msg="tracks.errorMsg" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import XIcon from "@/components/svg/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
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
