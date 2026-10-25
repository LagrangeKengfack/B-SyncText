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

### Lancer un test
Prérequis : Node.js 22 et l'adresse de l'application dans `BASE_URL`. Depuis le dossier `tests/` :
```
export BASE_URL=https://<distribution>.cloudfront.net
node concurrence/t01-c1.mjs --n 1,500 --m 1000 --repetitions 5   # T-01
node concurrence/t02-remise-en-stock.mjs                           # T-02
node concurrence/t03-c2.mjs --clients 50 --duree 150               # T-03 (redémarrer le serveur pendant l'essai)
node concurrence/t04-c3.mjs                                        # T-04
node concurrence/t05-c4.mjs                                        # T-05
```
Pour T-06 et T-07, il faut d'abord créer un lien de 500 exemplaires (`LIEN_ID`), puis lancer en même temps :
```
k6 run -e BASE_URL=$BASE_URL -e LIEN_ID=<id> charge/t06-pic.js     # visiteurs
node charge/redacteurs.mjs --duree 240                             # 300 rédacteurs
```
`--help` liste les options de chaque script. Chaque test écrit ses résultats bruts et son verdict dans `tests/resultats/<test>-<date>.json`.

### Depuis la région AWS (recommandé)
Depuis un ordinateur personnel, la connexion internet ne tient pas 1 000 connexions simultanées et fausse les mesures. Les tests se lancent donc depuis une machine temporaire, dans la même région que l'application :
Les fichiers sont dans `tests/generateur/` : `generateur.yaml` décrit la machine (un `m7i-flex.large`, environ 0,10 USD de l'heure, pilotée par SSM sans SSH) et `generateur.sh` la commande. Depuis la racine du dépôt :
```
tests/generateur/generateur.sh creer
tests/generateur/generateur.sh lancer "BASE_URL=https://… node t01-c1.mjs --n 1,500 --m 1000 --repetitions 5"
tests/generateur/generateur.sh supprimer      # à faire après les tests
```
Les résultats sont rapatriés dans `tests/resultats/`.
