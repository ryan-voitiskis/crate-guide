<template>
  <div class="info-dropout">
    <div class="button-wrapper">
      <button type="button" @click="state.info = !state.info">
        <transition name="fade">
          <InfoIcon v-if="!state.info" />
        </transition>
        <transition name="fade">
          <ChevronUpIcon class="chevron-up" v-if="state.info" />
        </transition>
      </button>
    </div>
    <transition name="drop">
      <span v-if="state.info" v-html="text"></span>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive } from "vue"
import ChevronUpIcon from "@/components/icons/ChevronUpIcon.vue"
import InfoIcon from "@/components/icons/InfoIcon.vue"

defineProps<{
  text: string // animation keyframes set to max-height: 200px.
}>()

const state = reactive({
  info: false,
})
</script>

<style scoped lang="scss">
.info-dropout {
  font-size: 13px;
  display: flex;
  span {
    color: var(--light-text);
    align-self: center;
  }
  // wrapper exists to work around button resizing when fixed bug
  .button-wrapper {
    height: 38px;
    width: 38px;
    margin-right: 10px;
  }
  button {
    width: 38px;
    padding: 0 8px;
    svg {
      position: absolute;
    }
  }
}

.chevron-up {
  transform: rotate(-90deg);
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
