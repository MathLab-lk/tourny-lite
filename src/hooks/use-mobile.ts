import * as React from "react"

const MOBILE_BREAKPOINT = 768
const DESKTOP_BREAKPOINT = 1024

/** True below 768px — phone-class layouts. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/** True at 1024px and up — matches the lg: breakpoint where the
 *  desktop sidebar appears, so "desktop" means "sidebar visible". */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const onChange = () => setIsDesktop(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}
