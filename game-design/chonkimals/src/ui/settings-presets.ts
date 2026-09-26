// Settings content, bound to the persisted game settings (src/game-settings.ts).
// Figma ships SOUND + ACCOUNT; CONTROLS and DISPLAY are additions for this game,
// built from the same section-card / slider / option-row parts.

import { cameraSensitivityScale, gameSettings, type GameSettings, type GraphicsLevel } from '../game-settings';

const GRAPHICS_LEVELS: GraphicsLevel[] = ['low', 'medium', 'high'];
const SAFE_AREA_MODES: GameSettings['safeArea'][] = ['off', 'auto', 'extra'];
import type { SettingsOptions, SettingsSection } from './menu-screens';
import { showSettings } from './menu-screens';

const OFF_ON = ['Off', 'On'];

export function settingsSections(s: GameSettings): SettingsSection[] {
  return [
    {
      title: 'SOUND',
      controls: [
        { kind: 'slider', key: 'musicVolume', label: 'Music Volume', value: s.musicVolume },
        { kind: 'slider', key: 'sfxVolume', label: 'SFX Volume', value: s.sfxVolume },
      ],
    },
    {
      title: 'CONTROLS',
      controls: [
        { kind: 'slider', key: 'cameraSensitivity', label: 'Camera Sensitivity', value: s.cameraSensitivity,
          format: (v) => `${cameraSensitivityScale(v).toFixed(1)}×` },
        { kind: 'options', key: 'screenShake', label: 'Screen Shake', options: OFF_ON, value: s.screenShake ? 1 : 0 },
        { kind: 'options', key: 'showJoystick', label: 'Show Joystick', options: OFF_ON, value: s.showJoystick ? 1 : 0 },
      ],
    },
    {
      title: 'DISPLAY',
      controls: [
        { kind: 'options', key: 'graphics', label: 'Graphics', options: ['Low', 'Medium', 'High'],
          value: GRAPHICS_LEVELS.indexOf(s.graphics) },
        { kind: 'options', key: 'showNames', label: 'Player Names', options: OFF_ON, value: s.showNames ? 1 : 0 },
        { kind: 'options', key: 'chatBubbles', label: 'Chat Bubbles', options: OFF_ON, value: s.chatBubbles ? 1 : 0 },
        { kind: 'options', key: 'safeArea', label: 'Notch Padding', options: ['Off', 'Auto', 'Extra'],
          value: SAFE_AREA_MODES.indexOf(s.safeArea ?? 'auto') },
      ],
    },
  ];
}

/** Map a control change (slider 0..1 / option index) back onto GameSettings. */
export function applySettingChange(key: string, value: number): void {
  switch (key) {
    case 'musicVolume': case 'sfxVolume': case 'cameraSensitivity':
      gameSettings.set({ [key]: value } as Partial<GameSettings>); break;
    case 'graphics': gameSettings.set({ graphics: GRAPHICS_LEVELS[value] ?? 'high' }); break;
    case 'safeArea': gameSettings.set({ safeArea: SAFE_AREA_MODES[value] ?? 'auto' }); break;
    case 'screenShake': case 'showNames': case 'chatBubbles': case 'showJoystick':
      gameSettings.set({ [key]: value === 1 } as Partial<GameSettings>); break;
  }
}

/** Open Settings bound to the live, persisted game settings. */
export function openGameSettings(host: HTMLElement, extra: Partial<SettingsOptions> & { coins: number }) {
  const s = gameSettings.get();
  return showSettings(host, {
    sections: settingsSections(s),
    playerName: s.playerName,
    onChange: applySettingChange,
    ...extra,
  });
}
