<template>
  <form @submit.prevent="submit">
    <p class="form-hint">Enter the new name of the duplicated crate.</p>
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
    // TODO: inc records
  }
  crates.addCrate(newCrate, user.loggedIn.token)
  emit("close")
}
</script>

<style scoped lang="scss"></style>
