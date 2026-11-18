// `HomeSettingsDestination` (W/ui/main/settings/HomeSettingsDestination.kt). ChooseDiscover is omitted:
// upstream hard-codes `discoverEnabled = false`, so it is unreachable.
export type HomeSettingsDest =
  | { kind: 'rowList' }
  | { kind: 'addRow' }
  | { kind: 'rowType'; libraryId: string }
  | { kind: 'rowSettings'; rowId: number }
  | { kind: 'favorites' }
  | { kind: 'global' }
  | { kind: 'source' }
  | { kind: 'presets' }

/** An inner back-stack entry: the page and the item (data-hs-key) that opened the next one. */
export type StackEntry = { dest: HomeSettingsDest; returnKey?: string }
