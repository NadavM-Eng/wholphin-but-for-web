// Pure helpers of the Seerr detail pages (DiscoverMovieDetailsHeader.kt, DiscoverSeriesDetails.kt, ViewModels).
import type { MovieDetails, RelatedVideo, TvDetails } from '../../api/seerr'

export type Trailer = { name: string; url: string; site?: string }

/** Trailers = `relatedVideos` of type Trailer with a non-blank name and URL. */
export function trailersOf(videos: RelatedVideo[] | null | undefined): Trailer[] {
  return (videos ?? [])
    .filter((v) => v.type === 'Trailer' && v.name?.trim() && v.url?.trim())
    .map((v) => ({ name: v.name!, url: v.url!, site: v.site }))
}

/** Country of the UI locale ("fr-FR" -> "FR"), the device-locale stand-in. */
export function localeCountry(locale: string | undefined): string | null {
  try {
    return new Intl.Locale(locale ?? navigator.language).maximize().region ?? null
  } catch {
    return null
  }
}

/**
 * Certification: the `releases.results` entry of the locale's country, else US, else the first; its first
 * release date's certification when non-blank.
 */
export function movieCertification(movie: MovieDetails, country: string | null): string | null {
  const results = movie.releases?.results ?? []
  const release =
    (country ? results.find((r) => r.iso_3166_1 === country) : undefined) ??
    results.find((r) => r.iso_3166_1 === 'US') ??
    results[0]
  const cert = release?.release_dates?.[0]?.certification
  return cert?.trim() ? cert : null
}

/** "Directed by" names: crew with job Director, joined by ", ". */
export function directorNames(movie: MovieDetails): string | null {
  const names = (movie.credits?.crew ?? []).filter((c) => c.job === 'Director' && c.name?.trim()).map((c) => c.name!)
  return names.length ? names.join(', ') : null
}

/** Mean episode runtime in minutes, or null when absent / not positive. */
export function meanEpisodeRuntime(tv: TvDetails): number | null {
  const list = tv.episodeRunTime ?? []
  if (!list.length) return null
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return Number.isFinite(avg) && avg > 0 ? Math.round(avg) : null
}
