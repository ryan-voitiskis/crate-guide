<template>
  <label class="radio-card" :for="id" @input="$emit('update:modelValue', id)">
    <div class="sample">
      <div class="sample-primary"></div>
      <div class="sample-secondary"><XIcon /></div>
      <div class="sample-record record-one">
        <div class="sample-track"></div>
      </div>

      <div class="sample-record record-two">
        <div class="sample-track"></div>
      </div>
    </div>
    <input
      v-bind="$attrs"
      :name="name"
      type="radio"
      :id="id"
      :value="id"
      :checked="modelValue == id"
    />{{ label }}</label
  >
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import XIcon from "../icons/XIcon.vue"

defineProps<{
  label: string
  name: string
  id: string
  modelValue: string
  themeBackground: string
  themePrimary: string
  themeSecondary: string
  themeDarkText: string
  themeRecord: string
  themeTrackOdd: string
}>()
</script>

<style scoped lang="scss">
.radio-card {
  width: 140px;
  display: grid;
  grid-template-columns: 30px auto;
  grid-template-rows: 80px 30px;
  margin: 0;
  background: var(--radio-card-label);
  transition: background-color 800ms, color 800ms;
  border-radius: 10px;
  line-height: 30px;
  overflow: hidden;

  .sample {
    border: 1px solid var(--dark-text);
    border-radius: 10px 10px 0 0;
    grid-column: 1 / 3;
    display: grid;
    grid-template-columns: 4px 20px 1fr 8px 4px;
    grid-template-rows: 4px 8px 4px 28px 4px 28px 4px;
    background: v-bind(themeBackground);
    height: 80px;

    .sample-primary {
      background-color: v-bind(themePrimary);
      border-radius: 3px;
      grid-area: 2 / 2 / 3 / 3;
    }

    .sample-secondary {
      border-radius: 3px;
      background-color: v-bind(themeSecondary);
      display: flex;
      grid-area: 2 / 4 / 3 / 5;
      svg {
        color: v-bind(themeDarkText);
        height: 8px;
      }
    }

    .sample-primary {
      grid-area: 2 / 2 / 3 / 3;
    }

    .sample-record {
      width: 100%;
      height: 100%;
      background-color: v-bind(themeRecord);
      display: flex;
      justify-content: right;
      .sample-track {
        height: 50%;
        width: 50%;
        background-color: v-bind(themeTrackOdd);
      }
    }

    .record-one {
      grid-area: 4 / 2 / 5 / 5;
    }

    .record-two {
      grid-area: 6 / 2 / 7 / 5;
    }
  }
}
</style>
