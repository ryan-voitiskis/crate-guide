<template>
  <div class="deck-wrapper-outer">
    <div class="deck-wrapper-inner">
      <div class="deck">
        <StartStopButton :deckID="deckID" />
        <button class="load-track" @click="session.loadTrackTo = deckID">
          Load track
        </button>
        <RpmSwitch :deckID="deckID" :speed="33" />
        <RpmSwitch :deckID="deckID" :speed="45" />
        <PitchFader :deckID="deckID" />
        <RecordIcon :deckID="deckID" />
        <BPMTapper :deckID="deckID" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import StartStopButton from "./StartStopButton.vue"
import RpmSwitch from "./RpmSwitch.vue"
import PitchFader from "./PitchFader.vue"
import RecordIcon from "./RecordIcon.vue"
import BPMTapper from "./BPMTapper.vue"
import { sessionStore } from "@/stores/sessionStore"
const session = sessionStore()

defineProps<{
  deckID: number
}>()
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
