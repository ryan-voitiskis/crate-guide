<template>
  <transition name="drop">
    <span class="invalid" v-if="show"> <ExclamationIcon /> {{ msg }} </span>
  </transition>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import ExclamationIcon from "@/components/svg/ExclamationIcon.vue"

defineProps<{
  show: boolean
  msg: string
}>()
</script>

<style scoped lang="scss">
.invalid {
  grid-column: 1 / 3; // for use inside inline labels
  margin: 1rem auto;
  left: 0;
  right: 0;
  font-size: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--error);
  svg {
    height: 2.4rem;
    margin-right: 1rem;
    color: var(--error);
  }
}

.drop-enter-active {
  animation: drop-down-60 0.4s linear;
}

.drop-leave-active {
  animation: drop-up-60 0.4s linear;
}
</style>
