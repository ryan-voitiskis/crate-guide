<template>
  <span v-if="props.saved" class="saved">
    Saved:&nbsp;
    <span class="saved-bpm">
      {{ props.saved.toFixed(1) }}
    </span>
  </span>
  <span v-if="state.lastBpm !== 0" class="last">
    Last:&nbsp;
    <span class="last-bpm">
      {{ state.lastBpm.toFixed(1) }}
    </span>
  </span>
  <div @click="tap()" class="bpm-tapper">
    <span v-if="state.bpm !== 0">{{ state.bpm.toFixed(1) }}</span>
    <span v-if="state.showTapPrompt" class="tap-text">Tap</span>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive, computed } from "vue"
import getBPMColour from "@/utils/getBPMColour"

const props = defineProps<{
  saved?: number
}>()

const state = reactive({
  bpm: 0,
  lastBpm: 0,
  tapCount: 0,
  initialTime: 0,
  showBpm: false,
  showTapPrompt: true,
})

const reset = () => {
  state.lastBpm = state.bpm
  state.bpm = 0
  state.tapCount = 0
  state.showBpm = false
  state.showTapPrompt = true
}

let timeout = setTimeout(reset, 0)

const tap = () => {
  if (state.tapCount === 0) {
    state.initialTime = Date.now()
    state.showTapPrompt = false
  } else {
    state.bpm = 60000 / ((Date.now() - state.initialTime) / state.tapCount)
    state.showBpm = true
  }
  state.tapCount++
  clearTimeout(timeout)
  timeout = setTimeout(reset, 2000)
}

const bpmColour = computed(() =>
  state.bpm ? getBPMColour(state.bpm) : "white"
)
const savedBpmColour = computed(() =>
  props.saved ? getBPMColour(props.saved) : null
)
const lastBpmColour = computed(() => getBPMColour(state.lastBpm))
</script>

<style scoped lang="scss">
.last,
.saved {
  color: var(--bpm-last-saved-label);
  font-weight: 500;
  position: absolute;
  height: 5%;
  width: 10%;
  right: 8%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.saved {
  bottom: 86%;
  .saved-bpm {
    font-weight: 600;
    color: v-bind(savedBpmColour);
  }
}

.last {
  bottom: 83%;
  .last-bpm {
    font-weight: 600;
    color: v-bind(lastBpmColour);
  }
}

.bpm-tapper {
  color: v-bind(bpmColour);
  font-weight: 600;
  user-select: none;
  position: absolute;
  width: 10%;
  height: calc(10% / 7 * 9);
  bottom: 70%;
  right: 8%;
  display: flex;
  background: var(--bpm-tap-btn);
  border-radius: 50%;
  justify-content: center;
  align-items: center;
  transition: all 450ms cubic-bezier(0.19, 1, 0.22, 1);
  outline: 0.2rem dotted;
  outline-color: v-bind(bpmColour);
  outline-offset: -0.1rem;
  &:active {
    outline-offset: 0.8rem;
  }
}

.tap-text {
  color: var(--bpm-tap-label);
}
</style>
