<template>
  <label :for="id">{{ label }}</label>
  <input
    v-bind="$attrs"
    :id="id"
    :placeholder="placeholder"
    :value="modelValue"
    @input="$emit('update:modelValue', handleInputChange($event))"
    :maxlength="maxlength"
    v-focus
  />
</template>

<script setup lang="ts">
import { defineProps, withDefaults } from "vue"

export interface Props {
  label?: string
  id: string
  placeholder?: string
  modelValue?: string | number
  focused?: boolean
  width?: string
  maxlength?: string
}

const props = withDefaults(defineProps<Props>(), {
  maxlength: "140",
})

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
