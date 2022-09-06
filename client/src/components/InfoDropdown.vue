<template>
  <div class="info-dropdown form-hint">
    <transition name="fade-in-out">
      <span v-if="state.info" v-html="text"></span>
    </transition>
    <button type="button" @click="state.info = !state.info">
      <transition name="fade-in">
        <InfoIcon v-if="!state.info" />
      </transition>
      <transition name="fade-in">
        <ChevronUpIcon v-if="state.info" />
      </transition>
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive } from "vue"
import InfoIcon from "./svg/InfoIcon.vue"
import ChevronUpIcon from "./svg/ChevronUpIcon.vue"

defineProps<{
  text: string
}>()

const state = reactive({
  info: false,
})
</script>

<style scoped lang="scss">
.info-dropdown {
  display: flex;
  justify-content: flex-end;
  flex-wrap: nowrap;
  span {
    display: inline;
    font-style: italic;
    color: var(--light-text);
  }
  button {
    margin-left: 0.6rem;
    width: 3.8rem;
    padding: 0 0.8rem;
  }
}

.fade-in-enter-active,
.fade-in-out-enter-active {
  animation: fade-in 0.4s linear;
}

.fade-in-out-leave-active {
  animation: fade-out 0.4s linear;
}
</style>
