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
}>()
</script>

<style scoped lang="scss">
.radio-card {
  width: 14rem;
  display: grid;
  grid-template-columns: 3rem auto;
  grid-template-rows: 8rem 3rem;
  margin: 0;
  background: #ddd;
  border-radius: 1rem;
  line-height: 3rem;
  overflow: hidden;
  .sample {
    grid-column: 1 / 3;
    background: #bbc087;
    height: 8rem;
  }
}
</style>
