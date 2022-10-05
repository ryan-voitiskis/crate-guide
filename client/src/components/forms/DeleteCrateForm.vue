<template>
  <div class="modal-header">
    <h2>Delete crate</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="form-hint">
      Enter the name &quot;<i>{{ crate.name }}</i
      >&quot; to delete crate.<br />
      <b>This can't be undone.</b>
    </span>
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.name"
        id="name"
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
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ crates.loading ? null : "Delete" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, watch, computed, onBeforeUnmount } from "vue"
import BasicInput from "./inputs/BasicInput.vue"
import ErrorFeedback from "./feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import XIcon from "@/components/svg/XIcon.vue"
import Crate from "@/interfaces/Crate"
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
      const response = await crates.deleteCrate(crate._id, user.authd.token)
      if (response === 200) {
        user.authd.settings.selectedCrate = "all"
        emit("close")
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
