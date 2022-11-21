<template>
  <div class="record-icon-wrapper">
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      width="366.047px"
      height="366.046px"
      fill="#161616"
      viewBox="0 0 366.047 366.046"
      xml:space="preserve"
      class="record-icon"
    >
      <g>
        <g>
          <g>
            <path
              d="M183.035,0.006C82.101,0.006,0,82.088,0,182.994c0,100.932,82.101,183.047,183.035,183.047
				c100.92,0,183.012-82.115,183.012-183.047C366.053,82.088,283.955,0.006,183.035,0.006z M159.295,25.452
				c1.144-0.505,11.646-4.906,29.613-4.906c15.903,0,32.524,3.441,49.41,10.238l2.57,1.027l-0.318,0.669l-41.139,83.95l-2.186-0.853
				c-2.757-1.06-5.939-1.619-9.212-1.619c-2.51,0-4.278,0.318-4.471,0.37l-2.377,0.486l-0.168-0.628L157.29,26.343L159.295,25.452z
				 M183.035,244.773c-34.059,0-61.753-27.693-61.753-61.75c0-34.077,27.694-61.783,61.753-61.783
				c34.062,0,61.757,27.712,61.757,61.783C244.804,217.08,217.098,244.773,183.035,244.773z"
            />
          </g>
        </g>
      </g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
      <g></g>
    </svg>
    <div class="record-label"></div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import { userStore } from "@/stores/userStore"
import { sessionStore } from "@/stores/sessionStore"
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

const coverImg = computed(
  () => `url("${session.decks[props.deckID].loadedTrack?.cover}")`
)
</script>

<style scoped lang="scss">
.record-icon-wrapper {
  animation: spin v-bind(spinRate) infinite linear;
  animation-play-state: v-bind(spinState);
  width: 610px;
  height: 100%;
  position: absolute;
  left: 6%;
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
