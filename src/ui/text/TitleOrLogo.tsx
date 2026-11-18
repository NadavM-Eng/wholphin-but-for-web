import clsx from 'clsx'
import { useState } from 'react'
import styles from './TitleOrLogo.module.css'

export type TitleOrLogoProps = {
  title?: string | null
  logoSrc?: string | null
  /** User preference "show logos". */
  showLogo?: boolean
  /** Heading level for the text title. */
  as?: 'h1' | 'h2' | 'p'
  className?: string
  /** Direction of the text title only (e.g. "auto" for titles in another script); the logo follows the page. */
  dir?: 'auto' | 'ltr' | 'rtl'
}

/**
 * Upstream `TitleOrLogo`: the logo image (Fit, 60dp high, max 320dp wide) or, without one / on error,
 * the title in headlineMedium SemiBold, 2 lines.
 */
export function TitleOrLogo({ title, logoSrc, showLogo = true, as: Tag = 'h1', className, dir }: TitleOrLogoProps) {
  const [failed, setFailed] = useState<string | null>(null)
  if (showLogo && logoSrc && failed !== logoSrc) {
    return (
      <div className={clsx(styles.box, className)}>
        <img src={logoSrc} alt={title ?? ''} className={styles.logo} onError={() => setFailed(logoSrc)} />
      </div>
    )
  }
  return (
    <Tag className={clsx(styles.title, className)} dir={dir}>
      {title}
    </Tag>
  )
}
