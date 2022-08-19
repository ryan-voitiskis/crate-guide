<template>
  <form @submit.prevent="submit">
    <InfoDropdown
      text="Crates are collections of records that, when selected, limit session recommendations. A crate could represent a crate of records taken to a gig."
      class="form-body"
      style="margin: -2rem 0 1rem 0"
    />
    <div class="form-body inline-labels">
      <BaseInput
        v-model="form.name"
        id="name"
        label="Name"
        type="text"
        placeholder="Name"
        :focused="true"
        required
      />
    </div>
    <div class="form-controls">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit">Save</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, inject, defineEmits } from "vue"
import BaseInput from "./BasicInput.vue"
import InfoDropdown from "../InfoDropdown.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import Crate from "@/interfaces/Crate"
const user = userStore()
const crates = crateStore()
const API_URL = inject("API_URL")

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const submit = () => {
  const newCrate: Crate = {
    user: user.id,
    name: form.name,
  }
  crates.addCrate(newCrate, user.token)
  emit("close")
}
</script>

<style scoped lang="scss"></style>
