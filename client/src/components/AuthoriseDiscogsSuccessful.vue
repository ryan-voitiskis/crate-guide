<template>
  <div class="modal-header">
    <h2>Authorisation successful</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import XIcon from "@/components/svg/XIcon.vue"
</script>

<style scoped lang="scss"></style>
