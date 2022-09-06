<template>
  <div class="modal-body" v-html="text"></div>
  <div class="modal-controls">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
defineProps<{
  text: string
}>()
</script>

<style scoped lang="scss"></style>
