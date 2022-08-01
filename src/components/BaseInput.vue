<template>
  <label :for="id">{{ label }}</label>
  <input
    v-bind="$attrs"
    :id="id"
    :placeholder="placeholder"
    :value="modelValue"
    @input="$emit('update:modelValue', handleInputChange($event))"
  />
</template>

<script setup lang="ts">
import { defineProps } from "vue"

defineProps({
  label: String,
  id: String,
  placeholder: {
    type: String,
    default: "",
  },
  modelValue: {
    type: [String, Number],
    default: "",
  },
})

const handleInputChange = (event: Event) =>
  (event.target as HTMLInputElement).value
</script>

<style scoped lang="scss"></style>
