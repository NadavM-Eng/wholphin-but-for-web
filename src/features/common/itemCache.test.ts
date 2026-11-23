import type { BaseItemDto, UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { onItemPatched, patchItemInCaches, withUserData } from './itemCache'

describe('patchItemInCaches', () => {
  it('patches every cached copy of the item and tells the holders outside the caches, until they unsubscribe', () => {
    const qc = new QueryClient()
    const movie: BaseItemDto = { Id: 'm1', Type: 'Movie', UserData: { IsFavorite: false } as UserItemDataDto }
    qc.setQueryData(['s', 'u', 'item'], movie)
    qc.setQueryData(['s', 'u', 'list'], { Items: [movie, { Id: 'm2', Type: 'Movie' }] })
    const listener = vi.fn()
    const off = onItemPatched(listener)
    const fn = (i: BaseItemDto) => withUserData(i, { IsFavorite: true })

    patchItemInCaches(qc, 'm1', fn)
    expect(qc.getQueryData<BaseItemDto>(['s', 'u', 'item'])?.UserData?.IsFavorite).toBe(true)
    expect(qc.getQueryData<{ Items: BaseItemDto[] }>(['s', 'u', 'list'])?.Items.map((i) => i.UserData?.IsFavorite)).toEqual([true, undefined])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('m1', fn)

    off()
    patchItemInCaches(qc, 'm1', fn)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
