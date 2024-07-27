<template>
  <div class="modal-header">
    <h2>
      Edit track
      <span>(from {{ records.getRecordNameByTrackId(tracks.toEdit) }})</span>
    </h2>
    <button class="close" type="button" @click="tracks.toEdit = ''">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <div class="modal-body inline-labels">
      <label for="spotify_id" class="spotify-id-label">
        Spotify ID
        <button
          class="icon-only-button"
          @click.prevent="state.showSpotifyIdTip = !state.showSpotifyIdTip"
        >
          <HelpIcon />
        </button>
      </label>
      <input
        id="spotify_id"
        placeholder="Paste Spotify ID here"
        v-model="form.spotifyID"
        type="text"
      />
      <transition name="drop">
        <span class="spotify-id-tip" v-show="state.showSpotifyIdTip">
          ID will be searched for on Spotify upon save.
        </span>
      </transition>
      <hr />
      <BasicInput
        id="position"
        v-model="form.position"
        label="Position"
        type="text"
        placeholder="A1 (optional)"
        pattern="[A-Za-z][0-9]?"
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
      <div class="spotify-analysed" v-if="track.audioFeatures">
        Spotify analysed
        <div class="spotify-duration">
          {{ getDurationString(track.audioFeatures.duration_ms) }}
        </div>
      </div>
      <BasicInput
        id="duration"
        v-model="form.duration"
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
        id="bpm"
        v-model="form.bpm"
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
        id="key"
        v-model="form.key"
        label="Key"
        :options="keyOptions"
      />
      <div class="spotify-analysed" v-if="spotifyTimeSignature">
        Spotify estimated
        <div class="spotify-time-sig">{{ spotifyTimeSignature }}</div>
      </div>
      <SelectInput
        id="time_signature"
        v-model="form.timeSignature"
        label="Time signature"
        :options="timeSignatureOptions"
      />
      <GenreInput
        id="genre"
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
      <ErrorFeedback :show="spotify.errorMsg !== ''" :msg="spotify.errorMsg" />
      <ErrorFeedback :show="tracks.errorMsg !== ''" :msg="tracks.errorMsg" />
    </div>
    <div class="modal-footer">
      <button class="close" type="button" @click="tracks.toEdit = ''">
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
import { reactive, onBeforeUnmount, watch, ref, Ref } from "vue"
import { getDurationString, getDurationMs } from "@/utils/durationFunctions"
import { recordStore } from "@/stores/recordStore"
import { spotifyStore } from "@/stores/spotifyStore"
import { Track } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import getBPMColour from "@/utils/getBPMColour"
import HelpIcon from "@/components/icons/HelpIcon.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import MatchedTrack from "@/interfaces/MatchedTrack"
import RadioInput from "@/components/inputs/RadioInput.vue"
import SelectInput from "../inputs/SelectInput.vue"
import XIcon from "@/components/icons/XIcon.vue"
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
} from "@/utils/keyFunctions"
import GenreInput from "../inputs/GenreInput.vue"

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

const state = reactive({
  showSpotifyIdTip: false,
})

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
  ? getBPMColour(track.audioFeatures.tempo, user.authd.settings.theme)
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

const genreState = reactive({
  genreInputIsEmpty: true,
  addOrClearMsg: false,
})
const genres: Ref<string[]> = ref(track.genre ? track.genre.split(", ") : [])

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

// check if track has been edited, if not display noChangeMsg, else updateTrack
async function submit() {
  if (genreState.genreInputIsEmpty) {
    spotify.errorMsg = ""
    tracks.errorMsg = ""
    const notKeyEmptied = track.key?.toString() !== "" && form.key !== ""
    if (
      form.spotifyID === track.spotifyID &&
      form.position === track.position &&
      form.title.trim() === track.title &&
      form.artists?.trim() === track.artists &&
      form.duration?.trim() ===
        (track.duration ? getDurationString(track.duration) : "") &&
      form.bpm === track.bpm &&
      parseInt(form.rpm) === track.rpm &&
      genres.value.join(", ") === track.genre &&
      form.timeSignature === initialTimeSignature &&
      form.key ===
        (track.mode && track.key ? `${track.mode}${track.key}` : "") &&
      notKeyEmptied &&
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
        genre: genres.value.join(", "),
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
  } else genreState.addOrClearMsg = true
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

.spotify-id-label {
  display: flex;
  button {
    color: var(--dark-text);
    background: transparent;
    border-radius: 0;
    svg {
      align-self: center;
      height: 22px;
      margin: 0 10px;
    }
    &:hover {
      color: var(--primary-hover);
    }
  }
}

.spotify-id-tip {
  color: var(--light-text);
  height: 28px;
  line-height: 28px;
  font-size: 14px;
  width: 100%;
  text-align: center;
  grid-column: 1 / 3;
}

.drop-enter-active {
  animation: drop-down-28 0.4s linear;
}

.drop-leave-active {
  animation: drop-up-28 0.4s linear;
}
</style>
