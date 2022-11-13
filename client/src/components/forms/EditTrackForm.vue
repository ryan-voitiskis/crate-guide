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
      <div class="spotify-analysed" v-if="track.audioFeatures">
        Spotify analysed
        <div class="spotify-duration">
          {{ getDurationString(track.audioFeatures.duration_ms) }}
        </div>
      </div>
      <BasicInput
        v-model="form.duration"
        id="duration"
        label="Duration"
        type="text"
        placeholder="MM:SS (optional)"
        autocomplete="off"
        pattern="^(?:(?:([01]?\d|2[0-3]):)?([0-5]?\d):)?([0-5]?\d)$"
      />
      <div class="spotify-analysed" v-if="track.audioFeatures?.tempo">
        Spotify analysed
        <div class="spotify-bpm">{{ track.audioFeatures.tempo }}</div>
      </div>
      <BasicInput
        v-model="form.bpm"
        id="bpm"
        label="BPM"
        placeholder="BPM (optional)"
        type="text"
        inputmode="numeric"
        pattern="\d{2,3}"
        autocomplete="off"
      />
      <div class="spotify-analysed" v-if="spotifyKeyString">
        Spotify analysed
        <div class="spotify-key">{{ spotifyKeyString }}</div>
      </div>
      <SelectInput
        v-model="form.key"
        id="key"
        label="Key"
        :options="keyOptions"
      />
      <div class="spotify-analysed" v-if="spotifyTimeSignature">
        Spotify estimated
        <div class="spotify-time-sig">{{ spotifyTimeSignature }}</div>
      </div>
      <SelectInput
        v-model="form.timeSignature"
        id="time_signature"
        label="Time signature"
        :options="timeSignatureOptions"
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
import { userStore } from "@/stores/userStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import RadioInput from "@/components/inputs/RadioInput.vue"
import getBPMColour from "@/utils/getBPMColour"
import XIcon from "@/components/icons/XIcon.vue"
import { Track } from "@/interfaces/Track"
import MatchedTrack from "@/interfaces/MatchedTrack"
import SelectInput from "../inputs/SelectInput.vue"
import { getDurationString, getDurationMs } from "@/utils/durationFunctions"
import {
  getTimeSignatureOptions,
  getTimeSignatureString,
  getTimeSignatureNumbers,
} from "@/utils/timeSignatures"
import {
  getKeyString,
  getCamelotString,
  getKeyColour,
  getKeyOptions,
} from "@/utils/pitchClassMap"

const records = recordStore()
const spotify = spotifyStore()
const tracks = trackStore()
const user = userStore()
// todo: get track from tracks. ...
const track = records.getTrackById(tracks.toEdit)
const record = records.getRecordByTrackId(track._id)
const noChangeMsg = "Track has not been edited."

const keyOptions = getKeyOptions(user.authd.settings.keyFormat)
const timeSignatureOptions = getTimeSignatureOptions()

const spotifyKeyString = track.audioFeatures
  ? track.audioFeatures.key !== -1
    ? user.authd.settings.keyFormat === "key"
      ? getKeyString(track.audioFeatures.key, track.audioFeatures.mode)
      : getCamelotString(track.audioFeatures.key, track.audioFeatures.mode)
    : "No key detected"
  : ""

const spotifyKeyColour =
  track.audioFeatures && track.audioFeatures.key !== -1
    ? getKeyColour(track.audioFeatures.key, track.audioFeatures.mode)
    : "#ddd"

const bpmColour = track.audioFeatures?.tempo
  ? getBPMColour(track.audioFeatures.tempo)
  : ""

const spotifyTimeSignature = track.audioFeatures
  ? `${track.audioFeatures.time_signature}/4`
  : ""

const initialTimeSignature =
  track.timeSignatureUpper && track.timeSignatureLower
    ? getTimeSignatureString(track.timeSignatureUpper, track.timeSignatureLower)
    : ""

const form = reactive({
  spotifyID: track.spotifyID,
  position: track.position,
  title: track.title,
  artists: track.artists,
  duration: track.duration ? getDurationString(track.duration) : "",
  bpm: track.bpm,
  rpm: track.rpm.toString(),
  genre: track.genre,
  timeSignature: initialTimeSignature,
  key:
    typeof track.mode === "number" && typeof track.key === "number"
      ? `${track.mode}${track.key}`
      : "",
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
    form.duration?.trim() ===
      (track.duration ? getDurationString(track.duration) : "") &&
    form.bpm === track.bpm &&
    parseInt(form.rpm) === track.rpm &&
    form.genre?.trim() === track.genre &&
    form.timeSignature === initialTimeSignature &&
    form.key === `${track.mode}${track.key}` &&
    form.playable === track.playable
  )
    tracks.errorMsg = noChangeMsg
  else {
    const timeSignatureArray = getTimeSignatureNumbers(form.timeSignature)
    const editedTrack: Track = {
      _id: track._id,
      position: form.position?.toUpperCase(),
      title: form.title.trim(),
      artists: form.artists?.trim(),
      duration: getDurationMs(form.duration?.trim()),
      bpm: form.bpm,
      rpm: parseInt(form.rpm),
      key: parseInt(form.key.slice(1, 3)),
      mode: parseInt(form.key.slice(0, 1)),
      genre: form.genre?.trim(),
      timeSignatureUpper: timeSignatureArray[0],
      timeSignatureLower: timeSignatureArray[1],
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
  margin: 2px 0;
}

.spotify-analysed {
  font-weight: 500;
  grid-column: 1/3;
  display: flex;
  width: 100%;
  justify-content: end;
  margin-bottom: -10px;
  .spotify-duration {
    font-style: italic;
    margin-left: 10px;
  }
  .spotify-bpm {
    margin-left: 10px;
    color: v-bind(bpmColour);
  }
  .spotify-key {
    font-weight: 500;
    margin-left: 10px;
    padding: 0 10px;
    border-radius: 6px;
    background-color: v-bind(spotifyKeyColour);
    color: var(--key-text);
  }
  .spotify-time-sig {
    font-style: italic;
    margin-left: 10px;
  }
}
</style>
