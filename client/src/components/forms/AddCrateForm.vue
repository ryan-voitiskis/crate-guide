<template>
  <div class="modal-header">
    <h2>Add crate</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <InfoDropdown
      text="Crates are collections of records that, when selected a crate will limits session recommendations. A crate could represent a crate of records taken to a gig."
    />
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.name"
        id="name"
        label="Crate name"
        type="text"
        placeholder="My crate"
        :focused="true"
        autocomplete="off"
        required
      />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-controls">
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
import { reactive, defineEmits, onBeforeUnmount } from "vue"
import BasicInput from "./inputs/BasicInput.vue"
import ErrorFeedback from "./feedbacks/ErrorFeedback.vue"
import InfoDropdown from "@/components/InfoDropdown.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import XIcon from "@/components/svg/XIcon.vue"
import UnsavedCrate from "@/interfaces/UnsavedCrate"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const submit = async () => {
  const unsavedCrate: UnsavedCrate = {
    user: user.authd._id,
    name: form.name.trim(),
    records: [],
  }
  const response = await crates.addCrate(unsavedCrate, user.authd.token)
  if (response === 201) emit("close")
}

onBeforeUnmount(() => {
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
