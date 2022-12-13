<template>
  <div class="fader-container">
    <input
      type="range"
      min="-100"
      max="100"
      class="fader"
      :class="{ sliding: session.decks[deckID].faderSliding }"
      list="fader_labels"
      v-model="session.decks[deckID].faderPosition"
      @mouseup="changePitch"
    />

    <div class="reset-fader" @click="resetPitch()"></div>
    <label class="reset-fader-label" @click="resetPitch()">reset</label>
    <span class="bpm-readable">
      {{ bpmReadable }}
    </span>
    <span class="pitch-readable">
      {{ pitchReadable }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps, watch } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { userStore } from "@/stores/userStore"
import { adjustKey } from "@/utils/keyFunctions"
const session = sessionStore()
const user = userStore()

const props = defineProps<{
  deckID: number
}>()

function changePitch(event: Event) {
  const target = event.target as HTMLInputElement
  if (target) session.decks[props.deckID].pitch = Number(target.value)
}

function resetPitch() {
  session.slideFader(props.deckID, 0)
  session.decks[props.deckID].pitch = 0
}

const pitchReadable = computed(
  () =>
    (session.decks[props.deckID].faderPosition >= 0 ? "+" : "") +
    (
      session.decks[props.deckID].faderPosition *
      0.01 *
      user.authd.settings.turntablePitchRange
    ).toFixed(1) +
    "%"
)

const bpmReadable = computed(() =>
  session.decks[props.deckID].adjustedBpmReadable?.toFixed(1)
)

// set adjustedBpmReadable when dependencies change
watch(
  () =>
    session.decks[props.deckID].loadedTrack?.bpmFinal
      ? (session.decks[props.deckID].faderPosition *
          0.0001 *
          user.authd.settings.turntablePitchRange +
          1) *
        session.decks[props.deckID].loadedTrack!.bpmFinal!
      : null,
  (bpm: number | null) =>
    (session.decks[props.deckID].adjustedBpmReadable = bpm)
)

// set adjustedBpm when dependencies change
watch(
  () =>
    session.decks[props.deckID].loadedTrack?.bpmFinal
      ? (session.decks[props.deckID].pitch *
          0.0001 *
          user.authd.settings.turntablePitchRange +
          1) *
        session.decks[props.deckID].loadedTrack!.bpmFinal!
      : null,
  (bpm: number | null) => (session.decks[props.deckID].adjustedBpm = bpm)
)

// set adjustedKey when dependencies change
watch(
  () =>
    session.decks[props.deckID].loadedTrack?.keyFinal &&
    session.decks[props.deckID].loadedTrack?.keyFinal
      ? adjustKey(
          session.decks[props.deckID].loadedTrack!.keyFinal!.key!,
          session.decks[props.deckID].pitch *
            0.0001 *
            user.authd.settings.turntablePitchRange +
            1
        )
      : null,
  (bpm: number | null) => (session.decks[props.deckID].adjustedKey = bpm)
)
</script>

<style scoped lang="scss">
.reset-fader {
  user-select: none;
  position: absolute;
  width: 28px;
  height: 28px;
  bottom: 11%;
  right: 18%;
  background: var(--deck-button);
  border: 3px solid var(--deck-button-border);
  border-radius: 50%;
  cursor: pointer;
  z-index: 3;
}

.reset-fader-label {
  font-size: 12px;
  user-select: none;
  position: absolute;
  color: var(--reset-text);
  width: 28px;
  height: 28px;
  bottom: 6.2%;
  right: 18%;
  z-index: 3;
}

.pitch-readable,
.bpm-readable {
  user-select: none;
  position: absolute;
  width: 3%;
  bottom: 11%;
  right: 13%;
  color: var(--pitch-readable);
  font: 800 18px/1.6 Digital7, sans-serif;
}

.pitch-readable {
  bottom: 11%;
}

.bpm-readable {
  bottom: 14%;
}

@mixin track() {
  width: 100%;
  height: 60;
  background: var(--fader-track);
}

@mixin thumb() {
  width: 14%;
  height: 100vw;
  background: linear-gradient(
    to left,
    hsl(0, 0%, 87%) 0%,
    hsl(0, 0%, 67%) 33%,
    hsl(0, 0%, 87%) 33%,
    hsl(0, 0%, 87%) 47%,
    hsl(0, 0%, 0%) 47%,
    hsl(0, 0%, 0%) 53%,
    hsl(0, 0%, 87%) 53%,
    hsl(0, 0%, 87%) 67%,
    hsl(0, 0%, 56%) 67%,
    hsl(0, 0%, 87%) 100%
  );
  border: none;
  border-radius: 0;
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
}

@mixin thumb-sliding() {
}

input[type="range"] {
  &,
  &::-webkit-slider-runnable-track,
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
  }
  overflow: hidden;
  height: 6%;
  width: 28%;
  border-radius: 0;
  position: absolute;
  bottom: 21%;
  right: -21.2%;
  padding: 0;
  margin: 0;
  transform: translate(-50%, -50%) rotate(90deg) scaleY(-1);
  background-color: var(--fader-bg);
  font-size: 1em;
  cursor: pointer;
  z-index: 2;
  transition: box-shadow 1600ms ease-out;

  &::-webkit-slider-runnable-track {
    @include track();
    height: 3px;
  }
  &::-moz-range-track {
    @include track();
  }
  &::-ms-track {
    @include track();
    border: none;
    color: transparent;
  }
  &::-webkit-slider-thumb {
    margin-top: -20em;
    @include thumb();
  }
  &::-moz-range-thumb {
    @include thumb();
  }
  // todo: is this required?
  &::-ms-thumb {
    margin-top: -20em;
    @include thumb();
  }
  &::-ms-fill-lower,
  &::-ms-tooltip {
    display: none;
  }
  &.sliding {
    box-shadow: var(--fader-sliding-shadow);
    transition: none;
  }
}
</style>
