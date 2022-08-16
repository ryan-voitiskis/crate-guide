<template>
  <form @submit.prevent="submit">
    <span class="form-hint">
      Enter the name &quot;<i>{{ crate }}</i> &quot; to delete crate.<br />
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
    </div>
    <div class="form-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit">Save</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, inject, defineEmits, defineProps } from "vue"
import BaseInput from "./BasicInput.vue"
import { userStore } from "@/stores/user"
const API_URL = inject("API_URL")
const user = userStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const props = defineProps<{
  crate: string
}>()

const form = reactive({
  name: "",
})

const submit = async () => {
  // const body = new URLSearchParams()
  // body.append("name", form.name)
  // const options = {
  //   method: "DELETE",
  //   headers: {
  //     Accept: "application/json",
  //     "Content-Type": "application/x-www-form-urlencoded",
  //     Authorization: `Bearer ${user.token}`,
  //   },
  //   body: body,
  // }
  // try {
  //   const response = await fetch(API_URL + "crates", options)
  //   if (response.status === 200) {
  //     const data = await response.json()
  //     emit("close")
  //   } else if (response.status === 400) {
  //     const data = await response.json()
  //     console.error(data.message)
  //   }
  // } catch (error) {
  //   console.error(error)
  // }
}
</script>

<style scoped lang="scss"></style>
