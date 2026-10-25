# 04 — Choix des technologies

> **Statut :** à valider · **Date :** 25/10/2026 · **Auteur :** Kengfack Tsafack Bernice Lagrange · **Alimente :** livrable 2, oral

| Besoin | Choix | Alternative écartée | Raison |
|---|---|---|---|
| Fusion des écritures concurrentes (C-2) | **CRDT Yjs** | OT (Overleaf, Google Docs) ; sérialisation maison | convergence prouvée, bibliothèque éprouvée ; l'OT exige un algorithme de transformation qu'il faudrait écrire et prouver nous-mêmes |
| Serveur temps réel | **Hocuspocus** (serveur Yjs), Node.js, sur EC2 | API Gateway WebSocket + Lambda | il faudrait recharger le document à chaque message et diffuser à chaque connexion par un appel d'API : lent et coûteux ; Hocuspocus offre les points d'accroche dont on a besoin (authentification, contrôle avant d'accepter une modification) |
| Éditeur de texte | **Tiptap** (ProseMirror) + extensions Collaboration et curseurs | Quill, textarea | mise en forme de base (H-12), curseurs et présence prêts à l'emploi avec Yjs |
| Application web | **React + Vite**, TypeScript | Vue, HTML sans framework | écosystème de Tiptap ; les maquettes HTML/CSS sont reprises telles quelles |
| Fonctions | **Node.js 22 sur Lambda**, TypeScript | Python | un seul langage partout ; le même code Yjs sert au serveur d'édition et à la génération du PDF |
| PDF | **pdfmake** (PDF de base) + **pdf-lib** (numéro d'exemplaire) | navigateur sans interface (Chromium) dans Lambda | bibliothèques légères, démarrage rapide ; Chromium pèse plus de 100 Mo et est lent à démarrer |
| Base de données | **DynamoDB à la demande** | RDS PostgreSQL | écritures conditionnelles atomiques (C-1, C-4) ; pas de serveur facturé à l'heure ; RDS coûte même au repos |
| Infrastructure en code | **CloudFormation**, déployé avec l'AWS CLI | Terraform, CDK | aucun outil à installer ; l'état est gardé par AWS (pas de fichier d'état à protéger) ; une seule commande pour tout supprimer (BNF-12) |
| Accès à l'EC2 | **SSM Session Manager** | SSH avec clé `.pem` | aucun port 22 ouvert, aucune clé à garder (CH-03) |
| Test de charge | **k6** | JMeter, Artillery | scripts courts en JavaScript, gros volumes depuis une seule machine, résultats chiffrés exportables |
| Tests de convergence | script Node.js qui pilote N clients Yjs | tests manuels | rejouable et mesurable : chaque client vérifie à la fin que son texte est identique à celui des autres |

**Poste de travail** : Node.js 22 (nvm), k6, Graphviz, Java et AWS CLI installés.
