// Dev-only component gallery (mounted at /dev/gallery). Sample labels are literal English on purpose:
// this page is not part of the product UI and is not translated.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { THEME_NAMES, type ThemeName } from '../../theme/themes.gen'
import {
  AlphabetPicker,
  AppLogo,
  BannerCard,
  BannerCardWithTitle,
  Button,
  CardGrid,
  ChapterCard,
  CircularProgress,
  CommunityRating,
  ConfirmDialog,
  ContextMenu,
  CriticRating,
  Dialog,
  DialogPopup,
  DiscoverItemCard,
  DrawableIcon,
  DropdownMenu,
  DropdownMenuItem,
  ErrorMessage,
  ExpandableButton,
  FaIcon,
  FA_CODEPOINTS,
  GenreCard,
  GridCard,
  IconButton,
  ItemRow,
  ListItem,
  LoadingPage,
  LoadingRow,
  MaterialIcon,
  OverviewText,
  PersonCard,
  PlayButtons,
  PosterCard,
  QuickDetails,
  SearchField,
  SelectedDot,
  ServerCircleCard,
  Slider,
  StarRating,
  StreamChip,
  StudioCard,
  Switch,
  SwitchWithLabel,
  TabRow,
  TextButton,
  TextField,
  TitleOrLogo,
  TitleValueText,
  Toast,
  UserCircleCard,
  ViewMoreCard,
  WatchedBadge,
  contextMenuPoint,
  letterForSortName,
  type CardGridHandle,
  type DialogEntry,
  type FaName,
  type MaterialIconName,
  type MenuPoint,
} from '../index'
import styles from './GalleryPage.module.css'
import { GENRES, logo, MOVIES, PEOPLE, portrait, poster, still } from './samples'

const MATERIAL: MaterialIconName[] = [
  'check',
  'star',
  'arrow_forward',
  'arrow_back',
  'search',
  'settings',
  'warning',
  'arrow_drop_down',
  'chevron_left',
  'chevron_right',
  'close',
  'more_vert',
  'play_arrow',
  'refresh',
  'delete',
  'add',
  'home',
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

function Demo({ label, children, focus, wide }: { label: string; children: ReactNode; focus?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? styles.demoWide : styles.demo}>
      <div className={styles.demoBody} data-demo-focus={focus || undefined}>
        {children}
      </div>
      <span className={styles.demoLabel}>{label}</span>
    </div>
  )
}

const menuItems = (log: (s: string) => void): DialogEntry[] => [
  { headline: 'Go to', leading: <MaterialIcon name="arrow_forward" />, onSelect: () => log('Go to') },
  { headline: 'Play', leading: <MaterialIcon name="play_arrow" />, onSelect: () => log('Play') },
  { headline: 'Shuffle', leading: <FaIcon name="shuffle" />, onSelect: () => log('Shuffle') },
  { kind: 'divider' },
  { headline: 'Mark as watched', leading: <FaIcon name="eye" />, onSelect: () => log('Watched') },
  {
    headline: 'Remove from favorites',
    leading: <FaIcon name="heart" />,
    leadingColor: 'var(--fx-favorite-active)',
    onSelect: () => log('Unfavorite'),
  },
  { headline: 'Delete', supporting: 'Removes the file from the server', leading: <MaterialIcon name="delete" />, disabled: true, onSelect: () => log('Delete') },
]

export default function GalleryPage() {
  const [theme, setTheme] = useState<ThemeName>(() => (document.documentElement.dataset.theme as ThemeName) || 'PURPLE')
  const [log, setLog] = useState('—')
  const [switchOn, setSwitchOn] = useState(true)
  const [switch2, setSwitch2] = useState(false)
  const [slider, setSlider] = useState(40)
  const [text, setText] = useState('The Long Horizon')
  const [query, setQuery] = useState('')
  const [rating, setRating] = useState(70)
  const [tab, setTab] = useState('movies')
  const [dialog, setDialog] = useState<null | 'popup' | 'confirm' | 'delete' | 'scroll'>(null)
  const [menu, setMenu] = useState<{ open: boolean; point: MenuPoint | null; title: string }>({ open: false, point: null, title: '' })
  const [dropdown, setDropdown] = useState<HTMLElement | null>(null)
  const [letter, setLetter] = useState('A')
  const grid = useRef<CardGridHandle>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const openMenu = (title: string) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    setMenu({ open: true, point: contextMenuPoint(e), title })
  }
  const more = (title: string) => () => setMenu({ open: true, point: null, title })
  const items = menuItems(setLog)
  const gridTitles = Array.from({ length: 60 }, (_, i) => MOVIES[i % MOVIES.length].title + (i >= 10 ? ` ${i}` : ''))

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <span className={styles.brand}>
          <AppLogo size={32} withBackground /> Wholphin UI gallery
        </span>
        <div className={styles.themes} role="radiogroup" aria-label="Theme">
          {THEME_NAMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === theme}
              className={t === theme ? styles.themeOn : styles.theme}
              onClick={() => setTheme(t)}
              data-theme-button={t}
            >
              {t}
            </button>
          ))}
        </div>
        <span className={styles.log} aria-live="polite">
          last action: {log}
        </span>
      </header>

      <Section id="icons" title="Icons">
        <div className={styles.wrap}>
          {(Object.keys(FA_CODEPOINTS) as FaName[]).map((n) => (
            <span key={n} className={styles.iconCell} title={n}>
              <FaIcon name={n} size={20} />
            </span>
          ))}
        </div>
        <div className={styles.wrap}>
          {MATERIAL.map((n) => (
            <span key={n} className={styles.iconCell} title={n}>
              <MaterialIcon name={n} />
            </span>
          ))}
          <span className={styles.iconCell} title="video_solid">
            <DrawableIcon name="video_solid" size={20} />
          </span>
          <span className={styles.iconCell} title="gf_dvr">
            <DrawableIcon name="gf_dvr" size={24} />
          </span>
          <span className={styles.iconCell} title="rt_fresh">
            <DrawableIcon name="rt_fresh" size={22} />
          </span>
          <span className={styles.iconCell} title="rt_rotten">
            <DrawableIcon name="rt_rotten" size={22} />
          </span>
          <span className={styles.iconCell} title="captions">
            <DrawableIcon name="captions" size={24} />
          </span>
          <AppLogo size={40} withBackground />
          <AppLogo variant="banner" size={56} />
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className={styles.wrap}>
          <Demo label="Button">
            <Button onClick={() => setLog('Button')}>Sort by name</Button>
          </Demo>
          <Demo label="Button focused" focus>
            <Button>Sort by name</Button>
          </Demo>
          <Demo label="Button disabled">
            <Button disabled>Unavailable</Button>
          </Demo>
          <Demo label="disabled + focused" focus>
            <Button disabled>Unavailable</Button>
          </Demo>
          <Demo label="TextButton">
            <TextButton onClick={() => setLog('TextButton')}>Send app logs</TextButton>
          </Demo>
          <Demo label="TextButton focused" focus>
            <TextButton>Send app logs</TextButton>
          </Demo>
          <Demo label="IconButton (link)">
            <IconButton href="#buttons" label="Jump up" icon={<FaIcon name="angles_up" />} />
          </Demo>
          <Demo label="IconButton focused" focus>
            <IconButton label="Jump down" icon={<FaIcon name="angle_down" />} />
          </Demo>
        </div>
        <Demo label="PlayButtons: icon-only, label slides out on focus/hover (first shows label on touch)" wide>
          <PlayButtons label="Actions">
            <ExpandableButton label="Resume" icon={<MaterialIcon name="play_arrow" />} labelOnTouch onClick={() => setLog('Resume')} />
            <ExpandableButton label="Restart" icon={<MaterialIcon name="refresh" mirror />} onClick={() => setLog('Restart')} />
            <ExpandableButton label="Version" iconKind="fa" icon={<FaIcon name="file_video" />} />
            <ExpandableButton label="Mark as watched" iconKind="fa" icon={<FaIcon name="eye_slash" />} />
            <ExpandableButton label="Remove favorite" iconKind="fa" icon={<FaIcon name="heart" />} iconColor="var(--fx-favorite-active)" />
            <ExpandableButton label="No trailers" iconKind="fa" icon={<FaIcon name="film" />} disabled />
            <ExpandableButton label="Delete" icon={<MaterialIcon name="delete" />} destructive />
            <ExpandableButton label="More" icon={<MaterialIcon name="more_vert" />} onClick={more('The Long Horizon')} />
          </PlayButtons>
        </Demo>
        <div className={styles.wrap}>
          <Demo label="ExpandableButton focused" focus>
            <ExpandableButton label="Play" icon={<MaterialIcon name="play_arrow" />} />
          </Demo>
          <Demo label="Fa focused" focus>
            <ExpandableButton label="Add favorite" iconKind="fa" icon={<FaIcon name="heart" />} />
          </Demo>
          <Demo label="Delete focused" focus>
            <ExpandableButton label="Delete" icon={<MaterialIcon name="delete" />} destructive />
          </Demo>
        </div>
      </Section>

      <Section id="cards" title="Cards (hover, Tab, or right-click any card; ⋮ on touch)">
        <div className={styles.cardStrip}>
          <Demo label="GridCard">
            <GridCard
              width={120}
              title={MOVIES[0].title}
              subtitle={MOVIES[0].year}
              imageSrc={poster(0, MOVIES[0].title)}
              fit="fill"
              favorite
              versionCount={2}
              onClick={() => setLog('GridCard')}
              onContextMenu={openMenu(MOVIES[0].title)}
              onMore={more(MOVIES[0].title)}
              moreLabel="More"
            />
          </Demo>
          <Demo label="GridCard focused" focus>
            <GridCard width={120} title={MOVIES[3].title} subtitle={MOVIES[3].year} imageSrc={poster(3, 'Marquee')} fit="fill" watched />
          </Demo>
          <Demo label="unplayed + progress">
            <GridCard width={120} title="Northbound" subtitle="2010 - Present" imageSrc={poster(8, 'Northbound')} fit="fill" unplayedCount={12} playedPercent={35} />
          </Demo>
          <Demo label="no image">
            <GridCard width={120} title="Missing Art" subtitle="2001" imageSrc={null} />
          </Demo>
          <Demo label="broken URL">
            <GridCard width={120} title="Broken" subtitle="404" imageSrc="data:image/png;base64,AAAA" />
          </Demo>
          <Demo label="PosterCard (Season)">
            <PosterCard height={172} title="Season 1" subtitle="10 episodes" imageSrc={poster(5, 'Season 1')} fit="fill" showOverlay watched onContextMenu={openMenu('Season 1')} />
          </Demo>
          <Demo label="PosterCard focused" focus>
            <PosterCard height={172} title="Season 2" subtitle="8 episodes" imageSrc={poster(6, 'Season 2')} fit="fill" showOverlay unplayedCount={3} />
          </Demo>
          <Demo label="PersonCard">
            <PersonCard name={PEOPLE[1].name} role={PEOPLE[1].role} imageSrc={portrait(1)} onContextMenu={openMenu(PEOPLE[1].name)} />
          </Demo>
          <Demo label="PersonCard focused" focus>
            <PersonCard name={PEOPLE[0].name} role={PEOPLE[0].role} imageSrc={portrait(0)} />
          </Demo>
          <Demo label="no photo">
            <PersonCard name={PEOPLE[3].name} role={PEOPLE[3].role} />
          </Demo>
          <Demo label="ViewMoreCard">
            <ViewMoreCard label="View more" height={172} onClick={() => setLog('View more')} />
          </Demo>
          <Demo label="DiscoverItemCard">
            <DiscoverItemCard title="Ember" subtitle="2024" posterSrc={poster(5, 'Ember')} mediaType="movie" typeLabel="Movie" availability="available" availabilityLabel="Available" />
          </Demo>
          <Demo label="pending / TV">
            <DiscoverItemCard title="Paper Moons" subtitle="1998" posterSrc={poster(2, 'Paper Moons')} mediaType="tv" typeLabel="TV Show" availability="pending" />
          </Demo>
          <Demo label="partial / person" focus>
            <DiscoverItemCard title="Mei Tanaka" posterSrc={portrait(2)} mediaType="person" typeLabel="Person" availability="partially_available" />
          </Demo>
        </div>
        <div className={styles.cardStrip}>
          <Demo label="BannerCard (episode)">
            <BannerCard name="Pilot" imageSrc={still(1, 'S1 E1')} height={128} played cornerText="3" favorite onContextMenu={openMenu('Pilot')} />
          </Demo>
          <Demo label="BannerCard focused, progress" focus>
            <BannerCard name="The Bridge" imageSrc={still(2, 'S1 E2')} height={128} playedPercent={62} />
          </Demo>
          <Demo label="BannerCard no image">
            <BannerCard name="An Episode Without Artwork" height={128} />
          </Demo>
          <Demo label="BannerCardWithTitle">
            <BannerCardWithTitle title="Quiet Harbor" subtitle="S2 E5 - Low Tide" imageSrc={still(4)} height={128} />
          </Demo>
          <Demo label="BannerCardWithTitle focused" focus>
            <BannerCardWithTitle title="A Very Long Episode Title That Scrolls" subtitle="S2 E6 - High Tide" imageSrc={still(5)} height={128} />
          </Demo>
          <Demo label="ChapterCard">
            <ChapterCard name="Opening" time="0m" imageSrc={still(6)} height={96} />
          </Demo>
          <Demo label="ChapterCard focused" focus>
            <ChapterCard name="The Long Walk Home" time="12m 30s" imageSrc={still(7)} height={96} />
          </Demo>
        </div>
        <div className={styles.cardStrip}>
          {GENRES.map((g, i) => (
            <Demo key={g.id} label={i === 0 ? 'GenreCard' : i === 1 ? 'GenreCard focused' : 'GenreCard'} focus={i === 1}>
              <GenreCard id={g.id} name={g.name} imageSrc={i < 2 ? still(i + 2) : null} width={200} />
            </Demo>
          ))}
          <Demo label="StudioCard (image)">
            <StudioCard id={GENRES[0].id} name="Northlight" imageSrc={still(9, 'NORTHLIGHT')} width={200} />
          </Demo>
          <Demo label="StudioCard (no image)">
            <StudioCard id={GENRES[2].id} name="Harbor Pictures" width={200} />
          </Demo>
        </div>
        <div className={styles.cardStrip}>
          <Demo label="UserCircleCard">
            <UserCircleCard id="38f5f7a0-9f4c-4e1b-8a43-1f2e3d4c5b6a" name="nadia" onClick={() => setLog('user')} />
          </Demo>
          <Demo label="current, focused" focus>
            <UserCircleCard id="e9b1c3f0-1234-4bcd-9abc-0123456789ab" name="Sam" isCurrent />
          </Demo>
          <Demo label="with image">
            <UserCircleCard id="a1b2c3d4-e5f6-4789-abcd-ef0123456789" name="Priya" imageSrc={portrait(4)} />
          </Demo>
          <Demo label="ServerCircleCard">
            <ServerCircleCard id="5d2f1a0e-7c3b-4a9d-8e6f-abcdefabcdef" name="https://media.example.org" />
          </Demo>
          <Demo label="error">
            <ServerCircleCard id="12345678-9abc-4ef0-9234-56789abcdef0" name="Basement" status="error" statusLabel="Connection refused" />
          </Demo>
          <Demo label="unsupported soon">
            <ServerCircleCard id="fedcba98-7654-4210-bedc-ba9876543210" name="Old box" status="unsupported_future" />
          </Demo>
          <Demo label="pending">
            <ServerCircleCard id="00000000-0000-4000-8000-000000000001" name="Loading" status="pending" />
          </Demo>
          <Demo label="add">
            <ServerCircleCard name="Add server" add />
          </Demo>
        </div>
        <div className={styles.wrap}>
          <Demo label="WatchedBadge">
            <WatchedBadge />
          </Demo>
          <Demo label="QuickDetails" wide>
            <QuickDetails parts={['2023', '2h 4m', '45m left']} officialRating="PG-13" communityRating={7.46} criticRating={91} endsAt="Ends at 10:42 PM" />
          </Demo>
          <Demo label="rotten">
            <QuickDetails parts={['S2 E5', 'Aug 24, 2000']} communityRating={5.1} criticRating={32} />
          </Demo>
        </div>
      </Section>

      <Section id="rows" title="Rows and grids">
        <ItemRow
          title="Continue Watching"
          count={MOVIES.length + 1}
          itemWidth={(i) => (i === MOVIES.length ? (172 * 2) / 3 : (172 * 2) / 3)}
          restoreKey="gallery-row-1"
          renderItem={(i) =>
            i === MOVIES.length ? (
              <ViewMoreCard label="View more" />
            ) : (
              <PosterCard
                title={MOVIES[i].title}
                subtitle={MOVIES[i].year}
                imageSrc={poster(i, MOVIES[i].title)}
                fit="fill"
                showOverlay
                playedPercent={i % 3 === 0 ? 40 : undefined}
                favorite={i === 2}
                onClick={() => setLog(MOVIES[i].title)}
                onContextMenu={openMenu(MOVIES[i].title)}
                onMore={more(MOVIES[i].title)}
                moreLabel="More"
              />
            )
          }
        />
        <ItemRow
          title="Next Up (200 items, virtualized)"
          count={200}
          itemWidth={(128 * 16) / 9}
          restoreKey="gallery-row-2"
          renderItem={(i) => (
            <BannerCardWithTitle
              title={`Episode ${i + 1}`}
              subtitle={`S1 E${i + 1}`}
              imageSrc={still(i, `E${i + 1}`)}
              height={128}
              playedPercent={i % 4 === 1 ? 70 : 0}
              onContextMenu={openMenu(`Episode ${i + 1}`)}
            />
          )}
        />
        <ItemRow
          title="Cast & Crew"
          count={PEOPLE.length}
          itemWidth={108}
          renderItem={(i) => <PersonCard name={PEOPLE[i].name} role={PEOPLE[i].role} imageSrc={i === 3 ? null : portrait(i)} />}
        />
        <LoadingRow title="Recently Added" message="Loading…" />
        <LoadingRow title="Favorites" message="Request failed with status code 500" error focusable />
        <div className={styles.gridWithPicker}>
          <div className={styles.gridArea}>
            <h3 className={styles.subTitle}>CardGrid: auto-fit (min 120dp)</h3>
            <CardGrid
              ref={grid}
              count={gridTitles.length}
              columns={{ kind: 'auto', minCardWidth: 120 }}
              renderItem={(i) => (
                <GridCard
                  title={gridTitles[i]}
                  subtitle={MOVIES[i % MOVIES.length].year}
                  imageSrc={i % 7 === 6 ? null : poster(i, gridTitles[i])}
                  fit="fill"
                  watched={i % 5 === 0}
                  unplayedCount={i % 9 === 4 ? 5 : undefined}
                  onClick={() => setLetter(letterForSortName(gridTitles[i]))}
                  onContextMenu={openMenu(gridTitles[i])}
                />
              )}
            />
          </div>
          <AlphabetPicker
            current={letter}
            label="Jump to letter"
            className={styles.picker}
            onSelect={(l) => {
              setLetter(l)
              const idx = gridTitles.findIndex((t) => letterForSortName(t) === l)
              if (idx >= 0) grid.current?.scrollToIndex(idx)
            }}
          />
        </div>
        <h3 className={styles.subTitle}>CardGrid: fixed 4 columns, wide</h3>
        <CardGrid
          count={8}
          columns={{ kind: 'fixed', columns: 4 }}
          gap={24}
          renderItem={(i) => <GridCard title={`Clip ${i + 1}`} subtitle="Home video" aspectRatio={16 / 9} fit="cover" imageSrc={still(i)} />}
        />
      </Section>

      <Section id="feedback" title="Feedback">
        <div className={styles.wrap}>
          <Demo label="CircularProgress 40">
            <CircularProgress label="Loading" />
          </Demo>
          <Demo label="LoadingPage (300ms delay)">
            <div style={{ width: 160, height: 120 }}>
              <LoadingPage delayMs={300} label="Loading" />
            </div>
          </Demo>
          <Demo label="Toast">
            <Toast message="Added to favorites" />
          </Demo>
          <Demo label="Toast error">
            <Toast message="Could not reach the server" tone="error" action={<TextButton>Retry</TextButton>} />
          </Demo>
        </div>
        <ErrorMessage
          title="An error occurred"
          message="Could not load this library"
          detail="Request failed with status code 500"
          causes={['Caused by: java.net.SocketTimeoutException: timeout']}
          action={<TextButton>Send app logs</TextButton>}
        />
      </Section>

      <Section id="overlays" title="Overlays">
        <div className={styles.wrap}>
          <TextButton onClick={() => setDialog('popup')}>DialogPopup</TextButton>
          <TextButton onClick={() => setDialog('confirm')}>ConfirmDialog</TextButton>
          <TextButton onClick={() => setDialog('delete')}>Delete dialog</TextButton>
          <TextButton onClick={() => setDialog('scroll')}>ScrollableDialog</TextButton>
          <TextButton onClick={() => setMenu({ open: true, point: null, title: 'The Long Horizon' })}>ContextMenu (dialog)</TextButton>
          <TextButton onContextMenu={openMenu('Right-clicked')} onClick={(e) => setMenu({ open: true, point: { x: e.clientX, y: e.clientY }, title: 'At pointer' })}>
            ContextMenu (at pointer)
          </TextButton>
          <Button onClick={(e) => setDropdown(dropdown ? null : e.currentTarget)}>
            <span style={{ paddingInlineStart: '0.5rem' }}>Sort by</span> <MaterialIcon name="arrow_drop_down" />
          </Button>
        </div>
        <div className={styles.listPanel}>
          <ListItem headline="Default list item" supporting="Supporting text" leading={<FaIcon name="film" />} onClick={() => setLog('list')} />
          <div data-demo-focus>
            <ListItem headline="Focused list item" overline="Overline" supporting="Supporting" leading={<FaIcon name="tv" />} trailing="1080p" />
          </div>
          <ListItem headline="Selected (radio-style)" leading={<SelectedDot selected />} selected />
          <ListItem headline="Not selected" leading={<SelectedDot selected={false} />} />
          <ListItem headline="Disabled" disabled leading={<FaIcon name="xmark" />} />
          <ListItem headline="Dense item" dense trailing="Auto" />
        </div>
      </Section>

      <Section id="inputs" title="Inputs">
        <div className={styles.wrap}>
          <Demo label="TextField">
            <TextField label="Name" value={text} onChange={setText} />
          </Demo>
          <Demo label="TextField focused" focus>
            <TextField label="Server" value="https://media.example.org" onChange={() => {}} />
          </Demo>
          <Demo label="invalid">
            <TextField label="Port" value="99999" onChange={() => {}} invalid />
          </Demo>
          <Demo label="disabled">
            <TextField label="Disabled" value="Read only" onChange={() => {}} disabled />
          </Demo>
          <Demo label="SearchField">
            <SearchField label="Search" placeholder="Search" value={query} onChange={setQuery} onSearch={(q) => setLog(`search ${q}`)} />
          </Demo>
          <Demo label="multiline">
            <TextField label="Notes" value={'Line one\nLine two\nLine three'} onChange={() => {}} maxLines={4} />
          </Demo>
        </div>
        <div className={styles.wrap}>
          <Demo label="Switch">
            <Switch checked={switchOn} onChange={setSwitchOn} label="Switch" />
          </Demo>
          <Demo label="off">
            <Switch checked={false} onChange={() => {}} label="Off" />
          </Demo>
          <Demo label="disabled">
            <Switch checked disabled label="Disabled" />
          </Demo>
          <Demo label="SwitchWithLabel">
            <SwitchWithLabel label="Show titles" checked={switch2} onChange={setSwitch2} />
          </Demo>
          <Demo label="focused" focus>
            <SwitchWithLabel label="Show titles" checked onChange={() => {}} />
          </Demo>
        </div>
        <div className={styles.wrap}>
          <Demo label={`Slider (${slider})`} wide>
            <div style={{ width: 280 }}>
              <Slider label="Volume" value={slider} min={0} max={100} step={5} onChange={setSlider} />
            </div>
          </Demo>
          <Demo label="Slider focused" focus wide>
            <div style={{ width: 280 }}>
              <Slider label="Speed" value={60} min={0} max={100} onChange={() => {}} />
            </div>
          </Demo>
        </div>
      </Section>

      <Section id="text" title="Text bits">
        <TabRow
          label="Library"
          selectedKey={tab}
          onSelect={setTab}
          tabs={[
            { key: 'recommended', label: 'Recommended' },
            { key: 'movies', label: 'Movies' },
            { key: 'collections', label: 'Collections' },
            { key: 'genres', label: 'Genres' },
            { key: 'studios', label: 'Studios' },
          ]}
        />
        <div data-demo-focus>
          <TabRow
            label="Focused tab row"
            selectedKey="genres"
            onSelect={() => {}}
            tabs={[
              { key: 'movies', label: 'Movies (row focused)' },
              { key: 'genres', label: 'Genres' },
            ]}
          />
        </div>
        <div className={styles.wrap}>
          <Demo label="CommunityRating">
            <span className="t-titleSmall">
              <CommunityRating value={7.46} />
            </span>
          </Demo>
          <Demo label="CriticRating fresh / rotten">
            <span className="t-titleSmall" style={{ display: 'flex', gap: 16 }}>
              <CriticRating value={91} />
              <CriticRating value={32} />
            </span>
          </Demo>
          <Demo label={`StarRating (${rating})`}>
            <StarRating label="Your rating" rating100={rating} onChange={setRating} precision="half" />
          </Demo>
          <Demo label="StreamChips" wide>
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <StreamChip icon="video" text="4K HEVC HDR10" />
              <StreamChip icon="volume_high" text="English 5.1 EAC3" count={3} />
              <StreamChip icon="closed_captioning" text="English (SDH) - a very long subtitle name" maxWidth count={6} />
            </span>
          </Demo>
          <Demo label="TitleValueText">
            <span style={{ display: 'flex', gap: 24 }}>
              <TitleValueText title="Director" value="Sam Ortiz" />
              <TitleValueText title="Studio" value="Northlight" onClick={() => setLog('studio')} />
            </span>
          </Demo>
          <Demo label="clickable focused" focus>
            <TitleValueText title="Genre" value="Drama" onClick={() => {}} />
          </Demo>
        </div>
        <div className={styles.wrap}>
          <Demo label="TitleOrLogo (logo)" wide>
            <TitleOrLogo title="Quiet Harbor" logoSrc={logo('Quiet Harbor')} />
          </Demo>
          <Demo label="TitleOrLogo (text)" wide>
            <TitleOrLogo title="A Title That Is Far Too Long To Fit On One Line Of The Header" logoSrc={null} as="p" />
          </Demo>
        </div>
        <div className={styles.overviewBox}>
          <OverviewText
            maxLines={3}
            label="Show full overview"
            text="A lighthouse keeper on a remote island discovers that the ships passing at night are not from this century. As the fog thickens, she must decide whether to warn them or to follow the light herself — and what it will cost the people waiting for her on the mainland. Long enough to be clamped at three lines on most widths."
          />
        </div>
      </Section>

      <Section id="rtl" title="RTL sample (dir=rtl)">
        <div dir="rtl" lang="he" className={styles.rtl}>
          <QuickDetails parts={['2023', '2 שע׳ 4 דק׳']} officialRating="PG-13" communityRating={7.4} criticRating={88} />
          <ItemRow
            title="המשך צפייה"
            count={6}
            itemWidth={(172 * 2) / 3}
            renderItem={(i) => (
              <PosterCard title={['אופק ארוך', 'רכבת לילה', 'ירחי נייר', 'נמל שקט', 'גחלת', 'צפונה'][i]} subtitle={MOVIES[i].year} imageSrc={poster(i, MOVIES[i].title)} fit="fill" showOverlay playedPercent={i === 1 ? 50 : undefined} favorite={i === 0} unplayedCount={i === 2 ? 4 : undefined} />
            )}
          />
          <PlayButtons>
            <ExpandableButton label="המשך" icon={<MaterialIcon name="play_arrow" />} labelOnTouch />
            <ExpandableButton label="מועדפים" iconKind="fa" icon={<FaIcon name="heart" />} />
          </PlayButtons>
          <div style={{ width: 280 }}>
            <Slider label="עוצמה" value={30} min={0} max={100} onChange={() => {}} />
          </div>
          <TabRow selectedKey="b" onSelect={() => {}} tabs={[{ key: 'a', label: 'מומלצים' }, { key: 'b', label: 'סרטים' }, { key: 'c', label: 'ז׳אנרים' }]} />
        </div>
      </Section>

      <DialogPopup
        open={dialog === 'popup'}
        title="Choose version"
        onClose={() => setDialog(null)}
        items={[
          { headline: '4K HDR', supporting: 'HEVC · 58 GB', leading: <SelectedDot selected />, selected: true, onSelect: () => setLog('4K') },
          { headline: '1080p', supporting: 'H.264 · 12 GB', leading: <SelectedDot selected={false} />, onSelect: () => setLog('1080p') },
          { kind: 'divider' },
          { headline: '720p (disabled)', leading: <SelectedDot selected={false} />, disabled: true, onSelect: () => {} },
        ]}
      />
      <ConfirmDialog
        open={dialog === 'confirm'}
        title="Sign out?"
        body="You will need to enter your password again."
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setLog('confirmed')
          setDialog(null)
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        variant="delete"
        title="Delete item"
        body="The Long Horizon (2023)"
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        onCancel={() => setDialog(null)}
        onConfirm={() => setDialog(null)}
      />
      <Dialog open={dialog === 'scroll'} variant="scrollable" onClose={() => setDialog(null)} label="Overview">
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} className="t-bodyMedium">
            Paragraph {i + 1}. A lighthouse keeper on a remote island discovers that the ships passing at night are not from this century.
          </p>
        ))}
      </Dialog>
      <ContextMenu open={menu.open} title={menu.title} point={menu.point} items={items} onClose={() => setMenu((m) => ({ ...m, open: false }))} />
      <DropdownMenu open={!!dropdown} anchor={dropdown} onClose={() => setDropdown(null)} label="Sort by">
        {['Name', 'Date added', 'Release date', 'Community rating'].map((s, i) => (
          <DropdownMenuItem key={s} selected={i === 0} leading={i === 0 ? <FaIcon name="check" /> : <span />} onClick={() => { setLog(`sort ${s}`); setDropdown(null) }}>
            {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </div>
  )
}
