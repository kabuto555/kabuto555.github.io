import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { createHeader, createButton } from '../ui';
import { watchSafeLayout, centerWithinSafeArea } from '../safe-layout';

export class TitleScene extends Phaser.Scene {
  private menu!: any;
  private unsubscribeSafeLayout?: () => void;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg.primary);

    // This screen is a minimal example: a title + subtitle and one button
    // demonstrating the button + scene-transition pattern. Replace with your game.
    const header = createHeader(this, 'My Game', 'Describe your game idea in the chat to get started');
    const playButton = createButton(this, 'PLAY', COLORS.ui.button, () => {
      this.scene.start('GameScene');
    });

    // The canvas centre here is a first-frame placeholder, not the final
    // position — watchSafeLayout's first callback below corrects it. It is
    // laid out eagerly so the very first painted frame shows the menu roughly
    // where it belongs, rather than stacked at the sizer's default origin for
    // however many frames the gated first read takes to resolve.
    this.menu = (this as any).rexUI.add.sizer({
      x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2,
      orientation: 'y',
      space: { item: 32 },
    })
      .add(header, 0, 'center')
      .add(playButton, 0, 'center')
      .layout();

    // centerWithinSafeArea clamps to insetRect — the device insets — and only
    // consults the keep-out corner if the content actually reaches it. This
    // menu is ~620 units wide, hundreds of units above the bottom-right
    // overlay, so it is never nudged and sits on the true canvas centre. A
    // rect that carved the keep-out permanently out of the whole bottom/right
    // edges would shunt this menu sideways to respect a corner it can never
    // reach — see anchorTo's doc in ../safe-layout for why that approach was
    // replaced.
    //
    // Read from watchSafeLayout's callback rather than a bare getSafeLayout()
    // call here: at create() time the canvas may not be laid out yet, and that
    // call would silently return a degraded 1:1 scale. GAME_WIDTH/GAME_HEIGHT
    // are fixed for the life of the session (engine/orientation are locked at
    // creation), so only the insets can change post-mount.
    this.unsubscribeSafeLayout = watchSafeLayout(
      () => ({ width: GAME_WIDTH, height: GAME_HEIGHT }),
      (layout) => {
        const { x, y } = centerWithinSafeArea(
          GAME_WIDTH,
          GAME_HEIGHT,
          this.menu.width,
          this.menu.height,
          layout,
        );
        this.menu.setPosition(x, y).layout();
      },
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  shutdown(): void {
    this.unsubscribeSafeLayout?.();
  }
}
