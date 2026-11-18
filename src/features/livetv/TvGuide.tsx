import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { qk } from '../../api/queryKeys'
import { useApi } from '../../api/session'
import { useNav } from '../../app/nav'
import { toast } from '../../app/toast'
import { usePrefs } from '../../stores/preferences'
import { DialogPopup, ExpandableButton, FaIcon, focusFromScript, LoadingPage, MaterialIcon } from '../../ui'
import { useItemActions } from '../common/useItemActions'
import collapse from '../common/Collapse.module.css'
import { GuideGrid, type GuideGridHandle, type GuidePosition } from './GuideGrid'
import { isFake, type TvChannel, type TvProgram } from './guideModel'
import { LiveTvError } from './LiveTvError'
import { LiveTvViewOptionsDialog } from './LiveTvViewOptionsDialog'
import { fetchProgram } from './liveTvApi'
import { ProgramDialog, type ProgramDialogState } from './ProgramDialog'
import styles from './TvGuide.module.css'
import { TvGuideHeader } from './TvGuideHeader'
import { useGuide } from './useGuide'

type Props = {
  /** keyboard focus moved to guide row `row` (the page hides its tab row while row > 0) */
  onRowPosition: (row: number) => void
}

/**
 * The Guide tab (`TvGuideGrid`, W/ui/detail/livetv/TvGuideGrid.kt): optional header with the focused program,
 * the "View options" button (only while focus is on the first row), and the grid. Program click: "No data"
 * cells tune the channel while airing (else a toast), real programs open the program dialog. Channel click: a
 * dialog with "Watch live" and Favorite / Unfavorite.
 */
export function TvGuide({ onRowPosition }: Props) {
  const { t } = useTranslation()
  const api = useApi()
  const go = useNav()
  const location = useLocation()
  const guide = useGuide()
  const actions = useItemActions()
  const showHeader = usePrefs('liveTvShowHeader')
  const colorCode = usePrefs('liveTvColorCodePrograms')
  const grid = useRef<GuideGridHandle>(null)
  const buttons = useRef<HTMLDivElement>(null)

  const [position, setPosition] = useState<GuidePosition>({ row: 0, programId: null })
  const [focusedProgram, setFocusedProgram] = useState<TvProgram | null>(null)
  const [hovered, setHovered] = useState<TvProgram | null>(null)
  const [dialogProgram, setDialogProgram] = useState<string | null>(null)
  const [channelDialog, setChannelDialog] = useState<{ index: number; channel: TvChannel } | null>(null)
  const [viewOptions, setViewOptions] = useState(false)

  // Only keyboard focus past the first row hides the tab row and the buttons; pointer input shows them again
  // (same rule as the Discover tabs, SE-15), since mouse and touch users scroll instead of moving focus.
  // A press shows them on release, not on pointerdown: the grid moves down as they expand, and a click whose
  // press and release land on different cells is lost. Both targets are hit-tested before pointerup is
  // dispatched, so the click still reaches the cell that was pressed.
  useEffect(() => {
    const reset = () => {
      setPosition((p) => (p.row === 0 ? p : { ...p, row: 0 }))
      onRowPosition(0)
    }
    window.addEventListener('pointerup', reset, { passive: true })
    window.addEventListener('pointercancel', reset, { passive: true })
    window.addEventListener('wheel', reset, { passive: true })
    return () => {
      window.removeEventListener('pointerup', reset)
      window.removeEventListener('pointercancel', reset)
      window.removeEventListener('wheel', reset)
    }
  }, [onRowPosition])

  // The view options dialog stays open while a channel-order switch reloads the guide (TvGuideGrid.kt draws it
  // outside the loading `when`). Its opener is replaced by that reload, so on close focus goes to the new
  // "View options" button when it fell to <body>.
  const viewOptionsWasOpen = useRef(false)
  useEffect(() => {
    if (viewOptions) {
      viewOptionsWasOpen.current = true
      return
    }
    if (!viewOptionsWasOpen.current) return
    viewOptionsWasOpen.current = false
    const a = document.activeElement
    if (a && a !== document.body) return
    const first = buttons.current?.querySelector<HTMLElement>('[data-focusable]')
    if (first && !first.closest('[inert]')) focusFromScript(first)
  }, [viewOptions])

  const programQuery = useQuery({
    queryKey: qk('livetv', 'program', dialogProgram),
    enabled: dialogProgram != null,
    staleTime: 0,
    gcTime: 0,
    // upstream fetches once per open; a failure shows the error at once
    retry: false,
    queryFn: ({ signal }) => fetchProgram(api, dialogProgram!, signal),
  })

  const viewOptionsDialog = viewOptions && <LiveTvViewOptionsDialog onClose={() => setViewOptions(false)} />
  // the dialog keeps one place in the tree whatever the guide shows, so a reload does not re-create it
  const withDialog = (content: ReactNode) => (
    <>
      {content}
      {viewOptionsDialog}
    </>
  )
  if (guide.status === 'error') return withDialog(<LiveTvError error={guide.error} className={styles.fill} />)
  if (guide.status === 'pending') return withDialog(<LoadingPage className={styles.fill} label={t('loading')} />)
  if (guide.channels.length === 0) {
    // TvGuideGrid.kt:127 (hard-coded upstream)
    return withDialog(<LiveTvError message={t('web_livetv_no_channels')} className={styles.fill} />)
  }

  // header shows the focused program (initially the first program of the first row); hover counts as focus
  const firstProgram = guide.programs.byChannel.get(guide.channels[0]?.id ?? '')?.[0] ?? null
  const headerProgram = hovered ?? focusedProgram ?? firstProgram

  const watch = (channelId: string | null | undefined) => {
    if (channelId) go.play(channelId)
    else toast(t('web_livetv_no_channel_id'), { long: true })
  }

  const onClickProgram = (p: TvProgram) => {
    if (isFake(p)) {
      const now = Date.now()
      if (now > p.start && now < p.end) go.play(p.channelId)
      else toast(t('web_livetv_no_guide_data'))
      return
    }
    setDialogProgram(p.id)
  }

  const dialogState: ProgramDialogState = programQuery.isError
    ? { kind: 'error', error: programQuery.error }
    : programQuery.data
      ? { kind: 'success', item: programQuery.data }
      : { kind: 'loading' }

  const channelDto = channelDialog ? guide.channelDtos.find((d) => d.Id === channelDialog.channel.id) : null
  const channelFav = channelDialog ? (guide.channels.find((c) => c.id === channelDialog.channel.id)?.favorite ?? false) : false

  return withDialog(
    <div className={styles.guide}>
      {/* AnimatedVisibility(showHeader, expandVertically / shrinkVertically) */}
      {showHeader && (
        <div className={styles.headerSlot}>
          <TvGuideHeader program={headerProgram} />
        </div>
      )}
      <div
        className={clsx(collapse.collapse, styles.buttonsSlot)}
        data-hidden={position.row < 1 ? undefined : ''}
        inert={position.row >= 1}
      >
        <div>
          <div
            ref={buttons}
            className={styles.buttons}
            onKeyDown={(e) => {
              // Down goes back to the program it came from. Spatial search would pick the cell under the button,
              // and in a right-to-left interface the buttons sit at the right edge over a left-to-right guide.
              if (e.key !== 'ArrowDown' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
              if (grid.current?.focusFirstRow()) e.preventDefault()
            }}
          >
            <ExpandableButton
              iconKind="fa"
              icon={<FaIcon name="sliders" size={16} />}
              label={t('view_options')}
              onClick={() => setViewOptions(true)}
            />
            {/* web: a pointer user has no Back-key jump to the start of the guide */}
            <ExpandableButton
              iconKind="fa"
              icon={<FaIcon name="clock" size={16} />}
              label={t('web_livetv_jump_to_now')}
              onClick={() => grid.current?.jumpToNow()}
            />
          </div>
        </div>
      </div>
      <GuideGrid
        ref={grid}
        channels={guide.channels}
        programs={guide.programs}
        guideTimes={guide.guideTimes}
        colorCode={colorCode}
        refreshing={guide.refreshing}
        restoreKey={location.key}
        heldProgramId={dialogProgram}
        heldChannelId={channelDialog?.channel.id ?? null}
        onClickProgram={onClickProgram}
        onClickChannel={(index, channel) => setChannelDialog({ index, channel })}
        onFocusCell={(pos, program, keyboard) => {
          setFocusedProgram(program)
          if (keyboard) {
            setPosition(pos)
            onRowPosition(pos.row)
          }
          guide.onFocusRow(pos.row)
        }}
        onHoverProgram={setHovered}
        onScrollRow={guide.onFocusRow}
        onExitUp={() => {
          // the TV has one button above the grid: Up from any program of the first row lands on "View options"
          const first = buttons.current?.querySelector<HTMLElement>('[data-focusable]')
          if (!first || first.closest('[inert]')) return false
          first.focus()
          return true
        }}
      />
      {dialogProgram != null && (
        <ProgramDialog
          state={dialogState}
          canRecord
          onClose={() => setDialogProgram(null)}
          onWatch={(item) => {
            setDialogProgram(null)
            watch(item.ChannelId)
          }}
          onRecord={(item, series) => {
            if (item.Id) guide.record(item.Id, series)
            setDialogProgram(null)
          }}
          onCancelRecord={(item, series) => {
            guide.cancel(series, series ? item.SeriesTimerId : item.TimerId)
            setDialogProgram(null)
          }}
        />
      )}
      {channelDialog && (
        <DialogPopup
          open
          title={channelDialog.channel.name ?? ''}
          elevation={3}
          onClose={() => setChannelDialog(null)}
          items={[
            {
              key: 'watch',
              headline: t('watch_live'),
              leading: <MaterialIcon name="play_arrow" />,
              onSelect: () => go.play(channelDialog.channel.id),
            },
            {
              key: 'favorite',
              headline: channelFav ? t('remove_favorite') : t('add_favorite'),
              leading: <FaIcon name="heart" />,
              leadingColor: channelFav ? 'var(--fx-favorite-active)' : undefined,
              onSelect: () => {
                if (channelDto) void actions.setFavorite(channelDto, !channelFav)
              },
            },
          ]}
        />
      )}
    </div>
  )
}
