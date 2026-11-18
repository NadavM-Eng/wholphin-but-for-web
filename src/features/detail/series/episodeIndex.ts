// `findIndexByNumberOrIdFast` / `findIndexByNumberOrId` / `searchList` (W/ui/detail/series/SeriesViewModel.kt:728-878):
// where the series overview starts. The lists are paged (`ApiRequestPager`: 100 episodes or 20 seasons a page);
// a list that fits in one page is scanned, a longer one is entered at the number hint (`number - 1`) and walked
// towards the target, which handles missing episodes shifting the indices. Pure; pages load through `get`.

/** The fields the search reads (episodes and seasons). */
export type IndexedItem = {
  Id?: string | null
  IndexNumber?: number | null
  ParentId?: string | null
  SeasonId?: string | null
  ParentIndexNumber?: number | null
}

/** Upstream `BlockingList`: a paged list whose items load on demand. */
export type BlockingList<T> = {
  size: number
  /** The pager's page size (100 for episodes, 20 for seasons). */
  pageSize: number
  get: (index: number) => Promise<T | undefined>
}

const eq = <T>(a: T | null | undefined, b: T | null | undefined) => a != null && b != null && a === b

function checkNumberOrId(targetNum: number | null, targetId: string | null, item: IndexedItem | undefined): boolean {
  return eq(targetId, item?.Id) || eq(item?.IndexNumber, targetNum)
}

/**
 * `checkParent`: true without a parent to check. Upstream compares `parentId`; the web also accepts `SeasonId`,
 * which the server sets on episodes that are not stored in a season folder.
 */
function checkParent(parentId: string | null, parentIndex: number | null, item: IndexedItem | undefined): boolean {
  if (parentId == null && parentIndex == null) return true
  return eq(parentId, item?.ParentId) || eq(parentId, item?.SeasonId) || eq(parentIndex, item?.ParentIndexNumber)
}

async function indexOf<T extends IndexedItem>(list: BlockingList<T>, pred: (item: T | undefined) => boolean): Promise<number> {
  for (let i = 0; i < list.size; i++) if (pred(await list.get(i))) return i
  return -1
}

/** `Int?.lt` / `Int?.gt` (W/ui/Extensions.kt:436-438): null counts as 0. */
const num = (n: number | null | undefined) => n ?? 0

async function searchList<T extends IndexedItem>(
  listIndex: number,
  targetNum: number,
  targetId: string | null,
  list: BlockingList<T>,
  parentId: string | null,
  parentIndex: number | null,
): Promise<number> {
  const inRange = (i: number) => i >= 0 && i < list.size
  const matches = (it: T | undefined) => checkNumberOrId(targetNum, targetId, it) && checkParent(parentId, parentIndex, it)
  let index = listIndex
  let item = await list.get(index)
  if ((parentId != null || parentIndex != null) && !checkParent(parentId, parentIndex, item)) {
    // Search before and after for an episode with the right parent.
    let left = listIndex - 1
    let right = listIndex + 1
    while (inRange(left) || inRange(right)) {
      if (inRange(left) && checkParent(parentId, parentIndex, await list.get(left))) {
        index = left
        break
      }
      if (inRange(right) && checkParent(parentId, parentIndex, await list.get(right))) {
        index = right
        break
      }
      left--
      right++
    }
    item = await list.get(index)
  }
  // Upstream walks from `listIndex` even after moving to an item with the right parent above; the web walks
  // from `index`, as the upstream comment ("starting from this new one") intends.
  if (num(item?.IndexNumber) < targetNum) {
    for (let i = index + 1; i < list.size; i++) if (matches(await list.get(i))) return i
    return 0
  }
  if (num(item?.IndexNumber) > targetNum) {
    for (let i = index - 1; i >= 0; i--) if (matches(await list.get(i))) return i
    return 0
  }
  if (matches(item)) return index
  // Upstream checks the parent of the hint item instead of each candidate here (`checkParent(…, item)`).
  return Math.max(0, await indexOf(list, matches))
}

/**
 * `findIndexByNumberOrId`: the index of the item whose number is `targetNum` (1-based) or whose id is
 * `targetId`, or 0 when not found.
 */
export async function findIndexByNumberOrId<T extends IndexedItem>(
  targetNum: number | null,
  targetId: string | null,
  list: BlockingList<T>,
  parentId: string | null = null,
  parentIndex: number | null = null,
): Promise<number> {
  const listIndex = targetNum != null ? Math.max(0, targetNum - 1) : null
  const inRange = listIndex != null && listIndex < list.size
  if (targetId != null && (targetNum == null || !inRange)) {
    // No usable hint: check everything.
    return Math.max(0, await indexOf(list, (it) => checkNumberOrId(targetNum, targetId, it)))
  }
  if (listIndex != null && inRange && targetNum != null) return searchList(listIndex, targetNum, targetId, list, parentId, parentIndex)
  return 0
}

/**
 * `findIndexByNumberOrIdFast`: a list that fits in one page is scanned (number or id, and the parent);
 * a longer one uses the hint-based search. -1 when the scan finds nothing (callers clamp to 0, as upstream).
 */
export async function findIndexByNumberOrIdFast<T extends IndexedItem>(
  targetNum: number | null,
  targetId: string | null,
  list: BlockingList<T>,
  parentId: string | null,
  parentIndex: number | null,
): Promise<number> {
  if (list.size <= list.pageSize) {
    return indexOf(list, (it) => checkNumberOrId(targetNum, targetId, it) && checkParent(parentId, parentIndex, it))
  }
  return findIndexByNumberOrId(targetNum, targetId, list, parentId, parentIndex)
}

/** A `BlockingList` over an array that is already loaded. */
export function arrayList<T>(items: readonly T[], pageSize: number): BlockingList<T> {
  return { size: items.length, pageSize, get: async (i) => items[i] }
}
