import { MaterialIcon } from '../icons/MaterialIcon'
import { TextField, type TextFieldProps } from './TextField'

export type SearchFieldProps = Omit<TextFieldProps, 'type' | 'leading' | 'maxLines' | 'onSubmit'> & {
  onSearch: (query: string) => void
}

/** Upstream `SearchEditTextBox`: the pill text field with a leading Search icon tinted onPrimaryContainer, IME action Search. */
export function SearchField({ onSearch, ...rest }: SearchFieldProps) {
  return (
    <TextField
      {...rest}
      type="search"
      inputMode="search"
      enterKeyHint="search"
      autoComplete="off"
      onSubmit={onSearch}
      leading={<MaterialIcon name="search" color="var(--c-on-primary-container)" />}
    />
  )
}
