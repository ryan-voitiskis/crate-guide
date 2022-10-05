<template>
  <div class="info-dropdown form-hint">
    <transition name="drop">
      <span v-if="state.info" v-html="text"></span>
    </transition>
    <div class="button-wrapper">
      <button type="button" @click="state.info = !state.info">
        <transition name="fade">
          <InfoIcon v-if="!state.info" />
        </transition>
        <transition name="fade">
          <ChevronUpIcon v-if="state.info" />
        </transition>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive } from "vue"
import InfoIcon from "./svg/InfoIcon.vue"
import ChevronUpIcon from "./svg/ChevronUpIcon.vue"

defineProps<{
  text: string // animation keyframes set to max-height: 200px.
}>()

const state = reactive({
  info: false,
})
</script>

<style scoped lang="scss">
.info-dropdown {
  font-size: 1.3rem;
  display: flex;
  justify-content: flex-end;
  flex-wrap: nowrap;
  span {
    display: inline;
    width: 100%;
    color: var(--light-text);
  }
  // wrapper exists to work around button resizing when fixed bug
  .button-wrapper {
    width: 3.8rem;
    margin-left: 0.6rem;
  }
  button {
    width: 3.8rem;
    padding: 0 0.8rem;
    svg {
      position: fixed;
    }
  }
}

.fade-enter-active {
  animation: fade-in 0.6s linear;
}

.drop-enter-active {
  animation: drop-down-200 0.4s linear;
}

.drop-leave-active {
  animation: drop-up-200 0.4s linear;
}
</style>
