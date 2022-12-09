<template>
  <div
    class="suggestion"
    :class="{ 'deck-2-suggestion': deckID === 1 }"
    @click="load"
  >
    <div class="cover"></div>
    <div class="top-row">
      <span class="position" v-if="track.position">{{ track.position }}</span>
      <span class="catno">{{ track.catno }}</span>
      <span class="title-artists">
        {{ track.title }} - {{ track.artistsFinal }}
      </span>
      <span class="genre" v-if="track.genre">{{ track.genre }}</span>
      <span class="year" v-if="track.year">{{ track.year }}</span>
    </div>
    <div class="bottom-row">
      <span class="bpm" v-if="track.bpmFinal">
        {{ Math.round(track.bpmFinal).toString() }}
      </span>
      <div class="time-signature" v-if="track.timeSignature">
        <sup>{{ track.timeSignature[0] }}</sup>
        <sub>{{ track.timeSignature[1] }}</sub>
      </div>
      <span class="duration" v-if="track.durationFinal">
        {{ getDurationString(track.durationFinal) }}
      </span>
      <span
        class="key"
        v-if="track.keyFinal"
        :class="{ long: user.authd.settings.keyFormat === 'key' }"
      >
        {{
          user.authd.settings.keyFormat === "key"
            ? track.keyFinal.keyString
            : track.keyFinal.camelotString
        }}
      </span>
      <span class="key-relation" v-if="track.harmonyScore?.harmonicAffinity">
        {{ (track.harmonyScore.harmonicAffinity * 100).toFixed(1) }}% -
        {{ keyCombinations[track.harmonyScore.keyCombination] }}
      </span>
      <span
        class="tempo-distance"
        v-if="typeof track.tempoScore?.pitchAdjustment === 'number'"
      >
        {{ (track.tempoScore.pitchAdjustment * 100).toFixed(1) }}% pitch adj.
      </span>
      <button
        class="audio-feature danceability"
        v-if="track.audioFeatures"
        @click.stop="tracks.toShowFeatures = track._id"
      >
        <DanceIcon />{{ getPercent(track.audioFeatures.danceability) }}
      </button>
      <button
        class="audio-feature energy"
        v-if="track.audioFeatures"
        @click.stop="tracks.toShowFeatures = track._id"
      >
        <BoltIcon />{{ getPercent(track.audioFeatures.energy) }}
      </button>
      <button
        class="audio-feature valence"
        v-if="track.audioFeatures"
        @click.stop="tracks.toShowFeatures = track._id"
      >
        <SmileIcon />{{ getPercent(track.audioFeatures.valence) }}
      </button>
    </div>
    <button class="play" @click="load">
      <PlayIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { getDurationString } from "@/utils/durationFunctions"
import { sessionStore } from "@/stores/sessionStore"
import { TrackScored } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import BoltIcon from "../icons/BoltIcon.vue"
import DanceIcon from "../icons/DanceIcon.vue"
import getBPMColour from "@/utils/getBPMColour"
import getPercent from "@/utils/getPercent"
import getPositionColour from "@/utils/positionColours"
import PlayIcon from "../icons/PlayIcon.vue"
import SmileIcon from "../icons/SmileIcon.vue"
import { keyCombinations } from "@/utils/keyFunctions"

const session = sessionStore()
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  track: TrackScored
  deckID: number
}>()

const loadTo = props.deckID === 1 ? 0 : 1

const coverImg = `url("${props.track.cover}")`

const keyColour = props.track.keyFinal ? props.track.keyFinal.colour : null

const bpmColour = props.track.bpmFinal
  ? getBPMColour(props.track.bpmFinal)
  : null

const positionColour = props.track.position
  ? getPositionColour(props.track.position)
  : "hsl(0, 0%, 68%)"

function load() {
  session.decks[props.deckID].adjustedBpm
    ? session.loadTrack(props.track._id, loadTo, true)
    : session.loadTrack(props.track._id, loadTo)
  session.loadTrackTo = -1
}
</script>

<style scoped lang="scss">
.suggestion {
  overflow: hidden;
  display: grid;
  grid-template-columns: 60px auto 40px;
  grid-template-rows: 30px 30px;
  width: 100%;
  transition: background-color 50ms linear;
  cursor: pointer;
  span {
    color: var(--dark-text);
    line-height: 30px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    margin: 0;
  }
  .cover {
    background-color: hsl(40, 13%, 82%);
    background-image: v-bind(coverImg);
    grid-area: 1 / 1 / 3 / 2;
    overflow: hidden;
    background-repeat: no-repeat;
    background-size: contain;
  }
  .top-row {
    overflow: hidden;
    display: grid;
    grid-template-columns: 40px 138px 1fr 1fr 40px;
    grid-template-rows: 30px;
    .position {
      grid-area: 1 / 1 / 2 / 2;
      text-align: center;
      color: v-bind(positionColour);
    }
    .catno {
      grid-area: 1 / 2 / 2 / 3;
    }
    .title-artists {
      padding-left: 8px;
      grid-area: 1 / 3 / 2 / 4;
    }
    .genre {
      grid-area: 1 / 4 / 2 / 5;
    }
    .year {
      grid-area: 1 / 5 / 2 / 6;
    }
  }
  .bottom-row {
    overflow: hidden;
    display: grid;
    grid-template-columns: 40px 28px 50px 60px 1fr 1fr 58px 58px 58px;
    grid-template-rows: 30px;
    .bpm {
      grid-area: 1 / 1 / 2 / 2;
      text-align: center;
      color: v-bind(bpmColour);
    }
    .time-signature {
      text-align: center;
      grid-area: 1 / 2 / 2 / 3;
      font-size: 18px;
      margin-top: -2px;
      height: 32px;
    }
    .duration {
      grid-area: 1 / 3 / 2 / 4;
      font-style: italic;
      text-align: center;
    }
    .key {
      grid-area: 1 / 4 / 2 / 5;
      height: 26px;
      width: 100%;
      line-height: 26px;
      align-self: center;
      font-weight: 500;
      padding: 0 10px;
      border-radius: 6px;
      background-color: v-bind(keyColour);
      color: var(--key-text);
      text-align: center;
      &.long {
        font-size: 12px;
      }
    }
    .key-relation {
      grid-area: 1 / 5 / 2 / 6;
      padding-left: 8px;
      font-style: italic;
    }
    .tempo-distance {
      grid-area: 1 / 6 / 2 / 7;
      padding-left: 8px;
      font-style: italic;
    }
    .audio-feature {
      height: 30px;
      line-height: 30px;
      border-radius: 0;
      height: 100%;
      width: 58px;
      margin: 0 -5px;
      background-color: transparent;
      padding: 0;
      font-size: 12px;

      svg {
        width: 18px;
        margin-right: 1px;
      }
      &:hover {
        background-color: var(--track-features-hover);
      }
    }
    .danceability {
      grid-area: 1 / 7 / 2 / 8;
    }
    .energy {
      grid-area: 1 / 8 / 2 / 9;
    }
    .valence {
      grid-area: 1 / 9 / 2 / 10;
    }
  }
  .play {
    grid-area: 1 / 3 / 3 / 4;
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    border-radius: 0;
    background-color: transparent;
    color: var(--play-button);
    svg {
      fill: transparent;
      transition: fill 80ms linear;
    }
  }
  &:hover {
    background-color: var(--track-hover);
    .play {
      svg {
        color: var(--play-button);
        fill: var(--play-button);
      }
    }
  }
  &:nth-child(even) {
    background-color: var(--even-row-bg);
    &:hover {
      background-color: var(--track-hover);
    }
  }
}

.deck-2-suggestion {
  .play {
    svg {
      transform: rotate(180deg);
    }
  }
}

@media (max-width: 1830px) {
  .play {
    svg {
      transform: rotate(90deg);
    }
  }

  .deck-2-suggestion {
    .play {
      svg {
        transform: rotate(-90deg);
      }
    }
  }
}
</style>
