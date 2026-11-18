import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { BackButton, useHideBackButton } from '../../app/shell'
import { toast } from '../../app/toast'
import { setPref, usePrefs } from '../../stores/preferences'
import { dp } from '../../theme/scale'
import { DialogPopup, ErrorMessage, IconButton, LoadingPage, MaterialIcon, SelectedDot } from '../../ui'
import { useTranslate } from '../common/useTranslate'
import { ImageFilterDialog } from './ImageFilterDialog'
import { ImageOverlay } from './ImageOverlay'
import { parseSlideshowParams, slideshowRequest, withViewerPosition } from './photoQuery'
import { loadImageFilter, saveImageFilter } from './photoStorage'
import { originalPhotoUrl, resizedPhotoUrl, slideshowVideoUrl } from './photoUrls'
import { keepScreenOn } from './screensaverService'
import styles from './SlideshowPage.module.css'
import {
  applyPan,
  applyZoom,
  colorMatrix,
  DEFAULT_FILTER,
  hasImageFilter,
  IDENTITY,
  isZoomed,
  needsOriginal,
  PAN_STEP_DP,
  resetTransform,
  screenImageEdge,
  slideshowDelay,
  ZOOM_BUTTON_STEP,
  ZOOM_REPEAT_STEP,
  type ImageFilter,
  type Screen,
  type Transform,
} from './slideshowModel'
import { SlideshowStage, type StageMedia } from './SlideshowStage'
import { SlideshowTimer } from './slideshowTimer'
import { PAGE_SIZE, usePagedItems, type Page } from './usePagedItems'

/** Web: slideshow durations offered in the viewer (the setting itself is a 1-30 s slider in Advanced). */
const DURATIONS = [2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000]
/** Pages scanned to find the clicked photo when the grid index does not match. */
const MAX_SCAN_PAGES = 10
const CHROME_HIDE_MS = 3000

function useScreen(): Screen {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('resize', cb)
    return () => window.removeEventListener('resize', cb)
  }, [])
  const w = useSyncExternalStore(subscribe, () => window.innerWidth, () => 1280)
  const h = useSyncExternalStore(subscribe, () => window.innerHeight, () => 720)
  return useMemo(() => ({ width: w, height: h }), [w, h])
}

function isTypingTarget(el: Element | null): boolean {
  return !!el && !!el.closest('input, textarea, select, [contenteditable="true"]')
}

/**
 * Photo viewer / slideshow (W/ui/slideshow/SlideshowPage.kt + SlideshowViewModel.kt): black full screen, no
 * chrome until OK opens the details and controls overlay. Left / Right step through the photos, the slideshow
 * advances every "Slideshow duration" and loops at the end, clips play inline when "Play videos during slideshow"
 * is on. Web additions: a top bar (Back, fullscreen) and side arrows that appear with the pointer, wheel / pinch /
 * double-click zoom, drag to pan, swipe, and a screen-sized image request instead of the original file.
 */
export default function SlideshowPage() {
  const { t } = useTranslate()
  const { parentId = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const searchKey = search.toString()
  const params = useMemo(() => parseSlideshowParams(parentId, new URLSearchParams(searchKey)), [parentId, searchKey])
  useHideBackButton()
  const api = useApi()
  const session = useSession()
  const base = api.basePath
  const token = api.accessToken
  const playVideos = usePrefs('slideshowPlayVideos')
  const durationPref = usePrefs('slideshowDuration')
  const screen = useScreen()
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1

  const fetchPage = useCallback(
    async (startIndex: number, limit: number, signal: AbortSignal): Promise<Page> => {
      const res = await getLibraryApi(api).getItems(
        {
          ...slideshowRequest({
            userId: session?.user.id ?? '',
            parentId,
            recursive: params.recursive,
            sort: params.sort,
            filter: params.filter,
            playVideos,
          }),
          startIndex,
          limit,
          enableTotalRecordCount: true,
        },
        { signal },
      )
      return { items: res.data.Items ?? [], total: res.data.TotalRecordCount ?? res.data.Items?.length ?? 0 }
    },
    [api, session, parentId, params.recursive, params.sort, params.filter, playVideos],
  )
  const items = usePagedItems(
    qk('photos', 'slideshow', parentId, { recursive: params.recursive, sort: params.sort, filter: params.filter, playVideos }),
    fetchPage,
    !!session,
  )
  const total = items.total

  // ---- start position: the clicked photo by id (the grid index counts albums and videos too), else the index
  const [position, setPosition] = useState<number | null>(null)
  useEffect(() => {
    if (items.status !== 'success' || position != null) return
    let cancelled = false
    void (async () => {
      const clampIndex = Math.min(Math.max(0, params.index), Math.max(0, total - 1))
      let found = -1
      if (params.itemId && total > 0) {
        const last = Math.floor((total - 1) / PAGE_SIZE)
        const startPage = Math.min(Math.floor(params.index / PAGE_SIZE), last)
        const order: number[] = []
        for (let n = startPage; n >= 0; n--) order.push(n)
        for (let n = startPage + 1; n <= last; n++) order.push(n)
        for (const n of order.slice(0, MAX_SCAN_PAGES)) {
          const page = await items.page(n).catch(() => [] as BaseItemDto[])
          const i = page.findIndex((it) => it.Id === params.itemId)
          if (i >= 0) {
            found = n * PAGE_SIZE + i
            break
          }
        }
      }
      if (!cancelled) setPosition(found >= 0 ? found : clampIndex)
    })()
    return () => {
      cancelled = true
    }
  }, [items, position, params.index, params.itemId, total])

  const pos = position ?? 0
  const item = position != null ? items.get(pos) : undefined
  const isVideo = item?.MediaType === 'Video' || item?.Type === 'Video'

  // ---- slideshow state + timer
  const [ss, setSs] = useState({ enabled: false, paused: false })
  // a tick advances, or goes back to the first item at the end (if (!nextImage()) updatePosition(0))
  const [timer] = useState(
    () =>
      new SlideshowTimer(
        slideshowDelay(durationPref),
        (tm) => {
          setPosition((p) => (p == null ? p : p + 1 < tm.size ? p + 1 : 0))
        },
        (s) => setSs(s),
      ),
  )
  useEffect(() => timer.setDelay(slideshowDelay(durationPref)), [timer, durationPref])
  useEffect(() => timer.setSize(total), [timer, total])
  useEffect(() => () => timer.dispose(), [timer])
  useEffect(() => {
    keepScreenOn(ss.enabled, 'slideshow')
  }, [ss.enabled])
  useEffect(() => () => keepScreenOn(false, 'slideshow'), [])

  const goTo = useCallback((index: number) => setPosition(index), [])
  const next = useCallback((): boolean => {
    if (position == null) return false
    if (position + 1 < total) {
      goTo(position + 1)
      return true
    }
    return false
  }, [position, total, goTo])
  const previous = useCallback((): boolean => {
    if (position == null) return false
    if (position - 1 >= 0) {
      goTo(position - 1)
      return true
    }
    return false
  }, [position, goTo])

  // ---- per-image UI state (reset when the image changes)
  const [transform, setTransform] = useState<Transform>(IDENTITY)
  const [animate, setAnimate] = useState(true)
  const [showOverlay, setShowOverlay] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [showDuration, setShowDuration] = useState(false)
  const [failed, setFailed] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [albumFilter, setAlbumFilter] = useState<ImageFilter>(() => loadImageFilter(parentId, 'PHOTO_ALBUM') ?? DEFAULT_FILTER)
  const [imageFilter, setImageFilter] = useState<ImageFilter>(albumFilter)
  const itemId = item?.Id ?? null
  const [seenItem, setSeenItem] = useState<string | null>(null)
  if (itemId !== seenItem) {
    setSeenItem(itemId)
    setTransform(IDENTITY)
    setAnimate(false)
    setFailed(false)
    // the album filter first, then the photo's own saved one (SlideshowViewModel.kt:266-291)
    const own = itemId ? loadImageFilter(itemId, 'PHOTO') : null
    setImageFilter(own && hasImageFilter(own) ? own : albumFilter)
  }

  // ---- the address follows the photo on screen, so a reload or Back / Forward to this entry comes back to it
  useEffect(() => {
    if (position == null || !itemId) return
    const next = withViewerPosition(new URLSearchParams(searchKey), position, itemId)
    if (next) setSearch(next, { replace: true })
  }, [position, itemId, searchKey, setSearch])

  // ---- media for the stage
  const edge = screenImageEdge(screen, dpr)
  const media: StageMedia | null = useMemo(() => {
    if (!item?.Id || !base) return null
    if (isVideo) return { kind: 'video', key: item.Id, src: slideshowVideoUrl(base, item, token), loop: !ss.enabled }
    const src = resizedPhotoUrl(base, item, edge)
    if (!src) return null
    const wantOriginal = needsOriginal({
      zoom: transform.zoom,
      edge,
      imageWidth: item.Width,
      imageHeight: item.Height,
      screen,
      dpr,
      rotated: Math.abs(Math.round(transform.rotation / 90)) % 2 === 1,
    })
    return {
      kind: 'photo',
      key: item.Id,
      src,
      originalSrc: wantOriginal ? originalPhotoUrl(base, item.Id, token) : null,
      matrix: colorMatrix(imageFilter),
    }
  }, [item, base, token, isVideo, ss.enabled, edge, transform.zoom, transform.rotation, screen, dpr, imageFilter])

  // ---- prefetch the neighbour in the travel direction (photos only)
  const lastPos = useRef<number | null>(null)
  useEffect(() => {
    if (position == null || !base) return
    // travel direction from the previous position (the wrap from the last item to 0 counts as forward)
    const prev = lastPos.current
    lastPos.current = position
    const forward = prev == null || position > prev || (prev === total - 1 && position === 0)
    const n = position + (forward ? 1 : -1)
    if (n < 0 || n >= total) return
    let cancelled = false
    void items.fetch(n).then((it) => {
      if (cancelled || !it || it.MediaType === 'Video' || it.Type === 'Video') return
      const url = resizedPhotoUrl(base, it, edge)
      if (url) new Image().src = url
    })
    return () => {
      cancelled = true
    }
  }, [position, total, base, edge, items])

  // ---- overlay / transforms (SlideshowPage.kt)
  const openOverlay = useCallback(() => {
    setShowOverlay(true)
    timer.pause()
  }, [timer])
  const closeOverlay = useCallback(() => {
    setShowOverlay(false)
    timer.unpause()
    timer.pulse()
  }, [timer])
  const zoom = useCallback((factor: number) => {
    setAnimate(true)
    setTransform((tr) => applyZoom(tr, factor))
  }, [])
  const pan = useCallback(
    (x: number, y: number) => {
      setAnimate(true)
      setTransform((tr) => applyPan(tr, dp(x), dp(y), screen))
    },
    [screen],
  )
  const startSlideshow = useCallback(() => {
    setShowOverlay(false)
    timer.start(isVideo)
  }, [timer, isVideo])
  const stopSlideshow = useCallback(() => timer.stop(), [timer])
  const step = useCallback(
    (dir: 1 | -1) => {
      if (dir === 1 ? !next() : !previous()) toast(t(dir === 1 ? 'no_more_images' : 'slideshow_at_beginning'))
    },
    [next, previous, t],
  )

  // auto start (Destination.Slideshow.startSlideshow) once the first item is known
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!params.start || autoStarted.current || !item) return
    autoStarted.current = true
    timer.start(isVideo)
  }, [params.start, item, isVideo, timer])

  // videos follow the slideshow: no loop while it runs, loop otherwise
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = !ss.enabled
  }, [ss.enabled])

  // ---- web chrome: shown while the pointer moves, hidden after 3 s
  const [chrome, setChrome] = useState(false)
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | null = null
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      setChrome(true)
      if (id) clearTimeout(id)
      id = setTimeout(() => setChrome(false), CHROME_HIDE_MS)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (id) clearTimeout(id)
    }
  }, [])

  // ---- fullscreen
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => {
      document.removeEventListener('fullscreenchange', on)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined)
  }, [])

  const playPause = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }, [])

  // ---- keys (SlideshowPage.kt:231-307): actions on key-up; a held Up / Down zooms
  // `down` holds the keys whose key-down this page took for a key-up action: a key-up without one (the Enter that
  // clicked 'Play slideshow', or the Enter that opened this page from a grid card) is ignored, as on TV where the
  // control that consumed the key-down also consumes its key-up.
  const keyState = useRef({ longPressing: false, down: new Set<string>() })
  const live = useRef({ showOverlay, showFilter, showDuration, transform, zoom, pan, step, openOverlay, closeOverlay, toggleFullscreen, timer })
  useEffect(() => {
    live.current = { showOverlay, showFilter, showDuration, transform, zoom, pan, step, openOverlay, closeOverlay, toggleFullscreen, timer }
  })
  useEffect(() => {
    const arrows = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
    const onDown = (e: KeyboardEvent) => {
      const L = live.current
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(document.activeElement)) return
      if (L.showFilter || L.showDuration) return
      if (L.showOverlay) {
        if (e.key === 'Escape') {
          e.preventDefault()
          L.closeOverlay()
        }
        return
      }
      const onControl = !!(document.activeElement as Element | null)?.closest?.('button, a, [role="slider"]')
      if (onControl && (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab')) return
      if (e.repeat) {
        keyState.current.longPressing = true
        if (e.key === 'ArrowUp') L.zoom(ZOOM_REPEAT_STEP)
        else if (e.key === 'ArrowDown') L.zoom(-ZOOM_REPEAT_STEP)
        if (arrows.has(e.key) || e.key === 'Enter' || e.key === ' ') e.preventDefault()
        return
      }
      if (arrows.has(e.key) || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        keyState.current.down.add(e.key)
        return
      }
      if (e.key === 'Escape' && isZoomed(L.transform.zoom)) {
        e.preventDefault()
        setAnimate(true)
        setTransform((tr) => resetTransform(tr, false))
        L.timer.pulse()
        return
      }
      // web keys
      if (e.key === '+' || e.key === '=') L.zoom(ZOOM_BUTTON_STEP)
      else if (e.key === '-' || e.key === '_') L.zoom(-ZOOM_BUTTON_STEP)
      else if (e.key === '0') {
        setAnimate(true)
        setTransform((tr) => resetTransform(tr, true))
      } else if (e.key === 'f' || e.key === 'F') L.toggleFullscreen()
      else return
      e.preventDefault()
      L.timer.pulse()
    }
    const onUp = (e: KeyboardEvent) => {
      const L = live.current
      if (!keyState.current.down.delete(e.key)) return
      if (L.showOverlay || L.showFilter || L.showDuration || isTypingTarget(document.activeElement)) return
      if (keyState.current.longPressing) {
        keyState.current.longPressing = false
        e.preventDefault()
        return
      }
      const onControl = !!(document.activeElement as Element | null)?.closest?.('button, a, [role="slider"]')
      if (onControl && (e.key === 'Enter' || e.key === ' ')) return
      const zoomed = isZoomed(L.transform.zoom)
      const rtl = document.documentElement.dir === 'rtl'
      if (zoomed && arrows.has(e.key)) {
        if (e.key === 'ArrowLeft') L.pan(PAN_STEP_DP, 0)
        else if (e.key === 'ArrowRight') L.pan(-PAN_STEP_DP, 0)
        else if (e.key === 'ArrowUp') L.pan(0, PAN_STEP_DP)
        else L.pan(0, -PAN_STEP_DP)
        L.timer.pulse()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // navigation does not pulse: the next image's load does.
        // Right-to-left languages: the key that points at the on-screen "next" arrow (on the left there) goes
        // next, as in every row and grid of the web app. Upstream (SlideshowPage.kt:269-290) reads the raw keys:
        // Left is previous in every language. Deliberate deviation.
        L.step((e.key === 'ArrowRight') !== rtl ? 1 : -1)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        L.openOverlay()
        L.timer.pulse()
      }
    }
    // a key released while the window had no focus never reaches onUp
    const onBlur = () => {
      keyState.current.down.clear()
      keyState.current.longPressing = false
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // ---- render
  if (items.status === 'error') {
    return (
      <div className={styles.page} data-no-focus-restore>
        <ErrorMessage className={styles.errorState} title={t('compose_error_message_title')} detail={items.error?.message} />
        <div className={styles.topBar} data-visible="">
          <BackButton />
        </div>
      </div>
    )
  }
  const loadingItem = items.status === 'pending' || position == null || (total > 0 && !item)
  const chromeVisible = (chrome || showOverlay) && !showFilter
  const durationValue = slideshowDelay(durationPref)

  return (
    <div className={styles.page} data-no-focus-restore data-slideshow data-slideshow-state={ss.enabled ? (ss.paused ? 'paused' : 'running') : 'off'}>
      {total === 0 && items.status === 'success' ? (
        // an empty list ends in ImageLoadingState.Error upstream (SlideshowViewModel.updatePosition, SlideshowPage.kt:310)
        <ErrorMessage className={styles.errorState} title={t('compose_error_message_title')} message={t('web_photos_error_loading_image')} />
      ) : (
        <SlideshowStage
          media={media}
          failed={failed}
          transform={transform}
          animate={animate}
          screen={screen}
          videoRef={videoRef}
          onTransform={(tr, anim) => {
            setAnimate(anim)
            setTransform(tr)
            timer.pulse()
          }}
          onTap={() => (showOverlay ? closeOverlay() : (openOverlay(), timer.pulse()))}
          onSwipe={step}
          onLoadStart={() => timer.park()}
          onLoaded={() => {
            setFailed(false)
            if (!isVideo) timer.pulse()
            else timer.park()
          }}
          onError={(message) => {
            setFailed(true)
            toast(t('web_photos_error_loading_image_detail', { p1: message }), { long: true })
            timer.pulse()
          }}
          onVideoEnded={() => timer.pulse()}
          onVideoPlayingChange={setVideoPlaying}
        />
      )}
      {loadingItem && total !== 0 && <LoadingPage className={styles.loading} label={t('loading')} />}

      <div className={styles.topBar} data-visible={chromeVisible ? '' : undefined}>
        <BackButton />
        <IconButton
          label={t(fullscreen ? 'web_playback_exit_fullscreen' : 'web_playback_fullscreen')}
          icon={<MaterialIcon name={fullscreen ? 'fullscreen_exit' : 'fullscreen'} />}
          onClick={toggleFullscreen}
        />
      </div>
      {!showOverlay && !showFilter && total > 1 && (
        <>
          <div className={`${styles.side} ${styles.prev}`} data-visible={chrome ? '' : undefined}>
            <IconButton label={t('web_previous')} icon={<MaterialIcon name="chevron_left" className={styles.flipRtl} />} onClick={() => step(-1)} />
          </div>
          <div className={`${styles.side} ${styles.next}`} data-visible={chrome ? '' : undefined}>
            <IconButton label={t('web_next')} icon={<MaterialIcon name="chevron_right" className={styles.flipRtl} />} onClick={() => step(1)} />
          </div>
        </>
      )}

      <div className={styles.overlaySlot} data-open={showOverlay && item && !failed ? '' : undefined}>
        {showOverlay && item && !failed && (
          <ImageOverlay
            item={item}
            position={pos}
            count={total}
            slideshowEnabled={ss.enabled}
            isVideo={isVideo}
            videoPlaying={videoPlaying}
            onStartSlideshow={startSlideshow}
            onStopSlideshow={stopSlideshow}
            onPlayPause={playPause}
            onRotate={(deg) => {
              setAnimate(true)
              setTransform((tr) => ({ ...tr, rotation: tr.rotation + deg }))
            }}
            onZoom={zoom}
            onReset={() => {
              setAnimate(true)
              setTransform((tr) => resetTransform(tr, true))
            }}
            onFilter={() => {
              setShowFilter(true)
              setShowOverlay(false)
              timer.pause()
            }}
            onDuration={() => setShowDuration(true)}
          />
        )}
      </div>

      {showFilter && (
        <ImageFilterDialog
          filter={imageFilter}
          showSaveAlbum={!!parentId}
          onChange={setImageFilter}
          onSave={() => {
            if (itemId && saveImageFilter(itemId, 'PHOTO', imageFilter)) toast(t('web_photos_saved'))
          }}
          onSaveAlbum={() => {
            if (!parentId) return
            setAlbumFilter(imageFilter)
            if (saveImageFilter(parentId, 'PHOTO_ALBUM', imageFilter)) toast(t('web_photos_saved'))
          }}
          onClose={() => {
            setShowFilter(false)
            timer.unpause()
            timer.pulse()
          }}
        />
      )}
      <DialogPopup
        open={showDuration}
        title={t('slideshow_duration')}
        onClose={() => setShowDuration(false)}
        initialFocusIndex={Math.max(0, DURATIONS.indexOf(durationValue))}
        items={DURATIONS.map((ms) => ({
          key: String(ms),
          headline: t('decimal_seconds', { p1: (ms / 1000).toFixed(2) }),
          leading: <SelectedDot selected={ms === durationValue} />,
          onSelect: () => setPref('slideshowDuration', ms),
        }))}
      />
    </div>
  )
}
