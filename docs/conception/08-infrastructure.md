# 08 — Infrastructure

> **Statut :** à valider · **Date :** 25/10/2026 · **Auteur :** Kengfack Tsafack Bernice Lagrange · **Alimente :** livrable 1 (description de l'infrastructure), livrable 5

Toute l'infrastructure est décrite dans [`infra/template.yaml`](../../infra/template.yaml) (CloudFormation, D-009).
- `infra/deployer.sh <email>` crée ou met à jour tout.
- `infra/supprimer.sh` supprime tout.

## 1. Ressources

| Groupe | Ressources | Remarque |
|---|---|---|
| Réseau | VPC `10.20.0.0/16`, 2 sous-réseaux publics (2 zones), passerelle internet, points de terminaison S3 et DynamoDB | les points de terminaison sont gratuits ; pas de NAT, qui est facturé à l'heure |
| Serveur d'édition | EC2 `t4g.small` (ARM, Amazon Linux 2023), disque chiffré de 8 Go, groupe de sécurité | port 8080 ouvert **à CloudFront seulement** ; IMDSv2 obligatoire ; aucun port 22 ; service systemd relancé automatiquement |
| Fonctions | Lambda `api` (512 Mo) et `telechargement` (1 Go, **250 exécutions réservées**), Node.js 22 ARM | journaux gardés 7 jours |
| API | API Gateway HTTP, limite de 3 000 requêtes/s | au-delà : 429, que la page traduit en « Patientez » |
| Données | 9 tables DynamoDB à la demande, 2 buckets S3 privés et chiffrés (site, données) | expiration automatique (TTL) des crédits, du journal et des compteurs |
| Diffusion | CloudFront, fonction de réécriture des chemins de l'application, accès au bucket par OAC | une seule adresse HTTPS |
| Hors pile | bucket d'artefacts (code), 3 secrets SSM, identité e-mail SES, budget de 20 USD avec alertes à 5, 10 et 20 USD | créés par `deployer.sh` : le budget n'existe pas dans CloudFormation pour eu-north-1, et les secrets ne doivent pas apparaître dans le gabarit |

## 2. Droits (un rôle par composant)

| Rôle | Peut | Ne peut pas |
|---|---|---|
| EC2 (édition) | lire et écrire 7 tables nommées ; `etats/` et `versions/` du bucket de données ; lire 2 secrets ; lire son code | toucher aux liens et aux réservations, aux PDF, au code administrateur |
| Lambda `api` | lire et écrire les tables métier ; lire les versions ; lire 2 secrets | écrire dans S3 ; envoyer un e-mail |
| Lambda `telechargement` | liens, réservations, journal (lecture), documents, versions ; `pdf/` et `versions/` ; envoyer un e-mail SES | lire les secrets ; toucher aux crédits et aux membres |
| CloudFront | lire le bucket du site | tout le reste |

Aucune clé d'accès n'existe : chaque composant utilise son rôle, et le déploiement utilise la session `aws login` de l'auteur.

## 3. Déploiement, en huit étapes (`deployer.sh`)
1. Création des secrets SSM, une seule fois.
2. Création du bucket d'artefacts.
3. Construction du code (`npm run build`), un fichier par composant (esbuild), téléversement.
4. Création ou mise à jour de la pile CloudFormation (`aws cloudformation deploy`).
5. Copie de l'application web dans S3, puis invalidation du cache CloudFront.
6. Mise à jour du serveur d'édition par SSM Run Command, sans SSH.
7. Création de l'identité e-mail SES (vérifiée une fois par un lien).
8. Création du budget.

## 4. Coût d'oubli
Si l'on oubliait de supprimer la pile, elle coûterait environ **0,55 USD par jour** :
- EC2 : environ 0,40 USD ;
- adresse IPv4 : 0,12 USD ;
- disque : 0,02 USD ;
- le reste ne coûte rien sans trafic.
