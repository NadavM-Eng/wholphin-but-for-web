import { Button, type ButtonProps } from './Button'

export type TextButtonProps = Omit<ButtonProps, 'variant'>

/** Upstream `TextButton` (`Button.kt:115-141`): same Button look, 32dp content, 8/4dp padding. */
export function TextButton(props: TextButtonProps) {
  return <Button {...props} variant="text" />
}
