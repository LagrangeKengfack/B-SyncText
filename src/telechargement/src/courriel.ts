// E-mail « lien épuisé » via SES v2 (texte simple).
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { Lien } from './depot.js';
import { courrielEpuise } from './regles.js';

export function envoyeurSes(ses: SESv2Client, expediteur: string) {
  return async (lien: Lien, epuiseLe: number): Promise<void> => {
    const { sujet, texte } = courrielEpuise(lien.titre, lien.n, epuiseLe, lien.creeParNom);
    const r = await ses.send(new SendEmailCommand({
      FromEmailAddress: expediteur,
      Destination: { ToAddresses: [lien.creePar] },
      Content: {
        Simple: {
          Subject: { Data: sujet, Charset: 'UTF-8' },
          Body: { Text: { Data: texte, Charset: 'UTF-8' } },
        },
      },
    }));
    console.log(`e-mail « lien épuisé » accepté par SES pour ${lien.lienId} : ${r.MessageId ?? ''}`);
  };
}
