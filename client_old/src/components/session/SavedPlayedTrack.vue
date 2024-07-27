<template>
  <div class="rating" v-if="index > 0">
    <StarIcon :class="{ lit: rating > 0 }" />
    <StarIcon :class="{ lit: rating > 1 }" />
    <StarIcon :class="{ lit: rating > 2 }" />
    <StarIcon :class="{ lit: rating > 3 }" />
    <StarIcon :class="{ lit: rating > 4 }" />
  </div>
  <div class="played-track" v-if="foundTrack">
    <div class="cover"></div>
    <span class="position" v-if="foundTrack.position">{{
      foundTrack.position
    }}</span>
    <span class="catno">{{ foundTrack.catno }}</span>
    <span class="bpm" v-if="foundTrack.bpmFinal">
      {{ Math.round(foundTrack.bpmFinal).toString() }}
    </span>
    <span class="bpm-adjusted" v-if="playedTrack.adjustedBpm">
      @{{ Math.round(playedTrack.adjustedBpm).toString() }}
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
    <span class="title-artists">
      {{ foundTrack.title }} - {{ foundTrack.artistsFinal }}
    </span>
  </div>
  <div class="deleted" v-else>This track has been deleted</div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, onMounted, computed } from "vue"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import getBPMColour from "@/utils/getBPMColour"
import getPositionColour from "@/utils/positionColours"
import PlayedTrack from "@/interfaces/PlayedTrack"
import StarIcon from "../icons/StarIcon.vue"

const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  playedTrack: PlayedTrack
  index: number
}>()

const foundTrack =
  tracks.getTrackByIdFromTrackList(props.playedTrack._id) || null

const rating = computed(() =>
  props.playedTrack.transitionRating ? props.playedTrack.transitionRating : 0
)

const coverImg = foundTrack ? `url("${foundTrack.cover}")` : null

const keyColour = !foundTrack
  ? null
  : foundTrack.keyFinal
  ? foundTrack.keyFinal.colour
  : null

const bpmColour = !foundTrack
  ? null
  : foundTrack.bpmFinal
  ? getBPMColour(foundTrack.bpmFinal, user.authd.settings.theme)
  : null

const bpmAdjustedColour = props.playedTrack.adjustedBpm
  ? getBPMColour(props.playedTrack.adjustedBpm, user.authd.settings.theme)
  : null

const positionColour = !foundTrack
  ? null
  : foundTrack.position
  ? getPositionColour(foundTrack.position)
  : "hsl(0, 0%, 68%)"

const emit = defineEmits<{
  (e: "newTrackMounted"): void
}>()

onMounted(() => emit("newTrackMounted"))
</script>

<style scoped lang="scss">
.played-track {
  overflow: hidden;
  display: grid;
  grid-template-columns: 60px 30px 1fr 36px 50px 50px;
  grid-template-rows: 30px 30px;
  width: 100%;
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
    color: v-bind(bpmAdjustedColour);
    text-align: center;
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

.deleted {
  overflow: hidden;
  display: flex;
  justify-content: center;
  height: 60px;
  line-height: 60px;
  width: 100%;
  font-size: 16px;
  font-weight: 600;
}

.rating {
  display: flex;
  width: 100%;
  height: 20px;
  align-items: center;
  justify-content: center;
  svg {
    height: 18px;
    padding: 0 10px;
    &.lit {
      fill: hsl(51, 100%, 42%);
      color: hsl(51, 100%, 42%);
    }
  }
}
</style>
