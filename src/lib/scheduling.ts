export interface SlotDraft {
  roundNumber: number;
  courtNumber: number;
  teamAId: number;
  teamBId: number;
  startOffsetMinutes: number;
  durationMinutes: number;
  isExtension: boolean;
  extensionNumber: number;
}

const BYE = -1;

/**
 * Standard "circle method" round robin: team[0] stays fixed, the rest
 * rotate one position each round. A bye (-1) is added for odd team counts
 * so every real team still gets a turn each round.
 */
function roundRobinRounds(teamIds: number[]): [number, number][][] {
  const ids = [...teamIds];
  if (ids.length % 2 !== 0) ids.push(BYE);
  const n = ids.length;
  if (n < 2) return [];

  const fixed = ids[0];
  const rotation = ids.slice(1);
  const rounds: [number, number][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const roundTeams = [fixed, ...rotation];
    const matches: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = roundTeams[i];
      const b = roundTeams[n - 1 - i];
      if (a !== BYE && b !== BYE) matches.push([a, b]);
    }
    rounds.push(matches);
    rotation.push(rotation.shift() as number);
  }
  return rounds;
}

/**
 * Turns round-robin rounds into concrete slots: each round's fixtures are
 * chunked into court-sized waves so no team is asked to play twice in the
 * same wave, and waves run sequentially in time.
 */
function layoutRounds(
  rounds: [number, number][][],
  courtCount: number,
  slotMinutes: number,
  startRoundNumber: number,
  startWaveOffsetMinutes: number,
  isExtension: boolean,
  extensionNumber: number,
): { slots: SlotDraft[]; endOffsetMinutes: number } {
  const slots: SlotDraft[] = [];
  let waveOffset = startWaveOffsetMinutes;
  let roundNumber = startRoundNumber;

  for (const roundMatches of rounds) {
    for (let i = 0; i < roundMatches.length; i += courtCount) {
      const chunk = roundMatches.slice(i, i + courtCount);
      chunk.forEach(([teamAId, teamBId], courtIndex) => {
        slots.push({
          roundNumber,
          courtNumber: courtIndex + 1,
          teamAId,
          teamBId,
          startOffsetMinutes: waveOffset,
          durationMinutes: slotMinutes,
          isExtension,
          extensionNumber,
        });
      });
      waveOffset += slotMinutes;
    }
    roundNumber += 1;
  }

  return { slots, endOffsetMinutes: waveOffset };
}

export function generateInitialSchedule(
  teamIds: number[],
  courtCount: number,
  slotMinutes: number,
): SlotDraft[] {
  const rounds = roundRobinRounds(teamIds);
  const { slots } = layoutRounds(rounds, courtCount, slotMinutes, 1, 0, false, 0);
  return slots;
}

/**
 * Appends another full round-robin cycle after the existing schedule.
 * Can be called repeatedly for multiple extensions (e.g. games ran long
 * and the group wants more rounds).
 */
export function generateExtensionSchedule(
  teamIds: number[],
  courtCount: number,
  slotMinutes: number,
  lastRoundNumber: number,
  lastEndOffsetMinutes: number,
  extensionNumber: number,
): SlotDraft[] {
  const rounds = roundRobinRounds(teamIds);
  const { slots } = layoutRounds(
    rounds,
    courtCount,
    slotMinutes,
    lastRoundNumber + 1,
    lastEndOffsetMinutes,
    true,
    extensionNumber,
  );
  return slots;
}

export function formatOffset(startOffsetMinutes: number, baseTime: Date): string {
  const d = new Date(baseTime.getTime() + startOffsetMinutes * 60_000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
