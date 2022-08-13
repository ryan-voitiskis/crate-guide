<template>
  <div class="invalid-creds-wrapper">
    <transition name="fade">
      <span class="invalid-creds" v-if="invalidCreds">
        <ExclamationIcon /> Invalid credentials
      </span>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import ExclamationIcon from "../svg/ExclamationIcon.vue"

const props = defineProps<{
  invalidCreds: boolean
}>()
</script>

<style scoped lang="scss">
.invalid-creds-wrapper {
  margin-top: 1rem;
  height: 2.4rem;
  .invalid-creds {
    position: fixed;
    margin: 0 auto;
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
}
.fade-enter-active {
  animation: fade-in 0.3s linear;
}
</style>
