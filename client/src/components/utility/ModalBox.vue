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
.modal-backdrop {
  position: fixed;
  background: var(--modal-backdrop);
  backdrop-filter: blur(2px);
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99;
  .modal {
    background: var(--page-bg);
    transition: background-color 200ms, color 200ms;
    border-radius: 10px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    max-width: v-bind(width);
    width: 100%;
    margin: 10px;
    &.dynamic {
      max-height: calc(100% - 20px);
    }
    &.full {
      height: calc(100% - 20px);
    }
  }
}

.modal-header {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 30px 40px;
  h2 {
    font-weight: 500;
    color: var(--darkest-text);
    line-height: 38px;
    margin: 0 20px 0 0;
    span {
      color: var(--dark-text);
      font-size: 16px;
    }
  }
  .close {
    margin-left: auto; // right align when no h2
    padding: 0 8px;
  }
}

.modal-body {
  padding: 0 40px;
  margin-bottom: 40px;
  overflow-y: scroll;
  overflow-x: hidden;
  p {
    color: var(--dark-text);
  }
}

.modal-body-sticky-header {
  padding: 0 40px;
}

// for more complex forms with multiple control buttons
.modal-footer {
  margin-top: -20px;
  gap: 20px;
  padding: 20px 40px;
  width: 100%;
  display: flex;
  justify-content: end;
  background: var(--secondary);
  border-radius: 0 0 10px 10px;
  button[type="reset"] {
    margin-right: auto;
  }
  button.primary {
    margin-top: unset;
  }
}

.modal-footer-plain {
  margin-top: -20px;
  gap: 20px;
  padding: 20px 40px;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 20px;
}

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
