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

const props = defineProps({
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
  focused: {
    type: Boolean,
    default: false,
  },
})

// custom directive to focus input el if focused prop. used to focus first input.
const vFocus = {
  mounted: (el: any) => {
    if (props.focused) el.focus()
  },
}

const handleInputChange = (event: Event) =>
  (event.target as HTMLInputElement).value
</script>

<style scoped lang="scss"></style>
