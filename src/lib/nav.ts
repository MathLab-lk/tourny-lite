/*
 * Router bridge — the app store lives outside React, so the root
 * client component registers the Next router here once on mount.
 * Store navigation actions then push URLs through it (soft client
 * navigation); anything that fires before registration falls back
 * to a plain location change.
 */

export interface NavRouter {
  push: (url: string) => void
  replace: (url: string) => void
}

let router: NavRouter | null = null

export function registerAppRouter(next: NavRouter | null) {
  router = next
}

export function navPush(url: string) {
  if (router) router.push(url)
  else if (typeof window !== 'undefined') window.location.assign(url)
}

export function navReplace(url: string) {
  if (router) router.replace(url)
  else if (typeof window !== 'undefined') window.location.replace(url)
}
