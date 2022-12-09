<template>
  <div class="modal-header">
    <h2>Edit record</h2>
    <button class="close" type="button" @click="records.toEdit = ''">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.catno"
        label="Catalog #"
        type="text"
        placeholder="CAT001 (optional)"
        :focused="true"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.artists"
        label="Artists"
        type="text"
        placeholder="Artist, Artist"
        required
      />
      <BasicInput
        v-model="form.title"
        label="Title"
        type="text"
        placeholder="Title"
        autocomplete="off"
        required
      />
      <BasicInput
        v-model="form.label"
        label="Label"
        type="text"
        placeholder="Label (optional)"
      />
      <BasicInput
        v-model="form.year"
        label="Year"
        placeholder="Year (optional)"
        type="text"
        inputmode="numeric"
        pattern="\d{4}"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.cover"
        label="Cover Image"
        type="text"
        placeholder="Image URL (optional)"
      />
      <ErrorFeedback :show="records.errorMsg !== ''" :msg="records.errorMsg" />
    </div>
    <div class="modal-footer">
      <button class="close" type="button" @click="records.toEdit = ''">
        Close
      </button>
      <button class="primary" type="submit">
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
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import Record from "@/interfaces/Record"
import XIcon from "@/components/icons/XIcon.vue"
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
  cover: record.cover,
})

// check if record has been edited, if not display noChangeMsg, else updateRecord
function submit() {
  if (
    form.catno?.trim() === record.catno &&
    form.artists.trim() === record.artists &&
    form.title.trim() === record.title &&
    form.label?.trim() === record.label &&
    form.year == record.year && // * not === as coersion desired
    form.cover === record.cover
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
      tracks: record.tracks,
      cover: form.cover.trim(),
    }
    records.updateRecord(editedRecord)
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
