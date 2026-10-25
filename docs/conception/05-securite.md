# 05 — Sécurité et abus

> **Statut :** à valider · **Date :** 25/10/2026 · **Auteur :** Kengfack Tsafack Bernice Lagrange · **Alimente :** livrable 2, oral

## 1. Identité et session
- `POST /api/session` (nom, e-mail) renvoie un **jeton signé** (HMAC-SHA256), valable 7 jours, qui contient l'e-mail et le nom. Le navigateur l'envoie à chaque requête (`Authorization: Bearer …`) et à l'ouverture du WebSocket.
- Le secret de signature est rangé dans **SSM Parameter Store** (SecureString). Il n'est jamais dans le dépôt.
- Limite assumée (R-08) : l'e-mail n'est pas vérifié, comme le prévoit le sujet.

## 2. Qui a le droit de quoi

| Action | Autorisé à |
|---|---|
| Lire, écrire, voir l'historique, créer une version, créer un lien de téléchargement | membre du document |
| Donner accès, régénérer le lien d'invitation, nommer un propriétaire, restaurer | propriétaire |
| Retirer le rôle de propriétaire à un autre | propriétaire principal |
| Télécharger | toute personne qui a le lien, sans identité |
| Tableau de bord | détenteur du code administrateur (SSM) |

Chaque règle est vérifiée **côté serveur** (Lambda ou EC2). L'interface ne fait que masquer les boutons.

## 3. Droits AWS (un rôle par composant, ressources nommées)

| Composant | Droits |
|---|---|
| Lambda « api » | DynamoDB : lecture et écriture sur ses tables ; S3 « donnees » : lecture de `versions/` et `etats/` ; SSM : lecture de 2 paramètres |
| Lambda « telechargement » | DynamoDB : tables `Liens`, `Reservations`, `Journal` (lecture) ; S3 : lecture de `etats/`, lecture et écriture de `pdf/` ; SES : envoi depuis l'adresse vérifiée |
| EC2 (profil d'instance) | DynamoDB : `Journal`, `Credits`, `Documents`, `Membres`, `Versions`, `Redacteurs`, `Compteurs` ; S3 : `etats/` et `versions/` ; SSM : lecture de 2 paramètres ; `AmazonSSMManagedInstanceCore` (accès par Session Manager) |
| CloudFront | lecture du bucket « site » seulement (OAC + politique de bucket) |

Aucune clé d'accès nulle part : les composants utilisent leur rôle, et le déploiement se fait avec le profil CLI `Lagrange`.

## 4. Réseau et données
- **EC2** :
  - le port 80 n'est ouvert qu'à la liste d'adresses CloudFront gérée par AWS ;
  - le serveur refuse toute requête sans l'en-tête secret ajouté par CloudFront ;
  - aucun port 22 ; IMDSv2 obligatoire.
- **HTTPS partout** côté utilisateur : CloudFront redirige HTTP vers HTTPS.
- **Données au repos** :
  - les buckets S3 sont privés (Block Public Access) et chiffrés (SSE-S3) ;
  - DynamoDB est chiffré par défaut.
- **Identifiants** : les identifiants de lien, les tickets de réservation et les jetons d'invitation sont aléatoires (128 bits), donc impossibles à deviner.

## 5. Abus et limites

| Menace | Parade |
|---|---|
| Rédacteur qui force le crédit ou inonde le serveur | limite de débit par session sur l'EC2 ; 20 refus en 1 min → **blocage 15 min** (H-10), visible au tableau de bord |
| Collage géant | document limité à 200 000 caractères ; insertion > crédit refusée entière |
| Rafale de clics sur un lien | limite de débit d'API Gateway par route ; au-delà, réponse 429 qui devient « Patientez » ; **jamais de blocage par IP** (R-07) |
| Réutilisation d'une adresse de fichier | ticket à usage unique, consommé par écriture conditionnelle (R-02) |
| Essais de codes administrateur | 10 échecs par minute au plus, puis 429 |
| Dépense qui s'emballe | alertes de budget à 5, 10 et 20 USD ; concurrence Lambda plafonnée |
| Données invalides | validation côté serveur : format d'e-mail, 1 ≤ N ≤ 10 000, titre de 1 à 120 caractères |
