<template>
  <div class="feedback-container">
    <transition name="fade">
      <span class="feedback saving" v-if="state.saving">
        <LoaderIcon /> Saving settings
      </span>
    </transition>
    <transition name="fade">
      <span class="feedback saved" v-if="state.saved">
        <CheckIcon /> Settings Saved
      </span>
    </transition>
    <transition name="fade">
      <span class="feedback failed" v-if="state.failed">
        <ExclamationIcon /> Failed to save settings
      </span>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import CheckIcon from "../svg/CheckIcon.vue"
import ExclamationIcon from "../svg/ExclamationIcon.vue"
import LoaderIcon from "../svg/LoaderIcon.vue"

const props = defineProps<{
  state: {
    saving: boolean
    saved: boolean
    failed: boolean
  }
}>()
</script>

<style scoped lang="scss">
.feedback-container {
  margin-top: 1rem;
  height: 2.4rem;
  .feedback {
    position: fixed;
    margin: 0 auto;
    left: 0;
    right: 0;
    font-size: 1.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--light-text);
    svg {
      height: 2.4rem;
      margin-right: 1rem;
    }
    &.saved svg {
      color: var(--success);
    }
    &.saving svg {
      color: var(--saving);
    }
    &.failed svg {
      color: var(--error);
    }
  }
}

.fade-enter-active {
  animation: fade-in 0.6s linear;
}
.fade-leave-active {
  animation: fade-out 0.6s linear;
}
</style>
