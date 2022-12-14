<template>
  <label class="radio-card" :for="id" @input="$emit('update:modelValue', id)">
    <div class="sample"></div>
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

defineProps<{
  label: string
  name: string
  id: string
  modelValue: string
  deckBackground: string
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
    grid-column: 1 / 3;
    background: v-bind(deckBackground);
  }
}
</style>
