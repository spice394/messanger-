import { setAuthTokenGetter } from "@workspace/api-client-react";

const SESSION_KEY = "cloudtalk_session";

export function saveSession(token: string) {
  sessionStorage.setItem(SESSION_KEY, token);
  setAuthTokenGetter(() => token);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  setAuthTokenGetter(null);
}

export function restoreSession() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) {
    setAuthTokenGetter(() => stored);
  }
}

export function getSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}
