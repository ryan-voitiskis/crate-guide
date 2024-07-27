<template>
  <label class="radio" :for="id" @input="$emit('update:modelValue', id)">
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

<style scoped lang="scss"></style>
