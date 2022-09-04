<template>
  <div class="invalid-wrapper" v-if="showWrapper">
    <transition name="fade">
      <span class="invalid" v-if="show"> <ExclamationIcon /> {{ msg }} </span>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps } from "vue"
import ExclamationIcon from "@/components/svg/ExclamationIcon.vue"

const props = defineProps<{
  show: boolean
  msg: string
  notReserved?: boolean // optional prop for when error space isn't reserved
}>()

// show wrapper (purpose is to hold space to avoid resizing)
const showWrapper = computed(() => (props.notReserved ? props.show : true))
</script>

<style scoped lang="scss">
.invalid-wrapper {
  margin: 1rem 0;
  height: 2.4rem;
  .invalid {
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
