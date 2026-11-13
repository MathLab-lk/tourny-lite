import { notFound } from 'next/navigation'
import { parseAppRoute } from '@/lib/app-route'
import { TournyApp } from '@/components/tournament/tourny-app'

export const dynamic = 'force-dynamic'

/**
 * The whole app sits behind one optional catch-all — every view is
 * the same client application, and the URL decides which view it
 * opens on (see lib/app-route.ts). Anything that is not a valid
 * app path falls through to the 404. The public guest scoreboard at
 * /present/{id} is a page of its own and matches before this.
 */
export default async function AppPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const route = parseAppRoute(slug ?? [])
  if (!route) notFound()
  return <TournyApp route={route} />
}
