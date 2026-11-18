import type { ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'

export type IconButtonProps = Omit<ButtonProps, 'variant' | 'children' | 'label'> & {
  icon: ReactNode
  /** Required: icon-only buttons need an accessible name. */
  label: string
}

/** A 40dp circular Button holding only an icon (e.g. upstream `JumpButton`). */
export function IconButton({ icon, label, title, ...rest }: IconButtonProps) {
  return (
    <Button {...rest} variant="icon" label={label} title={title ?? label}>
      {icon}
    </Button>
  )
}
