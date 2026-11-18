// Real pixels of two backdrops of the throwaway test server, for extractColors.test.ts: only the source positions
// a nearest-neighbour downscale to Palette's working size can read (per destination pixel the floor pixel and, where
// the sample lands exactly on a pixel edge, the pixel below it), each channel reduced to the 5 bits Palette keeps.
// Generated from the stored JPEGs as Chromium decodes them (byte-identical to libjpeg-turbo); do not edit by hand.

export interface SparseBackdrop {
  /** size of the stored image */
  width: number
  height: number
  /** colour table: 3 base-32 digits (r, g, b; 5 bits each) per colour */
  colors: string
  /** distinct pixel rows as runs: `<colour index, base 36>` or `<index>*<run length, base 36>` */
  lines: string[]
  /** per sampled source row (ascending): index into `lines`, base 36 */
  order: string
}

/** Music artist "The Glass Orchard" (reference 27-music-artist-artist): gradient, flat bands and text. */
export const GLASS_ORCHARD: SparseBackdrop = {
  width: 1920,
  height: 1080,
  colors: [
    '3k53k63j63j73i82h92ha2ga2gb2fc2ec3ec3dc3cb4bb4ab5ab59b58a67a66a75a74a83a83982992981991avvv435olo20392aqnp919sqs',
    'ihieaf302303818rpr808tstvuvsrsfbfppp617popusuutunlnuuuliluru828gbgtsurqrqoqttutrt645geg718sss515313fefc8d404nkn',
    'jhj939403vtu405rrr707nlo616pnp414gfg505baca2a425413202lklqqqono979vvu93a918847nnn212b8c415727627626rrssrr728qqr',
    'rrq717525213jijqrrfcefdf516',
  ].join(''),
  lines: [
    '0*50',
    '1*50',
    '2*50',
    '3*50',
    '4*50',
    '5*50',
    '6*50',
    '7*50',
    '8*50',
    '9*50',
    'a*50',
    'b*50',
    'c*50',
    'd*50',
    'e*50',
    'f*50',
    'g*50',
    'h*50',
    'i*50',
    'j*50',
    'k*50',
    'l*50',
    'm*50',
    'n*50',
    'o*50',
    'p*50',
    'q*h r p*8 s r t*2 u q*o p t*3 v p q*3 t*2 w q*y p x t*3 y z q*j t*3 z q*r 10 t*2 11 q*i',
    'q*h 12 t*8 13 14 t*2 u q*m z t*7 15 q*2 t*2 w q*y t*7 16 q*i t*3 z q*r 10 t*2 11 q*i',
    'q*h r q*2 t*4 q*4 t*2 u 17 18 19 q*5 z p 1a 1b q*a t*2 1c z p q p 1d 15 q*2 t*2 w q*2 x 15 1e 18 p q*5 p 1f 1g 1h z r q*3 p 1i 1j z*2 q*7 1k t*2 1l q*2 z t*2 r q*2 15 p z*2 19*2 z q*2 1m 19 1n p q*2 t*3 z 1l 1o x q*3 z p 1p 1q 1r 15 q*3 z p*2 q*2 19 p q*2 x 1a p 10 t*2 11 q*i',
    'q*k t*4 q*4 t*2 1s t*4 1t q*2 t*6 1u q*7 x t*2 q*9 t*2 w q*2 1v t*6 q*2 t*6 14 q t*6 14 1w q*5 p t*2 1x q*4 t*3 q*2 t*2 1y t*3 r 1z t*5 20 q t*3 1i t*3 15 q*2 21 t*6 p q t*3 1y t*2 q*2 t*4 1a t*2 11 q*i',
    'q*k t*4 q*4 t*2 22 t*4 19 q*2 t*6 q*8 p t*2 23 q*8 t*2 w q*2 1v t*6 q*2 t*6 24 q t*6 14 1w q*5 r t*2 1x q*4 t*3 q*2 t*2 25 t*3 r 1f t*5 26 q t*7 1l q*2 21 t*6 p q t*3 19 t*2 q*2 1i t*3 27 t*2 11 q*i',
    'q*k t*4 q*4 t*3 1l q 28 t*2 p 29 t*3 q*2 t*3 z q*5 t*3 q*3 t*3 19 q*2 t*2 w q*3 r q*2 t*3 20 x t*2 p q*3 14 q t*3 q*2 r 14 2a q*6 t*2 2a q*4 2b t*2 z q t*3 20 z q r t*2 14 q p r 2c q t*3 1g q t*2 2d 14 q*2 z q*2 p t*2 2a q t*4 20 q 15 p t*2 2e p t*3 11 q*i',
    'q*k t*4 q*4 t*2 2f q*3 t*2 z t*9 q*6 19 t*2 q*3 t*4 q*2 t*2 w q 2g 1l t*6 1x q t*6 q*2 t*6 q p q*6 t*2 1w q*4 19 t*2 z q t*2 14 q*4 t*2 q*6 t*3 15 q t*3 2h q 23 t*6 14 q t*3 2i q*4 t*2 p q t*3 11 q*i',
    'q*k t*4 q*4 t*2 u q*3 t*2 z t*3 2j 14*5 1l q*5 1u t*2 p q*3 v t*2 q*2 t*2 w q t*3 2j q t*3 14 q*2 2a 2k 2l t*3 q*2 z 2a 2m t*4 q*5 p t*3 q*4 t*2 2n p q t*2 w q*4 t*2 q*6 t*3 z q t*3 2h q t*2 2j z*2 2o t 14 q t*3 14 q*3 r t*2 p q 19 t*2 11 q*i',
    'q*k t*4 q*4 t*2 u q*3 t*2 z*2 t*3 z p r t*2 q*7 t*3 1b 2p p t*3 q*2 t*2 w q t*3 q*2 t*3 14 q t 15 r q*2 t*2 q t*2 x q r t*3 q*6 15 t*2 19 p q t*3 q*3 t*2 14 q*4 t*2 19 r 2q 1l 26 q t*3 z q t*3 2h q t*2 15 z q t*2 14 q t*3 14 q*3 r t*2 1l z t*3 11 q*i',
    'q*k t*4 q*4 t*2 u q*3 t*2 z q 2r 2s t*6 q*7 p t*7 2t q*2 t*2 w q 2u t*7 14 q t*6 1x q t*6 14 w q*7 z t*6 2v q*3 t*2 14 q*4 p t*5 20 q t*3 z q t*3 2h q 1p t*6 14 q t*3 14 q*4 p t*3 1a t*2 11 q*i',
    'q*l p r q*5 p r*2 q*3 r*2 q*4 p r q p*2 q*b z r q p q*4 p r*2 q*4 p q p r*2 x q*5 p q*4 p q*2 p*2 q*e p q*6 r*2 q*6 z q p r q*2 p r*2 p q*2 r*2 p q*3 p q p q r*2 q*2 p r p q*6 x p q z r q*j',
    'q*50',
    '2w*50',
    '2x*50',
    '2x*25 2y 2x*5 2z 2y 14 2x*5 30 27 2z 31 2x*6 1a 2y 2x*25',
    '2x*24 2w 2j 1o 2l 2w 31 32 27 2y 2j 33 27*2 34 2x 27 34 35 36 1a 37 1d 38 27 2d 27 1a 2j 2x*24',
    '2x*24 2w 2j 1o 39 2i 2w 2s 27 2y 2j 1o 2z 2j 2c 2x 27 2a*2 3a 27 2x 2j 27 1o 2x 27*2 2x*25',
    '2x*25 3b 2y 34 1d 2x 2y 2w 2x 2y 2x 2a 14 2x*3 2a 2x 2y 2x 2j 2x*3 14 2w 2x 2y 2x*24',
    '34*50',
  ],
  order: '0 1 2 2 3 2 3 4 4 4 5 5 5 6 7 8 8 8 9 9 9 a b c d e f f g h i j k k l m m n o p q r s t u v w x y z 10 11 11 11 11 11 11 11 11 11 11 11 11 11 11 11 11 11 11 12 13 13 13 13 13 13 13 14 15 16 17 13 13 13 13 13 13 13 13 13 13 13 13 13 13 18',
}

/** Movie "Multi Track Showcase" (reference 11-movie-tracks-top). */
export const MULTI_TRACK: SparseBackdrop = {
  width: 1920,
  height: 1080,
  colors: [
    'k3ik3hj3gj3fj3ei3di2di3ci3bh2bh2ah29g28g27g26f25e24e34d34c34b44a43a53953863763774873vvv220761652a98874662221762',
    '773663673uuu672uvubb8ijgllkqqo331453ttsvvu772rrqsssppo551hhgffdssr120775uutcdc452nom562671ccc442ghe572573351582',
    '462352241682tusnnn7879a7785776abafge4824721302311212308a5583483aa9251cda473471mnl593efe481382020281dgd391695492',
    'rtr594mplikh131271493dfc392tutjmiuvv282npm393666030tttcec151292291191171rsr9d9262qrq272261dedrrr5649b9pspqqp172',
    'rssiliqqqprp797252lmm242nonqrr161140040',
  ].join(''),
  lines: [
    '0*50',
    '1*50',
    '2*50',
    '3*50',
    '4*50',
    '5*50',
    '6*50',
    '7*50',
    '8*50',
    '9*50',
    'a*50',
    'b*50',
    'c*50',
    'd*50',
    'e*50',
    'f*50',
    'g*50',
    'h*50',
    'i*50',
    'j*50',
    'k*50',
    'l*50',
    'm*50',
    'n*50',
    'o*50',
    'p*9 q p*3 r p*g s*2 p*3 o*2 p*4 s*2 t p*5 u p*9 v p*o s*2 o p*b o r w s*2 x o*2 p*2 s*2 p*1y',
    'p*6 s*4 y p*2 s*4 z p*b 10 s*2 p*3 s*2 p*4 s*2 t p*5 11 s*9 z p*o s*2 p*b 11 s*8 p*2 s*2 12 p*1x',
    '13*5 12 s*4 14 13 y s*4 z 13 11*4 13*2 11*2 15 13 y s*2 13 y 11 s*2 11*3 y 12 11 12 13*5 y 15*3 s*3 15*3 11*2 15 y 13 16 13 11 17 16 s 18 11 13*5 y 19 1a 11 y 13*2 s*2 13*3 11*2 y 13*6 s*3 13*3 1b 1c 13*2 s*2 y 13*2 1d y 13*6 1e q 12 11 13*2 11*2 12 11 13 y*2 13*3 11*2 13*5 1e y 1f y 13 12*2 1g 1h 1i 11 13*4 1j y 14 1k 11 y 13*4 1l 1d 1m 12 13*7',
    '13*6 s*5 13 s*5 z 13 s*3 z 13*2 s*3 13 15 s*2 15 13 s*6 15 s*2 1n 13*9 s*3 13*3 s*6 13 s*6 1o 13*3 s*6 15 13 s*2 13*2 1p s*2 15 13*5 15 s*3 13*7 s*7 13*4 s*6 13*2 s*3 15*2 s*2 13*3 s*2 13*2 15 s*5 1q 13 s*7 13*2 s*6 1r 13*2 12 s*6 13*6',
    '13*6 s*5 13 s*5 z 13 s*3 z 13*2 s*3 13 15 s*2 15 13 s*6 15 s*2 1n 13*9 s*3 13*3 s*6 13 s*6 1s 13*3 s*6 15 13 s*2 13*2 s*3 13*7 s*3 13*7 s*7 13*4 s*6 13*2 s*3 1t*2 s*2 15 13*2 s*2 13*2 1u s*5 1v 13 s*7 13*2 s*6 1w 13*2 1x s*6 13*6',
    '1y*5 1z s*2 1y 1z s 20 s 16 s*3 z 1y s*3 z 1y*2 s*3 1y 1z s*2 1y*2 21 s*2 1y*4 s*2 t 1y*9 s*3 1y*3 s*3 22 1z 1y*2 23 1y*4 s*2 1y*2 13 s*2 24 1y 25 1y 1z 1y s*2 26 s*3 1y*8 s*6 1y*4 s*4 1y s*2 27 1y*2 s*2 28 1y*2 29 s*2 1y s*3 z 1y s*2 22 1y 2a s 2b 1y s*3 2c 1y 1z 2d 2c 1y*6 s*2 1z*2 s*3 1y*2 21 1r 1y*2 s*2 1y*3 s*2 1r 1y*5',
    '2e*5 2f s*2 2e*2 s*3 1y s*3 2g 2e s*3 2h 2e*2 s*3 2e 21 s*2 2e*3 s*2 2e*4 s*2 2i 2e*9 s*3 2e*3 s*2 2g 2e*3 21 s*7 2e s*4 2e*6 s*5 2e*b 2j s*5 2e*2 s*2 2g 2e*2 2k s*2 2e 2l s*2 2m 2e*3 s*2 2e 2l s*7 2n s*2 2o 21 s*3 2e*6 2p s*6 2h 2e s*6 2f 2e*2 s*7 1e 2e*5',
    '2e*6 s*2 2e*2 2q s*2 2e s*3 2g 2e s*3 2h 2e*2 s*3 2e*2 s*2 2e*3 s*2 2e*4 s*2 1n 2e*9 s*3 2e*3 s*2 2e*4 2f s 16 2r 2e*2 s*2 2e 2s s*3 2e*6 s*5 2l 2e*d s*3 2g 2e s*2 2f 2e*2 2t s*2 2e*2 s*2 2m 2e*3 s*2 2e*2 s*4 2u s*5 2e*2 s*3 2e*6 s*2 2g 2e*2 s*2 2g 2e*2 2v 2g 1h s*4 2e s*2 1n*5 2h 2e*5',
    '2w*5 2e s*2 2w*3 2g 2x 2w s*3 2g 2w 1e s*3 2y s*4 2w*2 s*2 2w*3 s*2 2z 2m 30 2w s*2 2g 2w*9 s*3 2w*3 s*2 2w*4 31 s*2 32 2w 33 s*2 2w*2 32 s*2 34 2w 35 16 2m 2w s*2 2w 2e s*2 2w*8 s*2 33 2w 36 s*2 1e 2e 2w s*2 2w*3 2t s*2 2w*2 s*3 2e s*4 2w*2 s*4 37 38 s*4 2w*2 s*4 2w 39 s 3a 2w s*2 32 2w 3b s*2 2g 2w 3c 3d 2w 32 2t s*3 2w s*2 32 2w*3 3e 2o 2w*5',
    '3b*5 2w s*2 2w 3b*5 s*3 2g 3b 3f s*4 2i s*3 3b 3f s*2 3b*3 3g s*4 3b s*2 1n 3b*9 s*3 3b*3 s*2 2w 3b*3 3h s*4 16 s*2 3b*3 30 s*5 2w 3b s*2 3b*2 2y s*2 2y 3b*6 s*6 3i 3j 3b*2 s*2 2w 3b*2 39 s*2 3b*2 2w s*6 2w 3b*2 2w 3k s*2 2y 2w s*3 2g 3b*3 2w s*5 3l 3b s*7 2g 3b s*6 3j 3m 3b*2 s*6 2o 3b*5',
    '3n*6 3o 3n*a 3b 3n*9 3o 3n*4 3o 3n*z 3b 3p 3n*7 3o 3p 3b 3n*4 3o 3n*4 3o 3n*2 3o 3n*8 3b 3n*6 3b 3n 3o 3n*a 3f 3o 3b 3n*8 3o 3n 3b 3n*9 3o 3b*2 3n*5 3b 3n 3b 3n 3o 3n*6 3o 3n*5 3o*2 3b 3n*8',
    '3n*50',
    '3q*50',
    '38*50',
    '38*21 3r*4 38*6 3s 38*4 3q 3t 3r*2 3q 38*8 3u 3v 38*25',
    '38*22 1g*2 3w 3x 3y 1m 3z 40 41 42 43 38 44 3r 38*2 45 38 3y*2 1g 2d 3y 2y 46 3y 47 3r*2 3q 48 49 4a 38*21',
    '38*22 1g*2 3v 2x*2 38 4b 4c 3q 48 38*2 2u 2x 38*2 45 38 3y*2 38 3y 3r 3q 1n*2 38 3y*2 38 2x 1n 4d 38*21',
    '38*22 4e 38*2 3t 2o 38 2x 3j 38*3 43 49 38*4 3v 4e 38*2 3q 38 3v*2 3t 4f 38 3q 3w 4g 3j 4e 38*21',
  ],
  order: '0 1 1 2 2 2 3 4 4 5 6 7 7 8 9 a a b c c c d e e f f f g h i i j k k l m m n n o p q r s t u v w x y z 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 11 12 12 12 12 12 12 12 13 14 15 16 12 12 12 12 12 12 12 12 12 12 12 12 12 12 12',
}
