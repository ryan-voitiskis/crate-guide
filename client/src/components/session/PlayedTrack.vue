<template>
  <TransitionRating v-if="index > 0" :index="index" />
  <div class="played-track">
    <div class="cover"></div>
    <span class="position" v-if="foundTrack.position">{{
      foundTrack.position
    }}</span>
    <span class="catno">{{ foundTrack.catno }}</span>
    <span class="bpm" v-if="foundTrack.bpmFinal">
      {{ Math.round(foundTrack.bpmFinal).toString() }}
    </span>
    <span class="bpm-adjusted" v-if="track.adjustedBpm">
      @{{ Math.round(track.adjustedBpm).toString() }}
    </span>
    <span
      class="key"
      v-if="foundTrack.keyFinal"
      :class="{ long: user.authd.settings.keyFormat === 'key' }"
    >
      {{
        user.authd.settings.keyFormat === "key"
          ? foundTrack.keyFinal.keyString
          : foundTrack.keyFinal.camelotString
      }}
    </span>
    <button class="delete" @click="remove">
      <TrashIcon />
    </button>
    <span class="title-artists">
      {{ foundTrack.title }} - {{ foundTrack.artistsFinal }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import getBPMColour from "@/utils/getBPMColour"
import getPositionColour from "@/utils/positionColours"
import TrashIcon from "../icons/TrashIcon.vue"
import TransitionRating from "@/components/session/TransitionRating.vue"
import PlayedTrack from "@/interfaces/PlayedTrack"

const session = sessionStore()
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  track: PlayedTrack
  index: number
}>()

const foundTrack = tracks.getTrackByIdFromTrackList(props.track._id)!

const coverImg = `url("${foundTrack.cover}")`

const keyColour = foundTrack.keyFinal ? foundTrack.keyFinal.colour : null

const bpmColour = foundTrack.bpmFinal ? getBPMColour(foundTrack.bpmFinal) : null

const positionColour = foundTrack.position
  ? getPositionColour(foundTrack.position)
  : "hsl(0, 0%, 68%)"

const remove = () => {
  if (session.history.length !== props.index + 1) {
    console.log(session.history.length, props.index)
    session.history[props.index + 1].transitionFromRating = null
  }
  session.history.splice(props.index, 1)
}
</script>

<style scoped lang="scss">
.played-track {
  overflow: hidden;
  display: grid;
  grid-template-columns: 60px 30px 1fr 36px 50px 50px 30px;
  grid-template-rows: 30px 30px;
  width: 100%;
  transition: background-color 50ms linear;
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
  .position {
    grid-area: 1 / 2 / 2 / 3;
    width: 30px;
    text-align: center;
    color: v-bind(positionColour);
  }
  .catno {
    grid-area: 1 / 3 / 2 / 4;
  }
  .bpm {
    grid-area: 1 / 4 / 2 / 5;
    color: v-bind(bpmColour);
    text-align: center;
  }
  .bpm-adjusted {
    grid-area: 1 / 5 / 2 / 6;
    color: v-bind(bpmColour);
    text-align: center;
  }
  .key {
    grid-area: 1 / 6 / 2 / 7;
    height: 26px;
    line-height: 26px;
    align-self: center;
    font-weight: 500;
    width: 100%;
    border-radius: 6px;
    background-color: v-bind(keyColour);
    color: var(--key-text);
    text-align: center;
    &.long {
      font-size: 12px;
    }
  }
  .title-artists {
    padding-left: 8px;
    grid-area: 2 / 2 / 3 / 7;
  }
  .delete {
    grid-area: 1 / 7 / 3 / 8;
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    border-radius: 0;
    background-color: transparent;
  }
}
</style>
