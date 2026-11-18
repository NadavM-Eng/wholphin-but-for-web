// "Choose Version / Audio / Subtitles" dialogs (W/ui/components/Dialogs.kt chooseVersionParams / chooseStream)
// and saving the choice in the remembered-choices store (ItemPlaybackRepository.savePlayVersion /
// saveTrackSelection). The player reads these choices when Play is pressed.
import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { formatBitrate, formatDuration, roundMinutesMs, ticksToMs, type Translate } from '../../../lib/format'
import { deleteChosenStreams, savePlayVersion, saveTrackSelection } from '../../../stores/playbackChoices'
import { TrackIndex } from '../../playback/engine/streamChoice'
import { SelectedDot, type DialogEntry } from '../../../ui'
import type { StreamChoiceKind } from '../../common/itemMenuHandlers'
import { reasonText, streamDisplayTitle, type ChosenStreams } from './streams'

/**
 * Upstream gives every chooser row a `supportingContent` lambda, even one that draws nothing ("None", a stream
 * without a title), and a tv ListItem with supporting content is a two-line item (64dp). An empty fragment keeps
 * the row two-line here without drawing a second line.
 */
const NO_SUPPORTING = <></>

const sameId = (a: string | null | undefined, b: string | null | undefined) =>
  a != null && b != null && a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase()

/** Dialog title: "Choose Version" / "Choose Audio" / "Choose Subtitles". */
export function chooserTitle(t: Translate, kind: StreamChoiceKind): string {
  return t('choose_stream', { p1: t(kind === 'version' ? 'version' : kind === 'audio' ? 'audio' : 'subtitles') })
}

/** `chooseVersionParams`: one row per source with an id; headline name/path/id, supporting video title + bitrate, trailing runtime. */
export function versionEntries(
  t: Translate,
  sources: readonly MediaSourceInfo[],
  chosenSourceId: string | null | undefined,
  onPick: (source: MediaSourceInfo) => void,
  locale?: string,
): DialogEntry[] {
  return sources
    .filter((s) => !!s.Id && s.Id.trim() !== '')
    .map((source) => {
      const video = source.MediaStreams?.find((m) => m.Type === 'Video')
      const supporting = [video?.DisplayTitle, source.Bitrate != null ? formatBitrate(source.Bitrate, locale) : null].filter(Boolean).join(', ')
      const selected = sameId(source.Id, chosenSourceId)
      return {
        key: source.Id ?? '',
        headline: source.Name ?? source.Path ?? source.Id ?? '',
        supporting: supporting || NO_SUPPORTING,
        trailing: source.RunTimeTicks != null ? formatDuration(t, roundMinutesMs(ticksToMs(source.RunTimeTicks))) : undefined,
        leading: <SelectedDot selected={selected} />,
        selected,
        onSelect: () => onPick(source),
      }
    })
}

/**
 * `chooseStream`: subtitles start with "None" and "Only Forced Subtitles" (and a divider), then the streams of
 * the chosen source; the user's preferred subtitle language sorts first. The chosen row shows why it was chosen.
 */
export function trackEntries(
  t: Translate,
  kind: 'audio' | 'subtitles',
  chosen: ChosenStreams,
  preferredSubtitleLanguage: string | null | undefined,
  onPick: (index: number) => void,
  locale?: string,
): DialogEntry[] {
  const type = kind === 'audio' ? 'Audio' : 'Subtitle'
  const result = kind === 'audio' ? chosen.audio : chosen.subtitle
  const current = result.stream?.Index ?? null
  let streams = (chosen.source.MediaStreams ?? []).filter((s) => s.Type === type)
  const out: DialogEntry[] = []
  if (kind === 'subtitles') {
    out.push({
      key: 'none',
      headline: t('none'),
      supporting: NO_SUPPORTING,
      leading: <SelectedDot selected={current == null} />,
      selected: current == null,
      trailing: current == null ? reasonText(t, result.reason) : undefined,
      onSelect: () => onPick(TrackIndex.DISABLED),
    })
    // Upstream compares the chosen stream index with ONLY_FORCED, which never matches, so the row is never
    // marked (W/ui/components/Dialogs.kt chooseStream); here it is marked when that is the saved choice.
    const onlyForced = chosen.itemPlayback?.subtitleIndex === TrackIndex.ONLY_FORCED
    out.push({
      key: 'forced',
      headline: t('only_forced_subtitles'),
      supporting: NO_SUPPORTING,
      leading: <SelectedDot selected={onlyForced} />,
      onSelect: () => onPick(TrackIndex.ONLY_FORCED),
    })
    if (streams.length > 0) out.push({ kind: 'divider', key: 'div' })
    if (preferredSubtitleLanguage && preferredSubtitleLanguage.trim() !== '') {
      streams = [...streams].sort(
        (a, b) => Number(b.Language != null && b.Language === preferredSubtitleLanguage) - Number(a.Language != null && a.Language === preferredSubtitleLanguage),
      )
    }
  }
  for (const s of streams) {
    const title = s.Title && s.Title.trim() !== '' ? s.Title : null
    const display = streamDisplayTitle(t, s, true, locale)
    const selected = current != null && current === s.Index
    out.push({
      key: `s${s.Index}`,
      headline: title ?? display,
      supporting: title ? display : NO_SUPPORTING,
      leading: <SelectedDot selected={selected} />,
      selected,
      trailing: selected ? reasonText(t, result.reason) : undefined,
      onSelect: () => onPick(s.Index ?? TrackIndex.UNSPECIFIED),
    })
  }
  return out
}

/** Saves a version choice (resets the item's track choices, as upstream builds a fresh row). */
export function chooseVersion(item: BaseItemDto, source: MediaSourceInfo) {
  if (item.Id && source.Id) savePlayVersion(item.Id, source.Id)
}

/** Saves an audio / subtitle choice for the item (and the season / series language choice for episodes). */
export function chooseTrack(item: BaseItemDto, chosen: ChosenStreams | null, kind: 'audio' | 'subtitles', index: number) {
  saveTrackSelection(item, chosen?.itemPlayback ?? null, index, kind === 'audio' ? 'Audio' : 'Subtitle')
}

/** "Clear track choices". */
export function clearChoices(item: BaseItemDto) {
  deleteChosenStreams(item)
}
