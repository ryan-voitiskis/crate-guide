<template>
  <div class="collapse-header" :class="{ collapsed: session.collapseHeader }">
    <button @click="session.collapseHeader = !session.collapseHeader">
      <ChevronUpIcon />
    </button>
  </div>
  <div class="session">
    <RecordDeck :deckID="0" />
    <RecordDeck :deckID="1" />
  </div>

  <KeepAlive>
    <ModalBox
      v-if="session.loadTrackTo !== -1"
      @close="session.loadTrackTo = -1"
      width="1826px"
      :fullHeight="true"
    >
      <SelectTrackList />
    </ModalBox>
  </KeepAlive>
</template>

<script setup lang="ts">
import { sessionStore } from "@/stores/sessionStore"
import ModalBox from "@/components/utility/ModalBox.vue"
import RecordDeck from "@/components/session/RecordDeck.vue"
import SelectTrackList from "@/components/session/SelectTrackList.vue"
import ChevronUpIcon from "@/components/icons/ChevronUpIcon.vue"

const session = sessionStore()
</script>

<style scoped lang="scss">
.collapse-header {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: -32px;
  button {
    height: 12px;
    margin: 10px;
    transition: margin 0.4s;
    svg {
      transition: transform 0.4s;
    }
  }
  &.collapsed {
    margin-top: 0;
    button {
      margin: 0;
      svg {
        transform: scaleY(-1);
      }
    }
  }
}
.session {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-around;
  width: 100%;
  height: 100%;
}
</style>
