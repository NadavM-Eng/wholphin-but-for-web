import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { primaryButton, type Availability } from '../../api/seerr'
import { mayTakeInitialFocus } from '../../app/shell'
import { DialogPopup, ExpandableButton, FaIcon, MaterialIcon } from '../../ui'
import type { Trailer } from './detailHelpers'
import styles from './DiscoverDetails.module.css'
import { useSpaLink } from './useSpaLink'

export type DiscoverButtonsProps = {
  availability: Availability
  canRequest: boolean
  canCancel: boolean
  trailers: Trailer[]
  onRequest: () => void
  /** Movies: no-op (upstream default); TV: opens the season dialog. */
  onPending?: () => void
  /** Jellyfin page for "Go to"; null -> `onGoToMissing` (toast). */
  goToHref: string | null
  onGoToMissing: () => void
  onCancel: () => void
}

/** Only web links are opened; anything else Seerr might send (javascript:, data:, …) is ignored. */
const openTrailer = (t: Trailer) => {
  if (/^https?:$/.test(protocolOf(t.url))) window.open(t.url, '_blank', 'noopener,noreferrer')
}

/**
 * Upstream `ExpandableDiscoverButtons`: [Request | Pending | Go to | Delete | Unavailable], a second Request
 * when partially available, Cancel when allowed, then the trailer button (none / play / chooser).
 */
export function DiscoverButtons({
  availability,
  canRequest,
  canCancel,
  trailers,
  onRequest,
  onPending,
  goToHref,
  onGoToMissing,
  onCancel,
}: DiscoverButtonsProps) {
  const { t } = useTranslation()
  const link = useSpaLink()
  const [chooser, setChooser] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  // Upstream focuses the button row when the page opens (LaunchedEffect -> HEADER_ROW). Only with a hover
  // pointer (keyboard / remote), and only when nothing else holds focus yet.
  useEffect(() => {
    if (!mayTakeInitialFocus()) return
    if (!matchMedia('(hover: hover)').matches) return
    rowRef.current?.querySelector<HTMLElement>('[data-focusable]')?.focus({ preventScroll: true })
  }, [])
  const state = primaryButton(availability, canRequest)
  const primary = {
    request: {
      label: t('request'),
      icon: <FaIcon name="download" size={16} />,
    },
    pending: { label: t('pending'), icon: <FaIcon name="clock" size={16} /> },
    goTo: { label: t('go_to'), icon: <FaIcon name="play" size={16} /> },
    deleted: { label: t('delete'), icon: <FaIcon name="video" size={16} /> },
    blocklisted: {
      label: t('unavailable'),
      icon: <FaIcon name="xmark" size={16} />,
    },
  }[state.kind]
  const primaryClick = (e: MouseEvent<HTMLElement>) => {
    if (state.kind === 'goTo' && goToHref) return link(goToHref)(e)
    if (state.kind === 'request') onRequest()
    else if (state.kind === 'pending') onPending?.()
    else if (state.kind === 'goTo' && !goToHref) onGoToMissing()
  }
  const trailerLabel = trailers.length === 0 ? t('no_trailers') : trailers.length === 1 ? t('play_trailer') : t('trailers_title')
  return (
    <div ref={rowRef} className={styles.buttons} data-focus-group>
      <ExpandableButton
        iconKind="fa"
        icon={primary.icon}
        label={primary.label}
        labelOnTouch
        disabled={!state.enabled}
        href={state.kind === 'goTo' && goToHref ? goToHref : undefined}
        onClick={primaryClick}
        className={styles.alwaysLabel}
      />
      {state.showPartialRequest && (
        <ExpandableButton iconKind="fa" icon={<FaIcon name="download" size={16} />} label={t('request')} onClick={onRequest} />
      )}
      {canCancel && (
        <ExpandableButton
          icon={<MaterialIcon name="delete" />}
          label={t('cancel')}
          destructive
          onClick={(e) => {
            // Upstream moves focus to the primary button before cancelling.
            const first = (e.currentTarget.parentElement?.querySelector('[data-focusable]') as HTMLElement | null) ?? null
            first?.focus()
            onCancel()
          }}
        />
      )}
      <ExpandableButton
        iconKind="fa"
        icon={<FaIcon name="film" size={16} />}
        label={trailerLabel}
        disabled={trailers.length === 0}
        onClick={() => (trailers.length === 1 ? openTrailer(trailers[0]) : setChooser(true))}
      />
      <DialogPopup
        open={chooser}
        title={t('trailers_title')}
        onClose={() => setChooser(false)}
        items={trailers.map((tr, i) => ({
          key: `${i}`,
          headline: <span dir="auto">{tr.name}</span>,
          supporting: /^(www\.)?youtube\.com$/.test(hostOf(tr.url)) ? t('web_seerr_youtube') : undefined,
          leading: <FaIcon name="film" size={16} />,
          onSelect: () => openTrailer(tr),
        }))}
      />
    </div>
  )
}

function protocolOf(url: string): string {
  try {
    return new URL(url).protocol
  } catch {
    return ''
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
