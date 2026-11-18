import { useState } from 'react'
import { DialogPopup, ExpandableButton, FaIcon } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { openTrailer, type Trailer } from './trailers'

/**
 * Upstream `TrailerButton` (W/ui/components/PlayButtons.kt:389-422): always shown, three states. No trailers:
 * disabled "No trailers"; one: "Play trailer" plays it; several: "Trailers" opens the picker.
 */
export function TrailerButton({ trailers, navigate }: { trailers: Trailer[]; navigate: (path: string) => void }) {
  const { t } = useTranslate()
  const [open, setOpen] = useState(false)
  const label = trailers.length === 0 ? t('no_trailers') : trailers.length === 1 ? t('play_trailer') : t('trailers_title')
  return (
    <>
      <ExpandableButton
        icon={<FaIcon name="film" />}
        iconKind="fa"
        label={label}
        disabled={trailers.length === 0}
        onClick={() => {
          if (trailers.length === 1) openTrailer(trailers[0], navigate)
          else if (trailers.length > 1) setOpen(true)
        }}
      />
      {open && (
        <DialogPopup
          open
          title={t('play_trailer')}
          onClose={() => setOpen(false)}
          items={trailers.map((tr, i) => ({
            key: String(i),
            headline: <span dir="auto">{tr.name}</span>,
            supporting: tr.kind === 'local' ? t('local') : (tr.subtitle ?? t('external_track')),
            onSelect: () => openTrailer(tr, navigate),
          }))}
        />
      )}
    </>
  )
}
