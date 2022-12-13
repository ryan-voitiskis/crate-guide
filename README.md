# Crate Guide

demo: [https://crate.guide](https://crate.guide)

Crate Guide is a DJ app designed to assist in finding compatible tracks
within a users physical record collection. Records can be added manually
or imported from your Discogs collection. Audio features from your tracks
can then be imported from Spotify.

### Features implemented:

- Create account and login
- Create, edit and delete Records, Tracks and Crates
- Connect to Discogs API using OAuth 1.0
- Select from folders in Discogs collection and import records
- BPM tapper for loaded track, option to save to track
- Connect to Spotify API using OAuth 2.0
- Fetch BPM + other audio features from Spotify for:
  - Single Track (user provided ID)
  - Whole Record
  - Entire collection / selection of records
- Load track onto Deck
- Suggest compatible tracks for currently playing track:
  - Track is able to match the BPM of the currently playing track with the users turntable pitch adjustment range (Option in settings).
  - Track hasn't been played yet during this session. Transition history can be cleared.
  - Track isn't from the same record as currently playing track.
  - Suggestions are then sorted by their harmonic compatibility.

### Features to be implemented:

- Recover account and reset password
- Suggestions sorted by a final score which is generated as a combination of harmonic compatibility and tempo closeness.
- 33 / 45 RPM button is adjusted automatically when a track is loaded. Requires accurate RPM data imported.
- RecordIcon on the deck component to be of higher quality and reflect the design of a real turntable.

### Feature to be possibly implemented

- Mobile and tablet support, design separate UI, particularly Session view only utilising one simplified deck.
- Safari tested and supported (probably important because many DJs use Safari).

## Project setup

```
npm install
```

### Compiles and hot-reloads client for development

```
cd client
npm run client
```

### Compiles and hot-reloads server for development

```
cd server
npm run server
```

### Compiles and minifies for production

```
cd client
npm run build
```

### Lints and fixes files

```
cd client
npm run lint
```

### License

This project is licensed under the MIT License.

### Contributions

Crate Guide is an open source project, contributions are welcome.

### Author

Created and maintained by Ryan Voitiskis.
[ryanvoitiskis@pm.me](mailto:ryanvoitiskis@pm.me) | [GitHub](https://github.com/ryan-voitiskis)
