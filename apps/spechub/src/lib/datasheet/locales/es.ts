import type { DatasheetDict } from "./types";

/**
 * Spanish (Latin America / Mexico).
 *
 * Driven by the Mexico certification push — first models are the Cloud
 * Switch pair ECS1528FP / ECS1552FP.
 *
 * Two deliberate choices worth knowing:
 *
 * 1. QR points at the SAME English QSG URL as `en` (product decision,
 *    2026-08-06). Only the label is localised. If a Spanish QSG ever
 *    ships, change `defaultQrUrl` here and nowhere else.
 * 2. Unlike ja / zh-TW this locale needs NO typography entry — Spanish
 *    renders in Roboto with the same metrics as English. See the
 *    `CJK_LOCALES` note in ../typography.ts.
 *
 * ⚠️ The disclaimer below is regulatory boilerplate. It was translated
 * from the English source, not drafted by counsel — have the branch
 * office confirm it before the first PDF ships.
 */
export const es: DatasheetDict = {
  datasheet: "Ficha técnica |",
  overview: "Descripción general",
  featuresAndBenefits: "Características y ventajas",
  technicalSpecifications: "Especificaciones técnicas",
  hardwareOverview: "Descripción del hardware",
  antennasPatterns: "Patrones de antena",
  defaultQrLabel: "Guía de inicio rápido",
  defaultQrUrl: "https://qr.engenius.ai/qsg/{model}",
  disclaimer:
    "Las características y especificaciones están sujetas a cambios sin previo aviso. " +
    "Las marcas comerciales y marcas registradas son propiedad de sus respectivos titulares. " +
    "Estos límites están diseñados para proporcionar una protección razonable contra interferencias perjudiciales en una instalación residencial. " +
    "Este equipo genera, utiliza y puede irradiar energía de radiofrecuencia y, si no se instala y utiliza de acuerdo con las instrucciones, puede causar interferencias perjudiciales en las comunicaciones por radio. " +
    "Es probable que el funcionamiento de este equipo en una zona residencial cause interferencias perjudiciales, en cuyo caso el usuario deberá corregir la interferencia por su propia cuenta. " +
    "Antes de instalar cualquier equipo de videovigilancia, es su responsabilidad asegurarse de que la instalación cumpla con las leyes locales, estatales y federales en materia de videovigilancia, grabación de audio y privacidad.",
  dateLocale: "es-MX",
  bullet: "●",
};
