<template>
  <div class="modal-header">
    <h2>
      {{ user.authd.discogsUID === "" ? "Provide" : "Update" }} Discogs username
    </h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <InfoDropdown :text="discogsEndpointInfo" />
  <form @submit.prevent="submit">
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.username"
        id="name"
        label="Discogs username"
        type="text"
        placeholder="Username"
        :focused="true"
        autocomplete="off"
        required
      />
    </div>
    <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    <div class="modal-footer">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ crates.loading ? null : "Save" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, onBeforeUnmount, inject } from "vue"
import BasicInput from "@/components/forms/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import XIcon from "@/components/svg/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import InfoDropdown from "./InfoDropdown.vue"
const user = userStore()
const crates = crateStore()
const discogsEndpointInfo = inject("discogsEndpointInfo") as string
const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  username: user.authd.discogsUID,
})

const submit = async () => {
  user.authd.discogsUID = form.username
  user.updateSettings()
  emit("close")
}

onBeforeUnmount(() => {
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
