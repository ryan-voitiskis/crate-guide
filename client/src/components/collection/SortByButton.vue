<template>
  <button
    class="inline-btn"
    :class="{ active: active, reversed: reversed }"
    @click="active ? $emit('reverse') : $emit('activate')"
  >
    {{ title }} <ChevronUpIcon />
  </button>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import ChevronUpIcon from "../svg/ChevronUpIcon.vue"

defineProps<{
  title: string
  active: boolean
  reversed: boolean
}>()
</script>

<style scoped lang="scss">
button {
  width: 12rem;
  svg {
    transition: transform 0.4s;
  }
  &.active {
    font-weight: 600;
  }
  &.reversed {
    svg {
      transform: scaleY(-1);
    }
  }
}
</style>
