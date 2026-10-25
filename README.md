# B-SyncText

Éditeur de documents partagé en temps réel, déployé sur AWS (région eu-north-1).

> Ce README sera complété en fin de projet : déployer, tester, supprimer.

## Contenu du dépôt

| Dossier | Contenu |
|---|---|
| `docs/conception/` | dossier de conception (commencer par `README.md`) |
| `docs/tests/` | plan de test, puis résultats bruts |
| `docs/DECISIONS.md` | journal des décisions |
| `src/web/` | application web (React, Vite, Tiptap) |
| `src/edition/` | serveur d'édition temps réel (Hocuspocus, sur EC2) |
| `src/api/` | fonction Lambda « api » |
| `src/telechargement/` | fonction Lambda « telechargement » |
| `src/commun/` | code partagé |
| `infra/` | infrastructure en code (CloudFormation) |
| `tests/` | tests de concurrence et de charge |

## Démarrer

```
npm ci
npm run build
```

Prérequis : Node.js 22 ou plus.
