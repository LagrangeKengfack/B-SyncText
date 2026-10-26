# API de B-SyncText

Cette description suffit pour écrire ses propres tests sans lire le code. Chaque route a sa fiche : ce qu'elle fait, qui peut l'appeler, ce qu'il faut envoyer, ce qu'elle répond et ses erreurs.

## 1. Conventions

| Sujet | Règle |
|---|---|
| Adresse de base | `https://d1u2w3ays8s3t6.cloudfront.net`, notée `$B` ci-dessous. Toutes les routes commencent par `/api`. |
| Format | HTTPS et JSON (`Content-Type: application/json`), sauf le PDF. |
| Routes publiques | marquées **public** : aucune identité demandée. |
| Autres routes | l'en-tête `Authorization: Bearer <jeton>` est obligatoire. Le jeton vient de `POST /api/session` et vaut 7 jours. |
| Dates | en millisecondes depuis le 1er janvier 1970 (comme `Date.now()`). |
| Identifiants | `docId`, `lienId`, `versionId` sont des textes opaques renvoyés par l'API. |
| Réponse vide | quand une fiche dit « corps : aucun », la requête n'a pas de corps (ne rien envoyer). |

**Format d'une erreur**, toujours le même :
```json
{"erreur": {"code": "interdit", "message": "Réservé aux propriétaires du document."}}
```

| Code HTTP | Signification | Codes `erreur.code` possibles |
|---|---|---|
| 400 | requête invalide (champ manquant ou mal formé) | `requete_invalide` |
| 401 | jeton absent, invalide ou expiré | `non_authentifie` |
| 403 | droit manquant | `interdit` |
| 404 | introuvable | `introuvable` |
| 409 | conflit | `dernier_proprietaire` |
| 410 | expiré ou déjà utilisé | `invitation_expiree`, `ticket_invalide` |
| 423 | rédacteur bloqué (écritures refusées) | `bloque` |
| 429 | trop de requêtes ou service saturé | `trop_de_requetes`, `sature` |

**Rôles d'un document** : `principal` (le créateur), `proprietaire`, `membre`. « Propriétaire » dans la colonne *Qui* veut dire principal ou propriétaire.

## 2. Toutes les routes

| # | Méthode et chemin | Corps | Qui |
|---|---|---|---|
| 1 | `POST /api/session` | oui | public |
| 2 | `GET /api/moi` | aucun | connecté |
| 3 | `GET /api/documents` | aucun | connecté |
| 4 | `POST /api/documents` | oui | connecté |
| 5 | `GET /api/documents/{docId}` | aucun | membre |
| 6 | `PATCH /api/documents/{docId}` | oui | membre |
| 7 | `POST /api/documents/{docId}/membres` | oui | propriétaire |
| 8 | `PATCH /api/documents/{docId}/membres/{email}` | oui | propriétaire |
| 9 | `POST /api/documents/{docId}/invitation` | aucun | propriétaire |
| 10 | `POST /api/invitations/{jeton}` | aucun | connecté |
| 11 | `GET /api/documents/{docId}/versions` | aucun | membre |
| 12 | `GET /api/documents/{docId}/versions/{versionId}` | aucun | membre |
| 13 | `POST /api/documents/{docId}/liens` | oui | membre |
| 14 | `GET /api/documents/{docId}/liens` | aucun | membre |
| 15 | `GET /api/liens/{lienId}` | aucun | public |
| 16 | `POST /api/liens/{lienId}/demandes` | aucun | public |
| 17 | `GET /api/liens/{lienId}/fichier?ticket=…` | aucun | public |
| 18 | `GET /api/admin/tableau-de-bord` | aucun (en-tête `x-code-admin`) | association |

Les routes en écriture (4, 6, 7, 8, 9, 10, 13) répondent aussi `423` si le rédacteur est bloqué. Création d'une version, restauration et édition du texte passent par le canal temps réel (section 6).

## 3. Session et rédacteur

### 1. `POST /api/session` — entrer (public)
Crée la fiche du rédacteur à la première entrée, la retrouve ensuite (même e-mail = même fiche, même crédit). Met à jour le nom à chaque entrée.

| Corps | Type | Règle |
|---|---|---|
| `nom` | texte | 1 à 80 caractères |
| `email` | texte | adresse bien formée (mise en minuscules) |

Réponse `200` :
```json
{"jeton": "eyJ…", "redacteur": {"email": "camille@exemple.com", "nom": "Camille",
  "credit": {"restant": 10000, "rechargeA": 1792976400000}, "bloqueJusqua": null}}
```
Erreurs : `400` nom ou e-mail invalide.

```bash
B=https://d1u2w3ays8s3t6.cloudfront.net
J=$(curl -s -X POST $B/api/session -H 'content-type: application/json' \
     -d '{"nom":"Camille","email":"camille@exemple.com"}' | jq -r .jeton)
```
Les exemples suivants utilisent `-H "authorization: Bearer $J"`.

### 2. `GET /api/moi` — ma fiche
Corps : aucun. Réponse `200` : le même objet `redacteur` que ci-dessus (`credit.restant` est le crédit du jour, `bloqueJusqua` la fin du blocage ou `null`). Erreurs : `401`.

## 4. Documents et membres

### 3. `GET /api/documents` — mes documents
Corps : aucun. Réponse `200`, du plus récemment modifié au plus ancien :
```json
[{"docId": "…", "titre": "Journal 2026", "role": "principal",
  "principal": {"email": "camille@exemple.com", "nom": "Camille"},
  "modifieLe": 1792960000000, "connectes": 2}]
```
Erreurs : `401`.

### 4. `POST /api/documents` — créer un document
Le créateur devient propriétaire principal.

| Corps | Type | Règle |
|---|---|---|
| `titre` | texte | 1 à 120 caractères |
| `formatVersion` | texte, facultatif | `v.x`, `v.x.x` (défaut) ou `v.x.x.x` ; **définitif** |

Réponse `201` :
```json
{"docId": "…", "titre": "Journal 2026", "role": "principal", "formatVersion": "v.x.x",
 "lienInvitation": "/invitation/<jeton>"}
```
Erreurs : `400` titre ou format invalide ; `401` ; `423`.

### 5. `GET /api/documents/{docId}` — détail d'un document
Corps : aucun. Réponse `200` :
```json
{"docId": "…", "titre": "Journal 2026", "role": "membre", "formatVersion": "v.x.x",
 "modeTelechargement": "version",
 "derniereVersion": {"versionId": "…", "numero": "v1.2"},
 "membres": [{"email": "camille@exemple.com", "nom": "Camille", "role": "principal"}],
 "lienInvitation": "/invitation/<jeton>"}
```
`derniereVersion` vaut `null` tant qu'aucune version n'existe. `lienInvitation` n'est présent que pour un propriétaire. `modeTelechargement` : `version` (le PDF est la dernière version déclarée) ou `direct` (le PDF est le document au moment du clic). Erreurs : `401` ; `403` pas membre ; `404`.

### 6. `PATCH /api/documents/{docId}` — renommer, changer le mode de téléchargement
Au moins un des deux champs.

| Corps | Type | Règle |
|---|---|---|
| `titre` | texte, facultatif | 1 à 120 caractères |
| `modeTelechargement` | texte, facultatif | `version` ou `direct` |

Réponse `200` : `{"docId": "…", "titre": "…", "modeTelechargement": "direct"}` (seuls les champs modifiés sont répétés). Erreurs : `400` rien à modifier ou valeur invalide ; `401` ; `403` ; `404` ; `423`.

### 7. `POST /api/documents/{docId}/membres` — donner accès par e-mail
| Corps | Type | Règle |
|---|---|---|
| `email` | texte | adresse bien formée ; la personne n'a pas besoin d'être déjà venue |

Réponse `201` : `{"email": "idriss@exemple.com"}`. Un e-mail déjà membre ne change rien. Erreurs : `400` ; `401` ; `403` pas propriétaire ; `404` ; `423`.

### 8. `PATCH /api/documents/{docId}/membres/{email}` — changer le rôle d'un membre
`{email}` est l'adresse du membre visé, encodée dans l'URL.

| Corps | Type | Règle |
|---|---|---|
| `role` | texte | `proprietaire` ou `membre` |

Réponse `200` : `{"changements": [{"email": "…", "role": "proprietaire"}]}` (liste des rôles réellement changés, vide s'il n'y a rien à faire). Règles : tout propriétaire peut nommer un propriétaire ; seul le principal peut retirer le rôle à un autre ; on peut renoncer à son propre rôle s'il reste un autre propriétaire ; si le principal renonce, le propriétaire le plus ancien devient principal. Erreurs : `400` rôle invalide ; `403` droit manquant ; `404` membre inconnu ; `409` (`dernier_proprietaire`) le document doit garder un propriétaire ; `423`.

### 9. `POST /api/documents/{docId}/invitation` — régénérer le lien d'invitation
Corps : aucun. Réponse `200` : `{"lienInvitation": "/invitation/<nouveau jeton>"}`. L'ancien lien cesse de fonctionner. Erreurs : `401` ; `403` ; `404` ; `423`.

### 10. `POST /api/invitations/{jeton}` — accepter une invitation
`{jeton}` est la fin du lien reçu (`/invitation/<jeton>`). Corps : aucun. Le rédacteur connecté devient membre. Réponse `200` : `{"docId": "…"}`. Erreurs : `401` ; `404` invitation inconnue ; `410` (`invitation_expiree`) le lien a été régénéré ; `423`.

## 5. Versions et liens (côté rédacteur)

### 11. `GET /api/documents/{docId}/versions` — liste des versions
Corps : aucun. Réponse `200` :
```json
[{"versionId": "…", "numero": "v1.2", "nom": "relu par Camille",
  "type": "manuelle", "horodatage": 1792960000000, "auteurs": ["camille@exemple.com"]}]
```
`type` : `manuelle`, `auto` (créée à la génération d'un PDF en mode `direct`) ou `restauration`. `nom` vaut `null` s'il n'a pas été donné. Erreurs : `401` ; `403` ; `404`.

### 12. `GET /api/documents/{docId}/versions/{versionId}` — contenu d'une version
Corps : aucun. Réponse `200` : `{"versionId": "…", "numero": "v1.2", "contenu": [blocs]}`, où chaque bloc est :
```json
{"type": "paragraphe", "niveau": null, "alignement": "gauche",
 "segments": [{"texte": "Bonjour", "gras": true, "italique": false, "souligne": false}]}
```
`type` : `paragraphe`, `titre`, `puce` ou `numero`. Lecture seule. Erreurs : `401` ; `403` ; `404`.

### 13. `POST /api/documents/{docId}/liens` — créer un lien de téléchargement
| Corps | Type | Règle |
|---|---|---|
| `n` | entier | nombre de téléchargements autorisés, de 1 à 10 000 |

Réponse `201` : `{"lienId": "…", "url": "/l/<lienId>", "n": 500}`. L'adresse publique est `$B/l/<lienId>`. Plusieurs liens peuvent exister pour un même document. Erreurs : `400` ; `401` ; `403` ; `404` ; `423`.

### 14. `GET /api/documents/{docId}/liens` — liens du document
Corps : aucun. Réponse `200` :
```json
[{"lienId": "…", "url": "/l/…", "n": 500, "restants": 312, "etat": "actif",
  "email": null, "emailErreur": null, "creeLe": 1792960000000, "creePar": "Camille"}]
```
`etat` : `actif` ou `epuise`. `email` (message « lien épuisé » envoyé au créateur) : `envoye`, `echec` (avec le motif dans `emailErreur`) ou `null` tant qu'il n'est pas parti. Erreurs : `401` ; `403` ; `404`.

## 6. Téléchargement (côté visiteur, public)

C'est la partie qui porte les contraintes « exactement N téléchargements » et « chaque visiteur reçoit un état ». Aucune identité, aucun en-tête d'authentification.

### 15. `GET /api/liens/{lienId}` — état du lien
Corps : aucun. Réponse `200` : `{"titre": "Journal 2026", "n": 500, "restants": 312, "etat": "actif"}`. Pour un lien épuisé : `restants` vaut 0 et `etat` vaut `epuise`. Erreurs : `404` lien inconnu ; `429` (`sature`) à traiter comme « réessayer ».

### 16. `POST /api/liens/{lienId}/demandes` — demander un exemplaire
Corps : aucun. Répond toujours `200` avec l'un des trois états :

```json
{"etat": "pret", "ticket": "v-92sIAQU20j0pXmbTRkww", "expireA": 1792946170296, "restants": 312, "n": 500}
{"etat": "patientez", "reessayerDans": 2, "restants": 0, "n": 500}
{"etat": "epuise", "n": 500}
```

| État | Sens | Que faire |
|---|---|---|
| `pret` | un exemplaire est **réservé** 60 s pour ce visiteur | demander le fichier (route 17) avec `ticket` avant `expireA` |
| `patientez` | tous les exemplaires restants sont réservés par d'autres, ou le service prépare le document ou est saturé | redemander après `reessayerDans` secondes (1 ou 2) |
| `epuise` | tous les exemplaires sont distribués ; état **définitif** | ne plus rien demander |

Erreurs : `404` lien inconnu. Une saturation ne donne jamais d'erreur à ce stade : elle devient `patientez`.

### 17. `GET /api/liens/{lienId}/fichier?ticket=<ticket>` — télécharger le PDF
Paramètre de requête `ticket` obligatoire (reçu à la route 16). Corps : aucun. Réponse `200` : le PDF, avec `Content-Type: application/pdf` et `Content-Disposition: attachment; filename="<titre>-exemplaire-<k>.pdf"`. Le PDF porte « Exemplaire k / N » en pied de page, le numéro de version et la date d'édition. Erreurs : `400` ticket manquant ; `410` (`ticket_invalide`) ticket inconnu, déjà utilisé ou expiré, ou lien épuisé ; `404` identifiant de lien mal formé ; `429` (`sature`) réessayer avec le même ticket.

**Règles utiles pour tester**
- Un exemplaire n'est **compté** que lorsque le fichier est demandé avec le ticket. Une réservation non utilisée revient dans le stock au bout de 60 s.
- Un ticket ne sert qu'une fois : le rejouer donne `410`.
- Nombre d'exemplaires comptés + réservés ≤ N à tout instant ; après le dernier exemplaire compté, le lien passe à `epuise`.
- Le contenu du PDF dépend du mode du document (route 6) : dernière version déclarée, ou état au moment du clic.

### Écrire soi-même le test de la contrainte 1
Créer un lien de N exemplaires, envoyer M demandes en même temps, télécharger chaque ticket obtenu, puis compter : on doit obtenir **exactement N** PDF, puis uniquement `epuise`.

```js
// node test-c1.mjs  (Node.js 22, aucune dépendance)
const B = 'https://d1u2w3ays8s3t6.cloudfront.net', N = 20, M = 200;
const j = async (chemin, o = {}) => fetch(B + chemin, { ...o, headers: { 'content-type': 'application/json', ...(o.headers ?? {}) } });
const { jeton } = await (await j('/api/session', { method: 'POST', body: JSON.stringify({ nom: 'Test', email: 'test@exemple.com' }) })).json();
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

## 7. Temps réel (édition à plusieurs)

L'écriture du texte, la présence, la création de versions et la restauration passent par une connexion WebSocket, pas par des routes REST.

| Sujet | Description |
|---|---|
| Adresse | `wss://d1u2w3ays8s3t6.cloudfront.net/collab`, protocole [Hocuspocus](https://tiptap.dev/docs/hocuspocus) sur [Yjs](https://docs.yjs.dev/) |
| Connexion | nom du document = `docId` ; jeton de session dans le champ `token` du client |
| Contenu | fragment Yjs `default` au format [ProseMirror/Tiptap](https://tiptap.dev/) (paragraphes, titres, listes, gras, italique, souligné, alignement) |

**Messages du client** (messages « sans état » Hocuspocus, en JSON)

| Message | Qui | Réponse |
|---|---|---|
| `{"type": "creerVersion", "nom": "relu", "niveau": 1}` | membre | `{"type": "versionCreee", "numero": "v2.0", "versionId": "…"}` |
| `{"type": "restaurer", "versionId": "…"}` | propriétaire | `{"type": "versionCreee", "numero": "…", "versionId": "…", "restauration": true}` : la version renvoyée est la sauvegarde de l'état d'avant, créée juste avant que le contenu de la version demandée soit remis ; l'historique n'est jamais réécrit |

`nom` est facultatif. `niveau` est le chiffre du numéro à incrémenter (1 = premier chiffre) ; sans `niveau`, le dernier chiffre augmente et les chiffres à droite du chiffre choisi repassent à 0. Toute erreur répond `{"type": "erreur", "message": "…"}`.

**Messages du serveur**

| Message | Quand |
|---|---|
| `{"type": "credit", "restant": 9650, "rechargeA": 1792976400000}` | après chaque modification **acceptée**, c'est-à-dire écrite dans le journal |
| `{"type": "refus", "raison": "credit", "restant": 40, "rechargeA": 1792976400000}` | modification refusée ; `raison` vaut `credit`, `taille` ou `bloque` (alors `bloqueJusqua` est présent) |

Après un refus, le serveur ferme la connexion du document : le client doit se reconnecter avec un document neuf ; la modification refusée n'est appliquée chez personne.

**Crédit** : 10 000 caractères insérés par rédacteur et par jour (recharge à minuit, heure locale), commun à tous ses appareils. Une insertion qui dépasse le crédit restant est refusée en entier ; effacer ne rend pas de crédit. Taille maximale d'un document : 200 000 caractères. Au vingtième refus en une minute, le rédacteur est bloqué 15 minutes.

Un client minimal en Node.js (paquets `@hocuspocus/provider`, `yjs`, `ws`) est la classe `ClientYjs` de `tests/concurrence/commun.mjs`, utilisée par les tests de convergence (`t03-c2.mjs`) et de crédit (`t05-c4.mjs`).

## 8. Tableau de bord de l'association

### 18. `GET /api/admin/tableau-de-bord`
Corps : aucun. En-tête obligatoire : `x-code-admin: <code>` (pas de jeton de session).

Réponse `200` :
```json
{"documentsOuverts": [{"docId": "…", "titre": "Journal 2026",
    "principal": {"email": "camille@exemple.com", "nom": "Camille"}, "connectes": 3}],
 "liensActifs": [{"lienId": "…", "docId": "…", "titre": "Journal 2026", "creePar": "Camille", "n": 500, "restants": 312}],
 "bloques": [{"email": "x@exemple.com", "nom": "X", "motif": "20 refus en 1 minute", "bloqueJusqua": 1792960900000}]}
```
`documentsOuverts` : documents où au moins un rédacteur est connecté. `restants` = exemplaires pas encore distribués. Erreurs : `403` code faux ; `429` (`trop_de_requetes`) après dix codes faux en une minute.

Le code est généré au déploiement ; la personne qui a déployé le lit avec :
```
aws ssm get-parameter --name /bsynctext/code-admin --with-decryption --query Parameter.Value --output text
```
