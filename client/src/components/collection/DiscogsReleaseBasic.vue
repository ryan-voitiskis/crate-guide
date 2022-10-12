<template>
  <div class="record">
    <div class="cover" :style="backgroundImg"></div>
    <label class="checkbox-hitbox">
      <input type="checkbox" v-model="state.checked" />
    </label>
    <h3 class="title">{{ title }}</h3>
    <div class="label">
      <span class="catno">{{ catno }}</span> {{ label }}
      <span class="year">{{ year }}</span>
    </div>
    <span class="artists">{{ artists }}</span>
    <div class="controls">
      <button
        class="inline-btn delete"
        :disabled="records.checkboxed.length !== 0"
      >
        <TrashIcon />Remove from import
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive, computed } from "vue"
import { recordStore } from "@/stores/recordStore"
import TrashIcon from "../svg/TrashIcon.vue"
const records = recordStore()

const props = defineProps<{
  id: number
  catno: string
  title: string
  label: string
  artists: string
  year: number
  cover: string
}>()

const state = reactive({
  checked: false,
})

const backgroundImg = computed(() => {
  return `background-image: url("${props.cover}");`
})
</script>

<style scoped lang="scss">
.record {
  background: linear-gradient(to right, hsl(10, 24%, 96%), hsl(35, 24%, 96%));
  display: grid;
  grid-template-columns: 12rem 4fr 6fr;
  grid-template-rows: 4rem 2rem 3rem 3rem;
  width: 100%;
  .cover {
    grid-area: 1 / 1 / 5 / 2;
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
  }
  .checkbox-hitbox {
    grid-area: 1 / 1 / 5 / 2;
    z-index: 1;
  }
  h3.title {
    color: var(--darker-text);
    grid-area: 1 / 2 / 2 / 3;
    line-height: 4rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label {
    grid-area: 2 / 2 / 3 / 3;
    line-height: 2rem;
    font-size: 1.2rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    .catno {
      font-weight: 600;
    }
    .year {
      color: var(--light-text);
    }
  }
  .artists {
    grid-area: 3 / 2 / 4 / 3;
    line-height: 3rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    button {
      margin: 0 1rem;
      font-size: 1.2rem;
      &.add-track {
        float: right;
      }
      &:disabled {
        cursor: default;
        color: var(--lighter-text);
        svg {
          fill: var(--lighter-text);
        }
      }
    }
  }
}
</style>
