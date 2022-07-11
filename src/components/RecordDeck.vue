<template>
  <div class="deck-wrapper-outer">
    <div class="deck-wrapper-inner">
      <div class="deck">
        <StartStopButton />
        <RpmSwitch speed="33" />
        <RpmSwitch speed="45" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue"
import StartStopButon from "@/components/StartStopButon.vue"
import StartStopButton from "./StartStopButton.vue"
import RpmSwitch from "./RpmSwitch.vue"

export default defineComponent({
  components: { StartStopButton, RpmSwitch },
  name: "RecordDeck",
  props: {
    msg: String,
  },
  data() {
    return {
      isPlaying: false,
      isLoaded: false,
      rpm: 33,
      pitch: 0,
    }
  },
  methods: {
    start() {
      console.log("Deck is playing.")
    },
    stop() {
      console.log("Deck is not playing.")
    },
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
