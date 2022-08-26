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
  <span v-if="errorMsg != '' && errorMsg !== undefined" class="error-msg">{{
    errorMsg
  }}</span>
</template>

<script setup lang="ts">
import { defineProps } from "vue"

const props = defineProps<{
  label: string
  id: string
  placeholder: string
  modelValue: string | number
  focused: boolean
  errorMsg?: string
}>()

// custom directive to focus input el if focused prop. used to focus first input.
const vFocus = {
  mounted: (el: any) => {
    if (props.focused) el.focus()
  },
}

const handleInputChange = (event: Event) =>
  (event.target as HTMLInputElement).value
</script>

<style scoped lang="scss">
.error-msg {
  width: 100%;
  box-sizing: border-box;
  background: var(--error);
  padding: 0.5rem 1.5rem;
  margin: -0.5rem 0 1.5rem;
  border-radius: 1rem;
  position: relative;
  display: inline-block;
  color: var(--white-text);
  grid-column: 1/3; // for inline form layouts
}
.error-msg:before {
  content: "";
  width: 0;
  height: 0;
  border-left: 1rem solid transparent;
  border-right: 1rem solid transparent;
  border-bottom: 1rem solid var(--error);
  position: absolute;
  top: -10px;
  right: 2rem;
}
</style>
