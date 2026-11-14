// Lucide icon nodes for the ten notch tabs (data.ts TABS order),
// transcribed from the reference checkout's lucide-react v1.72.0
// (desktop/node_modules/lucide-react/dist/esm/icons/*.mjs — the exact
// artwork the develop site rendered). ISC-licensed source; the node
// arrays below are the library's own __iconData payloads.
export const TAB_ICONS = {
  music: {
    // "eighth-notes" (lucide alias: music)
    size: 24,
    node: [
      ["path", { d: "M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19" }],
      ["circle", { cx: "18", cy: "16", r: "3" }],
      ["circle", { cx: "6", cy: "19", r: "3" }],
    ],
  },
  focus: {
    // "timer"
    size: 24,
    node: [
      ["line", { x1: "10", x2: "14", y1: "2", y2: "2" }],
      ["line", { x1: "12", x2: "15", y1: "14", y2: "11" }],
      ["circle", { cx: "12", cy: "14", r: "8" }],
    ],
  },
  todo: {
    // "square-check-big" (lucide alias: check-square)
    size: 24,
    node: [
      ["path", { d: "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344" }],
      ["path", { d: "m9 11 3 3L22 4" }],
    ],
  },
  board: {
    // "clipboard-list"
    size: 24,
    node: [
      ["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1" }],
      ["path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }],
      ["path", { d: "M12 11h4" }],
      ["path", { d: "M12 16h4" }],
      ["path", { d: "M8 11h.01" }],
      ["path", { d: "M8 16h.01" }],
    ],
  },
  mixer: {
    // "sliders-horizontal"
    size: 24,
    node: [
      ["path", { d: "M10 5H3" }],
      ["path", { d: "M12 19H3" }],
      ["path", { d: "M14 3v4" }],
      ["path", { d: "M16 17v4" }],
      ["path", { d: "M21 12h-9" }],
      ["path", { d: "M21 19h-5" }],
      ["path", { d: "M21 5h-7" }],
      ["path", { d: "M8 10v4" }],
      ["path", { d: "M8 12H3" }],
    ],
  },
  noise: {
    // "cloud-rain"
    size: 24,
    node: [
      ["path", { d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" }],
      ["path", { d: "M16 14v6" }],
      ["path", { d: "M8 14v6" }],
      ["path", { d: "M12 16v6" }],
    ],
  },
  mirror: {
    // "camera"
    size: 24,
    node: [
      ["path", { d: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" }],
      ["circle", { cx: "12", cy: "13", r: "3" }],
    ],
  },
  system: {
    // "settings"
    size: 24,
    node: [
      ["path", { d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" }],
      ["circle", { cx: "12", cy: "12", r: "3" }],
    ],
  },
  ai: {
    // "sparkles"
    size: 24,
    node: [
      ["path", { d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" }],
      ["path", { d: "M20 2v4" }],
      ["path", { d: "M22 4h-4" }],
      ["circle", { cx: "4", cy: "20", r: "2" }],
    ],
  },
  home: {
    // "house" (lucide alias: home)
    size: 24,
    node: [
      ["path", { d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" }],
      ["path", { d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }],
    ],
  },
};

// Renders one icon as a standalone lucide-convention SVG string: 24-unit
// viewBox, fill none, 2px round stroke in `color` (currentColor stand-in).
export function iconSvg(name, color, px) {
  const icon = TAB_ICONS[name];
  const children = icon.node
    .map(([tag, attrs]) => {
      const attrsText = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");
      return `<${tag} ${attrsText} />`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
    `viewBox="0 0 ${icon.size} ${icon.size}" fill="none" stroke="${color}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${children}</svg>`
  );
}
