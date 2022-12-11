<template>
  <div class="collapse-header" :class="{ collapsed: session.collapseHeader }">
    <button @click="session.collapseHeader = !session.collapseHeader">
      <ChevronUpIcon />
    </button>
  </div>
  <div class="session">
    <RecordDeck :deckID="0" />
    <button class="toggle-history" @click="session.historyListModal = true">
      <HistoryIcon />{{ session.set.length }}
    </button>
    <HistoryList />
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

  <ModalBox
    v-if="session.historyListModal"
    @close="session.historyListModal = false"
    width="760px"
    :fullHeight="true"
  >
    <HistoryListModal />
  </ModalBox>

  <ModalBox
    v-if="session.confirmClearHistory"
    @close="session.confirmClearHistory = false"
  >
    <ConfirmClearHistory />
  </ModalBox>

  <ModalBox
    v-if="session.saveHistoryForm"
    @close="session.saveHistoryForm = false"
  >
    <SaveHistoryForm />
  </ModalBox>

  <ModalBox
    v-if="session.setManager"
    @close="session.setManager = false"
    width="900px"
    :fullHeight="true"
  >
    <SetManager />
  </ModalBox>

  <ModalBox
    v-if="session.confirmDeleteSet"
    @close="session.confirmDeleteSet = false"
  >
    <ConfirmDeleteSet />
  </ModalBox>
</template>

<script setup lang="ts">
import { sessionStore } from "@/stores/sessionStore"
import ModalBox from "@/components/utility/ModalBox.vue"
import RecordDeck from "@/components/session/RecordDeck.vue"
import SelectTrackList from "@/components/session/SelectTrackList.vue"
import ChevronUpIcon from "@/components/icons/ChevronUpIcon.vue"
import HistoryList from "@/components/session/HistoryList.vue"
import ConfirmClearHistory from "@/components/forms/ConfirmClearHistory.vue"
import SaveHistoryForm from "@/components/forms/SaveHistoryForm.vue"
import SetManager from "@/components/session/SetManager.vue"
import ConfirmDeleteSet from "@/components/forms/ConfirmDeleteSet.vue"
import HistoryIcon from "@/components/icons/HistoryIcon.vue"
import HistoryListModal from "@/components/session/HistoryListModal.vue"

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
  gap: 10px;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.toggle-history {
  width: 38px;
  height: auto;
  padding: 10px 0 0;
  display: none;
  flex-direction: column;
}

@media (max-width: 2200px) {
  .session {
    flex-wrap: wrap;
  }
  .toggle-history {
    display: flex;
    align-self: center;
  }
}

@media (max-width: 1878px) {
  .toggle-history {
    flex-direction: row;
    padding: 0px 10px;
    width: auto;
    svg {
      margin-right: 10px;
    }
  }
}
</style>
