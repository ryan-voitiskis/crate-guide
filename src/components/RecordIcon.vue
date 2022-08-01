<template>
  <svg
    :style="{
      animation: `rotation { spinRate } infinite linear`,
      animationPlayState: spinStatus,
    }"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    x="0px"
    y="0px"
    width="366.047px"
    height="366.046px"
    viewBox="0 0 366.047 366.046"
    xml:space="preserve"
    class="record-icon"
  >
    <g>
      <g>
        <g>
          <path
            d="M183.035,211.975c-15.981,0-28.985-13.006-28.985-28.981c0-15.982,13.003-28.985,28.985-28.985
				c15.982,0,28.971,13.003,28.971,28.985C212.006,198.969,199.023,211.975,183.035,211.975z"
          />
        </g>
        <g>
          <path
            d="M183.035,159.167c-13.153,0-23.845,10.686-23.845,23.827c0,13.141,10.691,23.83,23.845,23.83
				c13.142,0,23.83-10.689,23.83-23.83C206.865,169.846,196.183,159.167,183.035,159.167z"
          />
        </g>
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
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"

const props = defineProps<{
  isPlaying: boolean
  pitch: number
  rpm: number
}>()

const spinStatus = computed(() => (props.isPlaying ? "running" : "paused"))

// spinRate is duration of rotaion in seconds: req'd for rotate animation eg. 1.82s for 33rpm with 0% pitch adjustment
const spinRate = computed(
  () =>
    (((props.pitch * -0.0008 + 1) * 60) / props.rpm).toFixed(2).toString() + "s"
)
</script>

<style scoped lang="scss">
.record-icon {
  width: 305/450 * 100%;
  height: 100%;
  left: 6%;
  position: absolute;
  z-index: 1;
  animation: rotation v-bind(spinRate) infinite linear;
}

@keyframes rotation {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
