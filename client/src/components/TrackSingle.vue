<template>
  <div class="track">
    <div class="details">
      <span class="position" v-if="position">{{ position }}</span>
      <span class="bpm" v-if="bpm">{{ bpm }}</span>
      <span class="title">{{ title }}</span>
      <span class="duration" v-if="duration">"{{ duration }}"</span>
      <span class="genre" v-if="genre">{{ genre }}</span>
    </div>
    <div class="controls">
      <button class="inline-button edit" @click="tracks.toEdit = _id">
        <PencilIcon />
      </button>
      <button class="inline-button delete" @click="tracks.toDelete = _id">
        <TrashIcon />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import { trackStore } from "@/stores/trackStore"
import PencilIcon from "./svg/PencilIcon.vue"
import TrashIcon from "./svg/TrashIcon.vue"
import * as d3 from "d3-interpolate"
const tracks = trackStore()

const props = defineProps<{
  _id: string
  position?: string
  bpm?: number
  title: string
  duration?: string
  genre?: string
}>()

const positionColours = [
  ["A", "hsl(342, 60%, 60%)"],
  ["B", "hsl(210, 60%, 55%)"],
  ["C", "hsl(157, 40%, 55%)"],
  ["D", "hsl(30, 71%, 65%)"],
  ["E", "hsl(89, 60%, 50%)"],
  ["F", "hsl(259, 60%, 66%)"],
  ["G", "hsl(55, 44%, 50%)"],
  ["H", "hsl(108, 44%, 50%)"],
  ["I", "hsl(342, 60%, 60%)"],
  ["J", "hsl(210, 60%, 55%)"],
  ["K", "hsl(157, 40%, 55%)"],
  ["L", "hsl(30, 71%, 65%)"],
  ["M", "hsl(89, 60%, 50%)"],
  ["N", "hsl(259, 60%, 66%)"],
  ["O", "hsl(55, 44%, 50%)"],
  ["P", "hsl(108, 44%, 50%)"],
  ["Q", "hsl(342, 60%, 60%)"],
  ["R", "hsl(210, 60%, 55%)"],
  ["S", "hsl(157, 40%, 55%)"],
  ["T", "hsl(30, 71%, 65%)"],
  ["U", "hsl(89, 60%, 50%)"],
  ["V", "hsl(259, 60%, 66%)"],
  ["W", "hsl(55, 44%, 50%)"],
  ["X", "hsl(108, 44%, 50%)"],
  ["Y", "hsl(342, 60%, 60%)"],
  ["Z", "hsl(210, 60%, 55%)"],
]

// returns text colour for position
// * computed because is reactive (eg. track edit changes position)
const positionColour = computed(() => {
  if (props.position) {
    for (let i = 0; i < positionColours.length; i++) {
      if (
        props.position.charAt(0).localeCompare(positionColours[i][0], "en", {
          sensitivity: "base",
        }) === 0
      )
        return positionColours[i][1]
    }
  }
  return "hsl(0, 0%, 68%)"
})

// returns text colour for bpm between c1 and c2. bpm clamped min - max
// * computed because is reactive (eg. track edit changes bpm)
const bpmColour = computed(() => {
  if (props.bpm) {
    const min = 80
    const max = 180
    const colour1 = "hsl(190, 94%, 55%)"
    const colour2 = "hsl(310, 87%, 46%)"
    const clampedBpm = Math.min(Math.max(props.bpm, min), max)
    return d3.interpolate(colour1, colour2)((clampedBpm - min) / (max - min))
  } else return null
})
</script>

<style scoped lang="scss">
.track {
  height: 3rem;
  display: flex;
  .details {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    span {
      line-height: 3rem;
    }
    .position {
      color: v-bind(positionColour);
      font-weight: 500;
      line-height: 3rem;
      margin: 0 0 0 1rem;
    }
    .bpm {
      color: v-bind(bpmColour);
      font-weight: 500;
      margin-left: 1rem;
    }
    .title {
      margin-left: 1rem;
    }
    .duration {
      color: var(--light-text);
      margin-left: 1rem;
    }
    .genre {
      color: var(--light-text);
      font-style: italic;
      margin-left: 1rem;
    }
  }
  .controls {
    margin-left: auto;
    flex-shrink: 0;
  }
}
</style>
