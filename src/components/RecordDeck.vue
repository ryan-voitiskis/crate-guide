<template>
  <div class="deck-wrapper-outer">
    <div class="deck-wrapper-inner">
      <div class="deck">
        <StartStopButton @stopStart="stopStart" />
        <RpmSwitch :speed="33" :isActive="rpm == 33" @activate="switchRPM" />
        <RpmSwitch :speed="45" :isActive="rpm == 45" @activate="switchRPM" />
        <PitchFader
          :pitch:number="pitch"
          @changePitch="changePitch"
          @resetPitch="resetPitch"
        />
        <RecordIcon :isPlaying="isPlaying" :pitch="pitch" :rpm="rpm" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, reactive, toRefs } from "vue"
import StartStopButton from "./StartStopButton.vue"
import RpmSwitch from "./RpmSwitch.vue"
import PitchFader from "./PitchFader.vue"
import RecordIcon from "@/components/RecordIcon.vue"

export default defineComponent({
  components: { StartStopButton, RpmSwitch, PitchFader, RecordIcon },
  name: "RecordDeck",
  props: ["deckID"],
  setup(props) {
    const state = reactive({
      isPlaying: false,
      isLoaded: false,
      rpm: 33,
      pitch: 0, // range of -100 (-8% of rpm) to 100 (+8% of rpm)
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

    return { ...toRefs(state), switchRPM, changePitch, stopStart, resetPitch }
  },
})
</script>

<style scoped lang="scss">
.deck-wrapper-outer {
  margin: 1rem;
  flex-grow: 1;
  min-width: 600px;
  max-width: 900px;
  box-sizing: border-box;
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
