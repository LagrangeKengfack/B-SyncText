// Prépare pdfkit (utilisé par pdfmake) pour tourner empaqueté en un seul fichier ESM sur Lambda.
// 1) pdfkit et pdfmake lisent __filename / __dirname, absents d'un module ESM.
// 2) pdfkit charge les métriques des polices standard par un require dynamique que l'empaqueteur
//    ne suit pas : on les importe ici statiquement et on intercepte ces require.
// Ce module doit être importé avant pdfmake.
import Module from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import HelveticaBold from 'pdfkit/standard-fonts/HelveticaBold';
import HelveticaOblique from 'pdfkit/standard-fonts/HelveticaOblique';
import HelveticaBoldOblique from 'pdfkit/standard-fonts/HelveticaBoldOblique';
import TimesRoman from 'pdfkit/standard-fonts/TimesRoman';
import TimesBold from 'pdfkit/standard-fonts/TimesBold';
import TimesItalic from 'pdfkit/standard-fonts/TimesItalic';
import TimesBoldItalic from 'pdfkit/standard-fonts/TimesBoldItalic';

const globale = globalThis as { __filename?: string; __dirname?: string };
if (globale.__filename === undefined) globale.__filename = fileURLToPath(import.meta.url);
if (globale.__dirname === undefined) globale.__dirname = dirname(globale.__filename);

const POLICES: Record<string, object> = {
  Helvetica, HelveticaBold, HelveticaOblique, HelveticaBoldOblique, TimesRoman, TimesBold, TimesItalic, TimesBoldItalic,
};
const PREFIXE = '#standard-fonts/';

const createRequireOriginal = Module.createRequire;
Module.createRequire = (chemin: string | URL) => {
  const requireOriginal = createRequireOriginal(chemin);
  const intercepte = ((id: string) => {
    const police = id.startsWith(PREFIXE) ? POLICES[id.slice(PREFIXE.length)] : undefined;
    return police ?? requireOriginal(id);
  }) as NodeJS.Require;
  return Object.assign(intercepte, requireOriginal);
};
