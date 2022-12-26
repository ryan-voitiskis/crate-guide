<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal" :class="{ full: fullHeight, dynamic: !fullHeight }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  withDefaults,
  defineProps,
  onMounted,
  defineEmits,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
} from "vue"

export interface Props {
  width?: string
  fullHeight?: boolean
}

withDefaults(defineProps<Props>(), {
  title: "",
  width: "440px",
  fullHeight: false,
})

const emit = defineEmits<{
  (e: "close"): void
}>()

function escapeClose(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close")
}

onMounted(() => {
  document.body.addEventListener("keyup", escapeClose)
  document.body.style.overflow = "hidden" // prevent scrolling of body when modal shown
})
onBeforeUnmount(() => {
  document.body.style.overflow = "visible"
  document.body.removeEventListener("keyup", escapeClose)
})

onActivated(() => {
  document.body.addEventListener("keyup", escapeClose)
  document.body.style.overflow = "hidden" // prevent scrolling of body when modal shown
})
onDeactivated(() => {
  document.body.style.overflow = "visible"
  document.body.removeEventListener("keyup", escapeClose)
})
</script>

<style lang="scss">
.question {
  justify-content: center;
  display: flex;
  text-align: center;
}

.hint {
  word-break: break-word;
  display: block;
  padding: 0 40px;
  margin: -20px 0 10px 0;
}
</style>
