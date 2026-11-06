import type { SessionPayload } from '@/lib/auth';
import type { Actor } from '@/lib/questionnaireService';

/** O PJ só mexe nos setores do próprio escopo; criar não publica (quem decide é o RH). */
export function gestorActor(session: SessionPayload & { scopedSectorIds: string[] }): Actor {
  return { adminId: session.adminId, role: session.role, isReviewer: false, sectorIds: session.scopedSectorIds };
}

/** RH e Super Admin enxergam todos os setores e são quem aprova. */
export function adminActor(session: SessionPayload): Actor {
  return { adminId: session.adminId, role: session.role, isReviewer: true, sectorIds: null };
}
