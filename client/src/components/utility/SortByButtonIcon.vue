<template>
  <button
    class="sort-by-icon"
    :class="{ active: active, reversed: reversed }"
    @click="active ? $emit('reverse') : $emit('activate')"
  >
    <slot class="s" /><ChevronUpIcon />
  </button>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import ChevronUpIcon from "@/components/icons/ChevronUpIcon.vue"

defineProps<{
  active: boolean
  reversed: boolean
}>()
</script>

<style scoped lang="scss">
.sort-by-icon {
  font-weight: 500;
  color: var(--darker-text);
  background-color: transparent;
  border-radius: 0;
  height: 100%;
  line-height: 100%;
  padding: 0;
  svg {
    margin: 0;
    transition: transform 400ms;
    width: 18px;
  }
  &.active {
    color: var(--primary);
  }
  &.reversed {
    svg {
      transform: scaleY(-1);
    }
  }
  &:hover {
    background-color: transparent;
  }
}
</style>

<style lang="scss">
.sort-by-icon {
  svg {
    margin: 0;
    align-self: center;
    height: 18px;
  }
}
</style>
