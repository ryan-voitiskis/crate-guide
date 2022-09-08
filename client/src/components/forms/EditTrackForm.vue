<template>
  <div class="modal-header">
    <h2>
      Edit track
      <span>(from {{ records.getRecordNameByTrackId(tracks.toEdit) }})</span>
    </h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <InfoDropdown text="TODO" />
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.position"
        id="position"
        label="Position"
        type="text"
        placeholder="A1"
        pattern="[A-Za-z][0-9]?"
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
      />
      <BasicInput
        v-model="form.duration"
        id="duration"
        label="Duration"
        type="text"
        placeholder="MM:SS"
        autocomplete="off"
        pattern="^(?:(?:([01]?\d|2[0-3]):)?([0-5]?\d):)?([0-5]?\d)$"
      />
      <BasicInput
        v-model="form.bpm"
        id="bpm"
        label="BPM"
        placeholder="BPM"
        type="text"
        inputmode="numeric"
        pattern="\d{2,3}"
        autocomplete="off"
      />
      <BasicInput
        v-model="form.genre"
        id="genre"
        label="Genre"
        type="text"
        placeholder="Genre"
        autocomplete="off"
      />
      <fieldset class="radio">
        <RadioInput v-model="form.rpm" name="rpm" id="33" label="33 rpm" />
        <RadioInput v-model="form.rpm" name="rpm" id="45" label="45 rpm" />
      </fieldset>
      <label class="checkbox">
        <input type="checkbox" v-model="form.playable" /> Mixable
      </label>
      <ErrorFeedback :show="tracks.errorMsg !== ''" :msg="tracks.errorMsg" />
    </div>
    <div class="modal-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ tracks.loading ? null : "Save" }}
        <LoaderIcon v-show="tracks.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onBeforeUnmount } from "vue"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import BasicInput from "./inputs/BasicInput.vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import InfoDropdown from "@/components/InfoDropdown.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import RadioInput from "./inputs/RadioInput.vue"
import XIcon from "@/components/svg/XIcon.vue"
import Track from "@/interfaces/Track"

const records = recordStore()
const tracks = trackStore()
const user = userStore()

const track = records.getTrackById(tracks.toEdit)

const form = reactive({
  position: track.position,
  title: track.title,
  artists: track.artists,
  duration: track.duration,
  bpm: track.bpm,
  rpm: track.rpm,
  genre: track.genre,
  playable: track.playable,
})

const submit = async () => {
  const editedTrack: Track = {
    _id: track._id,
    position: form.position.toUpperCase(),
    title: form.title,
    artists: form.artists,
    duration: form.duration,
    bpm: form.bpm,
    rpm: parseInt(form.rpm),
    genre: form.genre,
    playable: form.playable,
  }
  await tracks.updateTrack(editedTrack, user.authd.token)
}

onBeforeUnmount(() => {
  records.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
