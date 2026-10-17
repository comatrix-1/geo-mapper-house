import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../utils/firebase';

/**
 * Observes the Firebase auth session (Observer pattern). Returns the signed-in
 * user, or null while signed out — nothing else. Data loading triggered by
 * auth changes belongs to the consumer (useWorkspace), not here.
 */
export function useAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return user;
}
