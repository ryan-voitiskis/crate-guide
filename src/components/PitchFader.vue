<template>
  <div>
    <div class="pitch-fader-container">
      <input
        type="range"
        min="-100"
        max="100"
        class="pitch-fader"
        orient="vertical"
        @change="emitPitch"
      />
    </div>
    <div class="pitch">{{ pitch }}</div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue"

export default defineComponent({
  name: "PitchFader",
  props: ["pitch"],
  setup(props, { emit }) {
    const emitPitch = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target) emit("changePitch", target.value)
    }

    return { emitPitch }
  },
})
</script>

<style scoped lang="scss">
.pitch-fader-container {
  width: 30/450 * 100%;
  height: 123/350 * 100%;
  background-image: url("./svg/dot-texture.svg");
  border-radius: 0;
  position: absolute;
  bottom: 42/350 * 100%;
  right: 19.5/450 * 100%;
  padding: 0;
  margin: 0;
}
.pitch-fader {
  -webkit-appearance: slider-vertical;
  position: absolute;
  width: 100%;
  height: 100%;
  margin: 0;
}
</style>
<!-- background-color: #DFDBE5; background-image: url("data:image/svg+xml,%3Csvg
xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4
4'%3E%3Cpath fill='%239C92AC' fill-opacity='0.4' d='M1
3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E"); -->
