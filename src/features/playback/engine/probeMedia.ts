// Real playback probes (capabilities.ts): three clips of a fraction of a second, embedded so that probing needs no
// server. canPlayType answers "would you play this type"; these answer "did you just play it", which is what the
// device profile needs for Matroska (browsers disagree with their own canPlayType) and for AC-3 / E-AC-3 (a browser
// can name the codec and still have no decoder on this machine).
//
// Made with the ffmpeg of the test server's Jellyfin image (tools/testserver), bit-exact, no metadata:
//   MKV   -f lavfi -i color=c=black:s=32x32:r=10 -f lavfi -i anullsrc=r=22050:cl=mono -t 0.5 -c:v libx264
//         -profile:v baseline -level 3.0 -pix_fmt yuv420p -g 5 -crf 40 -c:a aac -b:a 8k -f matroska
//   AC-3  -f lavfi -i anullsrc=r=48000:cl=stereo -t 0.25 -c:a ac3  -b:a 64k -movflags +faststart -f mp4
//   EAC-3 -f lavfi -i anullsrc=r=48000:cl=stereo -t 0.25 -c:a eac3 -b:a 64k -movflags +faststart -f mp4
// The audio clips are silence.

/** What really happened when the element was given the clip. */
export type ProbeResult =
  /** the first frame was decoded */
  | 'ok'
  /** the element reported an error: it cannot play this */
  | 'error'
  /** no answer in time: the browser postponed loading (iOS without a user gesture, some background tabs) */
  | 'timeout'

export type ProbeClip = 'mkv' | 'ac3' | 'eac3'

const CLIPS: Record<ProbeClip, { type: string; tag: 'video' | 'audio'; base64: string }> = {
  // Matroska, H.264 Constrained Baseline 32x32 + AAC-LC mono, 0.5 s, 1533 bytes
  mkv: {
    type: 'video/x-matroska',
    tag: 'video',
    base64:
      'GkXfo6NChoEBQveBAULygQRC84EIQoKIbWF0cm9za2FCh4EEQoWBAhhTgGcBAAAAAAAFyRFNm3TAv4QX7vZmTbuLU6uEFUmpZlOsgaFNu4tTq4QWVK5rU6yB' +
      'zE27jFOrhBJUw2dTrIIBtU27jFOrhBxTu2tTrIIFrewBAAAAAAAAUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFUmpZqa/hPD51Wkq17GDD0JATYCETGF2ZldBhExhdmZEiYhAgRAAAAAAABZUrmtA47+EGiIj7q4B' +
      'AAAAAAAAgNeBAXPFiAAAAAAAAAABnIEAIrWcg3VuZIiBAIaPVl9NUEVHNC9JU08vQVZDg4EBI+ODhAX14QDgkLCBILqBIJqBAlWwhFW5gQFV7oEA7AEAAAAA' +
      'AAACAABjoqUBQsAe/+EAFWdCwB7ZCWwEQAAAAwBAAAAFA8WLkgEABWjLgOSyrgEAAAAAAABL14ECc8WIAAAAAAAAAAKcgQAitZyDdW5kiIEAhoVBX0FBQ1aq' +
      'hALEneWDgQLhkZ+BAbWIQNWIgAAAAABiZIEgVe6BAGOihROIVuUAElTDZ0Ckv4Rq5IHTc3POY8CLY8WIAAAAAAAAAAFnyJlFo4dFTkNPREVSRIeMTGF2YyBs' +
      'aWJ4MjY0Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC41MDAwMDAwMDAAc3PKY8CLY8WIAAAAAAAAAAJnyJVFo4dFTkNPREVSRIeITGF2YyBhYWNnyKFFo4hE' +
      'VVJBVElPTkSHkzAwOjAwOjAwLjU0NjAwMDAwMAAfQ7Z1Q0i/hPb2alzngQCjiIIAAIABGCAHo0KGgQAAgAAAAm0GBf//adxF6b3m2Ui3lizYINkj7u94MjY0' +
      'IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVv' +
      'bGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcg' +
      'cHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpv' +
      'bmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBu' +
      'cj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50' +
      'PTUga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NSByYz1jcmYgbWJ0cmVlPTEgY3JmPTQwLjAgcWNvbXA9' +
      'MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAANZYiED/JigACJLJ114KOIggAugAEYIAejiIIAXIAB' +
      'GCAHo4iCAIuAARggB6OOgQBkAAAAAAZBmjgf5YCjiIIAuYABGCAHo4iCAOiAARggB6OOgQDIAAAAAAZBmlQH+WCjiIIBFoABGCAHo4iCAUWAARggB6ONgQEs' +
      'AAAAAAVBmmA7y6OIggFzgAEYIAejiIIBooABGCAHo42BAZAAAAAABUGagDfLo4iCAdCAARggB6OIggH+gAEYIAccU7trl7+ErTc8EbuPs4EAt4r3gQHxggJf' +
      '8IET',
  },
  // MP4, AC-3 stereo, 0.25 s, 2745 bytes
  ac3: {
    type: 'audio/mp4',
    tag: 'audio',
    base64:
      'AAAAIGZ0eXBpc29tAAACAGlzb21kYnkxaXNvMm1wNDEAAAKJbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAPUAAQAAAQAAAAAAAAAAAAAAAAEAAAAA' +
      'AAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAdh0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAAB' +
      'AAAAAAAAAPUAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAA' +
      'AAEAAAD0AAABAAABAAAAAAFQbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAC7gAAALuBVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3Vu' +
      'ZEhhbmRsZXIAAAAA+21pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAv3N0YmwAAABTc3RzZAAAAAAA' +
      'AAABAAAAQ2FjLTMAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAC7gAAAAAAAC2RhYzMQEIAAAAAUYnRydAAAAAAAAQAAAAEAAAAAACBzdHRzAAAAAAAAAAIAAAAH' +
      'AAAGAAAAAAEAAATgAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAIAAAAAQAAABRzdHN6AAAAAAAAAQAAAAAIAAAAFHN0Y28AAAAAAAAAAQAAArkAAAA9dWR0YQAA' +
      'ADVtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAAhpbHN0AAAACGZyZWUAAAgIbWRhdAt3tJ4IQEPhBvABCAgIIQEBBFcfPnz5' +
      '8+fPnz58+/51fPnz58+fPnz4/51fPnz58+fPnz4y/wJEiSAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa+fPnz' +
      'bbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAA' +
      'Da+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4AAAAAAAAAA4lYLd7SeCEBD4QbwAQgICCEBAQRXHz58+fPnz58+fPv+dXz58+fP' +
      'nz58+P+dXz58+fPnz58+Mv8CRIkgAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAABtf' +
      'Pnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAA' +
      'AAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eAAAAAAAAAAOJWC3e0nghAQ+EG8AEICAghAQEEVx8+fPnz58+fPnz7/nV8+fPnz58+fPj/nV8+fPnz58+f' +
      'PjL/AkSJIAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa' +
      '+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx4' +
      '8AAAADa+fPnzbbbbbePHgAAAAAAAAADiVgt3tJ4IQEPhBvABCAgIIQEBBFcfPnz58+fPnz58+/51fPnz58+fPnz4/51fPnz58+fPnz4y/wJEiSAAAAABtfPn' +
      'z5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAA' +
      'AABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223j' +
      'x4AAAAAAAAAA4lYLd7SeCEBD4QbwAQgICCEBAQRXHz58+fPnz58+fPv+dXz58+fPnz58+P+dXz58+fPnz58+Mv8CRIkgAAAAAbXz58+bbbbbbx48AAAADa+f' +
      'PnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48A' +
      'AAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eAAAAAAAAAAOJWC3e0' +
      'nghAQ+EG8AEICAghAQEEVx8+fPnz58+fPnz7/nV8+fPnz58+fPj/nV8+fPnz58+fPjL/AkSJIAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAA' +
      'BtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4' +
      'YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHgAAAAAAAAADiVgt3tJ4IQEPhBvABCAgIIQEB' +
      'BFcfPnz58+fPnz58+/51fPnz58+fPnz4/51fPnz58+fPnz4y/wJEiSAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAA' +
      'ADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbb' +
      'bx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4AAAAAAAAAA4lYLd7SeCEBD4QbwAQgICCEBAQRXHz58+fPnz58+fPv+' +
      'dXz58+fPnz58+P+dXz58+fPnz58+Mv8CRIkgAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz58222223jx4YA' +
      'AAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eGAAAAAAAbXz58+bbbbbbx48AAAADa+fPnzbbbbbePHhgAAAAAAG18+fPm222228ePAAAAA2vnz582222' +
      '23jx4YAAAAAABtfPnz5tttttvHjwAAAANr58+fNttttt48eAAAAAAAAAAOJW',
  },
  // MP4, E-AC-3 stereo, 0.25 s, 2747 bytes
  eac3: {
    type: 'audio/mp4',
    tag: 'audio',
    base64:
      'AAAAIGZ0eXBpc29tAAACAGlzb21kYnkxaXNvMm1wNDEAAAKLbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAPUAAQAAAQAAAAAAAAAAAAAAAAEAAAAA' +
      'AAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAdp0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAAB' +
      'AAAAAAAAAPUAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAA' +
      'AAEAAAD0AAABAAABAAAAAAFSbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAC7gAAALuBVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3Vu' +
      'ZEhhbmRsZXIAAAAA/W1pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAwXN0YmwAAABVc3RzZAAAAAAA' +
      'AAABAAAARWVjLTMAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAC7gAAAAAAADWRlYzMCACAEAAAAABRidHJ0AAAAAAABAAAAAQAAAAAAIHN0dHMAAAAAAAAAAgAA' +
      'AAcAAAYAAAAAAQAABOAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAgAAAABAAAAFHN0c3oAAAAAAAABAAAAAAgAAAAUc3RjbwAAAAAAAAABAAACuwAAAD11ZHRh' +
      'AAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAAAIZnJlZQAACAhtZGF0C3cAfzSHwAAgAAAAQYAABAQEAQEB' +
      'AY+fPnz58+fPnz59/zq+fPnz58+fPnx/zq+fPnz58+fPnwAAAAADfPnz5tttttvHjx48AAAADfPnzJtttttvHjx48AAAAABvnz58222223jx48eAAAABvnz5' +
      'k222223jx48eAAAAAA3z58+bbbbbbx48ePAAAAA3z58ybbbbbbx48ePAAAAAAb58+fNttttt48ePHgAAAAb58+ZNttttt48ePHgAAAAAN8+fPm222228ePHj' +
      'wAAAAN8+fMm222228ePHjwAAAAAG+fPnzbbbbbePHjx4AAAAG+fPmTbbbbbePHjx4AAAAADODgt3AH80h8AAIAAAAEGAAAQEBAEBAQGPnz58+fPnz58+ff86' +
      'vnz58+fPnz58f86vnz58+fPnz58AAAAAA3z58+bbbbbbx48ePAAAAA3z58ybbbbbbx48ePAAAAAAb58+fNttttt48ePHgAAAAb58+ZNttttt48ePHgAAAAAN' +
      '8+fPm222228ePHjwAAAAN8+fMm222228ePHjwAAAAAG+fPnzbbbbbePHjx4AAAAG+fPmTbbbbbePHjx4AAAAADfPnz5tttttvHjx48AAAADfPnzJtttttvHj' +
      'x48AAAAABvnz58222223jx48eAAAABvnz5k222223jx48eAAAAAAzg4LdwB/NIfAACAAAABBgAAEBAQBAQEBj58+fPnz58+fPn3/Or58+fPnz58+fH/Or58+' +
      'fPnz58+fAAAAAAN8+fPm222228ePHjwAAAAN8+fMm222228ePHjwAAAAAG+fPnzbbbbbePHjx4AAAAG+fPmTbbbbbePHjx4AAAAADfPnz5tttttvHjx48AAA' +
      'ADfPnzJtttttvHjx48AAAAABvnz58222223jx48eAAAABvnz5k222223jx48eAAAAAA3z58+bbbbbbx48ePAAAAA3z58ybbbbbbx48ePAAAAAAb58+fNtttt' +
      't48ePHgAAAAb58+ZNttttt48ePHgAAAAAM4OC3cAfzSHwAAgAAAAQYAABAQEAQEBAY+fPnz58+fPnz59/zq+fPnz58+fPnx/zq+fPnz58+fPnwAAAAADfPnz' +
      '5tttttvHjx48AAAADfPnzJtttttvHjx48AAAAABvnz58222223jx48eAAAABvnz5k222223jx48eAAAAAA3z58+bbbbbbx48ePAAAAA3z58ybbbbbbx48ePA' +
      'AAAAAb58+fNttttt48ePHgAAAAb58+ZNttttt48ePHgAAAAAN8+fPm222228ePHjwAAAAN8+fMm222228ePHjwAAAAAG+fPnzbbbbbePHjx4AAAAG+fPmTbb' +
      'bbbePHjx4AAAAADODgt3AH80h8AAIAAAAEGAAAQEBAEBAQGPnz58+fPnz58+ff86vnz58+fPnz58f86vnz58+fPnz58AAAAAA3z58+bbbbbbx48ePAAAAA3z' +
      '58ybbbbbbx48ePAAAAAAb58+fNttttt48ePHgAAAAb58+ZNttttt48ePHgAAAAAN8+fPm222228ePHjwAAAAN8+fMm222228ePHjwAAAAAG+fPnzbbbbbePH' +
      'jx4AAAAG+fPmTbbbbbePHjx4AAAAADfPnz5tttttvHjx48AAAADfPnzJtttttvHjx48AAAAABvnz58222223jx48eAAAABvnz5k222223jx48eAAAAAAzg4L' +
      'dwB/NIfAACAAAABBgAAEBAQBAQEBj58+fPnz58+fPn3/Or58+fPnz58+fH/Or58+fPnz58+fAAAAAAN8+fPm222228ePHjwAAAAN8+fMm222228ePHjwAAAA' +
      'AG+fPnzbbbbbePHjx4AAAAG+fPmTbbbbbePHjx4AAAAADfPnz5tttttvHjx48AAAADfPnzJtttttvHjx48AAAAABvnz58222223jx48eAAAABvnz5k222223' +
      'jx48eAAAAAA3z58+bbbbbbx48ePAAAAA3z58ybbbbbbx48ePAAAAAAb58+fNttttt48ePHgAAAAb58+ZNttttt48ePHgAAAAAM4OC3cAfzSHwAAgAAAAQYAA' +
      'BAQEAQEBAY+fPnz58+fPnz59/zq+fPnz58+fPnx/zq+fPnz58+fPnwAAAAADfPnz5tttttvHjx48AAAADfPnzJtttttvHjx48AAAAABvnz58222223jx48eA' +
      'AAABvnz5k222223jx48eAAAAAA3z58+bbbbbbx48ePAAAAA3z58ybbbbbbx48ePAAAAAAb58+fNttttt48ePHgAAAAb58+ZNttttt48ePHgAAAAAN8+fPm22' +
      '2228ePHjwAAAAN8+fMm222228ePHjwAAAAAG+fPnzbbbbbePHjx4AAAAG+fPmTbbbbbePHjx4AAAAADODgt3AH80h8AAIAAAAEGAAAQEBAEBAQGPnz58+fPn' +
      'z58+ff86vnz58+fPnz58f86vnz58+fPnz58AAAAAA3z58+bbbbbbx48ePAAAAA3z58ybbbbbbx48ePAAAAAAb58+fNttttt48ePHgAAAAb58+ZNttttt48eP' +
      'HgAAAAAN8+fPm222228ePHjwAAAAN8+fMm222228ePHjwAAAAAG+fPnzbbbbbePHjx4AAAAG+fPmTbbbbbePHjx4AAAAADfPnz5tttttvHjx48AAAADfPnzJ' +
      'tttttvHjx48AAAAABvnz58222223jx48eAAAABvnz5k222223jx48eAAAAAAzg4=',
  },
}

const PROBE_TIMEOUT_MS = 2000

/**
 * Loads one clip into a detached, muted media element from a blob: URL (allowed by the production
 * Content-Security-Policy's media-src) and reports whether its first frame decoded. Nothing is played.
 */
export function probePlayback(clip: ProbeClip, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof atob !== 'function') {
    return Promise.resolve('timeout')
  }
  const c = CLIPS[clip]
  return new Promise<ProbeResult>((resolve) => {
    let url = ''
    let el: HTMLMediaElement | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (r: ProbeResult) => {
      if (timer) clearTimeout(timer)
      timer = null
      if (el) {
        el.removeEventListener('loadeddata', onData)
        el.removeEventListener('error', onError)
        el.removeAttribute('src')
        try {
          el.load()
        } catch {
          // nothing to release
        }
        el = null
      }
      if (url) URL.revokeObjectURL(url)
      url = ''
      resolve(r)
    }
    const onData = () => {
      // a video clip must also have produced a picture size: "audio only" would mean the video track was dropped
      const v = el as HTMLVideoElement | null
      finish(c.tag === 'video' && !(v && v.videoWidth > 0) ? 'error' : 'ok')
    }
    const onError = () => finish('error')
    try {
      const bytes = Uint8Array.from(atob(c.base64), (ch) => ch.charCodeAt(0))
      url = URL.createObjectURL(new Blob([bytes], { type: c.type }))
      el = document.createElement(c.tag)
      el.muted = true
      el.preload = 'auto'
      el.addEventListener('loadeddata', onData)
      el.addEventListener('error', onError)
      timer = setTimeout(() => finish('timeout'), timeoutMs)
      el.src = url
      el.load()
    } catch {
      finish('error')
    }
  })
}
