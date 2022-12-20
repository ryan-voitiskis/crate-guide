<template>
  <div class="modal-header">
    <h2>
      <img src="@/assets/images/Spotify_Logo_RGB_Green.png" />audio features
    </h2>
    <button class="close" type="button" @click="tracks.toShowFeatures = ''">
      <XIcon />
    </button>
  </div>
  <div class="modal-body" v-if="track.audioFeatures">
    <iframe
      style="border-radius: 12px"
      :src="iframeSource"
      width="100%"
      height="152"
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    ></iframe>
    <hr />
    <p>
      All of this data is from Spotify's API. Please look at these properties
      having read the information available on
      <a
        href="https://developer.spotify.com/documentation/web-api/reference/#/operations/get-audio-features"
        class="link-text"
        target="_blank"
      >
        this page</a
      >.
    </p>

    <table class="features">
      <tr>
        <td><DanceIcon /></td>
        <td>Danceability</td>
        <td>{{ getPercent(track.audioFeatures.danceability) }}</td>
      </tr>
      <tr>
        <td><BoltIcon /></td>
        <td>Energy</td>
        <td>{{ getPercent(track.audioFeatures.energy) }}</td>
      </tr>
      <tr>
        <td><SmileIcon /></td>
        <td>Valence</td>
        <td>{{ getPercent(track.audioFeatures.valence) }}</td>
      </tr>
      <tr>
        <td><PianoIcon /></td>
        <td>Instrumentalness</td>
        <td>{{ getPercent(track.audioFeatures.instrumentalness) }}</td>
      </tr>
      <tr>
        <td><GuitarIcon /></td>
        <td>Acousticness</td>
        <td>{{ getPercent(track.audioFeatures.acousticness) }}</td>
      </tr>
      <tr>
        <td><SpeechIcon /></td>
        <td>Speechiness</td>
        <td>{{ getPercent(track.audioFeatures.speechiness) }}</td>
      </tr>
      <tr>
        <td><EqualizerIcon /></td>
        <td>Loudness*</td>
        <td>{{ track.audioFeatures.loudness.toFixed(1) }} dB</td>
      </tr>
      <tr>
        <td><SpeakerIcon /></td>
        <td>Liveness</td>
        <td>{{ getPercent(track.audioFeatures.liveness) }}</td>
      </tr>
    </table>
    <button class="see-raw" @click="state.seeRaw = !state.seeRaw">
      {{ state.seeRaw ? "Hide raw" : "See raw" }}
    </button>
    <table class="raw-features" v-if="state.seeRaw">
      <tr>
        <td>acousticness</td>
        <td>{{ track.audioFeatures.acousticness.toString() }}</td>
      </tr>
      <tr>
        <td>danceability</td>
        <td>{{ track.audioFeatures.danceability.toString() }}</td>
      </tr>
      <tr>
        <td>duration_ms</td>
        <td>{{ track.audioFeatures.duration_ms.toString() }}</td>
      </tr>
      <tr>
        <td>energy</td>
        <td>{{ track.audioFeatures.energy.toString() }}</td>
      </tr>
      <tr>
        <td>instrumentalness</td>
        <td>{{ track.audioFeatures.instrumentalness.toString() }}</td>
      </tr>
      <tr>
        <td>key</td>
        <td>{{ track.audioFeatures.key.toString() }}</td>
      </tr>
      <tr>
        <td>liveness</td>
        <td>{{ track.audioFeatures.liveness.toString() }}</td>
      </tr>
      <tr>
        <td>loudness</td>
        <td>{{ track.audioFeatures.loudness.toString() }}</td>
      </tr>
      <tr>
        <td>mode</td>
        <td>{{ track.audioFeatures.mode.toString() }}</td>
      </tr>
      <tr>
        <td>speechiness</td>
        <td>{{ track.audioFeatures.speechiness.toString() }}</td>
      </tr>
      <tr>
        <td>tempo</td>
        <td>{{ track.audioFeatures.tempo.toString() }}</td>
      </tr>
      <tr>
        <td>time_signature</td>
        <td>{{ track.audioFeatures.time_signature.toString() }}</td>
      </tr>
      <tr>
        <td>valence</td>
        <td>{{ track.audioFeatures.valence.toString() }}</td>
      </tr>
    </table>
    <p class="note">
      * <i>Loudness</i> is from an analysis of Spotify's digital file. Loudness
      of the vinyl release will likely differ.
    </p>
  </div>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import { trackStore } from "@/stores/trackStore"
import BoltIcon from "@/components/icons/BoltIcon.vue"
import DanceIcon from "@/components/icons/DanceIcon.vue"
import EqualizerIcon from "@/components/icons/EqualizerIcon.vue"
import getPercent from "@/utils/getPercent"
import GuitarIcon from "@/components/icons/GuitarIcon.vue"
import PianoIcon from "@/components/icons/PianoIcon.vue"
import SmileIcon from "@/components/icons/SmileIcon.vue"
import SpeakerIcon from "@/components/icons/SpeakerIcon.vue"
import SpeechIcon from "@/components/icons/SpeechIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
const tracks = trackStore()

const state = reactive({
  seeRaw: false,
})

const track = tracks.getTrackByIdFromCrateTrackList(tracks.toShowFeatures)!

const iframeSource = `https://open.spotify.com/embed/track/${track.spotifyID}?utm_source=generator`
</script>

<style scoped lang="scss">
h2 {
  display: flex;
  img {
    align-self: center;
    height: 38px;
    margin-right: 10px;
  }
}
table.features {
  width: 100%;
  gap: 10px;
  border-collapse: collapse;
  tr {
    border: none;
  }
  td {
    padding: 0;
    height: 38px;
    line-height: 38px;
    border: none;
  }
  td:first-child {
    color: var(--darker-text);
    width: 30px;
    svg {
      vertical-align: middle;
      height: 30px;
      width: 30px;
    }
  }
  td:nth-child(2) {
    padding: 0 16px;
    width: auto;
  }
  td:last-child {
    width: 100px;
  }
}

.note {
  color: var(--light-text);
  font-size: 12px;
  margin: 10px 0 0 0;
}

.see-raw {
  color: var(--primary);
  margin: 0 auto;
  display: block;
  border-radius: 0;
  background-color: transparent;
  &:hover {
    color: var(--primary-hover);
  }
}

.raw-features {
  width: 100%;
  border-collapse: collapse;
  td {
    border: none;
    height: 18px;
    line-height: 18px;
    padding: 0;
  }
  td:last-child {
    width: 100px;
  }
}
</style>
