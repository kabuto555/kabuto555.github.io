// Mr Kodak's photo album — every snapshot he's taken of you, kept in localStorage as small
// JPEG data URLs (~30–40 KB each). Photos arrive "unseen": the HUD photo button counts them
// and the Photo Booth's "!" bobs until you've looked at them as post cards at the booth.
// Capped at ALBUM_MAX (oldest go first) and trimmed further if the storage quota fills up.

import { storageGet, storageTrySet } from '../storage';
import { POSTCARD_STYLES } from './postcard-art';

export interface Photo {
  id: string;
  /** Epoch ms. */
  takenAt: number;
  /** JPEG data URL, POSTCARD_PHOTO.w × POSTCARD_PHOTO.h (720 × 480). */
  image: string;
  /** The moment, e.g. "Sumo Champion!". */
  caption: string;
  /** Where it happened, e.g. "the Sumo Ring". */
  place: string;
  /** Index into POSTCARD_STYLES (tap "New Look" at the booth to change it). */
  style: number;
  seen: boolean;
}

const KEY = 'kodak_album_v1';
export const ALBUM_MAX = 30;

class PhotoAlbum {
  private list: Photo[] = storageGet<Photo[]>(KEY, []).filter((p) => p && typeof p.image === 'string');
  private subs = new Set<() => void>();

  /** Newest first. */
  get photos(): readonly Photo[] { return this.list; }
  get unseenCount(): number { return this.list.reduce((n, p) => n + (p.seen ? 0 : 1), 0); }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  add(p: Omit<Photo, 'id' | 'seen' | 'style'> & { style?: number }): Photo {
    const photo: Photo = {
      ...p,
      id: `${p.takenAt.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      style: p.style ?? Math.floor(Math.random() * POSTCARD_STYLES.length),
      seen: false,
    };
    this.list.unshift(photo);
    if (this.list.length > ALBUM_MAX) this.list.length = ALBUM_MAX;
    this.save();
    return photo;
  }

  markSeen(id: string): void {
    const p = this.list.find((x) => x.id === id);
    if (!p || p.seen) return;
    p.seen = true;
    this.save();
  }

  /** Next post card design for this photo. */
  cycleStyle(id: string): void {
    const p = this.list.find((x) => x.id === id);
    if (!p) return;
    p.style = (p.style + 1) % POSTCARD_STYLES.length;
    this.save();
  }

  remove(id: string): void {
    this.list = this.list.filter((x) => x.id !== id);
    this.save();
  }

  /** Dev: wipe the album. */
  debugReset(): void { this.list = []; this.save(); }

  private save(): void {
    // A full quota drops the oldest photos until the album fits again.
    while (!storageTrySet(KEY, this.list) && this.list.length > 1) this.list.pop();
    this.subs.forEach((f) => f());
  }
}

export const photoAlbum = new PhotoAlbum();
