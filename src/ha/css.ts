// Foglio di stile per ha-floorplan. I selettori passano dai gruppi (#lights, #areas…) e non dalle classi
// di partenza, perché floorplan.class_set può sostituire le classi dell'elemento.
import type { HaView } from './views';

export function buildCss(view: HaView) {
  const raster = view !== '2d';
  return `/* SP 3D Planner → ha-floorplan (${view}) */
#floorplan > svg { width: 100%; height: 100%; }

/* luci: la luce della lampada si somma all'immagine sotto (notte o giorno) */
#lights > * {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.6s ease-in-out;
  ${raster ? 'mix-blend-mode: plus-lighter;' : 'mix-blend-mode: normal;'}
}
#lights > .light-on { opacity: 1; }

/* giorno/notte (entità sun.sun) */
#sun\\.sun { pointer-events: none; transition: opacity 3s ease-in-out; }
#sun\\.sun.sun-below_horizon { opacity: 0; }

/* stanze: toccandole si accende/spegne la loro luce */
#areas polygon { fill: #ffffff; fill-opacity: 0; stroke: none; cursor: pointer; transition: fill-opacity 0.2s; }
#areas polygon:hover { fill-opacity: 0.12; }

/* simbolo della luce */
#light-markers circle { fill: #ffd23f; fill-opacity: 0.35; stroke: #ffffff; stroke-width: 2px; cursor: pointer; vector-effect: non-scaling-stroke; }
#light-markers circle.light-on { fill-opacity: 1; filter: drop-shadow(0 0 4px #ffd23f); }
#light-markers circle.light-unavailable { fill: #888888; }

/* porte e finestre con sensore di apertura */
#contacts polygon { fill: #2a9d8f; fill-opacity: 0; stroke: none; cursor: pointer; transition: fill-opacity 0.3s; }
#contacts polygon.contact-on { fill: #e63946; fill-opacity: 0.8; animation: sp3d-blink 1.6s ease-in-out infinite; }
@keyframes sp3d-blink { 50% { fill-opacity: 0.35; } }

/* sensori */
#sensors .sensor-bg { fill: #141820; fill-opacity: 0.72; }
#sensors text { fill: #ffffff; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; font-weight: 600; cursor: pointer; }
#sensors .sensor-label { font-weight: 400; fill-opacity: 0.8; pointer-events: none; }
#sensors rect.sensor-on { fill: #e63946; fill-opacity: 0.9; }
#sensors rect.sensor-off { fill: #2a9d8f; fill-opacity: 0.85; }
#sensors rect.co2-good { fill: #2a9d8f; fill-opacity: 0.85; }
#sensors rect.co2-fair { fill: #e9a23b; fill-opacity: 0.9; }
#sensors rect.co2-bad { fill: #e63946; fill-opacity: 0.9; animation: sp3d-blink 1.6s ease-in-out infinite; }

/* telecamere */
#cameras circle { fill: #2f7de1; stroke: #ffffff; stroke-width: 2px; cursor: pointer; vector-effect: non-scaling-stroke; }
#cameras .camera-icon { pointer-events: none; }
${
  raster
    ? ''
    : `
/* pianta 2D */
#plan .wall { fill: #2b2d31; }
#plan .item { fill: #d9dce1; stroke: #b5bac2; stroke-width: 1px; vector-effect: non-scaling-stroke; }
#plan .opening { fill: #fafaf8; }
#plan .glass { stroke: #6c9fd6; stroke-width: 2px; vector-effect: non-scaling-stroke; }
#plan .room-name { fill: #1d3557; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; font-weight: 600; pointer-events: none; }
`
}`;
}
