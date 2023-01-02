<template>
  <span v-if="savedTrackBpm" class="saved">
    Saved:&nbsp;
    <span class="saved-bpm">
      {{ savedTrackBpm.toFixed(1) }}
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
import { sessionStore } from "@/stores/sessionStore"
import { userStore } from "@/stores/userStore"
import getBPMColour from "@/utils/getBPMColour"

const session = sessionStore()
const user = userStore()

const props = defineProps<{
  deckID: number
}>()

const state = reactive({
  bpm: 0,
  lastBpm: 0,
  tapCount: 0,
  initialTime: 0,
  showBpm: false,
  showTapPrompt: true,
})

const savedTrackBpm = computed(
  () => session.decks[props.deckID].loadedTrack?.bpmFinal
)

function reset() {
  state.lastBpm = state.bpm
  state.bpm = 0
  state.tapCount = 0
  state.showBpm = false
  state.showTapPrompt = true
}

let timeout = setTimeout(reset, 0)

function tap() {
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
  state.bpm
    ? getBPMColour(
        state.bpm,
        user.authd.settings.turntableTheme === "black" ? "dark" : "light"
      )
    : "white"
)

const savedBpmColour = computed(() =>
  savedTrackBpm.value
    ? getBPMColour(
        savedTrackBpm.value,
        user.authd.settings.turntableTheme === "black" ? "dark" : "light"
      )
    : null
)

const lastBpmColour = computed(() =>
  getBPMColour(state.lastBpm, user.authd.settings.theme)
)
</script>

<style scoped lang="scss">
.last,
.saved {
  color: var(--bpm-last-saved-label);
  font-weight: 500;
  position: absolute;
  height: 5%;
  width: 10%;
  right: 14%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2;
}

.saved {
  bottom: 37%;
  .saved-bpm {
    font-weight: 600;
    color: v-bind(savedBpmColour);
  }
}

.last {
  bottom: 34%;
  .last-bpm {
    font-weight: 600;
    color: v-bind(lastBpmColour);
  }
}

.bpm-tapper {
  cursor: pointer;
  color: v-bind(bpmColour);
  font-weight: 600;
  user-select: none;
  position: absolute;
  width: 10%;
  height: 90px;
  bottom: 21%;
  right: 14%;
  display: flex;
  background: var(--deck-button);
  border: 3px solid var(--deck-button-border);
  border-radius: 50%;
  justify-content: center;
  align-items: center;
  transition: outline-color 450ms cubic-bezier(0.19, 1, 0.22, 1),
    outline-offset 450ms cubic-bezier(0.19, 1, 0.22, 1);
  outline: 3px dotted;
  outline-color: transparent;
  z-index: 2;
  &:active {
    outline-color: v-bind(bpmColour);
    outline-offset: 8px;
  }
}

.tap-text {
  color: var(--bpm-tap-label);
}
</style>
