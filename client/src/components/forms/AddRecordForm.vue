<template>
  <div class="modal-header">
    <h2>Add record</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit" @reset.prevent="reset()">
    <InfoDropdown
      text="Catalog #, label and year are optional.<br />Catalog # recommended for discogs integration."
    />
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.catno"
        id="catno"
        label="Catalog #"
        type="text"
        placeholder="CAT001 (optional)"
        :focused="true"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.artists"
        id="artists"
        label="Artists"
        type="text"
        placeholder="Artist, Artist"
        required
      />
      <BasicInput
        v-model="form.title"
        id="title"
        label="Title"
        type="text"
        placeholder="Title"
        autocomplete="off"
        required
      />
      <BasicInput
        v-model="form.label"
        id="label"
        label="Label"
        type="text"
        placeholder="Label (optional)"
      />
      <BasicInput
        v-model="form.year"
        id="year"
        label="Year"
        placeholder="Year (optional)"
        type="text"
        inputmode="numeric"
        pattern="\d{4}"
        autocomplete="off"
      />
      <label class="checkbox">
        <input type="checkbox" v-model="form.mixable" /> Mixable
      </label>
      <ErrorFeedback :show="records.errorMsg !== ''" :msg="records.errorMsg" />
    </div>
    <div class="modal-footer">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="$parent!.$emit('close')">
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
import InfoDropdown from "@/components/utility/InfoDropdown.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import UnsavedRecord from "@/interfaces/UnsavedRecord"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const records = recordStore()

const form = reactive({
  catno: "",
  artists: "",
  title: "",
  label: "",
  year: undefined,
  mixable: true,
})

const reset = () => {
  form.catno = ""
  form.artists = ""
  form.title = ""
  form.label = ""
  form.year = undefined
  form.mixable = true
}

const submit = async () => {
  const unsavedRecord: UnsavedRecord = {
    user: user.authd._id,
    catno: form.catno.trim(),
    artists: form.artists.trim(),
    title: form.title.trim(),
    label: form.label.trim(),
    year: form.year,
    mixable: form.mixable,
  }
  const response = await records.addRecord(unsavedRecord)
  if (response === 400) {
    console.error(`AddRecordForm: record.addRecord returned status ${response}`)
  } else if (response === 201) records.addRecordModal = false
}

onBeforeUnmount(() => {
  records.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
