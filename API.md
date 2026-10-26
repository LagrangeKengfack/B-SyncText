# API de B-SyncText

Cette description permet d'écrire ses propres tests sans lire le code. Tout passe par HTTPS, en JSON, sauf le PDF.

- **Adresse de base** : `https://<distribution>.cloudfront.net` (l'adresse affichée par `infra/deployer.sh`). Dans ce document : `$B`.
- **Routes publiques** (sans identité) : marquées 🌐. Les autres exigent l'en-tête `Authorization: Bearer <jeton>`, le jeton étant obtenu par `POST /api/session`.
- **Erreurs** : corps `{"erreur": {"code": "...", "message": "..."}}` avec le code HTTP : 400 requête invalide · 401 jeton absent ou invalide · 403 droit manquant · 404 introuvable · 409 conflit · 410 expiré ou déjà utilisé · 423 rédacteur bloqué · 429 trop de requêtes.
- Toutes les dates sont en millisecondes depuis le 1er janvier 1970 (format de `Date.now()`).

## 1. Session et rédacteur

| Route | Corps | Réponse |
|---|---|---|
| 🌐 `POST /api/session` | `{"nom": "Camille", "email": "camille@exemple.com"}` | `200 {"jeton": "...", "redacteur": {"email", "nom", "credit": {"restant": 10000, "rechargeA": 1792976400000}, "bloqueJusqua": null}}` |
| `GET /api/moi` | — | `200` le même objet `redacteur` |

Il n'y a pas de compte : l'e-mail identifie le rédacteur, le nom est mis à jour à chaque entrée. L'e-mail doit être bien formé (sinon 400).

```bash
B=https://d1u2w3ays8s3t6.cloudfront.net
J=$(curl -s -X POST $B/api/session -H 'content-type: application/json' \
     -d '{"nom":"Camille","email":"camille@exemple.com"}' | jq -r .jeton)
```

## 2. Documents et membres

| Route | Corps | Réponse | Qui |
|---|---|---|---|
| `GET /api/documents` | — | `[{"docId", "titre", "role", "principal": {"email", "nom"}, "modifieLe", "connectes"}]` | membre |
| `POST /api/documents` | `{"titre": "Journal 2026", "formatVersion": "v.x.x"}` (`v.x`, `v.x.x` ou `v.x.x.x`, défaut `v.x.x`) | `201 {"docId", "titre", "role": "principal", "formatVersion", "lienInvitation": "/invitation/<jeton>"}` | tout rédacteur |
| `GET /api/documents/{docId}` | — | `{"docId", "titre", "role", "formatVersion", "modeTelechargement": "version"\|"direct", "derniereVersion": {"versionId", "numero"} \| null, "membres": [{"email", "nom", "role"}], "lienInvitation"}` (le lien seulement pour un propriétaire) | membre |
| `PATCH /api/documents/{docId}` | `{"titre": "..."}` et/ou `{"modeTelechargement": "version"\|"direct"}` | `200` | membre |
| `POST /api/documents/{docId}/membres` | `{"email": "idriss@exemple.com"}` | `201` | propriétaire |
| `PATCH /api/documents/{docId}/membres/{email}` | `{"role": "proprietaire"\|"membre"}` | `200 {"changements": [...]}` ; `409` si le dernier propriétaire renonce | propriétaire (retirer un propriétaire : principal seulement) |
| `POST /api/documents/{docId}/invitation` | — | `{"lienInvitation": "/invitation/<jeton>"}` (l'ancien lien expire) | propriétaire |
| `POST /api/invitations/{jeton}` | — | `{"docId"}` ; `410` si expiré | rédacteur connecté |

Rôles : `principal` (le créateur), `proprietaire`, `membre`. Le mode de téléchargement vaut `version` (le PDF est la dernière version déclarée) ou `direct` (le document tel qu'il est au moment du clic).

## 3. Versions

| Route | Réponse |
|---|---|
| `GET /api/documents/{docId}/versions` | `[{"versionId", "numero": "v1.2", "nom", "type": "manuelle"\|"auto"\|"restauration", "horodatage", "auteurs": [...]}]` |
| `GET /api/documents/{docId}/versions/{versionId}` | `{"versionId", "numero", "contenu": [blocs]}` : `contenu` est une liste de blocs `{"type": "paragraphe"\|"titre"\|"puce"\|"numero", "niveau", "alignement", "segments": [{"texte", "gras", "italique", "souligne"}]}` |

La création d'une version et la restauration se font par le canal temps réel (section 6).

## 4. Liens de téléchargement (côté rédacteur)

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/documents/{docId}/liens` | `{"n": 500}` (1 à 10 000) | `201 {"lienId", "url": "/l/<lienId>", "n"}` |
| `GET /api/documents/{docId}/liens` | — | `[{"lienId", "url", "n", "restants", "etat": "actif"\|"epuise", "email": "envoye"\|"echec"\|null, "creeLe", "creePar"}]` |

L'adresse publique d'un lien est `$B/l/<lienId>` (page web) ; l'API publique correspondante est ci-dessous.

## 5. Téléchargement (côté visiteur, 🌐 sans identité)

C'est la partie qui porte les contraintes « exactement N téléchargements » et « chaque visiteur reçoit un état ».

| Route | Réponse |
|---|---|
| 🌐 `GET /api/liens/{lienId}` | `{"titre", "n", "restants", "etat": "actif"\|"epuise"}` ; `404 introuvable` |
| 🌐 `POST /api/liens/{lienId}/demandes` | l'un des trois états ci-dessous, toujours en `200` ; `404 introuvable` ; `429` en cas de saturation (à traiter comme « patientez ») |
| 🌐 `GET /api/liens/{lienId}/fichier?ticket=<ticket>` | `200 application/pdf` (en-tête `Content-Disposition: attachment; filename="<titre>-exemplaire-<k>.pdf"`) ; `410 ticket_invalide` si le ticket a déjà servi ou a expiré ; `400` si le ticket manque |

Les trois états d'une demande :
```json
{"etat": "pret", "ticket": "v-92sIAQU20j0pXmbTRkww", "expireA": 1792946170296, "restants": 312, "n": 500}
{"etat": "patientez", "reessayerDans": 2, "restants": 0, "n": 500}
{"etat": "epuise", "n": 500}
```
Règles à connaître pour tester :
- `pret` **réserve** un exemplaire pendant 60 s ; il n'est **compté** que lorsque le fichier est demandé avec le ticket. Une réservation non utilisée revient dans le stock au bout de 60 s.
- Un ticket ne sert qu'une fois : le rejouer donne `410`.
- `patientez` signifie que tous les exemplaires restants sont réservés par d'autres (ils peuvent se libérer), ou que le service est saturé : il faut redemander après `reessayerDans` secondes.
- Après le dernier exemplaire compté, le lien passe à `epuise`, état définitif ; chaque PDF porte en pied de page « Exemplaire k / N » et le numéro de version.

### Écrire soi-même le test de la contrainte 1
Créer un lien de N exemplaires, envoyer M demandes en même temps, télécharger chaque ticket obtenu, et compter : on doit obtenir **exactement N** PDF, numérotés de 1 à N, puis uniquement `epuise`.

```js
// node test-c1.mjs  (Node.js 22, aucune dépendance)
const B = 'https://d1u2w3ays8s3t6.cloudfront.net', N = 20, M = 200;
const j = async (chemin, o = {}) => fetch(B + chemin, { ...o, headers: { 'content-type': 'application/json', ...(o.headers ?? {}) } });
const { jeton } = await (await j('/api/session', { method: 'POST', body: JSON.stringify({ nom: 'Jury', email: 'jury@exemple.com' }) })).json();
const auth = { authorization: `Bearer ${jeton}` };
const { docId } = await (await j('/api/documents', { method: 'POST', headers: auth, body: JSON.stringify({ titre: 'Test C-1' }) })).json();
const { lienId } = await (await j(`/api/documents/${docId}/liens`, { method: 'POST', headers: auth, body: JSON.stringify({ n: N }) })).json();

const demandes = await Promise.all(Array.from({ length: M }, () => j(`/api/liens/${lienId}/demandes`, { method: 'POST' }).then((r) => r.json())));
const tickets = demandes.filter((d) => d.etat === 'pret').map((d) => d.ticket);
const fichiers = await Promise.all(tickets.map((t) => j(`/api/liens/${lienId}/fichier?ticket=${t}`).then((r) => r.status)));
const pdf = fichiers.filter((s) => s === 200).length;
const apres = await (await j(`/api/liens/${lienId}/demandes`, { method: 'POST' })).json();
console.log({ demandes: M, prets: tickets.length, pdf, apres: apres.etat, verdict: pdf === N && apres.etat === 'epuise' ? 'OK' : 'ECHEC' });
```
Les scripts complets du projet (1 000 demandes simultanées, lecture du numéro dans le PDF, remise en stock, pic de 15 000 visiteurs) sont dans `tests/`.

## 6. Temps réel (édition à plusieurs)

- **Adresse** : `wss://<distribution>.cloudfront.net/collab`, protocole [Hocuspocus](https://tiptap.dev/docs/hocuspocus) sur [Yjs](https://docs.yjs.dev/). Nom du document = `docId`, jeton de session dans le champ `token` du provider.
- **Contenu** : fragment Yjs `default` au format [ProseMirror/Tiptap](https://tiptap.dev/) (paragraphes, titres, listes, gras, italique, souligné, alignement).
- **Une modification est acceptée quand le serveur l'a écrite dans le journal** : il envoie alors `{"type": "credit", "restant", "rechargeA"}`. Sinon il envoie `{"type": "refus", "raison": "credit"|"taille"|"bloque", "restant", "rechargeA", "bloqueJusqua"}` et ferme la connexion du document : le client doit se reconnecter avec un document neuf (la modification refusée n'est appliquée chez personne).
- **Messages du client** (messages « sans état » Hocuspocus, en JSON) : `{"type": "creerVersion", "nom": "relu", "niveau": 1}` (membre ; `niveau` = chiffre à incrémenter, 1 = premier) ; `{"type": "restaurer", "versionId"}` (propriétaire). Réponses : `{"type": "versionCreee", "numero", "versionId"}` ou `{"type": "erreur", "message"}`.
- **Crédit** : 10 000 caractères insérés par rédacteur et par jour (recharge à minuit, heure locale), commun à tous ses appareils ; une insertion qui dépasse est refusée en entier ; effacer ne rend pas de crédit. Au vingtième refus en une minute, le rédacteur est bloqué 15 minutes.

Exemple de client minimal en Node.js (paquets `@hocuspocus/provider`, `yjs`, `ws`) : voir `tests/concurrence/commun.mjs` (classe `ClientYjs`), utilisé par les tests de convergence (`t03-c2.mjs`) et de crédit (`t05-c4.mjs`).

## 7. Tableau de bord de l'association

| Route | En-tête | Réponse |
|---|---|---|
| `GET /api/admin/tableau-de-bord` | `x-code-admin: <code>` | `{"documentsOuverts": [{"docId", "titre", "principal": {"email", "nom"}, "connectes"}], "liensActifs": [{"lienId", "docId", "titre", "creePar", "n", "restants"}], "bloques": [{"email", "nom", "motif", "bloqueJusqua"}]}` ; `403` code faux ; `429` après dix codes faux en une minute |

Le code est lu par la personne qui a déployé : `aws ssm get-parameter --name /bsynctext/code-admin --with-decryption --query Parameter.Value --output text`.
