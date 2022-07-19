<template>
  <div class="fader-container">
    <input
      ref="faderEl"
      value="0"
      type="range"
      min="-100"
      max="100"
      class="fader"
      list="fader_labels"
      @input="emitPitch"
    />

    <label class="reset-fader" @click="emitPitchReset">
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="50" />
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">
        <text dominant-baseline="middle" x="50%" y="50%">reset</text>
      </svg>
    </label>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from "vue"

export default defineComponent({
  name: "PitchFader",
  props: ["pitch", "faderValue"],
  setup(props, { emit }) {
    const faderEl = ref<HTMLInputElement | null>(null)
    const emitPitch = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target) emit("changePitch", Number(target.value) * -1) // * -1 as input could not be reversed when vertical
    }
    const emitPitchReset = () => {
      emit("resetPitch")
      faderEl!.value!.value = "0"
    }
    return { emitPitch, emitPitchReset, faderEl }
  },
})
</script>

<style scoped lang="scss">
label.reset-fader {
  position: absolute;
  width: 3%;
  bottom: 7%;
  right: 18%;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  button {
    height: unset;
    width: 100%;
    background: #333;
    border: none;
    border-radius: 50%;
    aspect-ratio: 1;
    margin: 0;
  }
  svg {
    font-size: 2.2em;
    text {
      text-anchor: middle;
    }
  }
}

@mixin track() {
  box-sizing: border-box;
  width: 100%;
  height: 30/350 * 100%;
  background: #222;
}

@mixin thumb() {
  box-sizing: border-box;
  width: 10%;
  height: 100vw;
  background: #333;
  border: none;
  border-radius: 0;
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
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
  transform: translate(-50%, -50%) rotate(-90deg) scaleY(-1);
  background-color: #aaa;
  font-size: 1em;
  cursor: pointer;
  z-index: 2;

  &::-webkit-slider-runnable-track {
    @include track();
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
  &::-ms-thumb {
    margin-top: -20em; // todo: test w edge
    @include thumb();
  }

  &::-ms-fill-lower,
  &::-ms-tooltip {
    display: none;
  }
}
</style>
