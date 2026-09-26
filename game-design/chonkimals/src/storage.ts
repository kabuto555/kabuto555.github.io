const prefix = (): string => {
  try {
    return (globalThis as any).__WIM_STORAGE_PREFIX || '';
  } catch {
    return '';
  }
};

export function storageGet<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(prefix() + key);
    if (raw === null) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  } catch {
    return defaultValue;
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(prefix() + key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(prefix() + key);
  } catch {
    return;
  }
}

/** Like storageSet, but reports whether the write stuck (false when the quota is full). */
export function storageTrySet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(prefix() + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
