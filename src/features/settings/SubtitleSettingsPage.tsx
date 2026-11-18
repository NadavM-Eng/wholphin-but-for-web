import { useState, type FocusEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { usePrefsStore } from '../../stores/preferences'
import { PreferenceList } from './PreferenceList'
import { buildScreen, screenTitleKey } from './prefModel'
import { SettingsLayout } from './SettingsLayout'
import { SubtitlePreview, type SubtitlePreviewMode } from './SubtitlePreview'
import { subtitleStyleFor } from './subtitleStyle'
import { useVisibilityContext } from './useVisibilityContext'

const prefIdOf = (target: EventTarget | null) =>
  target instanceof Element ? (target.closest<HTMLElement>('[data-pref-id]')?.dataset.prefId ?? null) : null

/**
 * Subtitle style editor (SubtitleStylePage.kt): live preview on the left, the 25% preference panel on the
 * right. `?hdr=1` edits the HDR copy (title "HDR subtitle style"). The preview switches to the margin or
 * image-opacity sample while that row is focused or hovered.
 */
export default function SubtitleSettingsPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const hdrPage = params.get('hdr') === '1' || params.get('hdr') === 'true'
  const ctx = useVisibilityContext(hdrPage)
  const prefs = usePrefsStore((s) => s.values)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const groups = buildScreen('SUBTITLE_STYLE', ctx)
  // The page edits its own copy, so the preview always shows that copy.
  const style = subtitleStyleFor({ ...prefs, subSeparateHdr: true }, hdrPage)
  const active = hoverId ?? focusedId
  const mode: SubtitlePreviewMode = active === 'SubMargin' ? 'margin' : active === 'SubImageOpacity' ? 'image' : 'examples'

  return (
    <SettingsLayout
      key={String(hdrPage)}
      title={t(screenTitleKey('SUBTITLE_STYLE', hdrPage))}
      width="narrow"
      initialFocusId={groups[0]?.entries[0]?.id}
      aside={<SubtitlePreview style={style} mode={mode} />}
    >
      <div
        onFocus={(e: FocusEvent) => setFocusedId(prefIdOf(e.target))}
        onBlur={(e: FocusEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedId(null)
        }}
        onPointerOver={(e: PointerEvent) => e.pointerType === 'mouse' && setHoverId(prefIdOf(e.target))}
        onPointerLeave={() => setHoverId(null)}
      >
        <PreferenceList groups={groups} hdrPage={hdrPage} />
      </div>
    </SettingsLayout>
  )
}
