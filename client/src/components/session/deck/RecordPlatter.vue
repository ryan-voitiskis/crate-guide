<template>
  <div class="record-icon-wrapper">
    <svg
      width="366"
      height="366"
      viewBox="0 0 366 366"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="record-icon"
    >
      <circle cx="183" cy="183" r="183" fill="#000" />
      <circle cx="183" cy="183" r="181" fill="#d7d8dd" />
      <circle cx="183" cy="183" r="180" fill="#222" />
      <circle
        cx="183"
        cy="183"
        r="177.7"
        stroke="#d7d8dd"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-dasharray="0,3.303"
      />
      <circle
        cx="183"
        cy="183"
        r="174"
        stroke="#d7d8dd"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-dasharray="0,3.333333"
      />
      <circle
        cx="183"
        cy="183"
        r="170"
        stroke="#d7d8dd"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-dasharray="0,3.3702"
      />
      <circle
        cx="183"
        cy="183"
        r="167"
        stroke="#d7d8dd"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-dasharray="0,3.418"
      />
      <circle cx="183" cy="183" r="165" fill="#d7d8dd" />

      <g v-if="session.decks[deckID].loadedTrack?.recordID">
        <clipPath id="myClip">
          <circle cx="183" cy="183" r="51" />
        </clipPath>
        <circle cx="183" cy="183" r="164" fill="#000" />
        <circle cx="183" cy="183" r="162.2" fill="#151515" />
        <circle cx="183" cy="183" r="142" fill="#000" />
        <circle cx="183" cy="183" r="141" fill="#151515" />
        <circle cx="183" cy="183" r="122" fill="#000" />
        <circle cx="183" cy="183" r="121" fill="#151515" />
        <circle cx="183" cy="183" r="100" fill="#000" />
        <circle cx="183" cy="183" r="99" fill="#151515" />
        <circle cx="183" cy="183" r="66" fill="#030303" />
        <image
          :href="coverImg"
          height="104"
          width="104"
          clip-path="url(#myClip)"
          x="131"
          y="131"
        />
        <circle cx="183" cy="183" r="2" fill="#d7d8dd" />
      </g>

      <g class="slipmat" v-else>
        <circle cx="183" cy="183" r="164" fill="#222" />
        <circle
          cx="183"
          cy="183"
          r="146"
          stroke-width="10"
          stroke="#8c4394"
          fill="transparent"
        />
        <text
          x="183"
          y="160"
          class="slipmat-title"
          fill="#8c4394"
          :transform="deckID === 1 ? 'rotate(180, 183, 183)' : ''"
        >
          Crate
        </text>
        <text
          x="183"
          y="160"
          class="slipmat-title"
          fill="#b9adda"
          :transform="deckID === 0 ? 'rotate(180, 183, 183)' : ''"
        >
          Guide
        </text>
        <circle cx="183" cy="183" r="2" fill="#d7d8dd" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { userStore } from "@/stores/userStore"
const user = userStore()
const session = sessionStore()

const props = defineProps<{
  deckID: number
}>()

const spinState = computed(() =>
  session.decks[props.deckID].playing ? "running" : "paused"
)

// spinRate is duration of rotaion in seconds: required for rotate animation eg. 1.82s for 33rpm with 0% pitch adjustment
const spinRate = computed(
  () =>
    (
      ((session.decks[props.deckID].pitch *
        -0.0001 *
        user.authd.settings.turntablePitchRange +
        1) *
        60) /
      session.decks[props.deckID].rpm
    )
      .toFixed(2)
      .toString() + "s"
)

const coverImg = computed(() =>
  session.decks[props.deckID].loadedTrack?.cover
    ? session.decks[props.deckID].loadedTrack?.cover
    : ""
)
</script>

<style scoped lang="scss">
.record-icon-wrapper {
  animation: spin v-bind(spinRate) infinite linear;
  animation-play-state: v-bind(spinState);
  width: 660px;
  height: 100%;
  position: absolute;
  left: 2%;
  z-index: 1;
}

.record-icon {
  width: 100%;
  height: 100%;
  position: absolute;
  z-index: 3;
}

.record-label {
  overflow: hidden;
  background-repeat: no-repeat;
  background-size: contain;
  z-index: 2;
  width: 37.8%;
  height: 37.8%;
  left: 31.1%;
  bottom: 28.6%;
  position: absolute;

  background-image: v-bind(coverImg);
}

.slipmat-title {
  font-size: 5rem;
  font-weight: 600;
  letter-spacing: 0.1rem;
  text-anchor: middle;
  font-family: "Sonsie One", serif;
  user-select: none;
}
</style>
