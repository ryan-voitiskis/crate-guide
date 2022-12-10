<template>
  <div
    class="transition-history"
    :class="{ active: index === selectedHistoryIndex }"
    @click="$emit('view', index)"
  >
    <span class="name">{{ history.name ? history.name : "Untitled" }}</span>
    <span class="date-time">{{ createdAt }}</span>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import TransitionHistory from "@/interfaces/TransitionHistory"

const props = defineProps<{
  history: TransitionHistory
  index: number
  selectedHistoryIndex: number
}>()

const createdAt = new Date(props.history.createdAt!).toLocaleDateString()
</script>

<style scoped lang="scss">
.transition-history {
  padding-left: 10px;
  margin-right: 7px;
  background-color: var(--item-bg);
  cursor: pointer;
  .name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &:hover {
    background-color: var(--item-hover);
  }
  &.active {
    background-color: var(--item-active);
  }
}
</style>
