import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { PresentBoard } from '@/components/tournament/present-board'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/**
 * The public guest scoreboard — no sign-in, no app chrome. This is
 * the link that gets shared to WhatsApp: open it and watch the
 * standings move live.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const t = await db.tournament.findUnique({
    where: { id },
    select: { name: true, organizer: true },
  })
  const title = t ? `${t.name} — Live Standings` : 'Tourny Lite'
  const description = t
    ? t.organizer
      ? `Watch ${t.organizer} — live podiums and standings, updated as results come in.`
      : 'Live podiums and standings, updated as results come in.'
    : 'Live tournament scoreboard.'
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
  }
}

export default async function PresentPage({ params }: Props) {
  const { id } = await params
  const exists = await db.tournament.findUnique({ where: { id }, select: { id: true } })
  if (!exists) notFound()
  return <PresentBoard id={id} />
}
