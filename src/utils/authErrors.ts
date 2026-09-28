/** Minimal structural shape of a Firebase auth error we care about. */
export interface AuthErrorLike {
  code?: string;
  message?: string;
}

/**
 * Messages for error codes that have a single fixed, user-friendly wording.
 * Keyed by Firebase auth error code.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/api-key-not-valid":
    "Invalid API Key. Please ensure you have replaced the placeholder config in utils/firebase.ts with your own project keys.",
  "auth/email-already-in-use":
    "This email is already registered. Please sign in instead.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/invalid-email": "Invalid email format.",
  "auth/too-many-requests":
    "Too many failed attempts. Please try again later.",
};

/**
 * Convert a Firebase auth error into a user-facing message.
 * Falls back to the error's own message for unknown codes.
 */
export const formatFirebaseError = (error: AuthErrorLike): string => {
  const { code: errorCode, message: errorMessage = "" } = error;

  if (
    errorCode === "auth/unauthorized-domain" ||
    errorMessage.includes("unauthorized-domain")
  ) {
    const displayDomain =
      window.location.hostname || window.location.host || "your-current-domain";
    return `Domain Not Authorized\n\nFirebase blocked the sign-in attempt from: "${displayDomain}"\nTo fix this:\n1. Go to Firebase Console > Authentication > Settings > Authorized Domains\n2. Click "Add Domain"\n3. Enter: ${displayDomain}`;
  }

  if (
    errorCode === "auth/invalid-credential" ||
    errorCode === "auth/user-not-found" ||
    errorCode === "auth/wrong-password"
  ) {
    return "Invalid email or password.";
  }

  return AUTH_ERROR_MESSAGES[errorCode ?? ""] ?? errorMessage;
};
