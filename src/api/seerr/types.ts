/**
 * Hand-written subset of the Seerr OpenAPI document (reference/wholphin/app/src/main/seerr/seerr-api.yml)
 * covering exactly the schemas the upstream client reads. Field names are the JSON names Seerr sends.
 * Everything is optional unless the schema marks it required: Seerr omits many fields.
 */

export interface SeerrUser {
  id: number
  email?: string
  username?: string | null
  displayName?: string
  jellyfinUsername?: string | null
  userType?: number
  permissions?: number | null
  avatar?: string
  requestCount?: number
}

export interface PublicSettings {
  initialized?: boolean
  applicationTitle?: string
  localLogin?: boolean
  mediaServerLogin?: boolean
  movie4kEnabled?: boolean
  series4kEnabled?: boolean
  cacheImages?: boolean
  locale?: string
  discoverRegion?: string
}

export interface MediaInfo {
  id?: number
  tmdbId?: number
  tvdbId?: number | null
  /** SeerrAvailability (1 unknown ... 7 deleted) */
  status?: number
  status4k?: number
  seasons?: Season[] | null
  requests?: MediaRequest[]
  jellyfinMediaId?: string | null
  jellyfinMediaId4k?: string | null
}

export interface Genre {
  id?: number
  name?: string
}

export interface RelatedVideo {
  url?: string
  key?: string
  name?: string
  size?: number
  type?: 'Clip' | 'Teaser' | 'Trailer' | 'Featurette' | 'Opening Credits' | 'Behind the Scenes' | 'Bloopers' | string
  site?: string
}

export interface MovieResult {
  id: number
  mediaType?: string
  posterPath?: string | null
  backdropPath?: string | null
  overview?: string
  title?: string
  originalTitle?: string
  releaseDate?: string
  mediaInfo?: MediaInfo
}

export interface TvResult {
  id: number
  mediaType?: string
  posterPath?: string | null
  backdropPath?: string | null
  overview?: string
  name?: string
  originalName?: string
  firstAirDate?: string
  mediaInfo?: MediaInfo
}

/** `SearchGet200ResponseResultsInner`: the union of movie / tv / person results. */
export interface SearchResult {
  id: number
  mediaType?: string
  posterPath?: string | null
  profilePath?: string | null
  backdropPath?: string | null
  overview?: string
  title?: string
  name?: string
  releaseDate?: string
  firstAirDate?: string
  mediaInfo?: MediaInfo
}

export interface CreditCast {
  id: number
  mediaType?: string
  name?: string
  title?: string
  character?: string
  overview?: string
  posterPath?: string | null
  profilePath?: string | null
  backdropPath?: string | null
  releaseDate?: string
  firstAirDate?: string
  mediaInfo?: MediaInfo
}

export interface CreditCrew extends Omit<CreditCast, 'character'> {
  job?: string
  department?: string
}

export interface ReleaseDate {
  certification?: string
  iso_639_1?: string | null
  note?: string | null
  release_date?: string
  type?: number
}

export interface MovieDetails {
  id?: number
  imdbId?: string
  backdropPath?: string | null
  posterPath?: string | null
  genres?: Genre[]
  relatedVideos?: RelatedVideo[]
  originalTitle?: string
  overview?: string
  releaseDate?: string
  releases?: {
    results?: {
      iso_3166_1?: string
      rating?: string | null
      release_dates?: ReleaseDate[]
    }[]
  }
  runtime?: number
  status?: string
  tagline?: string
  title?: string
  credits?: { cast?: CreditCast[]; crew?: CreditCrew[] }
  mediaInfo?: MediaInfo
}

export interface Season {
  id?: number
  airDate?: string | null
  episodeCount?: number
  name?: string
  overview?: string
  posterPath?: string | null
  seasonNumber?: number
  /** availability of the season */
  status?: number
  status4k?: number
}

export interface TvDetails {
  id?: number
  backdropPath?: string | null
  posterPath?: string | null
  episodeRunTime?: number[]
  firstAirDate?: string
  genres?: Genre[]
  name?: string
  originalName?: string
  overview?: string
  seasons?: Season[]
  tagline?: string
  credits?: { cast?: CreditCast[]; crew?: CreditCrew[] }
  mediaInfo?: MediaInfo
  relatedVideos?: RelatedVideo[]
}

export interface MediaRequest {
  id: number
  /** RequestStatus: 1 pending, 2 approved, 3 declined, 4 failed, 5 completed */
  status: number
  media?: MediaInfo
  createdAt?: string
  updatedAt?: string
  requestedBy?: SeerrUser
  is4k?: boolean
  serverId?: number
  profileId?: number
  rootFolder?: string
  type?: string
  seasons?: Season[]
}

export interface Paged<T> {
  page?: number
  totalPages?: number
  totalResults?: number
  results?: T[]
}

export interface RequestPage {
  pageInfo?: {
    page?: number
    pages?: number
    results?: number
    pageSize?: number
  }
  results?: MediaRequest[]
}

export interface RatingsResponse {
  title?: string
  year?: number
  url?: string
  criticsScore?: number | null
  criticsRating?: string
  audienceScore?: number | null
  audienceRating?: string
}

export interface GenreSlider {
  id?: number
  name?: string
  backdrops?: string[]
}

export interface WatchProviderDetails {
  displayPriority?: number
  logoPath?: string
  id?: number
  name?: string
}

export interface PersonCombinedCredits {
  id?: number
  cast?: CreditCast[]
  crew?: CreditCrew[]
}

/** `RadarrSettings` / `SonarrSettings` as returned by GET /service/{radarr|sonarr}. */
export interface ServiceServer {
  id?: number
  name?: string
  is4k?: boolean
  isDefault?: boolean
  activeProfileId?: number
  activeDirectory?: string
}

export interface ServiceProfile {
  id?: number
  name?: string
}

export interface RootFolder {
  id?: number
  freeSpace?: number
  path?: string
}

export interface ServiceDetails {
  server?: ServiceServer
  profiles?: ServiceProfile[]
  rootFolders?: RootFolder[]
}

/** POST /request body (`RequestPostRequest`). */
export interface RequestPostBody {
  mediaType: 'movie' | 'tv'
  mediaId: number
  seasons?: number[]
  is4k?: boolean
  serverId?: number | null
  profileId?: number | null
  rootFolder?: string | null
  tags?: number[]
}

/** PUT /request/{id} body (`RequestRequestIdPutRequest`). */
export interface RequestPutBody {
  mediaType: 'movie' | 'tv'
  seasons?: number[]
  is4k?: boolean
  serverId?: number | null
  profileId?: number | null
  rootFolder?: string | null
}
