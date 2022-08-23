<template>
  <form @submit.prevent="submit" @reset.prevent="reset()">
    <InfoDropdown
      text="Catalog #, label and year are optional.<br />Catalog # recommended for discogs integration."
      class="form-hint"
    />
    <div class="form-body inline-labels">
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
    <div class="form-controls">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ records.loading ? null : "Save" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits } from "vue"
import BasicInput from "./BasicInput.vue"
import InfoDropdown from "@/components/InfoDropdown.vue"
import ErrorFeedback from "@/components/forms/ErrorFeedback.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import Record from "@/interfaces/Record"
const user = userStore()
const records = recordStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  catno: "",
  artists: "",
  title: "",
  label: "",
  year: "",
  mixable: true,
})

const submit = async () => {
  const newRecord: Record = {
    user: user.loggedIn._id,
    catno: form.catno,
    artists: form.artists,
    title: form.title,
    label: form.label,
    year: form.year,
    mixable: form.mixable,
  }
  const response = await records.addRecord(newRecord, user.loggedIn.token)
  if (response === 400) {
    console.error(`AddRecordForm: record.addRecord returned status ${response}`)
  } else if (response === 201) emit("close")
}
</script>

<style scoped lang="scss"></style>
