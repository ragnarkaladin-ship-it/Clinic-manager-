import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AuditLog, UserProfile } from '../types';

let cachedIPPromise: Promise<string> | null = null;

const getClientIP = (): Promise<string> => {
  if (!cachedIPPromise) {
    cachedIPPromise = fetch('/api/ip')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then(data => data.ip || 'Unknown')
      .catch((err) => {
        console.warn('Could not fetch IP from backend, trying public fallback:', err);
        return fetch('https://api.ipify.org?format=json')
          .then(res => res.json())
          .then(data => data.ip || 'Unknown')
          .catch(() => 'Unknown');
      });
  }
  return cachedIPPromise;
};

export const AUDIT_LOGGER = {
  log: async (actor: UserProfile | { uid: string, name: string }, action: string, resourceId: string, resourceType: AuditLog['resourceType'], details?: string) => {
    try {
      const ipAddress = await getClientIP();
      const logEntry: Omit<AuditLog, 'id'> = {
        actorId: actor.uid,
        actorName: actor.name,
        action,
        resourceId,
        resourceType,
        timestamp: new Date().toISOString(),
        details,
        ipAddress
      };
      await addDoc(collection(db, 'audit_logs'), logEntry);
    } catch (error) {
      console.error('Audit skip (silent failure to avoid blocking):', error);
    }
  }
};
