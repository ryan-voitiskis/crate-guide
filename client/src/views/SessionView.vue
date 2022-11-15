<template>
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
      <SelectTrack />
    </ModalBox>
  </KeepAlive>
</template>

<script setup lang="ts">
import { sessionStore } from "@/stores/sessionStore"
import ModalBox from "@/components/utility/ModalBox.vue"
import RecordDeck from "@/components/session/RecordDeck.vue"
import SelectTrack from "@/components/session/SelectTrack.vue"

const session = sessionStore()
</script>

<style scoped lang="scss">
.session {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-around;
  width: 100%;
}
</style>
