/**
 * The Seerr endpoints upstream calls (spec 04 §D.11), one typed function each. Paths are relative to
 * `{proxy}/api/v1`. `logout` is the one web addition: unlinking must also drop the session cookie,
 * which the Android app never needed because its cookie jar lived in memory.
 */
import { seerrFetch, type SeerrQuery } from './client'
import type {
  GenreSlider,
  MediaRequest,
  MovieDetails,
  MovieResult,
  Paged,
  PersonCombinedCredits,
  PublicSettings,
  RatingsResponse,
  RequestPage,
  RequestPostBody,
  RequestPutBody,
  SearchResult,
  SeerrUser,
  ServiceDetails,
  ServiceServer,
  TvDetails,
  TvResult,
  WatchProviderDetails,
} from './types'

type Opts = { signal?: AbortSignal }

/** Sign-in calls answer within upstream's test-connection budget (connect 2 s + read 6 s). */
const LOGIN_TIMEOUT_MS = 8000

export const seerrApi = {
  // auth
  me: (o: Opts & { apiKey?: string | null } = {}) =>
    seerrFetch<SeerrUser>('/auth/me', {
      signal: o.signal,
      apiKey: o.apiKey,
      timeoutMs: LOGIN_TIMEOUT_MS,
    }),
  loginJellyfin: (username: string, password: string) =>
    seerrFetch<SeerrUser>('/auth/jellyfin', {
      method: 'POST',
      body: { username, password },
      apiKey: null,
      timeoutMs: LOGIN_TIMEOUT_MS,
    }),
  /** The UI labels the field "Username" but Seerr reads it as `email` (upstream `seerrLogin`). */
  loginLocal: (email: string, password: string) =>
    seerrFetch<SeerrUser>('/auth/local', {
      method: 'POST',
      body: { email, password },
      apiKey: null,
      timeoutMs: LOGIN_TIMEOUT_MS,
    }),
  logout: () => seerrFetch<unknown>('/auth/logout', { method: 'POST', apiKey: null }),
  publicSettings: (o: Opts = {}) =>
    seerrFetch<PublicSettings>('/settings/public', {
      signal: o.signal,
      timeoutMs: LOGIN_TIMEOUT_MS,
    }),

  // discover
  search: (query: string, page = 1, o: Opts = {}) =>
    seerrFetch<Paged<SearchResult>>('/search', {
      query: { query, page },
      signal: o.signal,
    }),
  trending: (page = 1, o: Opts = {}) =>
    seerrFetch<Paged<SearchResult>>('/discover/trending', {
      query: { page },
      signal: o.signal,
    }),
  discoverMovies: (query: SeerrQuery, o: Opts = {}) =>
    seerrFetch<Paged<MovieResult>>('/discover/movies', {
      query,
      signal: o.signal,
    }),
  discoverTv: (query: SeerrQuery, o: Opts = {}) => seerrFetch<Paged<TvResult>>('/discover/tv', { query, signal: o.signal }),
  upcomingMovies: (page = 1, o: Opts = {}) =>
    seerrFetch<Paged<MovieResult>>('/discover/movies/upcoming', {
      query: { page },
      signal: o.signal,
    }),
  upcomingTv: (page = 1, o: Opts = {}) =>
    seerrFetch<Paged<TvResult>>('/discover/tv/upcoming', {
      query: { page },
      signal: o.signal,
    }),
  genreSliderMovie: (o: Opts = {}) =>
    seerrFetch<GenreSlider[]>('/discover/genreslider/movie', {
      signal: o.signal,
    }),
  genreSliderTv: (o: Opts = {}) => seerrFetch<GenreSlider[]>('/discover/genreslider/tv', { signal: o.signal }),
  watchProvidersMovies: (watchRegion: string, o: Opts = {}) =>
    seerrFetch<WatchProviderDetails[]>('/watchproviders/movies', {
      query: { watchRegion },
      signal: o.signal,
    }),
  watchProvidersTv: (watchRegion: string, o: Opts = {}) =>
    seerrFetch<WatchProviderDetails[]>('/watchproviders/tv', {
      query: { watchRegion },
      signal: o.signal,
    }),

  // details
  movie: (id: number, o: Opts = {}) => seerrFetch<MovieDetails>(`/movie/${id}`, { signal: o.signal }),
  movieRatings: (id: number, o: Opts = {}) => seerrFetch<RatingsResponse>(`/movie/${id}/ratings`, { signal: o.signal }),
  movieSimilar: (id: number, page = 1, o: Opts = {}) =>
    seerrFetch<Paged<MovieResult>>(`/movie/${id}/similar`, {
      query: { page },
      signal: o.signal,
    }),
  movieRecommendations: (id: number, page = 1, o: Opts = {}) =>
    seerrFetch<Paged<MovieResult>>(`/movie/${id}/recommendations`, {
      query: { page },
      signal: o.signal,
    }),
  tv: (id: number, o: Opts = {}) => seerrFetch<TvDetails>(`/tv/${id}`, { signal: o.signal }),
  tvRatings: (id: number, o: Opts = {}) => seerrFetch<RatingsResponse>(`/tv/${id}/ratings`, { signal: o.signal }),
  tvSimilar: (id: number, page = 1, o: Opts = {}) =>
    seerrFetch<Paged<TvResult>>(`/tv/${id}/similar`, {
      query: { page },
      signal: o.signal,
    }),
  tvRecommendations: (id: number, page = 1, o: Opts = {}) =>
    seerrFetch<Paged<TvResult>>(`/tv/${id}/recommendations`, {
      query: { page },
      signal: o.signal,
    }),
  personCombinedCredits: (id: number, o: Opts = {}) =>
    seerrFetch<PersonCombinedCredits>(`/person/${id}/combined_credits`, {
      signal: o.signal,
    }),

  // requests
  requests: (o: Opts = {}) => seerrFetch<RequestPage>('/request', { signal: o.signal }),
  createRequest: (body: RequestPostBody) => seerrFetch<MediaRequest>('/request', { method: 'POST', body }),
  updateRequest: (id: number, body: RequestPutBody) => seerrFetch<MediaRequest>(`/request/${id}`, { method: 'PUT', body }),
  deleteRequest: (id: number) => seerrFetch<unknown>(`/request/${id}`, { method: 'DELETE' }),

  // radarr / sonarr (advanced request options)
  radarrServers: (o: Opts = {}) => seerrFetch<ServiceServer[]>('/service/radarr', { signal: o.signal }),
  radarrServer: (id: number, o: Opts = {}) => seerrFetch<ServiceDetails>(`/service/radarr/${id}`, { signal: o.signal }),
  sonarrServers: (o: Opts = {}) => seerrFetch<ServiceServer[]>('/service/sonarr', { signal: o.signal }),
  sonarrServer: (id: number, o: Opts = {}) => seerrFetch<ServiceDetails>(`/service/sonarr/${id}`, { signal: o.signal }),
} as const
