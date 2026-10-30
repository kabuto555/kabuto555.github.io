import '@fontsource/vt323/latin-400.css';
import '@fontsource/cinzel/latin-600.css';

/**
 * All UI CSS, injected once into <head>. PS1/DS look: dark translucent panels, 2px bone borders, hard
 * shadows, no blur. Pixel font VT323 / Cinzel for banners (self-hosted via @fontsource) with monospace/serif fallbacks.
 * Everything is scoped under `.cmw`, which is integer-scaled by createUi.
 */
export const UI_CSS = `
.cmw{position:absolute;left:0;top:0;transform-origin:0 0;font-family:'VT323','Courier New',monospace;font-size:18px;line-height:1;
  color:#d8d0b8;text-shadow:1px 1px 0 #000;user-select:none;-webkit-user-select:none;pointer-events:none;overflow:hidden;
  --bone:#d8d0b8;--dim:#7c7766;--gold:#e0c050;--red:#c83a2a;--green:#58b058;--panel:rgba(10,10,12,.86);--edge:#6a6350;--sel:#3a3524}
.cmw *{box-sizing:border-box;margin:0;padding:0}
.cmw .ic{width:32px;height:32px;image-rendering:pixelated;display:block;flex:none}
.cmw .ic.s{width:16px;height:16px}
.cmw .abs{position:absolute}
.cmw .kc{display:inline-block;min-width:14px;padding:2px 3px 1px;margin:0 1px;background:#1c1b18;border:1px solid #8a8268;border-bottom-width:2px;
  color:var(--bone);font-size:14px;line-height:1;text-align:center;text-shadow:none;white-space:nowrap}
.cmw .hint{transition:opacity .35s}
.cmw .hud:not(.hints-on) .hint{opacity:0}
.cmw .dim{color:var(--dim)} .cmw .gold{color:var(--gold)} .cmw .red{color:var(--red)} .cmw .good{color:var(--green)} .cmw .bad{color:#e05a48}

/* ---- bars (top-left) */
.cmw .bars{position:absolute;left:12px;top:10px}
.cmw .barrow{display:flex;align-items:center;gap:6px;margin-bottom:4px;height:12px}
.cmw .bar{position:relative;height:12px;background:#120e0e;border:2px solid #050505;outline:1px solid #6a6350;overflow:hidden}
.cmw .bar .fill,.cmw .bar .ghost{position:absolute;inset:0;transform-origin:0 50%}
.cmw .bar.hp .fill{background:linear-gradient(#e05040 0 40%,#a02418 40%)}
.cmw .bar.hp .ghost{background:#d8a020}
.cmw .bar.st .fill{background:linear-gradient(#78d070 0 40%,#3c9040 40%)}
.cmw .bar.st.exh .fill{background:linear-gradient(#e05040 0 40%,#901c18 40%);animation:cmwFlash .35s steps(2) infinite}
.cmw .bar.st.exh{background:#2a2a2a}
.cmw .chip{font-size:14px;padding:1px 4px;border:1px solid var(--edge);background:rgba(0,0,0,.55);letter-spacing:1px}
.cmw .chip.fast{color:#80d8f0}.cmw .chip.normal{color:var(--bone)}.cmw .chip.slow{color:#e0a040}.cmw .chip.fat{color:#e05a48}
@keyframes cmwFlash{50%{opacity:.35}}
.cmw .buffs{position:absolute;left:12px;top:46px;display:flex;gap:8px}
.cmw .buff{display:flex;align-items:center;gap:3px;background:rgba(0,0,0,.5);padding:1px 4px 1px 1px;border:1px solid #403c30}
.cmw .toasts{position:absolute;left:12px;top:84px;display:flex;flex-direction:column;gap:3px}
.cmw .toast{display:flex;align-items:center;gap:5px;background:rgba(8,8,10,.62);padding:2px 8px 2px 2px;border-left:2px solid var(--gold);max-width:300px}
.cmw .toast.info{border-left-color:#7c7766;padding-left:6px}
.cmw .toast .cnt{color:#b8b098}

/* ---- souls + gun block (bottom-right) */
.cmw .br{position:absolute;right:16px;bottom:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.cmw .souls{position:relative;text-align:right}
.cmw .souls .lbl{font-size:14px;color:var(--dim);letter-spacing:2px;margin-right:6px}
.cmw .souls .val{font-size:26px;color:var(--bone)}
.cmw .souls .pops{position:absolute;right:0;top:-18px;height:18px;width:120px}
.cmw .pop{position:absolute;right:0;color:var(--gold);animation:cmwPop 1.4s steps(14) forwards}
.cmw .pop.neg{color:#e05a48}
@keyframes cmwPop{0%{transform:translateY(8px);opacity:0}15%{transform:translateY(0);opacity:1}75%{opacity:1}100%{transform:translateY(-8px);opacity:0}}
.cmw .gun{position:relative;width:230px;text-align:right}
.cmw .gun .gname{font-size:18px;color:var(--bone)}
.cmw .gun .tag{font-size:14px;color:var(--gold);margin-left:6px;vertical-align:1px}
.cmw .gun .ticks{display:flex;justify-content:flex-end;gap:1px;height:6px;margin:4px 0 2px}
.cmw .gun .tk{flex:0 0 5px;height:6px;background:#2a2822}
.cmw .gun .tk.on{background:var(--bone)}
.cmw .gun.low .tk.on{background:var(--red)}
.cmw .gun .big{display:flex;justify-content:flex-end;align-items:baseline;gap:8px;font-size:40px;height:38px;color:var(--bone)}
.cmw .gun .big .sep{color:var(--dim);font-size:34px}
.cmw .gun .big .res{font-size:28px;color:#aaa48c}
.cmw .gun .big .mag.low,.cmw .gun .big .mag.empty,.cmw .gun .big .res.low,.cmw .gun .big .res.empty{color:#e05a48}
.cmw .gun .big .res.gold{color:var(--gold)}
.cmw .gun .big .ic{align-self:center;margin-left:2px}
.cmw .gun .sub{height:18px;font-size:16px;margin-top:2px}
.cmw .gun .reload{color:var(--bone)} .cmw .gun .reload.pulse{animation:cmwFlash .6s steps(2) infinite;color:#e0a040}
.cmw .gun .rbar{height:3px;background:#2a2822;margin-top:2px}.cmw .gun .rbar i{display:block;height:3px;background:var(--bone);transform-origin:0 50%}
.cmw .gun .noammo{color:#e05a48}
.cmw .gun .offhand{font-size:15px;color:#8a846e;margin-top:3px}

/* ---- quick-slot cross (bottom-left) */
.cmw .cross{position:absolute;left:20px;bottom:18px;display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px);gap:2px}
.cmw .cs{position:relative}
.cmw .cs .box{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:rgba(10,10,12,.72);border:2px solid #5a5440;outline:1px solid #000}
.cmw .cs.empty .box{opacity:.55}
.cmw .cs.zero .ic{filter:grayscale(1) brightness(.6)}
.cmw .cs .cnt{position:absolute;right:3px;bottom:1px;font-size:16px;color:var(--bone)}
.cmw .cs.zero .cnt{color:#e05a48}
.cmw .cs .ghost{position:absolute;left:2px;top:2px;width:16px;height:16px;opacity:.5;filter:grayscale(.6)}
.cmw .cs .side{position:absolute;left:calc(100% + 5px);top:6px;white-space:nowrap;font-size:14px;line-height:15px}
.cmw .cs .under{position:absolute;left:0;right:0;top:calc(100% + 3px);white-space:nowrap;font-size:14px;text-align:center}
.cmw .cs.l .under{text-align:left;left:-2px;right:auto}
.cmw .cs .nxt{color:var(--dim)}
.cmw .cs.flash .box{animation:cmwBox .5s steps(5)}
@keyframes cmwBox{0%{background:#6a6030}100%{background:rgba(10,10,12,.72)}}
.cmw .cs.t{grid-area:1/2}.cmw .cs.l{grid-area:2/1}.cmw .cs.m{grid-area:2/2}.cmw .cs.r{grid-area:2/3}.cmw .cs.b{grid-area:3/2}

/* ---- center */
.cmw .xh{position:absolute;left:50%;top:50%;width:0;height:0}
.cmw .xh i{position:absolute;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.55);opacity:.9}
.cmw .xh .dot{left:-1px;top:-1px;width:2px;height:2px}
.cmw .hm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
.cmw .hm i{position:absolute;width:2px;height:7px;background:#fff;box-shadow:0 0 0 1px #000}
.cmw .hm i:nth-child(1){left:-11px;top:-11px;transform:rotate(45deg)}
.cmw .hm i:nth-child(2){left:9px;top:-11px;transform:rotate(-45deg)}
.cmw .hm i:nth-child(3){left:-11px;top:5px;transform:rotate(-45deg)}
.cmw .hm i:nth-child(4){left:9px;top:5px;transform:rotate(45deg)}
.cmw .hm.on{animation:cmwHit .22s steps(4) forwards}
.cmw .hm.kill i{background:#ff3030;height:10px}
.cmw .hm.kill.on{animation-duration:.45s}
.cmw .hm.head i{background:var(--gold)}
.cmw .hm.block i{background:#60a0ff}
@keyframes cmwHit{0%{opacity:1;transform:scale(1.3)}100%{opacity:0;transform:scale(1)}}
.cmw .prompts{position:absolute;left:50%;top:62%;transform:translateX(-50%);text-align:center;font-size:20px}
.cmw .prompts div{margin-bottom:3px;background:rgba(8,8,10,.5);padding:2px 8px;white-space:nowrap}
.cmw .prompts .kc{font-size:16px}
.cmw .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(140,0,0,.55) 100%);opacity:0;transition:opacity .5s}
.cmw .arc{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
.cmw .arc i{position:absolute;left:-60px;top:-110px;width:120px;height:14px;background:radial-gradient(ellipse at 50% 0,rgba(220,30,20,.95),rgba(220,30,20,0) 70%)}
.cmw .arc.on{animation:cmwArc .9s steps(9) forwards}
@keyframes cmwArc{0%{opacity:1}100%{opacity:0}}
.cmw .boss{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:340px;text-align:center}
.cmw .boss .bn{font-size:20px;letter-spacing:3px;margin-bottom:2px}
.cmw .boss .bb{height:10px;background:#120e0e;border:2px solid #050505;outline:1px solid #6a6350;overflow:hidden}
.cmw .boss .bb i{display:block;height:100%;background:linear-gradient(#e05040 0 40%,#a02418 40%);transform-origin:0 50%}

/* ---- banners / dialogue */
.cmw .bn-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;opacity:0;transition:opacity 1.2s steps(12)}
.cmw .bn-layer.on{opacity:1}
.cmw .bn-layer.died{background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.72) 30%,rgba(0,0,0,.72) 70%,rgba(0,0,0,0))}
.cmw .bn-layer .t{font-family:'Cinzel','Times New Roman',serif;font-weight:600;font-size:min(64px,6.4vw);letter-spacing:min(8px,.9vw);max-width:100%;box-sizing:border-box;padding:0 12px;text-align:center;overflow-wrap:anywhere;text-shadow:0 0 0 #000,3px 3px 0 #000}
.cmw .bn-layer .sub{font-size:min(22px,2.6vw);text-align:center;margin-top:10px;color:var(--bone)}
.cmw .bn-layer.died .t{color:#a82020}
.cmw .bn-layer.bonfireLit .t{color:#e8c860;font-size:min(48px,5.2vw)}
.cmw .bn-layer.victory .t{color:#e8c860}
.cmw .bn-layer.demoComplete .t{color:#e8e0c8;font-size:min(58px,6vw)}
.cmw .bn-layer.text .t{color:var(--bone);font-size:min(44px,5vw)}
.cmw .keypop{position:absolute;left:50%;top:34%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:12px 26px 12px 14px;
  background:var(--panel);border:2px solid var(--gold);outline:1px solid #000;opacity:0;transition:opacity .4s steps(4)}
.cmw .keypop.on{opacity:1}
.cmw .keypop .ic{width:64px;height:64px}
.cmw .keypop .k1{font-size:14px;color:var(--gold);letter-spacing:2px}.cmw .keypop .k2{font-size:30px}.cmw .keypop .k3{font-size:16px;color:#b8b098;max-width:300px;margin-top:3px;line-height:14px}
.cmw .dlg{position:absolute;left:50%;bottom:172px;transform:translateX(-50%);width:440px;padding:10px 14px 12px;background:var(--panel);border:2px solid var(--edge);outline:1px solid #000;display:none}
.cmw .dlg .who{color:var(--gold);font-size:16px;letter-spacing:2px;margin-bottom:5px}
.cmw .dlg .line{font-size:20px;line-height:17px;min-height:34px}

/* ---- panels / menus */
.cmw .scrim{position:absolute;inset:0;background:rgba(0,0,0,.45);display:none;pointer-events:auto}
.cmw .scrim.on{display:block}
.cmw .panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--panel);border:2px solid var(--edge);outline:1px solid #000;
  box-shadow:3px 3px 0 rgba(0,0,0,.7);pointer-events:auto;display:flex;flex-direction:column}
.cmw .ptitle{display:flex;align-items:center;gap:6px;padding:5px 8px 4px;border-bottom:2px solid var(--edge);background:rgba(40,36,26,.7)}
.cmw .ptitle .sp{flex:1}
.cmw .tab{padding:3px 10px 2px;border:1px solid transparent;color:var(--dim);cursor:pointer;font-size:20px}
.cmw .tab:hover{color:var(--bone)} .cmw .tab.sel{color:var(--gold);border-color:var(--edge);background:#14130e}
.cmw .pbody{display:flex;gap:8px;padding:8px;min-height:0;flex:1}
.cmw .pfoot{padding:4px 8px 5px;border-top:2px solid var(--edge);color:var(--dim);font-size:15px;display:flex;gap:12px;align-items:center}
.cmw .col{display:flex;flex-direction:column;gap:5px;min-width:0}
.cmw .sec{color:var(--dim);font-size:14px;letter-spacing:2px;margin:3px 0 1px}
.cmw .btn{display:flex;align-items:center;gap:6px;padding:4px 8px 3px;border:2px solid #403c30;background:rgba(30,28,20,.6);cursor:pointer;white-space:nowrap}
.cmw .btn:hover,.cmw .btn.sel{border-color:var(--gold);background:var(--sel);color:#fff}
.cmw .btn.off{opacity:.45;cursor:default}
.cmw .btn.off:hover{border-color:#403c30;background:rgba(30,28,20,.6);color:inherit}

/* equipment */
.cmw .grid{display:grid;gap:5px 5px}
.cmw .slot{position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);border:2px solid #403c30;cursor:pointer}
.cmw .slot:hover{border-color:#8a8268}
.cmw .slot.sel{border-color:var(--gold);background:var(--sel)}
.cmw .slot .nm{position:absolute;left:0;right:0;top:calc(100% + 2px);text-align:center;font-size:12px;color:var(--dim);white-space:nowrap;pointer-events:none}
.cmw .slot .cnt{position:absolute;right:2px;bottom:0;font-size:15px}
.cmw .slot.nothing .ic{opacity:.15}
.cmw .cell{position:relative;padding-bottom:14px}
.cmw .list{display:flex;flex-direction:column;gap:2px;overflow-y:auto;pointer-events:auto;scrollbar-width:thin;scrollbar-color:#6a6350 #14130e}
.cmw .row{display:flex;align-items:center;gap:6px;padding:2px 6px 2px 3px;border:1px solid transparent;cursor:pointer;min-height:20px}
.cmw .row:hover,.cmw .row.sel{background:var(--sel);border-color:#8a8268}
.cmw .row .grow{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmw .row.cant{opacity:.4}
.cmw .row .eq{color:var(--gold);font-size:14px}
.cmw .detail{display:flex;flex-direction:column;gap:4px;font-size:17px}
.cmw .detail .dname{font-size:22px;color:var(--gold)}
.cmw .detail .desc{color:#b8b098;line-height:14px;min-height:42px}
.cmw .tbl{display:grid;grid-template-columns:auto 1fr;gap:1px 12px}
.cmw .tbl .v{text-align:right}
.cmw .meter{height:8px;background:#14130e;border:1px solid #403c30;margin-top:2px}
.cmw .meter i{display:block;height:100%;background:var(--bone);transform-origin:0 50%}
.cmw .meter.over i{background:#e05a48}
.cmw .tabs-inv{display:flex;gap:2px;flex-wrap:wrap}
.cmw .stat{display:flex;align-items:center;gap:8px}
.cmw .stat .nm{width:92px}.cmw .stat .lv{width:26px;text-align:right}

/* controls card */
.cmw .card{position:absolute;inset:0;background:rgba(0,0,0,.78);display:none;align-items:center;justify-content:center;pointer-events:none}
.cmw .card.on{display:flex}
.cmw .card .cp{background:var(--panel);border:2px solid var(--edge);outline:1px solid #000;padding:12px 18px 14px;display:flex;gap:30px}
.cmw .card h3{font-size:22px;color:var(--gold);font-weight:normal;margin-bottom:6px;letter-spacing:2px}
.cmw .card .kv{display:flex;justify-content:space-between;gap:20px;margin-bottom:3px;font-size:18px}
.cmw .card .kv span:first-child{color:#b8b098}
.cmw .card .foot{margin-top:8px;color:var(--dim);font-size:15px}

/* level up / shop */
.cmw .lu-row{display:flex;align-items:center;gap:10px;padding:4px 6px;border:2px solid #403c30;background:rgba(30,28,20,.6)}
.cmw .lu-row .nm{width:96px;font-size:20px}
.cmw .lu-row .val{width:40px;text-align:right;font-size:22px}
.cmw .lu-row .arrow{color:var(--dim)}
.cmw .lu-row .up{padding:2px 10px 1px;border:2px solid #403c30;cursor:pointer;font-size:20px}
.cmw .lu-row .up:hover{border-color:var(--gold);background:var(--sel)}
.cmw .lu-row.sel{border-color:#8a8268}
.cmw .lu-row .up.off{opacity:.35;cursor:default}.cmw .lu-row .up.off:hover{border-color:#403c30;background:none}
.cmw .shop-price{color:var(--gold);min-width:48px;text-align:right}
.cmw .shop-price.poor{color:#e05a48}
.cmw .warn{color:#e0a040;font-size:15px}
.cmw .big-souls{font-size:26px;color:var(--bone)}
`;

let injected = false;

export function injectStyle(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-cmw-ui', '');
  el.textContent = UI_CSS;
  document.head.appendChild(el);
}
