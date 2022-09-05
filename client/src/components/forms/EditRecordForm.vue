<template>
  <form @submit.prevent="submit">
    <InfoDropdown
      text="Catalog #, label and year are optional.<br />Catalog # recommended for discogs integration."
      class="form-hint"
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
        type="number"
        placeholder="Year"
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
import { reactive, defineEmits, onBeforeUnmount } from "vue"
import BasicInput from "./inputs/BasicInput.vue"
import InfoDropdown from "@/components/InfoDropdown.vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import Record from "@/interfaces/Record"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const records = recordStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const record = records.getById(records.toEdit)

const form = reactive({
  catno: record.catno,
  artists: record.artists,
  title: record.title,
  label: record.label,
  year: record.year,
  mixable: record.mixable,
})

const submit = async () => {
  const editedRecord: Record = {
    _id: record._id,
    user: user.authd._id,
    catno: form.catno,
    artists: form.artists,
    title: form.title,
    label: form.label,
    year: form.year,
    mixable: form.mixable,
    tracks: record.tracks,
  }
  const response = await records.updateRecord(editedRecord, user.authd.token)
  if (response === 400 || response === 401) {
    console.error(
      `EditRecordForm: record.updateRecord returned status ${response}`
    )
  } else if (response === 200) emit("close")
}

onBeforeUnmount(() => {
  records.errorMsg = ""
  records.toEdit = ""
})
</script>

<style scoped lang="scss"></style>
