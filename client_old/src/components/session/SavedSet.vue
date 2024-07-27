<template>
  <div
    class="transition-history"
    :class="{ active: index === session.selectedSetIndex }"
    @click="$emit('view', index)"
  >
    <span class="name">{{ set.name ? set.name : "Untitled" }}</span>
    <span class="date-time">{{ createdAt }}</span>
    <button
      class="delete-set"
      @click="
        ;(session.setToDelete = props.set._id),
          (session.confirmDeleteSet = true)
      "
    >
      <TrashIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import Set from "@/interfaces/Set"
import TrashIcon from "../icons/TrashIcon.vue"
const session = sessionStore()

const props = defineProps<{
  set: Set
  index: number
}>()

const dateTime = new Date(props.set.createdAt!)
const createdAt = `${dateTime.toLocaleTimeString()}, ${dateTime.toLocaleDateString()}`
</script>

<style scoped lang="scss">
.transition-history {
  display: grid;
  grid-template-columns: auto 60px;
  grid-template-rows: 34px 26px;
  padding-left: 10px;
  margin-right: 7px;
  background-color: var(--item-bg);
  cursor: pointer;
  .name {
    grid-area: 1 / 1 / 2 / 2;
    font-weight: 600;
    font-size: 16px;
    line-height: 34px;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .date-time {
    grid-area: 2 / 1 / 3 / 2;
  }
  .delete-set {
    grid-area: 1 / 2 / 3 / 3;
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    border-radius: 0;
    background-color: transparent;
    &:hover {
      color: var(--delete);
    }
  }
  &:hover {
    background-color: var(--item-hover);
  }
  &.active {
    background-color: var(--item-active);
  }
}
</style>
