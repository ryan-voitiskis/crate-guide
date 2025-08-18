<template>
  <div class="modal-header">
    <h2>Add crate</h2>
    <button class="close" type="button" @click="crates.addCrateModal = false">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <InfoDropdown
      text="Crates are collections of records that, when selected a crate will limits session suggestion options and track load options. A crate could represent a crate of records taken to a gig."
    />
    <div class="modal-body inline-labels">
      <BasicInput
        id="crate_name"
        v-model="form.name"
        label="Crate name"
        type="text"
        placeholder="My crate"
        :focused="true"
        autocomplete="off"
        maxlength="40"
        required
      />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-footer">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="crates.addCrateModal = false">
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
import { crateStore } from "@/stores/crateStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import InfoDropdown from "@/components/utility/InfoDropdown.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import UnsavedCrate from "@/interfaces/UnsavedCrate"
import XIcon from "@/components/icons/XIcon.vue"
const crates = crateStore()

const form = reactive({
  name: "",
})

function submit() {
  const unsavedCrate: UnsavedCrate = {
    name: form.name.trim(),
    records: [],
  }
  crates.addCrate(unsavedCrate)
}

onBeforeUnmount(() => {
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
