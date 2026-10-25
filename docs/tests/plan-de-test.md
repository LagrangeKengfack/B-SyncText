# Plan de test

> **Statut :** à valider · **Date :** 25/10/2026 · **Auteur :** Kengfack Tsafack Bernice Lagrange · **Alimente :** livrable 3 (rapport de test)

## 1. Approche
- **On teste sur AWS, pas sur un émulateur.** C-1 et C-4 reposent sur les écritures conditionnelles de DynamoDB : seul le vrai service prouve qu'elles tiennent. Une pile de test coûte quelques centimes.
- **Trois niveaux de test** :
  - **unitaires** : la logique pure, testée sur le poste ;
  - **concurrence** : un script par contrainte, lancé contre la pile déployée ;
  - **charge** : le profil C-5.
- **Chaque essai produit un fichier de résultats brut** (`docs/tests/resultats/*.json`), daté, cité dans la matrice de traçabilité (D-006).
- **Le générateur de charge** tourne sur une EC2 temporaire de la même région. Notre connexion internet ne limite donc pas l'essai. Il est supprimé après le test, pour quelques centimes.

## 2. Outils

| Outil | Usage |
|---|---|
| **Vitest** | tests unitaires TypeScript |
| **Scripts Node.js** (`tests/concurrence/`) | C-1, C-2, C-3, C-4 : clients HTTP et clients Yjs simulés |
| **k6** | charge C-5 (arrivées programmées, mesures de temps de réponse) |
| **CloudWatch Logs Insights** | compter côté serveur : PDF générés, e-mails envoyés, refus, erreurs |
| **Cost Explorer** | coût de chaque essai (livrable 5) |

## 3. Tests par contrainte

| ID | Contrainte | Essai | Réussi si |
|---|---|---|---|
| T-01 | **C-1** | lien de N = 1 et lien de N = 500 ; 1 000 demandes simultanées ; chaque ticket obtenu demande son fichier ; 5 répétitions | exactement N PDF, numéros 1 à N sans doublon ; ticket réutilisé → 410 ; demandes suivantes → `epuise` |
| T-02 | **C-1** (remise en stock) | N = 10 ; 10 réservations jamais utilisées, puis 20 visiteurs qui patientent | après 60 s, les 10 exemplaires sont servis aux visiteurs qui patientaient ; total = 10 |
| T-03 | **C-2** | 50 clients Yjs écrivent au même endroit pendant 60 s, chaque insertion porte un marqueur unique ; à mi-parcours, redémarrage du serveur d'édition | textes finaux identiques sur les 50 clients (même empreinte) et identiques à l'état rechargé depuis DynamoDB et S3 ; chaque marqueur confirmé est présent ; convergence en moins de 5 s |
| T-04 | C-3 | créer un lien, modifier le document, télécharger | le PDF contient la modification et le numéro de la version correspondante |
| T-05 | C-4 | 3 sessions du même rédacteur écrivent en parallèle jusqu'au refus | total accepté ≤ 10 000 = crédit débité ; tout le reste est refusé |
| T-06 | **C-5** | k6 : 15 000 visiteurs, dont 12 000 dans la 1re minute, sur un lien de 500 ; pendant ce temps, 300 rédacteurs (30 documents de 10, H-14) | 100 % des visiteurs ont un état ; p95 < 2 s ; 0 erreur 5xx ; latence d'édition p95 < 1 s |
| T-07 | C-6 | mesuré pendant T-06 | moins de 5 s entre le dernier exemplaire et le passage à « épuisé » des visiteurs qui patientent ; 0 PDF généré après épuisement |
| T-08 | BNF-08 | un rédacteur insiste sans crédit | bloqué après 20 refus, visible au tableau de bord, débloqué après 15 min |
| T-09 | BNF-10 | épuisement d'un lien, avec un nouvel essai d'envoi | exactement 1 e-mail (journaux SES) |

**Tests unitaires** :
- comptage des caractères insérés dans une mise à jour Yjs (la mise en forme ne compte pas) ;
- règles des rôles (dernier propriétaire, propriétaire principal) ;
- numéros de version ;
- validation des entrées.

**Taux de couverture** (mesuré par Vitest, joint au rapport) :
- **objectif ≥ 80 % des lignes** sur la logique métier (`src/commun` : comptage Yjs, rôles, numéros de version, validation, règles de réservation) ;
- pas d'objectif global. Ce qui porte C-1 à C-6 se joue entre nos composants et AWS : ces garanties sont prouvées par T-01 à T-09 contre la pile réelle, ce qu'un pourcentage de lignes ne mesure pas ;
- l'interface n'a pas de tests unitaires : elle est vérifiée à la main.

**Vérification manuelle** : les écrans E-01 à E-11 sur Chrome, Firefox et un téléphone (BNF-14).

## 4. Matrice de traçabilité (à remplir avec les résultats)

| Contrainte | Mécanisme (03 §2) | Test | Résultat mesuré | Preuve |
|---|---|---|---|---|
| C-1 | décrément conditionnel, ticket à usage unique | T-01, T-02 | | `resultats/t01-*.json` |
| C-2 | Yjs, modification acceptée = écrite dans le journal | T-03 | | `resultats/t03-*.json` |
| C-3 | état lu au moment du fichier, PDF par état | T-04 | | |
| C-4 | crédit par jour, décrément conditionnel | T-05 | | |
| C-5 | chemins séparés, 429 → « patientez » | T-06 | | |
| C-6 | état `epuise` définitif | T-07 | | |
