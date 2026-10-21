import { EventEmitter } from 'events'

// Cross-request in-process event bus used to fan out data changes to
// connected SSE clients. Stored on globalThis so hot-reload in dev does
// not create duplicate emitters.

const globalForBus = globalThis as unknown as {
  __tournamentBus?: EventEmitter
}

export const bus: EventEmitter =
  globalForBus.__tournamentBus ?? new EventEmitter()

bus.setMaxListeners(200)

if (!globalForBus.__tournamentBus) {
  globalForBus.__tournamentBus = bus
}

export function emitTournamentChanged(tournamentId: string): void {
  bus.emit('change', tournamentId)
}

export function onTournamentChange(handler: (tournamentId: string) => void): void {
  bus.on('change', handler)
}

export function offTournamentChange(handler: (tournamentId: string) => void): void {
  bus.off('change', handler)
}
