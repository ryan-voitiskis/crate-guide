<template>
  <div class="modal-header">
    <h2>Delete crate</h2>
    <button
      class="close"
      type="button"
      @click="crates.deleteCrateModal = false"
    >
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="hint">
      Enter the name &quot;<i>{{ crate.name }}</i
      >&quot; to delete crate.<br />
      <b>This can't be undone.</b>
    </span>
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.name"
        label="Crate name"
        type="text"
        :placeholder="crate.name"
        :focused="true"
        autocomplete="off"
        :class="{ matched: matched }"
        required
      />
      <ErrorFeedback :show="state.mismatch" msg="Name doesn't match" />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-footer">
      <button
        class="close"
        type="button"
        @click="crates.deleteCrateModal = false"
      >
        Close
      </button>
      <button class="primary" type="submit">
        {{ crates.loading ? null : "Delete" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, watch, computed, onBeforeUnmount } from "vue"
import { crateStore } from "@/stores/crateStore"
import { userStore } from "@/stores/userStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import Crate from "@/interfaces/Crate"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
const user = userStore()
const crates = crateStore()

const form = reactive({
  name: "",
})

const state = reactive({
  mismatch: false, // only true after a submit attempt
})

const crate = crates.getById(user.authd.settings.selectedCrate) as Crate

// input text matches crate name
const matched = computed(
  (): boolean =>
    form.name.localeCompare(crate.name, "en", {
      sensitivity: "accent",
    }) === 0
)

const submit = async () => {
  if (matched.value) {
    if (crate._id) {
      const response = await crates.deleteCrate(crate._id)
      if (response === 200) {
        user.authd.settings.selectedCrate = "all"
        crates.deleteCrateModal = false
      }
    }
  } else state.mismatch = true
}

// when input text matches crate name, remove mismatch message
watch(
  () => matched.value,
  () => {
    state.mismatch = false
  }
)

onBeforeUnmount(() => {
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
