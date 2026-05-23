/**
 * Contexto de marca y especificaciones Meta Ads.
 *
 * Fuente:
 *  - Logos en /logo (verde corporativo, tagline "Ganar es una Pasión").
 *  - Manual de marca oficial: /logo/MANUAL DE MARCA  - GanaPlay.pdf
 *    (131 MB — no parseado automáticamente; las reglas detalladas deben
 *    transcribirse aquí o servirse como recurso adjunto al modelo).
 *
 * Reglas marcadas con `verified: true` están confirmadas por activos del repo.
 * Reglas marcadas con `verified: false` son convenciones de mercado para
 * apuestas deportivas en LatAm y DEBEN revisarse contra el manual oficial.
 */

export type BrandRule = { rule: string; verified: boolean; source?: string };

export const BRAND_CONTEXT = {
  name: "GanaPlay",
  tagline: "Ganar es una Pasión",
  industry: "Apuestas deportivas (sportsbook + casino) en Latinoamérica",
  markets: ["El Salvador (SV)", "Guatemala (GT)"],

  colors: {
    primaryGreen: {
      hex: "#0E7A3C", // tomado del logo verde sólido
      name: "Verde GanaPlay",
      verified: true,
    },
    accentYellow: {
      hex: "#FFB800",
      name: "Amarillo CTA",
      verified: false, // confirmar contra manual
    },
    neutralDark: { hex: "#0B1F14", verified: false },
    neutralLight: { hex: "#FFFFFF", verified: true },
  },

  typography: {
    primaryStyle: "Sans-serif bold, alta legibilidad",
    notes: "Logo usa wordmark sans-serif pesado. Headlines deben sentirse deportivos y enérgicos.",
    verified: true,
  },

  logoUsage: [
    { rule: "Mantener área de respiro alrededor del logo equivalente a la altura de la 'G'.", verified: false },
    { rule: "Nunca deformar, rotar ni cambiar el color del logo fuera de la paleta oficial.", verified: false },
    { rule: "Sobre fondos verdes oscuros usar la variante blanca; sobre claros, la verde sólida.", verified: true },
    { rule: "Logo visible y legible: no debe ser ocupado por menos de ~80 px de alto en mobile.", verified: false },
  ] as BrandRule[],

  compliance: [
    { rule: "Mostrar leyenda de juego responsable y +18 (requisito legal en SV/GT).", verified: false },
    { rule: "Incluir disclaimer 'Aplican términos y condiciones' cuando se promocionen bonos.", verified: false },
    { rule: "Evitar promesas absolutas de ganancia. Lenguaje motivacional pero no engañoso.", verified: false },
  ] as BrandRule[],

  voice: {
    tone: "Apasionado, retador, cercano, profesional",
    avoid: ["términos en spanglish forzado", "anglicismos innecesarios", "vulgaridad", "promesas de ganancia garantizada"],
    prefer: ["verbos de acción", "lenguaje deportivo", "español neutro latino", "claridad sobre creatividad"],
  },
};

/**
 * Specs Meta Ads (Feed, Stories, Reels, Carrusel).
 * Actualizadas a finales de 2025 según documentación pública de Meta. Si Meta
 * actualiza, modificar aquí — son la fuente de verdad para el feedback de la IA.
 */
export const META_SPECS = {
  lastReviewed: "2026-01",
  placements: {
    instagramFeedSquare: {
      label: "Instagram Feed cuadrado",
      ratio: "1:1",
      recommendedPx: "1080 × 1080",
      minPx: "600 × 600",
      safeZoneNotes: "El nombre del perfil y el primer comentario tapan el borde inferior. Evitar texto crítico en los últimos 250 px.",
    },
    instagramFeedVertical: {
      label: "Instagram Feed vertical",
      ratio: "4:5",
      recommendedPx: "1080 × 1350",
      minPx: "600 × 750",
      safeZoneNotes: "Mejor uso de pantalla en mobile feed. Recomendado para piezas con copy.",
    },
    instagramStoryReel: {
      label: "Instagram Story / Reel / Facebook Story",
      ratio: "9:16",
      recommendedPx: "1080 × 1920",
      minPx: "600 × 1067",
      safeZoneNotes:
        "UI tapa ~250 px arriba (perfil/cierre) y ~310 px abajo (CTA, stickers, barra). " +
        "Texto y logo deben caber en la zona central (≈1080 × 1360).",
    },
    facebookFeed: {
      label: "Facebook Feed",
      ratio: "1:1 o 4:5",
      recommendedPx: "1080 × 1080 o 1080 × 1350",
      minPx: "600 × 600",
      safeZoneNotes: "Mismo criterio de feed cuadrado/vertical.",
    },
    carousel: {
      label: "Carrusel (FB/IG)",
      ratio: "1:1 (recomendado)",
      recommendedPx: "1080 × 1080",
      minPx: "600 × 600",
      safeZoneNotes: "Mantener identidad consistente entre tarjetas. Primera tarjeta debe enganchar.",
    },
  },

  textCoverage: {
    legacy20PercentRule:
      "La regla de '20% de texto' ya no es bloqueante desde 2020, pero Meta sigue desincentivando ad sets con cobertura de texto muy alta. Mantener texto ≤ ~20% del área para CPM óptimo.",
    recommendedApproach:
      "Headline ≤ 40 caracteres, descripción ≤ 125. CTA claro y único.",
  },

  bestPractices: [
    "Mobile-first: 98% del tráfico Meta es móvil. Diseñar para pantallas verticales pequeñas.",
    "Punto focal en el primer tercio superior — el usuario hace scroll en <3 s.",
    "Contraste alto entre texto y fondo (mínimo WCAG AA: ratio 4.5:1).",
    "CTA visible y único. Botón con color de marca o contraste fuerte.",
    "Logo presente pero no protagonista (≤ 15% del área).",
    "Evitar texto sobre rostros, manos o elementos con mucho ruido visual.",
    "Reels: primer segundo retiene o pierde audiencia. Hook visual fuerte.",
    "Probar variantes (A/B): cambiar headline, CTA, color, foto principal — un solo eje por test.",
  ],
};

/**
 * Construye el bloque de contexto que se inyecta al modelo en cada llamada.
 * Mantenerlo corto y estructurado para no inflar tokens.
 */
export function buildBrandContextBlock(): string {
  const c = BRAND_CONTEXT;
  return [
    `MARCA: ${c.name} — "${c.tagline}". ${c.industry}. Mercados: ${c.markets.join(", ")}.`,
    `Verde primario: ${c.colors.primaryGreen.hex} (${c.colors.primaryGreen.name}).`,
    `Voz: ${c.voice.tone}. Evitar: ${c.voice.avoid.join(", ")}.`,
    `Reglas de logo:\n- ${c.logoUsage.map((r) => r.rule).join("\n- ")}`,
    `Compliance (apuestas LatAm):\n- ${c.compliance.map((r) => r.rule).join("\n- ")}`,
  ].join("\n");
}

export function buildMetaSpecsBlock(): string {
  const placements = Object.values(META_SPECS.placements)
    .map((p) => `- ${p.label} (${p.ratio}): recomendado ${p.recommendedPx}. ${p.safeZoneNotes}`)
    .join("\n");
  const bp = META_SPECS.bestPractices.map((b) => `- ${b}`).join("\n");
  return [
    `META ADS — formatos vigentes (revisado ${META_SPECS.lastReviewed}):`,
    placements,
    `\nBuenas prácticas:`,
    bp,
    `\nTexto en imagen: ${META_SPECS.textCoverage.recommendedApproach} ${META_SPECS.textCoverage.legacy20PercentRule}`,
  ].join("\n");
}
