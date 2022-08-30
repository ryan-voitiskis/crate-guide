<template>
  <label :for="id">{{ label }}</label>
  <slot />
  <input
    v-bind="$attrs"
    :id="id"
    :placeholder="placeholder"
    :value="modelValue"
    :type="passwordType"
    @input="$emit('update:modelValue', handleInputChange($event))"
  />
  <label class="show-password">
    <input type="checkbox" v-model="showPassword" /> Show password
  </label>
</template>

<script setup lang="ts">
import { defineProps, ref, computed } from "vue"

const props = defineProps<{
  label: string
  id: string
  placeholder: string
  modelValue: string | number
}>()

const showPassword = ref(false)
const passwordType = computed(() => (showPassword.value ? "text" : "password"))

const handleInputChange = (event: Event) =>
  (event.target as HTMLInputElement).value
</script>

<style scoped lang="scss">
label.show-password {
  justify-self: start;
  input[type="checkbox"] {
    width: unset;
  }
}
</style>
