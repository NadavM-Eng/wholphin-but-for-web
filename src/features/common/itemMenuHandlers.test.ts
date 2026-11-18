import { describe, expect, it } from 'vitest'
import { getItemMenuHandlers, setItemMenuHandlers } from './itemMenuHandlers'

describe('setItemMenuHandlers', () => {
  it('restores only its own keys, keeping handlers installed after it (user switch unmounts MusicHost)', () => {
    const base = getItemMenuHandlers()
    const addToQueue = () => {}
    const addToPlaylist = () => {}
    const undoMusic = setItemMenuHandlers({ addToQueue })
    const undoDialogs = setItemMenuHandlers({ addToPlaylist })
    undoMusic()
    expect(getItemMenuHandlers().addToPlaylist).toBe(addToPlaylist)
    expect(getItemMenuHandlers().addToQueue).toBe(base.addToQueue)
    const addToQueue2 = () => {}
    const undoMusic2 = setItemMenuHandlers({ addToQueue: addToQueue2 })
    expect(getItemMenuHandlers().addToQueue).toBe(addToQueue2)
    expect(getItemMenuHandlers().addToPlaylist).toBe(addToPlaylist)
    undoMusic2()
    undoDialogs()
    expect(getItemMenuHandlers().addToPlaylist).toBe(base.addToPlaylist)
  })
})
