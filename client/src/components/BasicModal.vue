<!-- TODO: delete if unused after UI complete -->
<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"

defineProps({
  modalWidth: String,
})
</script>

<style scoped lang="scss">
.modal-backdrop {
  .modal {
    width: v-bind(modalWidth);
    text-align: center;
  }
}
</style>
