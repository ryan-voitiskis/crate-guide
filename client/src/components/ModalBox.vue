<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { withDefaults, defineProps } from "vue"

export interface Props {
  width?: string
}

withDefaults(defineProps<Props>(), {
  title: "",
  width: "440px",
})
</script>

<style lang="scss">
.modal-backdrop {
  .modal {
    width: v-bind(width);
    margin: 1rem;
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
  p {
    text-align: center;
    color: var(--dark-text);
  }
}

// for more complex forms with multiple control buttons
.modal-controls {
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

.modal-text {
  display: block;
  padding: 0 4rem;
  &.subtle {
    color: var(--light-text);
  }
}

.centered-btns {
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 2rem;
}
</style>
