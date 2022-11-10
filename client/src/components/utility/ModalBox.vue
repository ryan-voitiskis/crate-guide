<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal" :class="{ full: fullHeight, dynamic: !fullHeight }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { withDefaults, defineProps, onMounted, onBeforeUnmount } from "vue"

export interface Props {
  width?: string
  fullHeight?: boolean
}

withDefaults(defineProps<Props>(), {
  title: "",
  width: "440px",
  fullHeight: false,
})

// prevent scrolling of body when modal shown
onMounted(() => (document.body.style.overflow = "hidden"))
onBeforeUnmount(() => (document.body.style.overflow = "visible"))
</script>

<style lang="scss">
.modal-backdrop {
  position: fixed;
  background: rgba(0, 0, 0, 0.4);
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99;
  .modal {
    background: white;
    border-radius: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    width: v-bind(width);
    margin: 1rem;
    &.dynamic {
      max-height: calc(100% - 2rem);
    }
    &.full {
      height: calc(100% - 2rem);
    }
  }
}

.modal-header {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 3rem 4rem;
  h2 {
    font-weight: 500;
    color: var(--darkest-text);
    line-height: 3.8rem;
    margin: 0 2rem 0 0;
    span {
      color: var(--dark-text);
      font-size: 1.6rem;
    }
  }
  .close {
    margin-left: auto; // right align when no h2
    padding: 0 0.8rem;
  }
}

.modal-body {
  padding: 0 4rem;
  margin-bottom: 4rem;
  // max-height: 60%;
  overflow-y: scroll;
  overflow-x: hidden;
  p {
    color: var(--dark-text);
  }
}

.modal-body-sticky-header {
  padding: 0 4rem;
}

// for more complex forms with multiple control buttons
.modal-footer {
  margin-top: -2rem;
  gap: 2rem;
  padding: 2rem 4rem;
  width: 100%;
  display: flex;
  justify-content: end;
  background: var(--btn-secondary);
  border-radius: 0 0 1rem 1rem;
  button[type="reset"] {
    margin-right: auto;
  }
  button.primary {
    margin-top: unset;
  }
}

.modal-footer-plain {
  margin-top: -2rem;
  gap: 2rem;
  padding: 2rem 4rem;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 2rem;
}

.question {
  justify-content: center;
  display: flex;
  text-align: center;
}

.hint {
  word-break: break-all;
  display: block;
  padding: 0 4rem;
  margin: -2rem 0 1rem 0;
}
</style>
