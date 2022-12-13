// only properties needed for crate-guide included in interfaces.
// other properties exist on discogs responses, however, they are not required.
interface Folder {
  id: number
  name: string
  count: number
  resource_url: string
}

interface FoldersResponse {
  folders: Folder[]
}

const isFoldersResponse = (obj: any): obj is FoldersResponse => {
  return "folders" in obj
}

interface Format {
  name: string
  qty: number
  descriptions: string[]
}

interface Label {
  id: number
  name: string
  catno: string
  entity_type: string
  resource_url: string
}

interface Artist {
  id: number
  name: string
  join: string
  resource_url: string
  anv: string
  tracks: string
  role: string
}

interface Image {
  height: number
  width: number
  resource_url: string
  type: string
}

interface ExtraArtist {
  name: string
  role: string
}

interface Track {
  duration: string
  position: string
  artists?: Artist[]
  title: string
  type_: string
  extraartists: ExtraArtist[]
}

interface Release {
  id: number
  basic_information: {
    id: number
    title: string
    year: number
    thumb: string
    cover_image: string
    formats: Format[]
    labels: Label[]
    artists: Artist[]
    genre: string[]
    styles: string[]
  }
}

interface FolderResponse {
  pagination: {
    page: number
    pages: number
    per_page: number
    items: number
  }
  releases: Release[]
}

interface ReleaseFull {
  id: number
  title: string
  formats: Format[]
  labels: Label[]
  artists: Artist[]
  images: Image[]
  tracklist: Track[]
  genre?: string[]
  styles?: string[]
  year: number
}

export {
  Folder,
  FoldersResponse,
  isFoldersResponse,
  Format,
  Label,
  Artist,
  Image,
  Track,
  Release,
  FolderResponse,
  ReleaseFull,
  ExtraArtist,
}
