# Crate Guide

Live site: [https://crate.guide](https://crate.guide)

Crate Guide is a DJ app for finding compatible tracks within your vinyl record collection. Records can be added manually or imported from your Discogs collection. Audio features from your tracks can then be imported from Spotify through a mostly automated process.

### Features implemented:

- Create account and login
- Recover account and change password
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

- Record deck UI layout and styling close to a turntable.

### Features to be implemented:

- Suggestions sorted by a final score which is generated as a combination of harmonic compatibility and tempo closeness.
- De-dupe records button (with warning about users having multiple of same record intentionally).
- Import 7"/10"12" record format from Discogs and adjust Record SVG accordingly.
- 33 / 45 RPM button is adjusted automatically when a track is loaded. Requires accurate RPM data imported.

### Feature to be possibly implemented:

- Mobile and tablet support, design separate UI, particularly Session view only utilising one simplified deck.
- Safari tested and supported (probably important because many DJs use Safari).

## Project setup

Set crate-guide/client/src/globals.ts const API_URL appropriately.

```
client# npm i
client# npm run build
client# npm run client
```

Save crate-guide/server/.env with the following:

```
# NODE_ENV=production
NODE_ENV=development

PORT=3037
SITE_URL="https://crate.guide"
MONGO_URI=<YOUR_MONGO_URI>
JWT_SECRET=<YOUR_JWT_SECRET>
SPOTIFY_CLIENT_ID=<YOUR_SPOTIFY_CLIENT_ID>
SPOTIFY_CLIENT_SECRET=<YOUR_SPOTIFY_CLIENT_SECRET>
DISCOGS_CONSUMER_KEY=<YOUR_DISCOGS_CONSUMER_KEY>
DISCOGS_CONSUMER_SECRET=<YOUR_DISCOGS_CONSUMER_SECRET>
ELASTICMAIL_KEY=<YOUR_ELASTICMAIL_KEY>

PORT_DEV=5000
SITE_URL_DEV="http://localhost:5000"
MONGO_URI_DEV="mongodb://127.0.0.1:27017/crate-guide"
```

and

```
server# npm i
server# npm run build
server# npm run server
```

## License

This project is licensed under the MIT License.

## Contributions

Crate Guide is an open source project, contributions are welcome.

## Author

Created and maintained by Ryan Voitiskis.

[ryanvoitiskis.com](https://ryanvoitiskis.com) | [ryanvoitiskis@pm.me](mailto:ryanvoitiskis@pm.me) | [GitHub](https://github.com/ryan-voitiskis)
