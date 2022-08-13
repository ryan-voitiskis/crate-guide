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

const props = defineProps<{
  label: string
  name: string
  id: string
  modelValue: string
}>()
</script>

<style scoped lang="scss">
.radio-card {
  width: 14rem;
  height: 12rem;
  background: #ddd;
  border-radius: 1rem;
  overflow: hidden;
  line-height: 4rem;
  &:not(:first-of-type) {
    margin-left: 1rem;
  }
  .sample {
    background: #bbc087;
    width: 100%;
    height: 8rem;
  }
}
</style>
