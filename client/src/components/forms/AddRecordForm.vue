<template>
  <form @submit.prevent="submitAddRecord">
    <div class="form-body inline-labels">
      <BaseInput
        v-model="record.catno"
        id="catno"
        label="Catalog #"
        type="text"
        placeholder="CAT001"
        ref="firstField"
        :focused="true"
      />
      <BaseInput
        v-model="record.artist"
        id="artist"
        label="Artist"
        type="text"
        placeholder="Artist"
      />
      <BaseInput
        v-model="record.title"
        id="title"
        label="Title"
        type="text"
        placeholder="Title"
      />
      <BaseInput
        v-model="record.label"
        id="label"
        label="Label"
        type="text"
        placeholder="Label"
      />
      <BaseInput
        v-model="record.year"
        id="year"
        label="Year"
        type="text"
        placeholder="Year"
      />
      <label class="checkbox">
        <input type="checkbox" v-model="record.mixable" /> Mixable
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
import { reactive } from "vue"
import BaseInput from "@/components/forms/BaseInput.vue"

const record = reactive({
  catno: "",
  artist: "",
  title: "",
  label: "",
  year: "",
  mixable: true,
})

const submitAddRecord = () => {
  console.log("add record form submitted")
}
</script>

<style scoped lang="scss"></style>
