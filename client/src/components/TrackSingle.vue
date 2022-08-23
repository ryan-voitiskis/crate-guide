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
      <button class="inline-button edit"><PencilIcon /></button>
      <button class="inline-button delete"><TrashIcon /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import PencilIcon from "./svg/PencilIcon.vue"
import TrashIcon from "./svg/TrashIcon.vue"
import * as d3 from "d3-interpolate"

const props = defineProps<{
  position?: string
  bpm?: number
  title: string
  duration?: string
  genre?: string
}>()

// returns text colour for bpm between c1 and c2. bpm clamped min - max
const bpmColour = computed(() => {
  if (props.bpm) {
    const min = 80
    const max = 180
    const c1 = "rgb(31,212,248)"
    const c2 = "rgb(218,15,183)"
    const clampedBpm = Math.min(Math.max(props.bpm, min), max)
    return d3.interpolate(c1, c2)((clampedBpm - min) / (max - min))
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
      color: var(--light-text);
      line-height: 3rem;
      margin: 0 0 0 1rem;
    }
    .bpm {
      color: v-bind(bpmColour);
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
