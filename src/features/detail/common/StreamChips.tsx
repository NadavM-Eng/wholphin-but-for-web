import clsx from 'clsx'
import { StreamChip } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import styles from './DetailHeader.module.css'
import { streamChips, type ChosenStreams } from './streams'

/** `VideoStreamDetails`: video, codec, audio and subtitle chips of the chosen version. */
export function StreamChips({ chosen, versions, className }: { chosen: ChosenStreams | null; versions: number; className?: string }) {
  const { t, locale } = useTranslate()
  const chips = streamChips(t, chosen, versions, locale)
  if (!chosen) return null
  return (
    <div className={clsx(styles.chips, className)}>
      {chips.map((c) => (
        <StreamChip
          key={c.key}
          text={c.text}
          icon={c.icon}
          count={c.count}
          disabled={c.disabled}
          maxWidth={c.capped === 'subtitle'}
          className={c.capped === 'audio' ? styles.audioChip : undefined}
        />
      ))}
    </div>
  )
}
