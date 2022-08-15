<template>
  <form @submit.prevent="submit" @reset.prevent="reset()">
    <InfoDropdown
      text="Catalog #, label and year are optional.<br />Catalog # recommended for discogs integration."
      class="form-body"
      style="margin: -2rem 0 1rem 0"
    />
    <div class="form-body inline-labels">
      <BaseInput
        v-model="form.catno"
        id="catno"
        label="Catalog #"
        type="text"
        placeholder="CAT001"
        :focused="true"
      />
      <BaseInput
        v-model="form.artist"
        id="artist"
        label="Artist"
        type="text"
        placeholder="Artist"
        required
      />
      <BaseInput
        v-model="form.title"
        id="title"
        label="Title"
        type="text"
        placeholder="Title"
        required
      />
      <BaseInput
        v-model="form.label"
        id="label"
        label="Label"
        type="text"
        placeholder="Label"
      />
      <BaseInput
        v-model="form.year"
        id="year"
        label="Year"
        type="number"
        placeholder="Year"
      />
      <label class="checkbox">
        <input type="checkbox" v-model="form.mixable" /> Mixable
      </label>
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
  catno: "",
  artist: "",
  title: "",
  label: "",
  year: "",
  mixable: true,
})

const reset = () => {
  form.catno = ""
  form.artist = ""
  form.title = ""
  form.label = ""
  form.year = ""
  form.mixable = true
}

const submit = async () => {
  const mixable = form.mixable ? "1" : "0" // string only in x-www-form-urlencode
  const body = new URLSearchParams()
  body.append("catno", form.catno)
  body.append("artist", form.artist)
  body.append("title", form.title)
  body.append("label", form.label)
  body.append("year", form.year)
  body.append("mixable", mixable)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
    body: body,
  }

  try {
    const response = await fetch(API_URL + "records", options)
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
