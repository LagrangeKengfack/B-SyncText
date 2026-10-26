<p align="center">
  <img src="src/web/public/logo-clair.svg" alt="B-SyncText" width="110">
</p>

<h1 align="center">B-SyncText</h1>

<p align="center"><em>Créez sans effort. Modifiez en temps réel. Synchronisez en un instant.</em></p>

## Essayer l'application

| | Adresse |
|---|---|
| **Application** | https://d1u2w3ays8s3t6.cloudfront.net |
| **Tableau de bord de l'association** | https://d1u2w3ays8s3t6.cloudfront.net/association |

Code du tableau de bord : `4HnKLjvHBqNY`

Pour essayer : ouvrir l'application, entrer un nom et une adresse e-mail (aucun compte, aucune vérification), créer un document, inviter quelqu'un par le lien d'invitation, puis créer un lien de téléchargement depuis l'éditeur.

B-SyncText est un éditeur de documents partagé : plusieurs personnes écrivent en même temps dans le même texte, et le document se diffuse en PDF par un lien au nombre de téléchargements limité. L'application est conçue pour un journal étudiant écrit par des centaines de rédacteurs et téléchargé par des milliers de lecteurs le jour de sa parution. Elle est déployée sur AWS.

## Fonctionnalités

- **Écriture à plusieurs en temps réel** : chacun voit qui est présent et où écrivent les autres.
- **Mise en forme de base** : titres, gras, italique, souligné, alignement, listes.
- **Historique des versions** et restauration.
- **Partage** par e-mail ou par lien d'invitation, avec des rôles (propriétaire principal, propriétaire, membre).
- **Lien de téléchargement PDF** limité à N exemplaires, qui donne toujours le document tel qu'il est au moment du clic. Chaque PDF est numéroté (« exemplaire 137 / 500 ») et porte son numéro de version.
- **Crédit d'écriture** de 10 000 caractères par rédacteur et par jour.
- **Blocage temporaire** des abus.
- **Tableau de bord** pour l'association : documents ouverts, liens actifs, personnes bloquées.
- **E-mail** au créateur d'un lien quand il est épuisé.

Il n'y a pas de compte : on entre avec un nom et un e-mail. Les visiteurs qui téléchargent ne donnent aucune identité.

## Architecture

```mermaid
flowchart LR
  R[Rédacteurs] --> CF[CloudFront<br/>une seule adresse HTTPS]
  V[Visiteurs] --> CF
  CF -->|/| S3[S3<br/>application web]
  CF -->|/collab WebSocket| EC2[EC2<br/>serveur d'édition<br/>Hocuspocus + Yjs]
  CF -->|/api| API[API Gateway]
  API --> LA[Lambda api]
  API --> LT[Lambda telechargement]
  EC2 --> DB[(DynamoDB)]
  LA --> DB
  LT --> DB
  EC2 --> S3D[S3 données]
  LT --> S3D
  LT --> SES[SES e-mail]
```

**L'écriture et le téléchargement passent par deux chemins séparés** : le pic des visiteurs ne peut pas ralentir les rédacteurs.

| Contrainte | Comment elle est tenue |
|---|---|
| Exactement N téléchargements par lien | réservation par écriture conditionnelle atomique dans DynamoDB ; adresse de fichier à usage unique |
| Aucune modification perdue, même texte pour tous | CRDT **Yjs** ; une modification n'est confirmée qu'après son enregistrement dans DynamoDB |
| Le PDF reflète le document au moment du clic | le document est reconstruit au moment de la demande ; un PDF de base par état du document |
| Crédit journalier, même sur plusieurs appareils | décrément conditionnel d'un crédit par rédacteur et par jour |
| Pic de 15 000 visiteurs | Lambda à la demande ; une saturation devient « Patientez », jamais une erreur |
| Visiteurs informés de l'épuisement | état « épuisé » définitif, renvoyé sans lire le document |

## Technologies

| Partie | Choix |
|---|---|
| Application web | React, Vite, Tiptap (éditeur), TypeScript |
| Temps réel | Yjs (CRDT), Hocuspocus, Node.js 22 sur EC2 |
| API | Node.js 22 sur AWS Lambda, API Gateway HTTP |
| Données | DynamoDB, S3 |
| PDF | pdfmake, pdf-lib |
| Infrastructure | CloudFormation, AWS CLI |
| Tests | Vitest, scripts Node.js, k6 |

## Organisation du dépôt

```
src/
  web/              application web (React)
  edition/          serveur d'édition temps réel (EC2)
  api/              Lambda « api » : sessions, documents, membres, liens, tableau de bord
  telechargement/   Lambda « telechargement » : réservation des exemplaires, PDF, e-mail
  commun/           code partagé : crédit, jetons, versions, lecture du document Yjs
infra/              infrastructure (CloudFormation) et scripts de déploiement
tests/              tests de concurrence et de charge, générateur de charge, résultats bruts
documentation/      dossier de conception, rapport de test, preuve de coût
```

## Documentation du dépôt

| Fichier | Ce qu'il couvre |
|---|---|
| [infra/README.md](infra/README.md) | **description de l'infrastructure** : ressources AWS créées, droits de chaque composant, sécurité ; guide complet pour déployer, vérifier, supprimer ; coût |
| [documentation/API.md](documentation/API.md) | **description de l'API** : toutes les routes, corps et réponses, états du téléchargement, canal temps réel, et un exemple de test à écrire soi-même |
| [tests/README.md](tests/README.md) | **tests** : unitaires, de concurrence et de charge ; ce que vérifie chaque test (codes T-01 à T-09) ; commandes ; structure des résultats bruts |
| [documentation/](documentation/) | **dossier de conception** (PDF et sources LaTeX), **rapport de test** (PDF), **description de l'API**, **preuve de coût** |

## API

La description complète de l'API, assez précise pour écrire ses propres tests, est dans **[documentation/API.md](documentation/API.md)**.

## Déployer

Tout se fait **depuis un ordinateur**, à la racine du dépôt, avec une seule commande. Le script crée toute l'infrastructure AWS (voir [infra/README.md](infra/README.md)).

**À installer avant**

| Outil | Pourquoi | Vérifier |
|---|---|---|
| Un compte AWS | héberge l'application | |
| AWS CLI v2 | pilote AWS | `aws --version` |
| Node.js 22 et npm | construit le code | `node --version` |
| `zip`, `openssl`, `jq` | utilisés par le script | `zip -v`, `openssl version`, `jq --version` |

**Préparer**
```
aws login                                  # connexion à votre compte AWS (valable environ 8 heures)
aws configure set region eu-north-1        # région de l'application
npm ci                                     # installe les dépendances
```

**Déployer**
```
infra/deployer.sh <votre-email>
```
L'e-mail reçoit les alertes de budget (5, 10, 20 USD) et sert d'expéditeur pour l'e-mail « lien épuisé ». **Au premier déploiement, AWS envoie à cette adresse un lien de vérification : cliquez dessus**, sinon l'e-mail « lien épuisé » ne part pas.

Le premier déploiement dure 10 à 15 minutes, les suivants environ 3 minutes. À la fin, le script affiche l'adresse de l'application et la commande qui donne le code du tableau de bord. Pour mettre à jour après une modification du code, relancer la même commande.

## Tester

```
npm test               # tests unitaires
npm run couverture     # avec la couverture
```
Les tests de concurrence et de charge, qui portent les codes T-01 à T-09, visent l'application déployée. Ils sont décrits dans **[tests/README.md](tests/README.md)**.

## Tableau de bord de l'association

Adresse : [/association](https://d1u2w3ays8s3t6.cloudfront.net/association). La page demande un **code administrateur**, créé au déploiement et rangé dans le coffre de paramètres d'AWS. Pour une nouvelle installation, il se lit avec :
```
aws ssm get-parameter --name /bsynctext/code-admin --with-decryption --query Parameter.Value --output text
```
Toute personne qui connaît ce code peut consulter le tableau de bord (lecture seule) ; dix codes faux en une minute bloquent les essais pendant une minute.

## Supprimer

Depuis la racine du dépôt, avec la même connexion AWS :
```
infra/supprimer.sh
```
Le script demande de taper `oui`, vide les buckets, supprime la pile CloudFormation, puis les secrets et le budget, et affiche ce qui reste (rien). **L'opération est irréversible : les documents sont perdus.** Sans suppression, l'application coûte environ 0,55 USD par jour. Détail : [infra/README.md](infra/README.md#5-supprimer).
