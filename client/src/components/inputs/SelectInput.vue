<template>
  <label :for="id">{{ label }}</label>
  <select
    :value="modelValue"
    :id="id"
    :name="id"
    @input="$emit('update:modelValue', handleInputChange($event))"
    v-focus
  >
    <option v-for="option in options" :key="option.id" :value="option.id">
      {{ option.name }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import Option from "@/interfaces/SelectOption"

const props = defineProps<{
  label?: string
  id: string
  placeholder?: string
  modelValue?: string | number
  focused?: boolean
  options: Option[]
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
label {
  margin-right: 10px;
}
select {
  width: v-bind(width);
}
</style>
