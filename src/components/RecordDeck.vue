<template>
  <div class="deck-wrapper-outer">
    <div class="deck-wrapper-inner">
      <div class="deck">
        <StartStopButton />
        <RpmSwitch
          :speed="33"
          :isActive="this.rpm == 33"
          @activate="switchRPM"
        />
        <RpmSwitch
          :speed="45"
          :isActive="this.rpm == 45"
          @activate="switchRPM"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, reactive, toRefs } from "vue"
import StartStopButon from "@/components/StartStopButon.vue"
import StartStopButton from "./StartStopButton.vue"
import RpmSwitch from "./RpmSwitch.vue"

export default defineComponent({
  components: { StartStopButton, RpmSwitch },
  name: "RecordDeck",
  setup() {
    const state = reactive({
      isPlaying: false,
      isLoaded: false,
      rpm: 33,
      pitch: 0,
    })

    const start = () => {
      console.log("Deck started.")
    }

    const stop = () => {
      console.log("Deck stopped.")
    }

    const switchRPM = (speed: number) => {
      state.rpm = speed
    }

    return { ...toRefs(state), switchRPM }
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
