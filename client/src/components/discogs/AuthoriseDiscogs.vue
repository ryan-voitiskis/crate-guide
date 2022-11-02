<template>
  <div class="modal-header">
    <h2>Connect to Discogs API</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <InfoDropdown :text="discogsEndpointInfo" />
  <div class="modal-body">
    <span class="question">
      Would you like to allow {{ appName }} to access your discogs collections?
    </span>
    <ErrorFeedback :show="discogs.errorMsg !== ''" :msg="discogs.errorMsg" />
  </div>
  <div class="modal-footer-plain">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Cancel
    </button>
    <button
      @click="discogs.discogsRequestToken()"
      class="primary"
      type="submit"
      style="width: 18rem"
    >
      {{ discogs.loading ? null : "Request access" }}
      <LoaderIcon v-show="discogs.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import InfoDropdown from "../utils/InfoDropdown.vue"
import { discogsStore } from "@/stores/discogsStore"
import ErrorFeedback from "../feedbacks/ErrorFeedback.vue"
const discogs = discogsStore()
const discogsEndpointInfo = inject("discogsEndpointInfo") as string
const appName = inject("appName")
</script>

<style scoped lang="scss"></style>
