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
      <circle cx="183" cy="183" r="181" fill="url(#gradient_silver)" />
      <circle cx="183" cy="183" r="180" fill="url(#gradient)" />
      <circle
        cx="183"
        cy="183"
        r="177.7"
        stroke="url(#gradient_silver)"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-dasharray="0,3.303"
      />
      <circle
        cx="183"
        cy="183"
        r="174"
        stroke="url(#gradient_silver)"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-dasharray="0,3.333333"
      />
      <circle
        cx="183"
        cy="183"
        r="170"
        stroke="url(#gradient_silver)"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-dasharray="0,3.3702"
      />
      <circle
        cx="183"
        cy="183"
        r="167"
        stroke="url(#gradient_silver)"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-dasharray="0,3.418"
      />
      <circle cx="183" cy="183" r="165" fill="url(#gradient_silver)" />
      <circle cx="183" cy="183" r="164" fill="#000" />
      <circle cx="183" cy="183" r="163" fill="#181818" />
      <circle cx="183" cy="183" r="139" fill="#000" />
      <circle cx="183" cy="183" r="138" fill="#181818" />
      <circle cx="183" cy="183" r="109" fill="#000" />
      <circle cx="183" cy="183" r="108" fill="#181818" />
      <circle cx="183" cy="183" r="79" fill="#000" />
      <circle cx="183" cy="183" r="78" fill="#181818" />
      <circle cx="183" cy="183" r="52" fill="#000" />
      <circle cx="183" cy="183" r="51" fill="#f9f2de" />
      <circle cx="183" cy="183" r="2" fill="#000" />

      <defs>
        <linearGradient
          id="gradient_silver"
          gradientUnits="userSpaceOnUse"
          x1="183"
          y1="0"
          x2="183"
          y2="366"
          gradientTransform="rotate(-30)"
        >
          <stop offset="0" stop-color="#8f8d97" />
          <stop offset="1" stop-color="#d7d8dd" />
        </linearGradient>
        <linearGradient
          id="gradient"
          gradientUnits="userSpaceOnUse"
          x1="183"
          y1="0"
          x2="183"
          y2="366"
          gradientTransform="rotate(-30)"
        >
          <stop offset="0" stop-color="#111" />
          <stop offset="1" stop-color="#333" />
        </linearGradient>
      </defs>
    </svg>
    <div class="record-label"></div>
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
    ? `url("${session.decks[props.deckID].loadedTrack?.cover}")`
    : null
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
</style>
