<template>
  <article class="about-crate-guide">
    <h1>About Crate Guide</h1>
    <button @click="$router.go(-1)" class="back">Back to app</button>
    <p>
      Crate Guide is a DJ app designed to assist in finding compatible tracks
      within a users vinyl record collection. Records can be added manually or
      imported from your Discogs collection. Audio features from your tracks can
      then be imported from Spotify through a mostly automated process.
    </p>
    <hr />
    <h3>How to use</h3>
    <p>
      Crate Guide has been designed to be used on a laptop or desktop in
      fullscreen mode. To use the app in fullscreen, press <i>F11</i>. The
      Session view has an arrow button in the header that hides the header to
      provide more screen real-estate for the suggestions and a more focused
      view whilst playing. This is the recommended way to use the app. Crate
      Guide scales well to larger displays.
    </p>
    <p>
      Future versions may include better mobile device support, however this is
      not a priority.
    </p>
    <p>
      Please use a recent version of Firefox or Chrome. Other browsers aren't
      supported.
    </p>
    <p>
      It is recommended that you import your collection from Discogs, then
      import the audio features from Spotify for all of your tracks.
    </p>
    <h4>Importing your collection from Discogs</h4>
    <p>
      When importing records from Discogs it is important that the records you
      import are in the <i>Vinyl</i> format. The format can be found on a
      Discogs release page just under the label, below the title. Another quick
      way to determine the format is to look at the numbering of the
      <i>Tracklist</i> section. If the numbering section has record side
      lettering eg. <i>A1, A2, B1</i> then it is a Vinyl release. If you realise
      that a release in your Discogs collection is not in the vinyl format, you
      should be able to find the vinyl format in the
      <i>Other versions</i> section of the release page.
    </p>
    <p>
      To import from Discogs you must first authenticate your Crate Guide
      account with Discogs. To do so, navigate to the settings at the top right
      of the screen and click the button <i>Connect to Discogs</i>. The same
      must be done with the Spotify API if you wish to import track data from
      Spotify (highly recommended). A Discogs collection or folder can then be
      imported by clicking the <i>Import from Discogs</i> button in the
      Collection view.
    </p>
    <p>
      After importing your collection from Discogs, it is highly recommended you
      check the tracks of each record haven't been imported with errors.
      Sometimes a Discogs release will have been edited in a way such that
      tracks have been added that aren't part of the release. A common example
      of this would be tracks with the titles "This side", or "That side".
      Please remove these invalid tracks before importing Spotify data.
    </p>
    <h4>Importing audio features from Spotify</h4>
    <p>
      To import audio features from Spotify, select the records you wish to
      import using the checkboxes on the album cover, or click the select all
      checkbox in the header. Then click on the <i>Get selected Spotify data</i>
      button. When importing data from Spotify, you will likely be asked to
      confirm if Crate Guide has found the correct Record or Track. Be sure to
      select the provided options carefully, and if there is no exact match,
      don't select one, as this would result in the selected track data being
      saved to the wrong track, breaking the suggestions.
    </p>
    <p>
      Some tracks are not on Spotify, therefore important track details cannot
      be automatically imported. In this case, it is recommended that you
      provide Crate Guide with at least the BPM and Key of the track, as these
      details are necessary for providing suggestions. This can be done using
      the Edit track form.
    </p>
    <p>
      To view the Spotify audio features of a track, click on one of the feature
      icons anywhere a track is displayed.
    </p>
    <div class="feature-icons"><DanceIcon /><BoltIcon /><SmileIcon /></div>
    <h4>Session mode</h4>
    <p>
      From the Session view, load a track onto a deck using the
      <i>LOAD</i> button in the top left of one of the decks. Upon loading a
      track, suggestions will be generated below the deck. A suggestion can be
      loaded onto the other deck by clicking on it.
    </p>
    <p>
      When a suggestion is loaded, the deck it is loaded to will have it's pitch
      fader automatically adjusted to the position required for mixing that
      track into the currently playing track. This can be useful in assisting
      you during beat-matching, just make sure that the currently playing deck
      has its pitch fader in the same position as it is on the physical
      turntable.
    </p>
    <p>
      Suggestions are currently sorted based on their harmonic compatibility.
      There are five possible harmonic combinations between a loaded track and
      its suggestions:
    </p>
    <ul>
      <li>Same key</li>
      <li>Up a fifth</li>
      <li>Down a fifth</li>
      <li>Minor to Major</li>
      <li>Major to Minor</li>
    </ul>
    <p>
      When playback of a track is adjusted using the pitch fader on a turntable,
      the pitch changes. Due to this, the harmonic compatibility of two tracks
      changes. For example if Deck 1 is playing a track with an unadjusted BPM
      of 128 in the key of A minor, when it is adjusted to 135.6BPM (+5.9%), it
      is now in the key of A♯ minor. This effect is considered by the app and
      suggestions will be made accordingly. You will see a percentage value next
      to the key combination on a Suggestion. This is how close the two tracks
      are to the listed combination. This closeness is the sole variable used to
      sort the suggestions currently.
    </p>
    <p>
      The accuracy of the harmonic compatibility depends on the accuracy of the
      provided Keys for each track, whether added manually or imported from
      Spotify.
    </p>
    <p>
      A future update will improve the sorting of suggestions to consider genre
      and the closeness of the pitch adjustment required to 0%.
    </p>
    <p>
      The <i>start • stop</i> button can be used to help keep track of which
      deck is currently playing, however this feature is only useful as a visual
      indicator and does not affect suggestions or any other part of the app.
      Stroboscopic dots on the platter will move correctly according to the
      pitch adjustment on 60Hz displays. Using this feature may use alot of
      computer resources.
    </p>
    <p>
      Adjusting the pitch fader of a loaded deck will result in the suggestions
      to be recalculated. A suggestion will only be shown if it is within the
      achievable adjusted BPM range of the current playing tracks BPM.
    </p>
    <p>
      Session transition history keeps track of the tracks played during a
      session. If your display is wide enough, the transition history will
      appear between the decks, else a button between the decks will open a
      modal containing the transition history. If you only see the button and
      would like to see how the app looks on wider displays, try zooming out (<i
        >Ctrl</i
      >
      + <i>minus</i>).
    </p>
    <p>
      Sets can be saved and viewed again later. It may be helpful to rate
      transitions before saving for future reference. To remove a rating, simply
      click again on the currenty rating.
    </p>
    <p>
      Your past transition ratings may be used in a future feature to help score
      the suggestions.
    </p>
    <hr />
    <h3>License <ScaleIcon /></h3>
    <p>
      This project is licensed under the
      <a href="https://github.com/ryan-voitiskis/crate-guide/blob/main/LICENSE">
        MIT License
      </a>
    </p>
    <h3>Contributions <PullRequestIcon /></h3>
    <p>
      <a href="https://github.com/ryan-voitiskis/crate-guide">Crate Guide</a> is
      an open source project, contributions are welcome.
    </p>
    <h3>Author <CodeIcon /></h3>
    <p>
      Created and maintained by Ryan Voitiskis. Please email me feedback or
      suggestions.
    </p>
    <p class="last-p">
      <a href="https://ryanvoitiskis.com">ryanvoitiskis.com</a> |
      <a href="mailto:ryanvoitiskis@pm.me">ryanvoitiskis@pm.me</a> |
      <a href="https://github.com/ryan-voitiskis">GitHub</a>
    </p>
  </article>
</template>

<script setup lang="ts">
import BoltIcon from "@/components/icons/BoltIcon.vue"
import CodeIcon from "@/components/icons/CodeIcon.vue"
import DanceIcon from "@/components/icons/DanceIcon.vue"
import PullRequestIcon from "@/components/icons/PullRequestIcon.vue"
import ScaleIcon from "@/components/icons/ScaleIcon.vue"
import SmileIcon from "@/components/icons/SmileIcon.vue"
</script>

<style scoped lang="scss">
.about-crate-guide {
  font-size: 16px;
  max-width: 720px;
  overflow: auto;
  margin: 0 auto;
  .back {
    margin: 20px 0 30px;
  }
  hr {
    margin-bottom: 30px;
  }
  h3 {
    display: flex;
    align-content: center;
    svg {
      align-self: center;
      height: 22px;
      margin-left: 10px;
    }
  }
  .feature-icons {
    display: flex;
    width: 100%;
    gap: 10px;
    justify-content: center;
    margin-top: -20px;
    margin-bottom: 30px;
    svg {
      height: 24px;
    }
  }
  .last-p {
    margin-bottom: 360px; // must be here along with overflow: auto in parent for chrome
  }
}
</style>
