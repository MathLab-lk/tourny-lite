import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { PresentEventBoard } from '@/components/tournament/present-event-board'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string; eventId: string }> }

/**
 * The public page for one event — the link an event-result message
 * carries. No sign-in, no app chrome: guests land straight on that
 * event's podium, updating live. If the result has not been recorded
 * yet, the page waits with them — it flips the moment it is.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, eventId } = await params
  const event = await db.tournamentEvent.findUnique({
    where: { id: eventId },
    select: {
      tournamentId: true,
      subEventIndex: true,
      game: { select: { englishName: true, sinhalaName: true } },
      division: { select: { name: true } },
      tournament: { select: { name: true, organizer: true } },
    },
  })
  if (!event || event.tournamentId !== id) return { title: 'Tourny Lite' }
  const gameName = event.game.englishName || 'Event'
  const slot = event.subEventIndex > 1 ? ` (Slot ${event.subEventIndex})` : ''
  const title = `${event.tournament.name} — ${gameName}${slot}`
  const description = `Live result for ${gameName} — ${event.division.name}${
    event.tournament.organizer ? `, by ${event.tournament.organizer}` : ''
  }. Updates the moment the podium is recorded.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
  }
}

export default async function PresentEventPage({ params }: Props) {
  const { id, eventId } = await params
  // The event id is the primary key across tournaments, but the URL
  // names both — check they belong together so links stay honest.
  const event = await db.tournamentEvent.findUnique({
    where: { id: eventId },
    select: { id: true, tournamentId: true },
  })
  if (!event || event.tournamentId !== id) notFound()
  return <PresentEventBoard id={id} eventId={eventId} />
}
