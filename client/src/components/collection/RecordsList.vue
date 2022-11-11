<template>
  <div class="input-controls" v-if="user.hasUser()">
    <CrateSelect
      selectID="collection_crate_select"
      label="Crate"
      width="240px"
    />
    <CrateOptions />
    <div class="input-wrapper">
      <BasicInput
        v-model="state.searchTitle"
        id="search_title"
        label="Search title"
        type="text"
        placeholder=""
        autocomplete="off"
        width="240px"
      />
    </div>
    <div class="input-wrapper">
      <BasicInput
        v-model="state.searchArtists"
        id="search_artists"
        label="Search artist"
        type="text"
        placeholder=""
        autocomplete="off"
        width="240px"
      />
    </div>
  </div>
  <div class="sort-controls">
    <label class="checkbox-hitbox">
      <input type="checkbox" v-model="records.checkAll" />
    </label>
    <SortByButton
      class="sort-by-button"
      title="Title"
      :active="state.sortBy === 'title'"
      :reversed="state.titleRvrs"
      @activate="state.sortBy = 'title'"
      @reverse="state.titleRvrs = !state.titleRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Catalog No."
      :active="state.sortBy === 'catno'"
      :reversed="state.catnoRvrs"
      @activate="state.sortBy = 'catno'"
      @reverse="state.catnoRvrs = !state.catnoRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Artists"
      :active="state.sortBy === 'artists'"
      :reversed="state.artistsRvrs"
      @activate="state.sortBy = 'artists'"
      @reverse="state.artistsRvrs = !state.artistsRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Label"
      :active="state.sortBy === 'label'"
      :reversed="state.labelRvrs"
      @activate="state.sortBy = 'label'"
      @reverse="state.labelRvrs = !state.labelRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Year"
      :active="state.sortBy === 'year'"
      :reversed="state.yearRvrs"
      @activate="state.sortBy = 'year'"
      @reverse="state.yearRvrs = !state.yearRvrs"
    />
  </div>
  <div class="record-list">
    <RecordSingle
      v-for="record in sortedRecords"
      v-bind="record"
      :key="record._id"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import RecordSingle from "./RecordSingle.vue"
import Record from "@/interfaces/Record"
import SortByButton from "@/components/utility/SortByButton.vue"
import { sortStr, sortNumWithNull } from "@/utils/sortFunctions"
import localeContains from "@/utils/localeContains"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import CrateSelect from "../inputs/CrateSelect.vue"
import CrateOptions from "./CrateOptions.vue"
const user = userStore()
const crates = crateStore()
const records = recordStore()

const state = reactive({
  selectAll: false,
  searchTitle: "",
  searchArtists: "",
  sortBy: "title",
  titleRvrs: false,
  catnoRvrs: false,
  artistsRvrs: false,
  labelRvrs: false,
  yearRvrs: false,
})

// records from selected crate to display
const recordsByCrate = computed((): Record[] =>
  user.authd.settings.selectedCrate !== "all"
    ? crates
        .getRecordIDsByCrate(user.authd.settings.selectedCrate)
        .map((i) => records.getById(i))
    : records.recordList
)

const titleSearchedTracks = computed((): Record[] =>
  state.searchTitle !== ""
    ? recordsByCrate.value.filter((i) =>
        localeContains(i.title, state.searchTitle)
      )
    : recordsByCrate.value
)

const artistsSearchedTracks = computed((): Record[] =>
  state.searchArtists !== ""
    ? titleSearchedTracks.value.filter((i) =>
        localeContains(i.artists, state.searchArtists)
      )
    : titleSearchedTracks.value
)

// sort records by title alphabetically
const sortedRecords = computed((): Record[] => {
  switch (state.sortBy) {
    case "catno":
      return [...artistsSearchedTracks.value].sort(
        sortStr("catno", state.catnoRvrs)
      )
    case "artists":
      return [...artistsSearchedTracks.value].sort(
        sortStr("artists", state.artistsRvrs)
      )
    case "label":
      return [...artistsSearchedTracks.value].sort(
        sortStr("label", state.labelRvrs)
      )
    case "year":
      return [...artistsSearchedTracks.value].sort(
        sortNumWithNull("year", state.yearRvrs)
      )
    default: // default is title
      return [...artistsSearchedTracks.value].sort(
        sortStr("title", state.titleRvrs)
      )
  }
})

// if select/deselect all checkbox is unchecked, clear checkboxed array
watch(
  () => records.checkAll,
  () => {
    if (records.checkAll === false) records.checkboxed = []
  }
)
</script>

<style scoped lang="scss">
.input-controls {
  display: flex;
  column-gap: 1rem;
  flex-wrap: wrap;
}
.sort-controls {
  .checkbox-hitbox {
    margin: 0;
  }
  width: 100%;
  display: flex;
  gap: 1rem;
  align-items: center;
}
.record-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.sort-by-button {
  width: 12rem;
}
</style>
