/**
 * Where focus goes once a non-guide tab's content has loaded (CollectionFolderLiveTv.kt:145-147: DvrSchedule with
 * requestFocusAfterLoading and focusRequesterOnEmpty = the tab, DvrSchedule.kt:161-168; a recording folder's
 * first card). `page` holds the tab row and `body` the tab content.
 *
 * Returns the element to focus, `'wait'` while the content is still loading, or null when there is nothing to
 * do: focus is somewhere the user put it (`mayTake` is false and focus is not on the tab row, or it is on the tab
 * row but the tab was chosen with a pointer: `keyboard` is false). A click on a tab keeps focus on that tab, as
 * every other tabbed page does; the D-pad's arrival focus is for keyboard selection and for a page that opens
 * with nothing focused.
 */
export function tabArrivalTarget(page: HTMLElement, body: HTMLElement, tab: number, mayTake: boolean, keyboard: boolean): HTMLElement | 'wait' | null {
  const a = page.ownerDocument.activeElement
  const onTabRow = !!a?.closest('[role="tablist"]') && page.contains(a)
  if (!(onTabRow && keyboard) && !mayTake) return null
  if (tab === 1) {
    const list = body.querySelector<HTMLElement>('[data-dvr-list]')
    if (!list) return 'wait'
    // an empty schedule leaves focus on the selected tab
    return list.querySelector<HTMLElement>('[data-focusable]') ?? page.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  }
  return body.querySelector<HTMLElement>('[data-grid-index="0"] [data-focusable]') ?? 'wait'
}
