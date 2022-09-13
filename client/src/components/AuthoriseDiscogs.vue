<template>
  <div class="modal-header">
    <h2>Connect to Discogs API</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <p class="modal-text">
    Would you like to allow {{ appName }} to access your discogs collections?
  </p>
  <div class="modal-body centered-btns">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Cancel
    </button>
    <button
      class="primary"
      type="submit"
      style="width: 18rem"
      @click="submit()"
    >
      {{ user.loading ? null : "Request access" }}
      <!-- <LoaderIcon v-show="records.loading" /> -->
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineEmits, onBeforeUnmount, inject } from "vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import XIcon from "@/components/svg/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const appName = inject("appName")

const emit = defineEmits<{
  (e: "close"): void
}>()

const submit = async () => {
  const response = await user.discogsRequestToken()
  // if (response === 201) emit("close")
}

onBeforeUnmount(() => {
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
