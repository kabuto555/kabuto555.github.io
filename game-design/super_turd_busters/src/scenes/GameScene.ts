import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { createButton } from '../ui';
import { watchSafeLayout, anchorTo } from '../safe-layout';

export class GameScene extends Phaser.Scene {
  private placeholder!: Phaser.GameObjects.Rectangle;
  private backButton!: Phaser.GameObjects.Container;
  private unsubscribeSafeLayout?: () => void;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg.primary);

    // For HUD/menus use this.rexUI for responsive layout (see TitleScene).
    // Gameplay objects like this placeholder are positioned directly.
    // Placeholder object animated by update() below — replace with your game.
    this.placeholder = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, 140, 140, COLORS.button.fill,
    );

    this.backButton = createButton(this, 'BACK', COLORS.button.active, () => {
      this.scene.start('TitleScene');
    });

    // 'bottom-center' places the button horizontally centred on the canvas
    // (clamped to insetRect, the device insets) and vertically flush to
    // insetRect's bottom edge, nudging clear of the player app's floating
    // overlay only if the button's own footprint actually overlaps it — see
    // anchorTo in safe-layout.ts. The button sits far from the bottom-right
    // corner horizontally, so that nudge normally never fires; the fixed
    // 60-unit lift below reproduces this button's usual visual gap above the
    // safe area's bottom edge without folding an edge offset into the
    // anchor's own placement math.
    //
    // GAME_WIDTH/GAME_HEIGHT are fixed for the life of the session (engine/
    // orientation are locked at creation), so the canvas size never needs to be
    // re-measured live — only the safe-area insets can change post-mount.
    this.unsubscribeSafeLayout = watchSafeLayout(
      () => ({ width: GAME_WIDTH, height: GAME_HEIGHT }),
      ({ insetRect, keepOutRect }) => {
        const { x, y } = anchorTo(
          GAME_WIDTH,
          GAME_HEIGHT,
          this.backButton.width,
          this.backButton.height,
          'bottom-center',
          { insetRect, keepOutRect },
        );
        this.backButton.setPosition(x, y - 60);
      },
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  update(_time: number, delta: number): void {
    // Per-frame game logic goes here — runs every frame.
    this.placeholder.rotation += delta * 0.002;
  }

  shutdown(): void {
    this.unsubscribeSafeLayout?.();
  }
}
