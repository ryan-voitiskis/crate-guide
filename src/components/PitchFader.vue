<template>
  <div class="fader-container">
    <input
      id="fader"
      type="range"
      min="-100"
      max="100"
      class="fader"
      value="0"
      list="fader_labels"
      @input="emitPitch"
    />
    <datalist id="fader_labels">
      <option
        v-for="label in pitchLabels"
        v-bind:label="label.text"
        v-bind:value="label.value"
        v-bind:key="label.value"
      ></option>
    </datalist>
    <!-- <div class="readable">{{ pitchReadable }}%</div> -->
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from "vue"

export default defineComponent({
  name: "PitchFader",
  props: ["pitch"],
  setup(props, { emit }) {
    const pitchOptions = [{}]
    const pitchLabels = [
      { text: "-8", value: -100 },
      { text: "6", value: -75 },
      { text: "4", value: -50 },
      { text: "2", value: -25 },
      { text: "0", value: 0 },
      { text: "2", value: 25 },
      { text: "4", value: 50 },
      { text: "6", value: 75 },
      { text: "+8", value: 100 },
    ]
    const emitPitch = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target) emit("changePitch", Number(target.value) * -1) // * -1 as input could not be reversed when vertical
    }
    const pitchReadable = computed(() => (props.pitch * 0.08).toFixed(1))

    return { emitPitch, pitchReadable, pitchLabels }
  },
})
</script>

<style scoped lang="scss">
datalist {
  display: block;
  position: absolute;
  bottom: 7.6%;
  right: 10%;
  option {
    padding: 0;
  }
}

$thumb-w: 2.25em;
$track-w: 19.75em;
$track-h: 0.5em;
$thumb-h: 4 * $track-h;
$track-pad: 0.125em;
$thumb-sh-c: #111;
$track-bg: #999;

$diff-h: ($thumb-h - $track-h)/2;

@mixin track() {
  box-sizing: border-box;
  padding: $track-pad;
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
  cursor: ns-resize;
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
