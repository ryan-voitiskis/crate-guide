<template>
  <div class="modal-header">
    <h2>
      Add track <span>(to {{ records.getNameById(tracks.addTrackTo) }})</span>
    </h2>
    <button class="close" type="button" @click="tracks.addTrackTo = ''">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit" @reset.prevent="reset()">
    <div class="modal-body inline-labels">
      <BasicInput
        id="position"
        v-model="form.position"
        label="Position"
        type="text"
        placeholder="A1 (optional)"
        pattern="[A-Za-z][0-9]?"
        :focused="true"
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
        id="artists"
        v-model="form.artists"
        label="Artists"
        type="text"
        placeholder="Artist, Artist (optional)"
      />
      <BasicInput
        id="duration"
        v-model="form.duration"
        label="Duration"
        type="text"
        placeholder="MM:SS (optional)"
        autocomplete="off"
        pattern="^(?:(?:([01]?\d|2[0-3]):)?([0-5]?\d):)?([0-5]?\d)$"
      />
      <BasicInput
        id="bpm"
        v-model="form.bpm"
        label="BPM"
        placeholder="BPM (recommended)"
        type="text"
        inputmode="numeric"
        pattern="\d{2,3}"
        autocomplete="off"
      />
      <SelectInput
        id="key"
        v-model="form.key"
        label="Key"
        :options="keyOptions"
      />
      <SelectInput
        id="time_signature"
        v-model="form.timeSignature"
        label="Time signature"
        :options="timeSignatureOptions"
      />
      <GenreInput
        id="genres"
        :genres="genres"
        :addOrClearMsg="genreState.addOrClearMsg"
        @addGenre="addGenre"
        @removeGenre="removeGenre"
        @updateEmptyStatus="updateEmptyStatus"
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
    <div class="modal-footer">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="tracks.addTrackTo = ''">
        Close
      </button>
      <button class="primary" type="submit">
        {{ tracks.loading ? null : "Save" }}
        <LoaderIcon v-show="tracks.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onBeforeUnmount, ref, Ref } from "vue"
import { getDurationMs } from "@/utils/durationFunctions"
import { getKeyOptions } from "@/utils/keyFunctions"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import GenreInput from "../inputs/GenreInput.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import RadioInput from "@/components/inputs/RadioInput.vue"
import SelectInput from "../inputs/SelectInput.vue"
import UnsavedTrack from "@/interfaces/UnsavedTrack"
import XIcon from "@/components/icons/XIcon.vue"
import {
  getTimeSignatureOptions,
  getTimeSignatureNumbers,
} from "@/utils/timeSignatures"

const records = recordStore()
const tracks = trackStore()
const user = userStore()

const keyOptions = getKeyOptions(user.authd.settings.keyFormat)
const timeSignatureOptions = getTimeSignatureOptions()

const form = reactive({
  position: "",
  title: "",
  artists: "",
  duration: "",
  bpm: undefined,
  key: "",
  rpm: "33",
  genre: "",
  timeSignature: "",
  playable: true,
})

function reset() {
  form.position = ""
  form.title = ""
  form.artists = ""
  form.duration = ""
  form.bpm = undefined
  form.key = ""
  form.rpm = "33"
  form.genre = ""
  form.playable = true
}

const genreState = reactive({
  genreInputIsEmpty: true,
  addOrClearMsg: false,
})

const genres: Ref<string[]> = ref([])

function updateEmptyStatus(isEmpty: boolean) {
  genreState.genreInputIsEmpty = isEmpty
  if (isEmpty) genreState.addOrClearMsg = false
}

function addGenre(genre: string) {
  genres.value.push(genre)
  genreState.genreInputIsEmpty = true
  genreState.addOrClearMsg = false
}

function removeGenre(index: number) {
  return genres.value.splice(index, 1)
}

function submit() {
  if (genreState.genreInputIsEmpty) {
    const timeSignatureArray = getTimeSignatureNumbers(form.timeSignature)
    const unsavedTrack: UnsavedTrack = {
      position: form.position.toUpperCase(),
      title: form.title.trim(),
      artists: form.artists.trim(),
      duration: getDurationMs(form.duration?.trim()),
      bpm: form.bpm,
      key: parseInt(form.key.slice(1, 3)),
      mode: parseInt(form.key.slice(0, 1)),
      rpm: parseInt(form.rpm),
      genre: genres.value.join(", "),
      timeSignatureUpper: timeSignatureArray[0],
      timeSignatureLower: timeSignatureArray[1],
      playable: form.playable,
    }
    tracks.addTrack(unsavedTrack, tracks.addTrackTo)
  } else genreState.addOrClearMsg = true
}

onBeforeUnmount(() => {
  records.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
