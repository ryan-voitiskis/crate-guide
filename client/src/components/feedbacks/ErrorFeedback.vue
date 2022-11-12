<template>
  <transition name="drop">
    <span class="invalid" v-if="show"> <ExclamationIcon /> {{ msg }} </span>
  </transition>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import ExclamationIcon from "@/components/icons/ExclamationIcon.vue"

defineProps<{
  show: boolean
  msg: string
}>()
</script>

<style scoped lang="scss">
.invalid {
  grid-column: 1 / 3; // for use inside inline labels
  margin: 10px auto;
  left: 0;
  right: 0;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--error);
  svg {
    height: 24px;
    margin-right: 10px;
    color: var(--error);
  }
  &.modal-body {
    margin-bottom: 40px;
  }
}

.drop-enter-active {
  animation: drop-down-60 0.4s linear;
}

.drop-leave-active {
  animation: drop-up-60 0.4s linear;
}
</style>
