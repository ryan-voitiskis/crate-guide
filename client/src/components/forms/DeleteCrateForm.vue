<template>
  <form @submit.prevent="submit" v-if="crate !== null">
    <span class="form-hint">
      Enter the name &quot;<i>{{ crate.name }}</i
      >&quot; to delete crate.<br />
      <b>This can't be undone.</b>
    </span>
    <div class="form-body inline-labels">
      <BaseInput
        v-model="form.name"
        id="name"
        label="Crate name"
        type="text"
        placeholder="Name"
        :focused="true"
        required
      />
      <InvalidFeedback :invalid="state.invalid" :msg="state.invalidMsg" />
    </div>
    <div class="form-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit">Delete</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, inject, defineEmits, defineProps } from "vue"
import BaseInput from "./BasicInput.vue"
import InvalidFeedback from "./InvalidFeedback.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const API_URL = inject("API_URL")
const user = userStore()
const crates = crateStore()

const crate = crates.getById(user.loggedIn.settings.selectedCrate)

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const state = reactive({
  invalid: false,
  invalidMsg: "Name doesn't match",
})

const submit = () => {
  state.invalid = false
  if (form.name === crate?.name) {
    if (crate._id) {
      crates.deleteCrate(crate._id, user.loggedIn.token)
      user.loggedIn.settings.selectedCrate = "all"
      emit("close")
    }
  } else state.invalid = true
}
</script>

<style scoped lang="scss"></style>
