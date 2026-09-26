// The Words With Friends dictionary: assets/words.txt (built by tools/build-wordlist.mjs —
// prefix-compressed, see there), fetched once at boot and decoded on arrival.
//
// Plurals and verb / comparative forms of listed words are derived at lookup time (cats,
// zapped, running, nicer, happiest, campers…) — a little lenient (it'll take "happys"),
// which is fine for a camp game. Bots only play the everyday words flagged common
// (`botWords`), cross words included (`isWord(w, true)`), so their plays look like a
// person's, not a word-list's.

const URL = 'assets/words.txt';

let words: Set<string> | null = null;
let common: Set<string> | null = null;
let byLength: string[][] | null = null;
let loading: Promise<boolean> | null = null;

/** Starts the download (safe to call again); resolves true once the dictionary is usable. */
export function loadDictionary(): Promise<boolean> {
  loading ??= fetch(URL)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((text) => {
      const set = new Set<string>(), everyday = new Set<string>();
      const lens: string[][] = [];
      let prev = '';
      for (const line of text.split('\n')) {
        if (!line) continue;
        const c = line.charCodeAt(0);
        const isCommon = c >= 65; // 'A' + shared letters for common words, '0' + shared otherwise
        const w = prev.slice(0, c - (isCommon ? 65 : 48)) + line.slice(1);
        set.add(w);
        if (isCommon) { everyday.add(w); (lens[w.length] ??= []).push(w); }
        prev = w;
      }
      words = set;
      common = everyday;
      byLength = lens;
      return true;
    })
    .catch((e) => {
      console.warn('[words] dictionary failed to load:', e);
      loading = null; // let a later call retry
      return false;
    });
  return loading;
}

export const dictionaryReady = (): boolean => words !== null;

/** Common words of one length (lower case) — what bots pick their plays from. */
export function botWords(length: number): readonly string[] {
  return byLength?.[length] ?? [];
}

const listed = (w: string) => w.length >= 2 && words!.has(w);
const doubled = (w: string, end: number) => {
  const a = w[w.length - end - 1], b = w[w.length - end - 2];
  return a === b && !'aeiou'.includes(a) ? w.slice(0, -end - 1) : null;
};

/** Is `word` (any case) playable? Derived forms are checked two suffixes deep (camp+er+s);
 * `strict` takes everyday words only, exactly as listed (what bots allow themselves — the
 * common list already has the real inflections, so they never make up a "winchs"). */
export function isWord(word: string, strict = false): boolean {
  if (!words) return false;
  const w = word.toLowerCase();
  return strict ? common!.has(w) : check(w, 2);
}

function check(w: string, depth: number): boolean {
  if (listed(w)) return true;
  if (depth === 0 || w.length < 3) return false;
  const d = depth - 1;
  const base = (s: string | null) => !!s && s.length >= 2 && check(s, d);
  const cut = (n: number) => w.slice(0, -n);
  if (w.endsWith('ies') && base(cut(3) + 'y')) return true;
  if (w.endsWith('es') && base(cut(2))) return true;
  if (w.endsWith('s') && !w.endsWith('ss') && base(cut(1))) return true;
  if (w.endsWith('ied') && base(cut(3) + 'y')) return true;
  if (w.endsWith('ed') && (base(cut(2)) || base(cut(1)) || base(doubled(w, 2)))) return true;
  if (w.endsWith('ing') && (base(cut(3)) || base(cut(3) + 'e') || base(doubled(w, 3)))) return true;
  if (w.endsWith('ier') && base(cut(3) + 'y')) return true;
  if (w.endsWith('iest') && base(cut(4) + 'y')) return true;
  if (w.endsWith('er') && (base(cut(2)) || base(cut(1)) || base(doubled(w, 2)))) return true;
  if (w.endsWith('est') && (base(cut(3)) || base(cut(2)) || base(doubled(w, 3)))) return true;
  if (w.endsWith('ly') && base(cut(2))) return true;
  return false;
}
