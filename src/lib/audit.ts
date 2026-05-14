import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AuditLog, UserProfile } from '../types';

export const AUDIT_LOGGER = {
  log: async (actor: UserProfile | { uid: string, name: string }, action: string, resourceId: string, resourceType: AuditLog['resourceType'], details?: string) => {
    try {
      const logEntry: Omit<AuditLog, 'id'> = {
        actorId: actor.uid,
        actorName: actor.name,
        action,
        resourceId,
        resourceType,
        timestamp: new Date().toISOString(),
        details
      };
      await addDoc(collection(db, 'audit_logs'), logEntry);
    } catch (error) {
      console.error('Audit skip (silent failure to avoid blocking):', error);
    }
  }
};
