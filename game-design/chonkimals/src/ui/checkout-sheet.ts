// FAKED store checkout for real-money items (golden pinecone packs). There is no payment
// backend in WIM: this only mimics the platform purchase sheet — confirm →
// "processing" → done — and then the caller grants the pinecones locally. The sheet
// says plainly that it's a simulation and nothing is charged.

import { COLORS, FONT } from './theme';
import { el, fillScreen } from './components';
import { pillButton } from './store-components';
import { pineconeIcon } from './bead-art';

export interface CheckoutOptions {
  title: string;
  /** e.g. "$4.99". */
  price: string;
  image?: string;
  /** Called once the (fake) payment "succeeds". */
  onPurchased: () => void;
  onCancel?: () => void;
}

const TEXT = `font-family:${FONT};line-height:normal;`;

export function showCheckout(host: HTMLElement, o: CheckoutOptions): () => void {
  const root = el('div', 'position:absolute;inset:0;z-index:140;overflow:hidden;user-select:none;-webkit-user-select:none;');
  root.dataset.overlay = '1';
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel'] as const) {
    root.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  }
  const scrim = el('div', 'position:absolute;inset:0;background:rgba(20,12,6,0.55);');
  const frame = el('div', 'overflow:hidden;');
  root.append(scrim, frame);

  // Bottom sheet, like a platform purchase dialog but in the camp style.
  const sheet = el('div',
    `position:absolute;left:30px;right:30px;bottom:60px;background:${COLORS.cream};border:9px solid ${COLORS.brown};` +
    `border-radius:70px;box-shadow:0 18px 0 ${COLORS.brownDark};padding:50px 56px 60px;display:flex;flex-direction:column;` +
    'align-items:center;gap:30px;');
  const head = el('p', `${TEXT}font-weight:700;font-size:44px;color:${COLORS.brown};letter-spacing:0.02em;`, 'Confirm Purchase');
  const art = el('div', 'width:420px;height:300px;display:flex;align-items:center;justify-content:center;' +
    'background:#fff;border-radius:40px;border:5px solid #dfc3a5;');
  if (o.image) {
    const img = el('img', 'width:100%;height:100%;object-fit:contain;pointer-events:none;');
    img.src = o.image; img.alt = '';
    art.appendChild(img);
  } else {
    art.appendChild(pineconeIcon(160));
  }
  const name = el('p', `${TEXT}font-weight:700;font-size:56px;color:${COLORS.ink};text-align:center;`, o.title);
  const price = el('p', `${TEXT}font-weight:700;font-size:64px;color:${COLORS.brown};`, o.price);
  const note = el('p', `${TEXT}font-weight:500;font-size:28px;color:#8a6a52;text-align:center;max-width:820px;`,
    'Prototype store — this purchase is simulated. No real money is charged.');
  const status = el('p', `${TEXT}font-weight:700;font-size:40px;color:${COLORS.brown};height:50px;`);
  const buttons = el('div', 'display:flex;gap:36px;align-items:center;');
  const cancel = pillButton('Cancel', () => finish(false), 'getMore');
  const buy = pillButton(`Buy ${o.price}`, () => pay(), 'getMore');
  buy.style.background = COLORS.blue;
  buy.style.borderColor = COLORS.blueDark;
  buttons.append(cancel, buy);
  sheet.append(head, art, name, price, note, status, buttons);
  frame.appendChild(sheet);

  host.appendChild(root);
  const unfit = fillScreen(frame, host);
  scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  sheet.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }],
    { duration: 280, easing: 'cubic-bezier(.2,1.2,.4,1)' });

  let busy = false, done = false;
  function pay(): void {
    if (busy) return;
    busy = true;
    buttons.style.opacity = '0.4';
    buttons.style.pointerEvents = 'none';
    status.textContent = 'Processing…';
    setTimeout(() => {
      status.textContent = 'Purchase complete!';
      o.onPurchased();
      setTimeout(() => finish(true), 650);
    }, 700);
  }
  function finish(bought: boolean): void {
    if (done) return;
    done = true;
    if (!bought) o.onCancel?.();
    unfit();
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => root.remove();
  }
  return () => finish(false);
}
