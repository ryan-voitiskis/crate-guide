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
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.spotifyID"
        id="spotify_id"
        label="Spotify ID"
        type="text"
        placeholder="Paste Spotify ID here"
      />
      <hr />
      <BasicInput
        v-model="form.position"
        id="position"
        label="Position"
        type="text"
        placeholder="A1 (optional)"
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
        placeholder="Artist, Artist (optional)"
      />
      <BasicInput
        v-model="form.duration"
        id="duration"
        label="Duration"
        type="text"
        placeholder="MM:SS (optional)"
        autocomplete="off"
        pattern="^(?:(?:([01]?\d|2[0-3]):)?([0-5]?\d):)?([0-5]?\d)$"
      />
      <BasicInput
        v-model="form.bpm"
        id="bpm"
        label="BPM"
        placeholder="BPM (recommended)"
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
        placeholder="Genre (recommended)"
        autocomplete="off"
      />
      <fieldset class="radio">
        <RadioInput v-model="form.rpm" name="rpm" id="33" label="33 rpm" />
        <RadioInput v-model="form.rpm" name="rpm" id="45" label="45 rpm" />
      </fieldset>
      <label class="checkbox">
        <input type="checkbox" v-model="form.playable" /> Mixable
      </label>
      <ErrorFeedback :show="spotify.errorMsg !== ''" :msg="spotify.errorMsg" />
      <ErrorFeedback :show="tracks.errorMsg !== ''" :msg="tracks.errorMsg" />
    </div>
    <div class="modal-footer">
      <button class="close" type="button" @click="$parent!.$emit('close')">
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
import { reactive, onBeforeUnmount, watch } from "vue"
import { recordStore } from "@/stores/recordStore"
import { spotifyStore } from "@/stores/spotifyStore"
import { trackStore } from "@/stores/trackStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import RadioInput from "@/components/inputs/RadioInput.vue"
import XIcon from "@/components/icons/XIcon.vue"
import Track from "@/interfaces/Track"
import MatchedTrack from "@/interfaces/MatchedTrack"

const records = recordStore()
const spotify = spotifyStore()
const tracks = trackStore()

const track = records.getTrackById(tracks.toEdit)
const record = records.getRecordByTrackId(track._id)

const noChangeMsg = "Track has not been edited."

const form = reactive({
  spotifyID: track.spotifyID,
  position: track.position,
  title: track.title,
  artists: track.artists,
  duration: track.duration,
  bpm: track.bpm,
  rpm: track.rpm.toString(),
  genre: track.genre,
  playable: track.playable,
})

// check if track has been edited, if not display noChangeMsg, else updateTrack
const submit = async () => {
  spotify.errorMsg = ""
  tracks.errorMsg = ""
  if (
    form.spotifyID === track.spotifyID &&
    form.position === track.position &&
    form.title.trim() === track.title &&
    form.artists?.trim() === track.artists &&
    form.duration?.trim() === track.duration &&
    form.bpm === track.bpm &&
    parseInt(form.rpm) === track.rpm &&
    form.genre?.trim() === track.genre &&
    form.playable === track.playable
  )
    tracks.errorMsg = noChangeMsg
  else {
    const editedTrack: Track = {
      _id: track._id,
      position: form.position?.toUpperCase(),
      title: form.title.trim(),
      artists: form.artists?.trim(),
      duration: form.duration?.trim(),
      bpm: form.bpm,
      rpm: parseInt(form.rpm),
      genre: form.genre?.trim(),
      playable: form.playable,
    }
    const newSpotifyID =
      track.spotifyID !== form.spotifyID?.trim() ? form.spotifyID?.trim() : ""
    if (newSpotifyID) {
      const matchedTrack: MatchedTrack = {
        recordID: record._id,
        trackID: track._id,
        spotifyTrackID: newSpotifyID,
      }
      await spotify.getTrackFeatures(matchedTrack)
    }
    await tracks.updateTrack(editedTrack)
    if (spotify.errorMsg === "" && tracks.errorMsg === "") tracks.toEdit = ""
  }
}

// when form inputs changed, remove noChangeMsg
watch(
  () => ({ ...form }),
  () => {
    if (tracks.errorMsg === noChangeMsg) tracks.errorMsg = ""
  }
)

onBeforeUnmount(() => {
  spotify.errorMsg = ""
  tracks.errorMsg = ""
  records.errorMsg = ""
})
</script>

<style scoped lang="scss">
hr {
  grid-column: 1 / 3;
}
</style>
