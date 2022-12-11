<template>
  <div class="modal-header">
    <h2>Add record</h2>
    <button class="close" type="button" @click="records.addRecordModal = false">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit" @reset.prevent="reset()">
    <div class="modal-body inline-labels">
      <BasicInput
        id="catno"
        v-model="form.catno"
        label="Catalog #"
        type="text"
        placeholder="CAT001 (optional)"
        :focused="true"
        autocomplete="off"
      />
      <BasicInput
        id="artists"
        v-model="form.artists"
        label="Artists"
        type="text"
        placeholder="Artist, Artist"
        required
      />
      <BasicInput
        id="title"
        v-model="form.title"
        label="Title"
        type="text"
        placeholder="Title"
        autocomplete="off"
        required
      />
      <BasicInput
        id="label"
        v-model="form.label"
        label="Label"
        type="text"
        placeholder="Label (optional)"
      />
      <BasicInput
        id="year"
        v-model="form.year"
        label="Year"
        placeholder="Year (optional)"
        type="text"
        inputmode="numeric"
        pattern="\d{4}"
        autocomplete="off"
      />
      <BasicInput
        id="cover"
        v-model="form.cover"
        label="Cover Image"
        type="text"
        placeholder="Image URL (optional)"
      />
      <ErrorFeedback :show="records.errorMsg !== ''" :msg="records.errorMsg" />
    </div>
    <div class="modal-footer">
      <button type="reset">Clear</button>
      <button
        class="close"
        type="button"
        @click="records.addRecordModal = false"
      >
        Close
      </button>
      <button class="primary" type="submit">
        {{ records.loading ? null : "Save" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onBeforeUnmount } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import UnsavedRecord from "@/interfaces/UnsavedRecord"
import { recordStore } from "@/stores/recordStore"
const records = recordStore()

const form = reactive({
  catno: "",
  artists: "",
  title: "",
  label: "",
  year: undefined,
  cover: "",
})

function reset() {
  form.catno = ""
  form.artists = ""
  form.title = ""
  form.label = ""
  form.year = undefined
}

function submit() {
  const unsavedRecord: UnsavedRecord = {
    catno: form.catno.trim(),
    artists: form.artists.trim(),
    title: form.title.trim(),
    label: form.label.trim(),
    year: form.year,
    cover: form.cover.trim(),
  }
  records.addRecord(unsavedRecord)
}

onBeforeUnmount(() => {
  records.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
