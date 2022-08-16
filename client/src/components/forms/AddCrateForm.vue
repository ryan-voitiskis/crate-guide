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
import { userStore } from "@/stores/user"
const API_URL = inject("API_URL")
const user = userStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const submit = async () => {
  const body = new URLSearchParams()
  body.append("name", form.name)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
    body: body,
  }

  // TODO
  try {
    const response = await fetch(API_URL + "crates", options)
    if (response.status === 200) {
      const data = await response.json()
      emit("close")
    } else if (response.status === 400) {
      const data = await response.json()
      console.error(data.message)
    }
  } catch (error) {
    console.error(error)
  }
}
</script>

<style scoped lang="scss"></style>
