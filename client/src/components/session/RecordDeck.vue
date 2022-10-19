<template>
  <div class="deck-wrapper-outer">
    <div class="deck-wrapper-inner">
      <div class="deck">
        <StartStopButton @stopStart="stopStart" />
        <RpmSwitch
          :speed="33"
          :isActive="state.rpm == 33"
          @activate="switchRPM"
        />
        <RpmSwitch
          :speed="45"
          :isActive="state.rpm == 45"
          @activate="switchRPM"
        />
        <PitchFader
          :pitch="state.pitch"
          @changePitch="changePitch"
          @resetPitch="resetPitch"
        />
        <RecordIcon
          :isPlaying="state.isPlaying"
          :pitch="state.pitch"
          :rpm="state.rpm"
        />
        <!-- <BPMTapper :saved="state.trackLoaded.rpm" /> -->
        <BPMTapper :saved="144" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive } from "vue"
import StartStopButton from "./StartStopButton.vue"
import RpmSwitch from "./RpmSwitch.vue"
import PitchFader from "./PitchFader.vue"
import RecordIcon from "./RecordIcon.vue"
import BPMTapper from "./BPMTapper.vue"
import Track from "@/interfaces/Track"

const props = defineProps<{
  deckID: number
}>()

const state = reactive({
  isPlaying: false,
  isLoaded: false,
  rpm: 33,
  pitch: 0, // range of -100 (-8% of rpm) to 100 (+8% of rpm)
  trackLoaded: {} as Track,
})

const stopStart = () => {
  state.isPlaying = !state.isPlaying
  console.log(
    `Deck ${props.deckID} ${state.isPlaying ? "playing." : "stopped."}`
  )
}

const switchRPM = (speed: number) => (state.rpm = speed)

const changePitch = (pitch: number) => (state.pitch = pitch)

const resetPitch = () => (state.pitch = 0)
</script>

<style scoped lang="scss">
.deck-wrapper-outer {
  flex-grow: 1;
  min-width: 600px;
  max-width: 900px;
}
.deck-wrapper-inner {
  padding-top: calc(350 / 450 * 100%);
  overflow: hidden;
  height: 0;
  position: relative;
}
.deck {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--deck-silver);
}
.rpm-switch-container {
  position: absolute;
  bottom: 1/35 * 100%;
  left: 20/35 * 100%;
  display: flex;
  justify-content: start;
}
</style>
