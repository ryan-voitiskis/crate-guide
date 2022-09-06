<template>
  <form @submit.prevent="submit" @reset.prevent="reset()">
    <InfoDropdown text="TODO" />
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.position"
        id="position"
        label="Position"
        type="text"
        placeholder="A1"
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
        v-model="form.artists"
        id="artists"
        label="Artists"
        type="text"
        placeholder="Artists"
        required
      />
      <BasicInput
        v-model="form.duration"
        id="duration"
        label="Duration"
        type="number"
        placeholder="MM:SS"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.bpm"
        id="bpm"
        label="BPM"
        type="number"
        placeholder="BPM"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.rpm"
        id="rpm"
        label="RPM"
        type="number"
        placeholder="RPM"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.genre"
        id="genre"
        label="Genre"
        type="number"
        placeholder="Genre"
        autocomplete="off"
      />
      <label class="checkbox">
        <input type="checkbox" v-model="form.playable" /> Mixable
      </label>
      <ErrorFeedback :show="records.errorMsg !== ''" :msg="records.errorMsg" />
    </div>
    <div class="modal-controls">
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
import { reactive, onBeforeUnmount } from "vue"
import BasicInput from "./inputs/BasicInput.vue"
import InfoDropdown from "@/components/InfoDropdown.vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import UnsavedTrack from "@/interfaces/UnsavedTrack"
import { recordStore } from "@/stores/recordStore"
const records = recordStore()

const form = reactive({
  position: "",
  title: "",
  artists: "",
  duration: "",
  bpm: undefined,
  rpm: undefined,
  genre: "",
  playable: true,
})

const reset = () => {
  form.position = ""
  form.title = ""
  form.artists = ""
  form.duration = ""
  form.bpm = undefined
  form.rpm = undefined
  form.genre = ""
  form.playable = true
}

const submit = async () => {
  const unsavedTrack: UnsavedTrack = {
    position: form.position,
    title: form.title,
    artists: form.artists,
    duration: form.duration,
    bpm: form.bpm,
    rpm: form.rpm,
    genre: form.genre,
    playable: form.playable,
  }
  // const response = await records.addRecord(unsavedRecord, user.authd.token)
  // if (response === 400) {
  //   console.error(`AddRecordForm: record.addRecord returned status ${response}`)
  // } else if (response === 201) emit("close")
}

onBeforeUnmount(() => {
  records.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
