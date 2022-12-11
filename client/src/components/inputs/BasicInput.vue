<template>
  <label :for="id">{{ label }}</label>
  <input
    v-bind="$attrs"
    :id="id"
    :placeholder="placeholder"
    :value="modelValue"
    @input="$emit('update:modelValue', handleInputChange($event))"
    v-focus
  />
</template>

<script setup lang="ts">
import { defineProps } from "vue"

const props = defineProps<{
  label?: string
  id: string
  placeholder?: string
  modelValue?: string | number
  focused?: boolean
  width?: string
}>()

// custom directive to focus input el if focused prop. used to focus first input.
const vFocus = {
  mounted: (el: any) => {
    if (props.focused) el.focus()
  },
}

function handleInputChange(event: Event) {
  return (event.target as HTMLInputElement).value
}
</script>

<style scoped lang="scss">
input {
  width: v-bind(width);
}
</style>
