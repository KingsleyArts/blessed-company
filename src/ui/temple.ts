// The Temple home screen (director's mockup, Nov 19): a full-screen page over the temple background with the title, the currencies,
// a tab list on the left, one framed panel that scrolls (arrows show when there is more above or below), and Begin Expedition.
// The Heroes tab (director's mockup, Nov 19) is wider: the whole page slides left over the priestess, and a party bar replaces the
// footer. Built with DOM calls only, never innerHTML with game text.
import type { HeroSheet } from '../core/heroSheet';
import type { TempleItem, TempleSnapshot } from '../core/runManager';
import type { DamageReport, RoomDamage } from '../core/runStats';
import { kReportCss, reportDamageBody } from './reportView';
import { amountLabel, formatCount, type ResultLine } from '../core/uiText';
import { buildFloorSizeDebug, type FloorSizeDebug } from './floorSizeDebug';

export type TempleTab = 'blessings' | 'equipment' | 'heroes' | 'report' | 'settings';

export interface TempleView {
  snapshot: TempleSnapshot;
  /** Essence carried by the current or last run (the top bar's Essence pill). */
  essence: number;
  amountMode: number;
  volume: number;
  /** The last run's result lines, if there was a run. */
  report: { victory: boolean; lines: ResultLine[]; damage: DamageReport; rooms: RoomDamage[] } | undefined;
  /** Testing builds: the report gets its Damage taken (by room) tab. */
  debug: boolean;
  tab: TempleTab;
  resetArmed: boolean;
  /** Heroes tab: every hero's sheet (empty on other tabs), the hero shown in the stats card, and the party in the bar (empty while
   *  the player rebuilds it after Clear Party). */
  heroes: HeroSheet[];
  heroPick: string;
  party: string[];
  /** The page drawn before this one was the wide Heroes layout, so a change of layout slides instead of jumping. */
  wasWide: boolean;
  /** Testing builds only. */
  floorSize?: FloorSizeDebug;
}

export interface TempleActions {
  buy: (id: string) => void;
  amount: (mode: number) => void;
  newRun: () => void;
  reset: () => void;
  volume: (v: number) => void;
  tab: (t: TempleTab) => void;
  pickHero: (cls: string) => void;
  /** Adds the hero to the party, or removes it. */
  toggleHero: (cls: string) => void;
  autoParty: () => void;
  clearParty: () => void;
}

const kCss = `
.tp-bg { position: fixed; inset: 0; z-index: 9; background: #160c26 center / cover no-repeat; pointer-events: none; }
.tp-root { position: fixed; inset: 0; z-index: 10; color: #f3ecdf; font-family: Georgia, "Times New Roman", serif;
  background: transparent; display: grid; box-sizing: border-box; overflow: hidden;
  --clear: 28vw; --nav: clamp(112px, 12vw, 200px); --head: clamp(54px, 17vh, 170px); --foot: clamp(46px, 13vh, 120px);
  --gold: #e8c877; --gold-dim: rgba(232, 200, 119, 0.45);
  /* The first column is left empty so the priestess in the background stays in view (director, Nov 19). */
  grid-template-columns: calc(var(--clear) - max(10px, env(safe-area-inset-left)) - clamp(8px, 1.6vw, 26px)) var(--nav) minmax(0, 1fr);
  grid-template-rows: var(--head) minmax(0, 1fr) var(--foot);
  column-gap: clamp(8px, 1.6vw, 26px);
  padding: max(6px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(4px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
.tp-root::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(18, 8, 32, 0.6), rgba(18, 8, 32, 0) 38%),
    linear-gradient(180deg, rgba(18, 8, 32, 0.65), rgba(18, 8, 32, 0) 26%, rgba(18, 8, 32, 0) 72%, rgba(18, 8, 32, 0.55)); }
.tp-root > * { position: relative; }
.tp-root svg { display: block; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.tp-root button { font-family: inherit; touch-action: manipulation; -webkit-appearance: none; appearance: none; }

.tp-head { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; min-height: 0; }
.tp-brand { display: flex; align-items: flex-start; gap: clamp(6px, 1.2vw, 18px); min-width: 0; }
.tp-brand .ic { width: clamp(30px, 8vh, 84px); height: clamp(30px, 8vh, 84px); color: #f5dc9a; flex: 0 0 auto;
  filter: drop-shadow(0 0 6px rgba(255, 220, 140, 0.45)); }
.tp-brand h1 { margin: 0; font-size: clamp(26px, 7.4vh, 70px); font-weight: 700; font-style: italic; line-height: 1;
  color: #fbf3df; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6); }
.tp-brand p { margin: clamp(2px, 0.8vh, 8px) 0 0; font-size: clamp(11px, 2.3vh, 21px); color: #efe5d2; max-width: 28em; line-height: 1.2;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8); padding-bottom: clamp(3px, 1vh, 10px);
  border-bottom: 1px solid; border-image: linear-gradient(90deg, var(--gold-dim), var(--gold), rgba(232, 200, 119, 0)) 1; }
.tp-cur { display: flex; gap: clamp(6px, 1vw, 16px); flex: 0 0 auto; }
.tp-pill { display: flex; align-items: center; gap: 0.45em; font-size: clamp(13px, 2.7vh, 23px); padding: 0.22em 1.1em 0.22em 0.5em;
  background: linear-gradient(180deg, rgba(42, 24, 58, 0.92), rgba(22, 12, 34, 0.92)); border: 1px solid var(--gold);
  border-radius: 999px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45); white-space: nowrap; }
.tp-pill svg { width: 1.25em; height: 1.25em; }
.tp-pill.faith svg { color: #ffd36b; fill: #ffd36b; } .tp-pill.ess svg { color: #d9b8ff; fill: rgba(190, 150, 255, 0.55); }

.tp-nav { grid-column: 2; grid-row: 2 / 4; display: flex; flex-direction: column; gap: clamp(4px, 1.1vh, 12px); padding-top: clamp(14px, 4vh, 40px);
  min-height: 0; overflow: auto; scrollbar-width: none; }
.tp-nav::-webkit-scrollbar { display: none; }
.tp-tab { display: flex; align-items: center; gap: 0.55em; text-align: left; font-size: clamp(12px, 2.6vh, 21px); line-height: 1.1;
  color: #f3ecdf; padding: clamp(5px, 1.2vh, 12px) 0.7em; cursor: pointer;
  background: linear-gradient(90deg, rgba(44, 22, 64, 0.9), rgba(44, 22, 64, 0.45)); border: 1px solid var(--gold-dim);
  border-radius: 4px 999px 999px 4px; }
.tp-tab svg { width: 1.45em; height: 1.45em; flex: 0 0 auto; color: #e9dcc0; }
.tp-tab:hover { border-color: var(--gold); filter: brightness(1.15); }
.tp-tab.on { color: #2b1838; background: linear-gradient(180deg, #fbf1d8, #e7d2a6); border: 2px solid var(--gold);
  box-shadow: 0 0 12px rgba(255, 220, 150, 0.45); }
.tp-tab.on svg { color: #6b3f9a; }

.tp-panel { grid-column: 3; grid-row: 2; display: flex; flex-direction: column; min-height: 0; margin-top: clamp(16px, 4.6vh, 44px);
  background: rgba(30, 15, 46, 0.88); border: 2px solid #c9a55a; border-radius: 4px;
  box-shadow: inset 0 0 0 4px rgba(30, 15, 46, 0.9), inset 0 0 0 5px var(--gold-dim), 0 8px 30px rgba(0, 0, 0, 0.55); }
.tp-ptitle { position: absolute; top: 0; left: clamp(8px, 1.4vw, 22px); transform: translateY(-58%); display: flex; align-items: center;
  font-size: clamp(16px, 4.2vh, 38px); font-style: italic; color: #fbf3df; white-space: nowrap;
  padding: 0.12em 1.4em 0.12em 0.4em; background: linear-gradient(180deg, #33194c, #1d0e30); border: 1.5px solid var(--gold);
  clip-path: polygon(0 0, calc(100% - 0.9em) 0, 100% 50%, calc(100% - 0.9em) 100%, 0 100%); }
.tp-ptitle svg { width: 1.3em; height: 1.3em; margin-right: 0.35em; color: #ffd36b; fill: rgba(150, 80, 220, 0.7); }
/* flex: none: if the bar shrinks, the scroll list below overlaps its buttons and takes their taps (Nov 19). */
.tp-tools { display: flex; flex: none; justify-content: flex-end; gap: 6px; padding: clamp(6px, 1.4vh, 14px) clamp(8px, 1.2vw, 18px) 0; }
.tp-amt { -webkit-appearance: none; appearance: none; margin: 0; display: inline-flex; align-items: center; justify-content: center;
  min-width: 3.4em; height: 1.9em; line-height: 1; box-sizing: border-box; font-size: clamp(11px, 2.1vh, 18px); color: #f3ecdf;
  background: rgba(50, 28, 70, 0.9); border: 1px solid var(--gold-dim); border-radius: 3px; padding: 0 0.6em; cursor: pointer; }
.tp-amt.on { background: #6b4a14; border-color: var(--gold); }
.tp-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; scrollbar-width: none; overscroll-behavior: contain;
  padding: clamp(8px, 1.8vh, 18px) clamp(8px, 1.2vw, 18px) clamp(18px, 4vh, 40px); }
.tp-scroll::-webkit-scrollbar { display: none; }
/* Tabs with no amount bar: start the content below the title ribbon, which hangs into the panel. */
.tp-ptitle + .tp-scroll { padding-top: clamp(16px, 3.6vh, 36px); }
.tp-arrow { position: absolute; left: 50%; transform: translateX(-50%); width: clamp(26px, 5vh, 48px); height: clamp(20px, 4vh, 38px);
  padding: 2px 6px; border: 1px solid var(--gold-dim); border-radius: 999px; background: rgba(24, 11, 38, 0.92); color: var(--gold);
  cursor: pointer; display: none; z-index: 2; box-shadow: 0 0 8px rgba(0, 0, 0, 0.7); box-sizing: content-box; }
.tp-arrow svg { width: 100%; height: 100%; stroke-width: 2.4; }
.tp-arrow.show { display: block; }
.tp-arrow.up { top: clamp(4px, 1vh, 10px); } .tp-arrow.down { bottom: clamp(2px, 0.6vh, 8px); }
.tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(190px, 17vw, 300px), 1fr)); gap: clamp(6px, 1.4vh, 14px) clamp(8px, 1.2vw, 18px); }
.tp-sub { grid-column: 1 / -1; margin: clamp(2px, 0.8vh, 8px) 0 0; font-size: clamp(11px, 2.1vh, 18px); color: #d9c9a6; letter-spacing: 0.04em;
  border-bottom: 1px solid var(--gold-dim); padding-bottom: 2px; }
/* Every card is the same size (director, Nov 19): one line of name, up to three lines of detail, the rest is empty space. */
.tp-card { box-sizing: border-box; height: 5.3em; font-size: clamp(13px, 2.3vh, 19px); display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: 1.25em minmax(0, 1fr); column-gap: 0.6em; row-gap: 0.15em; align-items: start; text-align: left; color: #f3ecdf;
  padding: 0.45em 0.7em 0.45em 0.45em; -webkit-appearance: none; appearance: none; margin: 0;
  background: linear-gradient(180deg, rgba(64, 44, 74, 0.92), rgba(38, 24, 50, 0.95)); border: 1px solid var(--gold-dim); border-radius: 4px;
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.3); cursor: default; overflow: hidden; }
.tp-card.buy { border-color: var(--gold); cursor: pointer; }
.tp-card.buy:hover { box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.3), 0 0 10px rgba(255, 215, 130, 0.45); filter: brightness(1.12); }
.tp-card .ic { grid-row: 1 / 3; align-self: center; width: 3.3em; height: 3.3em; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--gold); border-radius: 3px; color: #efe3b8; background: radial-gradient(circle at 50% 40%, #4a4a2e, #24221a 75%); }
.tp-card .ic svg { width: 68%; height: 68%; }
.tp-card .nm { grid-column: 2 / 4; font-size: 1em; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tp-card .side { grid-column: 3; grid-row: 2; align-self: stretch; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; }
.tp-card .lv { font-size: 0.85em; line-height: 1.2; color: #efe5d2; white-space: nowrap; }
.tp-card .ds { font-size: 0.8em; color: #d6cbbd; line-height: 1.2; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
  overflow: hidden; }
.tp-card .cost { display: flex; align-items: center; gap: 0.3em; font-size: 0.95em; color: #ffe7a8; white-space: nowrap; }
.tp-card .cost svg { width: 1.05em; height: 1.05em; color: #ffd36b; fill: #ffd36b; }
.tp-card:not(.buy) .cost { color: #a39a90; } .tp-card:not(.buy) .cost svg { color: #8d8478; fill: #8d8478; }
.tp-card.max .cost { color: #b9f0b0; }
.tp-rows { max-width: 34em; }
.tp-row { display: flex; justify-content: space-between; gap: 24px; font-size: clamp(13px, 2.4vh, 21px); padding: 3px 0; color: #d6cbbd;
  border-bottom: 1px solid rgba(232, 200, 119, 0.18); }
.tp-row .v { color: #fbf3df; } .tp-wide { font-size: clamp(12px, 2.2vh, 19px); color: #fbf3df; padding: 1px 0 4px 12px; }
.tp-result { font-size: clamp(18px, 4vh, 34px); font-style: italic; margin: 0 0 6px; } .tp-result.win { color: #b8f5b8; } .tp-result.lose { color: #ffb4a4; }
.tp-empty { font-size: clamp(13px, 2.5vh, 21px); color: #d6cbbd; }
.tp-set { display: flex; flex-direction: column; gap: clamp(10px, 2.4vh, 22px); font-size: clamp(13px, 2.5vh, 21px); }
.tp-set label { display: flex; align-items: center; gap: 12px; }
.tp-set input[type=range] { width: clamp(120px, 24vw, 320px); accent-color: #e8c877; }
.tp-danger { align-self: flex-start; font-size: clamp(12px, 2.3vh, 19px); color: #fbe9e4; background: #4f1414; border: 1px solid #e0907c;
  border-radius: 4px; padding: 0.4em 1em; cursor: pointer; }
.tp-danger.armed { background: #9a1a1a; border-color: #ffc0b0; }

.tp-foot { grid-column: 3; grid-row: 3; display: flex; justify-content: flex-end; align-items: center; min-height: 0; }
.tp-go { display: flex; align-items: center; gap: 0.45em; font-size: clamp(16px, 4.4vh, 40px); color: #2a1608; cursor: pointer;
  padding: 0.25em 1.6em; border: 2px solid #fbe3a0; background: linear-gradient(180deg, #fff4cc, #ecc672 55%, #b98a35);
  clip-path: polygon(0.7em 0, calc(100% - 0.7em) 0, 100% 50%, calc(100% - 0.7em) 100%, 0.7em 100%, 0 50%);
  filter: drop-shadow(0 0 10px rgba(255, 210, 120, 0.5)); }
.tp-go:hover { filter: drop-shadow(0 0 16px rgba(255, 220, 140, 0.8)) brightness(1.06); }
.tp-go svg { width: 1.1em; height: 1.1em; color: #5a2f8a; stroke-width: 2.2; }
.tp-go .chev { font-size: 1.1em; line-height: 1; }
/* Heroes tab: the empty first column closes so the larger frame fits, and the party bar takes the footer row (director, Nov 19). */
.tp-root { transition: grid-template-columns 0.38s ease, grid-template-rows 0.38s ease; }
.tp-root.wide { --foot: clamp(62px, 21vh, 190px); grid-template-columns: 0px var(--nav) minmax(0, 1fr); }
.tp-root.wide .tp-nav { grid-row: 2; }
@media (prefers-reduced-motion: reduce) { .tp-root { transition: none; } }
.hr-wrap { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.15fr) minmax(0, 1fr); gap: clamp(8px, 1.4vw, 22px);
  align-items: start; font-size: clamp(12px, 2.3vh, 19px); }
.hr-box { background: linear-gradient(180deg, rgba(64, 44, 74, 0.7), rgba(30, 18, 42, 0.85)); border: 1px solid var(--gold-dim);
  border-radius: 4px; box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.3); }
/* The art frame fills the panel's visible height (and stays in view while the other columns scroll). */
.tp-scroll.heroes { container-type: size; }
.hr-art { position: sticky; top: 0; height: max(140px, calc(100cqh - clamp(16px, 3.6vh, 36px) - clamp(18px, 4vh, 40px))); overflow: hidden;
  background: radial-gradient(ellipse at 45% 30%, rgba(190, 140, 255, 0.22), rgba(40, 20, 60, 0) 65%); }
/* The large illustration from the character sheet, as in the mockup: no frame, head kept in view, the bottom fading into the panel. */
.hr-art .fig { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0;
  -webkit-mask-image: linear-gradient(180deg, #000 78%, transparent); mask-image: linear-gradient(180deg, #000 78%, transparent);
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5)); pointer-events: none; user-select: none; }
.hr-art.locked .fig { filter: grayscale(0.85) brightness(0.6); }
.hr-tok { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; border-radius: 50%; color: #fff8e6;
  font-weight: 700; border: 2px solid #f1d58c; box-shadow: 0 0 10px rgba(0, 0, 0, 0.6), inset 0 -0.15em 0.3em rgba(0, 0, 0, 0.35);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); line-height: 1; }
.hr-card { padding: 0.6em 0.8em; display: flex; flex-direction: column; gap: 0.25em; }
.hr-card h2 { margin: 0; font-size: 1.5em; font-style: italic; color: #fbf3df; line-height: 1.1; }
.hr-role { color: #e7d6ae; font-size: 0.9em; }
.hr-cap { color: #b8a98f; font-size: 0.72em; border-bottom: 1px solid var(--gold-dim); padding-bottom: 0.3em; margin-bottom: 0.1em; }
.hr-stat { display: grid; grid-template-columns: 1.3em minmax(0, 1fr) auto; align-items: center; gap: 0.5em; padding: 0.12em 0;
  border-bottom: 1px solid rgba(232, 200, 119, 0.14); }
.hr-stat svg { width: 1.2em; height: 1.2em; color: #e8c877; }
.hr-stat .v { color: #fbf3df; } .hr-stat.locked .v { color: #8f8578; font-style: italic; }
.hr-card h4, .hr-list h4 { margin: 0.45em 0 0.1em; font-size: 0.85em; font-weight: 400; letter-spacing: 0.06em; color: #d9c9a6; }
.hr-skill { font-size: 0.82em; line-height: 1.25; padding: 0.15em 0; }
.hr-skill b { color: #fbf3df; font-weight: 700; } .hr-skill .k { color: #c9b27a; font-size: 0.85em; margin-left: 0.4em; }
.hr-skill div { color: #d6cbbd; }
.hr-act { align-self: stretch; margin-top: 0.5em; font-size: 1em; padding: 0.35em 0.8em; cursor: pointer; color: #2a1608; border: 1px solid #fbe3a0;
  border-radius: 3px; background: linear-gradient(180deg, #fff4cc, #ecc672 55%, #b98a35); }
.hr-act.rem { color: #fbe9e4; background: #4f2a3a; border-color: #e0a0a0; }
.hr-act:disabled { cursor: default; color: #a39a90; background: rgba(50, 36, 60, 0.9); border-color: var(--gold-dim); }
.hr-list { padding: 0.2em 0.6em 0.6em; }
.hr-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5em; }
.hr-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.25em; padding: 0.4em 0.2em 0.3em; margin: 0;
  font-size: 0.85em; color: #f3ecdf; cursor: pointer; background: rgba(40, 24, 54, 0.85); border: 1px solid var(--gold-dim); border-radius: 4px; }
.hr-tile .hr-tok { width: 72%; font-size: 1.5em; }
.hr-tile .nm { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hr-tile.on { border: 2px solid var(--gold); box-shadow: 0 0 10px rgba(255, 220, 150, 0.5); background: rgba(80, 56, 96, 0.9); }
.hr-tile.locked .hr-tok { filter: grayscale(1) brightness(0.55); } .hr-tile.locked .nm { color: #9a9086; }
.hr-tile .lk { position: absolute; top: 30%; width: 1.6em; height: 1.6em; color: #e8dcc0; }
.hr-tile .in { position: absolute; top: 0.2em; right: 0.25em; min-width: 1.3em; height: 1.3em; border-radius: 50%; font-size: 0.8em;
  display: flex; align-items: center; justify-content: center; color: #2a1608; background: #ecc672; border: 1px solid #fbe3a0; }
.tp-party { grid-column: 2 / -1; grid-row: 3; display: flex; align-items: center; gap: clamp(8px, 1.6vw, 26px); min-height: 0; box-sizing: border-box;
  margin-top: clamp(4px, 1.2vh, 12px); padding: clamp(3px, 0.8vh, 10px) clamp(8px, 1.4vw, 22px); font-size: clamp(11px, 2.2vh, 19px);
  background: rgba(30, 15, 46, 0.88); border: 2px solid #c9a55a; border-radius: 4px;
  box-shadow: inset 0 0 0 3px rgba(30, 15, 46, 0.9), inset 0 0 0 4px var(--gold-dim), 0 6px 22px rgba(0, 0, 0, 0.5); }
.pt-words { min-width: 0; flex: 0 1 auto; }
.pt-words h3 { margin: 0; font-size: 1.25em; font-style: italic; font-weight: 400; color: #fbf3df; white-space: nowrap; }
.pt-words p { margin: 0.1em 0 0; color: #d6cbbd; font-size: 0.85em; }
/* Fixed sizes, no aspect-ratio with a % height: iOS Safari collapsed those slots and the buttons slid under them (director, Nov 20). */
.pt-slots { display: flex; gap: clamp(4px, 0.8vw, 14px); align-items: center; flex: none; }
.pt-slot { --h: clamp(50px, 18vh, 150px); position: relative; flex: none; width: calc(var(--h) * 1.3); height: var(--h); box-sizing: border-box;
  margin: 0; padding: 0; border: 0; background: none; cursor: pointer; }
.pt-slot .ring { position: absolute; left: 8%; right: 8%; bottom: 4%; height: 28%; border-radius: 50%; border: 2px solid rgba(190, 120, 255, 0.85);
  background: radial-gradient(ellipse, rgba(170, 90, 255, 0.55), rgba(60, 20, 100, 0.2) 70%); box-shadow: 0 0 10px rgba(170, 90, 255, 0.6); }
.pt-slot.empty .ring { border: 1px dashed var(--gold-dim); background: rgba(30, 18, 42, 0.5); box-shadow: none; }
/* The chibi pixel sprites: drawn with hard pixels, feet on the ring. */
.pt-slot .spr { position: absolute; left: 50%; bottom: 13%; transform: translateX(-50%); image-rendering: pixelated; pointer-events: none; }
.pt-slot .n { position: absolute; left: 50%; bottom: -0.35em; transform: translateX(-50%); font-size: 0.8em; color: #2a1608; background: #ecc672;
  border: 1px solid #fbe3a0; border-radius: 50%; width: 1.4em; height: 1.4em; display: flex; align-items: center; justify-content: center; }
.pt-slot .plus { position: absolute; left: 0; right: 0; top: 18%; text-align: center; color: var(--gold-dim); font-size: 1.6em; }
.pt-btn { font-size: 0.95em; padding: 0.35em 0.9em; cursor: pointer; color: #f3ecdf; background: rgba(60, 36, 84, 0.95); border: 1px solid var(--gold);
  border-radius: 3px; white-space: nowrap; }
.pt-btns { display: flex; flex-direction: column; gap: 0.3em; flex: none; }
.tp-party .tp-go { margin-left: auto; font-size: clamp(14px, 3.4vh, 32px); flex: none; }
.tp-go:disabled { filter: grayscale(0.85) brightness(0.7); cursor: default; }
@media (max-width: 900px) { .pt-words p { display: none; } }
@media (max-width: 700px) { .hr-wrap { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); } .hr-art { display: none; } }
@media (max-height: 480px) { .tp-brand p { max-width: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
@media (max-width: 640px) { .tp-cur { flex-direction: column; align-items: flex-end; gap: 4px; } }
`;

// 24x24 line icons.
const kIcon: Record<string, string> = {
  temple: 'M12 1.5v3M10.5 3h3M5 10l7-5.5L19 10M4 10h16v2H4zM6.5 12v7M10 12v7M14 12v7M17.5 12v7M3 19h18v3H3z',
  blessing: 'M12 2l2.4 6.6L21 7l-4.6 5L21 17l-6.6-1.6L12 22l-2.4-6.6L3 17l4.6-5L3 7l6.6 1.6z',
  report: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4',
  heroes: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 11a2.5 2.5 0 100-5.5M17.5 14c2.2.6 3.5 3 3.5 6',
  equipment: 'M3 10h18v10H3zM3 10l2.5-5h13L21 10M10 13h4v3h-4z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  faith: 'M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z',
  essence: 'M12 2l6 7-6 13-6-13zM6 9h12M9.5 9L12 22l2.5-13',
  sword: 'M14.5 3H21v6.5L10 20.5 6.5 17 17.5 6M5 15l4 4M3 21l3-3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10zM12 9v6M9 12h6',
  burst: 'M12 2l1.6 6.2L19 5l-3.2 5.4L22 12l-6.2 1.6L19 19l-5.4-3.2L12 22l-1.6-6.2L5 19l3.2-5.4L2 12l6.2-1.6L5 5l5.4 3.2z',
  speed: 'M3 16c4-1 8-4 10-10M7 19c4-1.5 9-5 12-12M13 20c3-1.5 6-4 8-8',
  flame: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8 0 4 3 7 7 7z',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11M12 15v2',
  crystal: 'M12 2l5 6-5 14-5-14zM7 8h10M12 2v20',
  chest: 'M3 10h18v10H3zM3 10l2.5-5h13L21 10M10 13h4v3h-4z',
  hero: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
  down: 'M6 5l6 6 6-6M6 12l6 6 6-6',
  up: 'M6 19l6-6 6 6M6 12l6-6 6 6',
  swords: 'M4 4l11 11M15 15l-2 3 4 4 2-2-3-3M20 4L9 15M9 15l2 3-4 4-2-2 3-3',
};

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', kIcon[name] ?? kIcon.blessing);
  svg.appendChild(p);
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function btn(cls: string, onClick: () => void, ...kids: (Node | string)[]): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  b.append(...kids);
  b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return b;
}

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = kCss + kReportCss;
  document.head.appendChild(s);
}

const kTabs: { id: TempleTab; label: string; icon: string; title: string }[] = [
  { id: 'blessings', label: 'Temple Blessings', icon: 'blessing', title: 'Temple Blessings' },
  { id: 'report', label: 'Expedition Report', icon: 'report', title: 'Expedition Report' },
  { id: 'heroes', label: 'Heroes', icon: 'heroes', title: 'Heroes' },
  { id: 'equipment', label: 'Equipment', icon: 'equipment', title: 'Equipment' },
  { id: 'settings', label: 'Settings', icon: 'settings', title: 'Settings' },
];

function itemIcon(it: TempleItem): string {
  const l = it.label.toLowerCase();
  if (it.id.startsWith('Stat:')) return 'lock';
  if (l.includes('weapon')) return 'sword';
  if (l.includes('armor') || l.includes('defense')) return 'shield';
  if (l.includes('health') || l.includes('heal')) return 'heart';
  if (l.includes('attack speed') || l.includes('speed')) return 'speed';
  if (l.includes('threat')) return 'flame';
  if (l.includes('damage') || l.includes('crit')) return 'burst';
  if (l.includes('essence')) return 'crystal';
  if (l.includes('faith')) return 'faith';
  if (l.includes('spirit')) return 'blessing';
  return 'chest';
}

function itemCard(it: TempleItem, buy: (id: string) => void): HTMLButtonElement {
  const unlock = it.maxLevel <= 1;
  const b = el('button', `tp-card${it.canBuy ? ' buy' : ''}${it.maxed ? ' max' : ''}${unlock ? ' unlock' : ''}`);
  b.type = 'button';
  const ic = el('span', 'ic');
  ic.appendChild(icon(itemIcon(it)));
  const cost = el('span', 'cost');
  if (it.maxed) cost.textContent = unlock ? 'Owned' : 'MAX';
  else cost.append(icon('faith'), formatCount(it.cost));
  b.title = `${it.label}: ${it.detail}`;   // the full text when the card cuts it short
  const side = el('span', 'side');
  side.append(el('span', 'lv', unlock ? '' : `Lv ${it.level}/${it.maxLevel}`), cost);
  b.append(ic, el('span', 'nm', it.label), el('span', 'ds', it.detail), side);
  if (it.canBuy) b.addEventListener('click', (ev) => { ev.stopPropagation(); buy(it.id); });
  else b.disabled = true;
  return b;
}

export interface BuiltTemple {
  root: HTMLElement;
  scroller: HTMLElement;
  /** Shows or hides the up and down arrows for the scroll position. */
  refreshArrows: () => void;
  /** Call once the page is in the document: slides into or out of the wide Heroes layout when it changed. */
  settle: () => void;
}

/** The Temple background on its own element. It stays in place while the page above it is rebuilt (tab, purchase), because a new
 *  element with the image flashes its dark fallback colour for a frame on iOS before the image paints (director, Nov 19). */
export function buildTempleBackdrop(bg: string): HTMLElement {
  ensureStyle();
  const back = el('div', 'tp-bg');
  back.style.backgroundImage = `url("${bg}")`;
  return back;
}

/** Builds the Temple page (everything above the background; see buildTempleBackdrop). */
export function buildTemple(v: TempleView, a: TempleActions): BuiltTemple {
  ensureStyle();
  const wide = v.tab === 'heroes';
  const root = el('div', `tp-root${v.wasWide ? ' wide' : ''}`);

  // Title and currencies.
  const head = el('div', 'tp-head');
  const brand = el('div', 'tp-brand');
  const bic = el('span', 'ic');
  bic.appendChild(icon('temple'));
  const words = el('div');
  words.append(el('h1', '', 'Temple'), el('p', '', 'Prepare your next expedition with blessings and permanent upgrades.'));
  brand.append(bic, words);
  const cur = el('div', 'tp-cur');
  const faith = el('div', 'tp-pill faith');
  faith.append(icon('faith'), `Faith ${formatCount(v.snapshot.essence)}`);
  const ess = el('div', 'tp-pill ess');
  ess.append(icon('essence'), `Essence ${formatCount(v.essence)}`);
  cur.append(faith, ess);
  head.append(brand, cur);

  // Tabs.
  const nav = el('nav', 'tp-nav');
  for (const t of kTabs) nav.appendChild(btn(`tp-tab${t.id === v.tab ? ' on' : ''}`, () => a.tab(t.id), icon(t.icon), t.label));

  // The framed panel.
  const panel = el('section', 'tp-panel');
  const title = el('div', 'tp-ptitle');
  title.append(icon('blessing'), kTabs.find((t) => t.id === v.tab)?.title ?? '');
  panel.appendChild(title);
  if (v.tab === 'blessings' || v.tab === 'equipment') {
    const tools = el('div', 'tp-tools');
    for (let i = 0; i < 4; ++i) tools.appendChild(btn(`tp-amt${i === v.amountMode ? ' on' : ''}`, () => a.amount(i), amountLabel(i)));
    panel.appendChild(tools);
  }
  const scroller = el('div', `tp-scroll${wide ? ' heroes' : ''}`);
  scroller.appendChild(tabBody(v, a));
  panel.appendChild(scroller);
  const up = btn('tp-arrow up', () => scroller.scrollBy({ top: -scroller.clientHeight * 0.8, behavior: 'smooth' }), icon('up'));
  const down = btn('tp-arrow down', () => scroller.scrollBy({ top: scroller.clientHeight * 0.8, behavior: 'smooth' }), icon('down'));
  up.setAttribute('aria-label', 'Scroll up');
  down.setAttribute('aria-label', 'Scroll down');
  panel.append(up, down);
  const refreshArrows = (): void => {
    const top = scroller.scrollTop;
    const more = scroller.scrollHeight - scroller.clientHeight - top;
    up.classList.toggle('show', top > 2);
    down.classList.toggle('show', more > 2);
  };
  scroller.addEventListener('scroll', refreshArrows, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refreshArrows).observe(scroller);

  // Begin Expedition (in the party bar on the Heroes tab).
  const foot = wide ? partyBar(v, a) : el('div', 'tp-foot');
  if (!wide) foot.appendChild(goButton(a, true));

  root.append(head, nav, panel, foot);
  const settle = (): void => {
    if (v.wasWide === wide) return;
    void root.offsetWidth;   // lay out the old layout first, so the change animates
    root.classList.toggle('wide', wide);
  };
  return { root, scroller, refreshArrows, settle };
}

function goButton(a: TempleActions, enabled: boolean): HTMLButtonElement {
  const b = btn('tp-go', () => { if (enabled) a.newRun(); }, icon('swords'), 'Begin Expedition', el('span', 'chev', '»'));
  b.disabled = !enabled;
  return b;
}

/** The director's character art (Nov 19), cut from the character sheets: a face for the round portraits and the front view for the
 *  large frame. The tint shows while an image loads. */
const heroArt = (cls: string, part: 'face' | 'art'): string => `${import.meta.env.BASE_URL}assets/heroes/${cls.toLowerCase()}_${part}.webp`;
const heroSprite = (cls: string): string => `${import.meta.env.BASE_URL}assets/heroes/${cls.toLowerCase()}_sprite.png`;
/** Sprite heights in pixels (all drawn at one scale, 72 = a full slot). Every hero has a chibi sprite since Nov 21 (the Barbarian's includes
 *  his axe, so he is the widest). */
const kSpriteH: Record<string, number> = { Warrior: 63, Mage: 65, Priest: 69, Assassin: 72, Barbarian: 75, Summoner: 57 };

const kHeroTint: Record<string, string> = {
  Warrior: '#b8443c', Mage: '#4a62c9', Assassin: '#3f9a5c', Priest: '#c9ad3e', Barbarian: '#c0702e', Summoner: '#8a4fc0',
};

function token(h: { className: string; label: string }): HTMLElement {
  const t = el('span', 'hr-tok');
  t.style.background = `url("${heroArt(h.className, 'face')}") center / cover no-repeat, ${kHeroTint[h.className] ?? '#777'}`;
  t.setAttribute('aria-hidden', 'true');
  return t;
}

const kStatIcon: Record<string, string> = {
  Health: 'heart', Damage: 'sword', AttackSpeed: 'speed', DefensePct: 'shield', CritChance: 'burst', CritFactor: 'flame',
};

function heroesBody(v: TempleView, a: TempleActions): HTMLElement {
  const wrap = el('div', 'hr-wrap');
  const h = v.heroes.find((x) => x.className === v.heroPick) ?? v.heroes[0];
  if (!h) return wrap;
  const inParty = v.party.includes(h.className);

  const art = el('div', 'hr-art');
  const fig = el('img', 'fig');
  fig.src = heroArt(h.className, 'art');
  fig.alt = h.label;
  fig.draggable = false;
  art.append(fig);
  if (!h.owned) art.classList.add('locked');

  const card = el('div', 'hr-box hr-card');
  card.append(el('h2', '', h.label), el('div', 'hr-role', h.role), el('div', 'hr-cap', 'Base stats with Temple blessings and gear'));
  for (const s of h.stats) {
    const row = el('div', `hr-stat${s.locked ? ' locked' : ''}`);
    row.append(icon(kStatIcon[s.key] ?? 'blessing'), el('span', '', s.label), el('span', 'v', s.value));
    card.appendChild(row);
  }
  card.appendChild(el('h4', '', 'Skills'));
  for (const sk of h.skills) {
    const row = el('div', 'hr-skill');
    const top = el('div');
    top.append(el('b', '', sk.name), el('span', 'k', sk.kind === 'attack' ? 'Attack' : 'Ability'));
    row.append(top, el('div', '', sk.text));
    card.appendChild(row);
  }
  let label = 'Add to Party';
  let ok = true;
  if (!h.owned) { label = h.note; ok = false; }
  else if (inParty) label = 'Remove from Party';
  else if (v.party.length >= 3) { label = 'Party is full'; ok = false; }
  const act = btn(`hr-act${inParty ? ' rem' : ''}`, () => { if (ok) a.toggleHero(h.className); }, label);
  act.disabled = !ok;
  card.appendChild(act);

  const list = el('div', 'hr-box hr-list');
  list.appendChild(el('h4', '', 'Choose a hero'));
  const tiles = el('div', 'hr-tiles');
  for (const x of v.heroes) {
    const slot = v.party.indexOf(x.className);
    const t = btn(`hr-tile${x === h ? ' on' : ''}${x.owned ? '' : ' locked'}`, () => a.pickHero(x.className), token(x), el('span', 'nm', x.label));
    if (!x.owned) {
      const lk = icon('lock');
      lk.classList.add('lk');
      t.appendChild(lk);
      t.title = `${x.label}: ${x.note}`;
    }
    if (slot >= 0) t.appendChild(el('span', 'in', String(slot + 1)));
    tiles.appendChild(t);
  }
  list.appendChild(tiles);
  wrap.append(art, card, list);
  return wrap;
}

function partyBar(v: TempleView, a: TempleActions): HTMLElement {
  const bar = el('div', 'tp-party');
  const words = el('div', 'pt-words');
  words.append(el('h3', '', 'Expedition Party'), el('p', '', 'Select up to 3 heroes for your next run.'));
  const slots = el('div', 'pt-slots');
  for (let i = 0; i < 3; ++i) {
    const cls = v.party[i];
    const h = cls === undefined ? undefined : v.heroes.find((x) => x.className === cls);
    const s = h ? btn('pt-slot', () => a.pickHero(h.className)) : el('div', 'pt-slot empty');
    s.appendChild(el('span', 'ring'));
    if (h) {
      const spr = el('img', 'spr');
      spr.src = heroSprite(h.className);
      spr.alt = '';
      spr.draggable = false;
      spr.style.height = `${((kSpriteH[h.className] ?? 72) / 72) * 100}%`;
      s.appendChild(spr);
    } else s.appendChild(el('span', 'plus', '+'));
    s.appendChild(el('span', 'n', String(i + 1)));
    if (h) s.setAttribute('aria-label', `Slot ${i + 1}: ${h.label}`);
    slots.appendChild(s);
  }
  const btns = el('div', 'pt-btns');
  btns.append(btn('pt-btn', a.autoParty, 'Auto Party'), btn('pt-btn', a.clearParty, 'Clear Party'));
  bar.append(words, slots, btns, goButton(a, v.party.length > 0));
  return bar;
}

function tabBody(v: TempleView, a: TempleActions): HTMLElement {
  const t = v.snapshot;
  if (v.tab === 'blessings' || v.tab === 'equipment') {
    const grid = el('div', 'tp-grid');
    if (v.tab === 'equipment') {
      for (const it of t.items.filter((i) => i.column === 0)) grid.appendChild(itemCard(it, a.buy));
      return grid;
    }
    // Stats (unlock, then upgrade) and Party Luck, the mockup's middle and right columns.
    grid.appendChild(el('h3', 'tp-sub', 'Stats: unlock, then upgrade'));
    for (const it of t.items.filter((i) => i.column === 1)) grid.appendChild(itemCard(it, a.buy));
    grid.appendChild(el('h3', 'tp-sub', 'Party Luck'));
    for (const it of t.items.filter((i) => i.column === 2)) grid.appendChild(itemCard(it, a.buy));
    return grid;
  }
  if (v.tab === 'heroes') return heroesBody(v, a);
  if (v.tab === 'report') {
    const box = el('div', 'tp-rows');
    if (!v.report) {
      box.appendChild(el('p', 'tp-empty', 'No expedition yet. Begin one and its report will be kept here.'));
      return box;
    }
    box.appendChild(el('div', `tp-result ${v.report.victory ? 'win' : 'lose'}`, v.report.victory ? 'Victory' : 'Run Over'));
    for (const l of v.report.lines) {
      if (l.wide) {
        box.appendChild(el('div', 'tp-wide', l.value));
        continue;
      }
      const row = el('div', 'tp-row');
      row.appendChild(el('span', '', l.label));
      if (l.value !== '') row.appendChild(el('span', 'v', l.value));
      box.appendChild(row);
    }
    box.appendChild(reportDamageBody(v.report.damage, v.report.rooms, v.debug));
    return box;
  }
  // Settings.
  const set = el('div', 'tp-set');
  const vol = el('label', '', 'Music');
  const slider = el('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(v.volume * 100));
  slider.addEventListener('input', () => a.volume(Number(slider.value) / 100));
  vol.appendChild(slider);
  set.append(vol, btn(`tp-danger${v.resetArmed ? ' armed' : ''}`, a.reset, v.resetArmed ? 'Tap again to erase all progress' : 'Reset progress'));
  if (v.floorSize) set.appendChild(buildFloorSizeDebug(v.floorSize));
  return set;
}
