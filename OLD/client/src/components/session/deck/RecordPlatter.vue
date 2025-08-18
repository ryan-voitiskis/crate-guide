<template>
  <div class="record-platter-wrapper">
    <svg
      width="366"
      height="366"
      viewBox="0 0 366 366"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="record-platter"
      ref="platter"
    >
      <!-- the platter ring -->
      <g>
        <circle r="183" fill="#000" />
        <circle r="181" fill="#d7d8dd" />
        <circle r="180" fill="#222" />
        <circle class="dots" r="177.7" stroke-dasharray="0,3.303" />
        <circle class="dots large" r="174" stroke-dasharray="0,3.33333" />
        <circle class="dots" r="170" stroke-dasharray="0,3.3702" />
        <circle class="dots" r="167" stroke-dasharray="0,3.418" />
        <circle r="165" fill="#d7d8dd" />
      </g>

      <!-- the record -->
      <g v-if="session.decks[deckID].loadedTrack?.recordID">
        <clipPath id="coverClip">
          <circle r="51" />
        </clipPath>
        <circle r="164" fill="#000" />
        <circle r="162.2" fill="#151515" />
        <circle r="142" fill="#000" />
        <circle r="141" fill="#151515" />
        <circle r="122" fill="#000" />
        <circle r="121" fill="#151515" />
        <circle r="100" fill="#000" />
        <circle r="99" fill="#151515" />
        <circle r="66" fill="#030303" />
        <image
          :href="coverImg"
          height="104"
          width="104"
          clip-path="url(#coverClip)"
          x="-52"
          y="-52"
        />
      </g>

      <!-- the slipmat -->
      <g class="slipmat" v-else>
        <circle r="164" fill="#222" />
        <circle r="146" stroke-width="10" stroke="#8c4394" fill="transparent" />
        <text
          y="-23"
          fill="#8c4394"
          :transform="deckID === 1 ? 'rotate(180)' : ''"
        >
          Crate
        </text>
        <text
          y="-23"
          fill="#b9adda"
          :transform="deckID === 0 ? 'rotate(180)' : ''"
        >
          Guide
        </text>
        <circle r="2" fill="#d7d8dd" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed, ref, watch } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { userStore } from "@/stores/userStore"
const user = userStore()
const session = sessionStore()

const props = defineProps<{
  deckID: number
}>()

const platter = ref<SVGElement>()

// duration of a full rotation in ms
const fullRotationDuration = computed(
  () =>
    (((session.decks[props.deckID].faderPosition *
      -0.0001 *
      user.authd.settings.turntablePitchRange +
      1) *
      60) /
      session.decks[props.deckID].rpm) *
    1000
)

let lastTime = 0 // timestamp of the last frame
let angle = 0 // current angle of rotation
let speedUpRotationDuration = 0 // duration of a full rotation in ms when speeding up
let slowDownRotationDuration = 0 // duration of a full rotation in ms when slowing down

function updateAnimation(time: number) {
  // if not playing or no platter exit function
  if (!platter.value) return
  if (!session.decks[props.deckID].playing) {
    slowDownRotationDuration = fullRotationDuration.value
    requestAnimationFrame(slowDownAnimation)
    return
  }

  const elapsedTime = time - lastTime

  // update the angle of rotation
  angle = (angle % 360) + (elapsedTime / fullRotationDuration.value) * 360

  // update transform property of the platter SVG element
  platter.value.style.transform = `rotate(${angle}deg)`

  lastTime = time

  // request next frame
  requestAnimationFrame(updateAnimation)
}

function speedUpAnimation(time: number) {
  if (!session.decks[props.deckID].playing || !platter.value) return
  const elapsedTime = time - lastTime
  angle = (angle % 360) + (elapsedTime / speedUpRotationDuration) * 360
  speedUpRotationDuration -= 200
  platter.value.style.transform = `rotate(${angle}deg)`
  lastTime = time
  if (speedUpRotationDuration <= fullRotationDuration.value)
    requestAnimationFrame(updateAnimation)
  else requestAnimationFrame(speedUpAnimation)
}

function slowDownAnimation(time: number) {
  if (!platter.value) return
  const elapsedTime = time - lastTime
  angle = (angle % 360) + (elapsedTime / slowDownRotationDuration) * 360
  slowDownRotationDuration += 200
  platter.value.style.transform = `rotate(${angle}deg)`
  lastTime = time
  if (slowDownRotationDuration <= 8000) requestAnimationFrame(slowDownAnimation)
}

// watch playing state, if playing, start animation
watch(
  () => session.decks[props.deckID].playing,
  (playing: boolean) => {
    if (playing) {
      speedUpRotationDuration = fullRotationDuration.value + 6000
      lastTime = performance.now()
      requestAnimationFrame(speedUpAnimation)
    }
  }
)

const coverImg = computed(() =>
  session.decks[props.deckID].loadedTrack?.cover
    ? session.decks[props.deckID].loadedTrack?.cover
    : ""
)
</script>

<style scoped lang="scss">
.record-platter-wrapper {
  width: 660px;
  height: 100%;
  position: absolute;
  left: 2%;
  z-index: 1;
}

.record-platter {
  width: 100%;
  height: 100%;
  position: absolute;
  z-index: 3;
  g {
    transform: translate(183px, 183px);
  }
  .dots {
    stroke: #d7d8dd;
    stroke-width: 1.6;
    stroke-linecap: round;
    &.large {
      stroke-width: 2.2;
    }
  }
  .slipmat {
    text {
      font-size: 5rem;
      font-weight: 600;
      letter-spacing: 0.1rem;
      text-anchor: middle;
      font-family: "Sonsie One", serif;
      user-select: none;
    }
  }
}
</style>
