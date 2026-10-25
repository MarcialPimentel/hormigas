// Browser notifications (opt-in) + tab title badge.
const KEY = 'hormigas.notify';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function notificationsEnabled(): boolean {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  try {
    localStorage.setItem(KEY, p === 'granted' ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  return p === 'granted';
}

export function disableNotifications() {
  try {
    localStorage.setItem(KEY, 'off');
  } catch {
    /* ignore */
  }
}

/** Show a system notification when the tab is in the background. Returns true if shown. */
export function pushNotification(title: string, body?: string, tag?: string): boolean {
  if (!notificationsEnabled() || document.visibilityState === 'visible') return false;
  try {
    const n = new Notification(title, { body, tag, icon: '/favicon.svg' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function setTitleBadge(count: number, alert?: string) {
  const base = 'Hormigas';
  document.title = count > 0 ? `(${count}) ${alert ? `${alert} – ` : ''}${base}` : base;
}
