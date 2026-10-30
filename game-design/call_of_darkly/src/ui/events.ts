/**
 * UI-facing events. Declared here (declaration merging) so any system can emit them and type-check,
 * whether or not it exists yet. Everything is optional-ish on purpose: the HUD tolerates absence.
 * The UI is a pure consumer of these; it emits only `uiCapture`.
 */
declare module '../core/events' {
  interface EventMap {
    /** World -> HUD: the current "[E] ..." prompt text (the part AFTER the keycap), or null when none. */
    promptChanged: { text: string | null };
    /** An NPC says a line (dialogue box). `name` overrides the id-derived speaker name. */
    npcTalk: { npcId: string; line: string; name?: string };
    /** Open the merchant menu for a shop id (data/shops). */
    shopOpen: { shopId: string };
    /** Death flow: 'start' fades in YOU DIED, 'end' fades it out. */
    deathScreen: { phase: 'start' | 'end' };
    /** Bloodstain / souls recovered (toast). */
    soulsRecovered: { souls?: number };
    /** Generic center banner (placeholders for BONFIRE LIT / VICTORY ACHIEVED / DEMO COMPLETE). */
    banner: { kind: 'died' | 'bonfireLit' | 'victory' | 'demoComplete' | 'text'; text?: string; sub?: string; hold?: number };
    /** Boss health bar (bottom-center). show=false hides it. */
    bossBar: { name?: string; hp?: number; max?: number; show: boolean };
    /** Flash a context hint, e.g. the first boss windups: { action: 'dodge', label: 'Dodge' }. */
    hintFlash: { action: string; label: string; hold?: number };
    /** UI menus took / released the mouse. Gameplay systems should ignore fire/move while `capturing`. */
    uiCapture: { capturing: boolean };
  }
}

export {};
