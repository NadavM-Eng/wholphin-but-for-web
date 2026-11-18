import type { KeyboardEvent, Ref } from 'react'
import type { Translate } from '../../lib/format'
import { moveFocus } from '../../app/spatialNav'
import { ExpandableButton, FaIcon, SearchField } from '../../ui'
import { inputArrowExit } from '../../ui/lib/fieldArrowExit'
import styles from './SearchPage.module.css'
import type { VoiceInput, VoiceState } from './voiceInput'
import { VoiceSearchButton } from './VoiceSearchButton'

type Props = {
  t: Translate
  text: string
  onTextChange: (v: string) => void
  onSearch: () => void
  inputRef: Ref<HTMLInputElement>
  /** null when the voice button is turned off in view options. */
  voice: { voice: VoiceInput; state: VoiceState; partial: string } | null
  onSpeechResult: (text: string) => void
  onViewOptions: () => void
  onEscape: () => void
}

/**
 * The search bar (SearchPage.kt:262-342): voice button, the 40dp pill text field with the search icon,
 * and the "View options" button, centered, 12dp apart, 16dp from the top.
 */
export function SearchHeader({ t, text, onTextChange, onSearch, inputRef, voice, onSpeechResult, onViewOptions, onEscape }: Props) {
  // Arrow keys leave the text field at its edges (the TV field is read-only until activated, so the
  // D-pad always moves focus there).
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement)) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
      return
    }
    const dir = inputArrowExit(e)
    if (dir && moveFocus(dir)) e.preventDefault()
  }

  return (
    <div className={styles.header} data-search-header onKeyDown={onKey}>
      <div className={styles.headerRow}>
        {voice && (
          <VoiceSearchButton voice={voice.voice} state={voice.state} partial={voice.partial} t={t} onSpeechResult={onSpeechResult} />
        )}
        <SearchField
          ref={inputRef}
          className={styles.field}
          label={t('search')}
          value={text}
          onChange={onTextChange}
          onSearch={onSearch}
          autoCapitalize="none"
          spellCheck={false}
        />
        <ExpandableButton iconKind="fa" icon={<FaIcon name="sliders" size={16} />} label={t('view_options')} onClick={onViewOptions} />
      </div>
    </div>
  )
}
