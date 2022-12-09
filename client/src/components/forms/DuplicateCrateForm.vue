<template>
  <div class="modal-header">
    <h2>Duplicate crate</h2>
    <button
      class="close"
      type="button"
      @click="crates.duplicateCrateModal = false"
    >
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <p class="hint">Enter the duplicated crate name.</p>
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.name"
        label="Crate name"
        type="text"
        placeholder="My crate"
        :focused="true"
        required
      />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-footer">
      <button type="reset">Clear</button>
      <button
        class="close"
        type="button"
        @click="crates.duplicateCrateModal = false"
      >
        Close
      </button>
      <button class="primary" type="submit">
        {{ crates.loading ? null : "Save" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onBeforeUnmount } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import UnsavedCrate from "@/interfaces/UnsavedCrate"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const form = reactive({
  name: "",
})

function submit() {
  const records = crates.getById(user.authd.settings.selectedCrate)
    ?.records as string[]
  const unsavedCrate: UnsavedCrate = {
    name: form.name,
    records: records,
  }
  crates.addCrate(unsavedCrate)
}

onBeforeUnmount(() => {
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
