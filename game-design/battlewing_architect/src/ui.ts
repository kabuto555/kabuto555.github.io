import { TEXT_STYLES } from './config';

export function createHeader(scene: Phaser.Scene, title: string, subtitle: string): any {
  const rexUI = (scene as any).rexUI;
  const titleText = scene.add.text(0, 0, title, TEXT_STYLES.title);
  const subtitleText = scene.add.text(0, 0, subtitle, TEXT_STYLES.body);

  return rexUI.add.sizer({ orientation: 'y', space: { item: 8 } })
    .add(titleText, 0, 'center')
    .add(subtitleText, 0, 'center');
}

export function createButton(
  scene: Phaser.Scene, label: string, color: number, onClick: () => void,
): Phaser.GameObjects.Container {
  const w = 320, h = 80, r = 16;
  const bg = scene.add.graphics();
  bg.fillStyle(color, 1);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

  const text = scene.add.text(0, 0, label, TEXT_STYLES.button).setOrigin(0.5);
  const container = scene.add.container(0, 0, [bg, text]);
  container.setSize(w, h);
  container.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
      scene.tweens.add({ targets: container, scaleX: 0.95, scaleY: 0.95, duration: 50, yoyo: true });
      onClick();
    });

  return container;
}
