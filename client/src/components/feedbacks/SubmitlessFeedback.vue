<template>
  <div class="feedback-container">
    <transition name="fade">
      <span class="feedback saving" v-if="user.loading">
        <LoaderIcon /> Saving...
      </span>
    </transition>
    <transition name="fade">
      <span class="feedback saved" v-if="user.success">
        <CheckIcon /> Settings saved
      </span>
    </transition>
    <transition name="fade">
      <span class="feedback failed" v-if="user.errorMsg !== ''">
        <ExclamationIcon />
        Error: {{ user.errorMsg ? user.errorMsg : "Failed to save settings" }}
      </span>
    </transition>
  </div>
</template>

<script setup lang="ts">
import CheckIcon from "@/components/icons/CheckIcon.vue"
import ExclamationIcon from "@/components/icons/ExclamationIcon.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
const user = userStore()
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
    &.saved {
      color: var(--success);
    }
    &.saving {
      color: var(--saving);
    }
    &.failed {
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
