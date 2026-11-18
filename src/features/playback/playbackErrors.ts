import type { TFunction } from 'i18next'
import type { PlaybackError } from './engine'

/** User-facing message for an engine error. */
export function playbackErrorText(t: TFunction, e: PlaybackError): string {
  switch (e.kind) {
    case 'server-error':
      return t('web_playback_error_server', { p1: e.code })
    case 'no-media-sources':
      return t('web_playback_error_no_sources')
    case 'no-url':
      return t('web_playback_error_no_url')
    case 'no-method':
      return t('web_playback_error_no_method')
    case 'unsupported-browser':
      return t('web_playback_error_browser')
    case 'load-failed':
      return t('web_playback_error_load', { p1: e.detail ?? '' })
    default:
      return t('web_playback_error_failed')
  }
}

/** The detail line under the message, left out when the message already quotes it ('load-failed'). */
export function playbackErrorDetail(message: string, e: PlaybackError): string | undefined {
  return e.detail && !message.includes(e.detail) ? e.detail : undefined
}

/**
 * "Play with transcoding" on the error screen: only while a lighter play method is still allowed, the browser can
 * play HLS at all, and the entry itself loaded (a failed GET /Items never reached a play method).
 */
export function canRetryWithTranscoding(e: PlaybackError, itemLoaded: boolean, allowDirectPlay: boolean, allowDirectStream: boolean): boolean {
  return itemLoaded && (allowDirectPlay || allowDirectStream) && e.kind !== 'unsupported-browser'
}
