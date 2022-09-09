<template>
  <div class="modal-header">
    <h2>Edit record</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <InfoDropdown
      text="Catalog #, label and year are optional.<br />Catalog # recommended for discogs integration."
    />
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.catno"
        id="catno"
        label="Catalog #"
        type="text"
        placeholder="CAT001"
        :focused="true"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.artists"
        id="artists"
        label="Artists"
        type="text"
        placeholder="Artists"
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
        placeholder="Label"
      />
      <BasicInput
        v-model="form.year"
        id="year"
        label="Year"
        placeholder="Year"
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
    <div class="modal-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 16rem">
        {{ records.loading ? null : "Save changes" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onBeforeUnmount, watch } from "vue"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import BasicInput from "./inputs/BasicInput.vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import InfoDropdown from "@/components/InfoDropdown.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import Record from "@/interfaces/Record"
import XIcon from "@/components/svg/XIcon.vue"
const records = recordStore()
const user = userStore()

const record = records.getById(records.toEdit)

const noChangeMsg = "Record has not been edited."

const form = reactive({
  catno: record.catno,
  artists: record.artists,
  title: record.title,
  label: record.label,
  year: record.year,
  mixable: record.mixable,
})

// check if record has been edited, if not display noChangeMsg, else updateRecord
const submit = async () => {
  if (
    form.catno?.trim() === record.catno &&
    form.artists.trim() === record.artists &&
    form.title.trim() === record.title &&
    form.label?.trim() === record.label &&
    form.year == record.year && // * not === as coersion desired
    form.mixable === record.mixable
  )
    records.errorMsg = noChangeMsg
  else {
    const editedRecord: Record = {
      _id: record._id,
      user: user.authd._id,
      catno: form.catno?.trim(),
      artists: form.artists.trim(),
      title: form.title.trim(),
      label: form.label?.trim(),
      year: form.year,
      mixable: form.mixable,
      tracks: record.tracks,
    }
    await records.updateRecord(editedRecord, user.authd.token)
  }
}

// when form inputs changed, remove noChangeMsg
watch(
  () => ({ ...form }),
  () => {
    if (records.errorMsg === noChangeMsg) records.errorMsg = ""
  }
)

onBeforeUnmount(() => {
  records.errorMsg = ""
  records.toEdit = ""
})
</script>

<style scoped lang="scss"></style>
