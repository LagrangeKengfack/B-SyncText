# Tests

Trois niveaux de tests. Les tests de concurrence et de charge visent l'application **déployée** : les garanties C-1 et C-4 reposent sur les écritures conditionnelles de DynamoDB, et seul le vrai service peut les prouver.

## 1. Tests unitaires

Depuis la racine du dépôt :
```
npm test                 # tous les tests (Vitest)
npm run couverture       # avec le taux de couverture de src/commun (objectif ≥ 80 %)
```

## 2. Tests de concurrence et de charge

Chaque test porte un code `T-xx`, et chaque code vérifie une contrainte du sujet (`C-1` à `C-6`).

| Code | Contrainte vérifiée | Ce que fait le test | Réussi si |
|---|---|---|---|
| **T-01** | C-1 : exactement N téléchargements | 1 000 visiteurs demandent en même temps un lien de N exemplaires (N = 1, puis N = 500), 5 fois | exactement N PDF, numérotés de 1 à N, sans doublon ; un ticket réutilisé est refusé ; les demandes suivantes reçoivent « épuisé » |
| **T-02** | C-1 : remise en stock | 10 exemplaires réservés puis abandonnés ; 20 visiteurs patientent | après 60 s, les 10 exemplaires sont servis aux visiteurs qui patientaient, jamais plus |
| **T-03** | C-2 : aucune perte, même texte pour tous | 50 rédacteurs écrivent au même endroit ; le serveur d'édition est redémarré pendant l'essai | textes identiques chez tous ; chaque insertion confirmée est présente |
| **T-04** | C-3 : le document tel qu'il est au clic | modifier le document après la création du lien, puis télécharger | le PDF contient la modification et son numéro de version |
| **T-05** | C-4 : crédit journalier | 3 appareils du même rédacteur écrivent jusqu'au refus | jamais plus de 10 000 caractères acceptés |
| **T-06** | C-5 : le pic | 15 000 visiteurs (12 000 dans la 1re minute) et 300 rédacteurs en même temps | 100 % des visiteurs reçoivent un état ; 95 % des réponses en moins de 2 s ; aucune erreur serveur |
| **T-07** | C-6 : fin du lien | mesuré pendant T-06 | les visiteurs qui patientent voient « épuisé » en moins de 5 s |
| **T-08** | abus | un rédacteur sans crédit insiste | bloqué après 20 refus en une minute, visible au tableau de bord |
| **T-09** | e-mail | un lien d'un exemplaire est épuisé, puis on insiste | exactement un e-mail « lien épuisé » (état « envoyé » sur le lien, +1 dans les statistiques SES) |

### Lancer un test
Prérequis : Node.js 22 et l'adresse de l'application dans `BASE_URL`. Depuis le dossier `tests/` :
```
export BASE_URL=https://<distribution>.cloudfront.net
node concurrence/t01-c1.mjs --n 1,500 --m 1000 --repetitions 5   # T-01
node concurrence/t02-remise-en-stock.mjs                           # T-02
node concurrence/t03-c2.mjs --clients 50 --duree 150               # T-03 (redémarrer le serveur pendant l'essai)
node concurrence/t04-c3.mjs                                        # T-04
node concurrence/t05-c4.mjs                                        # T-05
node concurrence/t08-blocage.mjs --code-admin <code>               # T-08
EMAIL=<adresse vérifiée dans SES> node concurrence/t09-email.mjs     # T-09
```
Pour T-06 et T-07, il faut d'abord créer un lien de 500 exemplaires (`LIEN_ID`), puis lancer en même temps :
```
k6 run -e BASE_URL=$BASE_URL -e LIEN_ID=<id> charge/t06-pic.js     # visiteurs
node charge/redacteurs.mjs --duree 240                             # 300 rédacteurs
```
`--help` liste les options de chaque script. Chaque test écrit ses résultats bruts et son verdict dans `tests/resultats/<test>-<date>.json` (voir la section 3).

### Depuis la région AWS (recommandé)
Depuis un ordinateur personnel, la connexion internet ne tient pas 1 000 connexions simultanées et fausse les mesures. Les tests se lancent donc depuis une machine temporaire, dans la même région que l'application :
Les fichiers sont dans `tests/generateur/` : `generateur.yaml` décrit la machine (un `m7i-flex.large`, environ 0,10 USD de l'heure, pilotée par SSM sans SSH) et `generateur.sh` la commande. Depuis la racine du dépôt :
```
tests/generateur/generateur.sh creer
tests/generateur/generateur.sh lancer "BASE_URL=https://… node t01-c1.mjs --n 1,500 --m 1000 --repetitions 5"
tests/generateur/generateur.sh supprimer      # à faire après les tests
```
Les résultats sont rapatriés dans `tests/resultats/`.

## 3. Résultats bruts

Le dossier `resultats/` contient la preuve de chaque test : les fichiers produits par les scripts, sans retouche. Seuls les essais cités dans le rapport de test y figurent.

```
resultats/
  t01-c1-<date>.json                C-1 : 10 essais à 1 000 demandes
  t02-remise-en-stock-<date>.json   C-1 : remise en stock
  t03-c2-<date>.json                C-2 : deux essais (60 s, puis 150 s avec redémarrage du serveur)
  t04-c3-<date>.json                C-3 : document au moment du clic
  t05-c4-<date>.json                C-4 : crédit sur trois appareils
  t08/t08-blocage-<date>.json       blocage après 20 refus
  t09-email-<date>.json             un seul e-mail par lien épuisé
  t06-essai1/ … t06-essai4/         le pic, quatre essais successifs
  t06-capacite-redacteurs/          capacité du serveur d'édition à trois rythmes d'écriture
```

**Un fichier JSON de test** (T-01 à T-05, T-08, T-09) a toujours le même squelette :

| Champ | Contenu |
|---|---|
| `test`, `date`, `baseUrl` | quel test, quand (UTC), contre quelle application |
| `parametres` | les options du lancement (N, nombre de demandes, de clients, durée) |
| champs de mesure | ce que le test a compté : exemplaires reçus, insertions confirmées, caractères acceptés, refus… |
| `verdict` | `REUSSI` ou `ECHEC`, calculé par le script et non à la main |

Pour vérifier un test, ouvrir son fichier et lire `verdict`, puis les champs de mesure qui le justifient (par exemple `totalAccepte` et `creditRestantServeur` pour T-05).

**Un dossier `t06-essai*`** contient les mesures d'un essai du pic :

| Fichier | Contenu |
|---|---|
| `t06-k6.txt` | sortie complète de k6 : scénarios, seuils, résumé |
| `t06-resume.json`, `t06-resume-complet.json` | métriques chiffrées de k6 (temps de réponse, erreurs, visiteurs servis, nombre de « patientez », « épuisé ») |
| `redacteurs-<date>.json`, `t06-redacteurs.txt` | mesures des 300 rédacteurs : modifications envoyées, confirmées, latence |

Les essais 1 à 3 montrent les défauts trouvés et corrigés ; l'essai 4 est le résultat final. Le verdict « ECHEC » du script des rédacteurs dans l'essai 4 vient de son seuil de latence (p95 sous 1 s) : cet essai faisait écrire chaque rédacteur à 2 insertions par seconde, soit 600 modifications par seconde, au-delà de la capacité du serveur. `t06-capacite-redacteurs/` donne la capacité réelle : 300 modifications par seconde tenues, avec une latence p95 de 101 ms.
