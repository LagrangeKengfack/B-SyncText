# Infrastructure et déploiement

Toute l'infrastructure AWS de B-SyncText est décrite dans un seul fichier, [`template.yaml`](template.yaml), au format CloudFormation (l'outil d'AWS qui crée des ressources à partir d'une description). Elle se crée, se met à jour et se supprime chacune par une seule commande.

| Fichier | Rôle |
|---|---|
| `template.yaml` | description de toutes les ressources de l'application |
| `deployer.sh` | crée ou met à jour l'application entière |
| `supprimer.sh` | supprime tout, après confirmation |

## 1. Ce qui est créé

Région unique : celle du profil AWS CLI (ou de `AWS_REGION`), **eu-north-1** (Stockholm) pour ce projet. Le gabarit ne dépend pas de la région, à condition que SES y soit disponible.

| Groupe | Ressources | Pourquoi |
|---|---|---|
| Diffusion | **CloudFront** : une seule adresse HTTPS pour tout | certificat sans nom de domaine ; aiguille `/` vers le site, `/api/*` vers l'API, `/collab` vers le serveur d'édition |
| Site web | bucket **S3** privé, lu par CloudFront seulement | fichiers statiques, coût quasi nul |
| Édition temps réel | **EC2 t4g.small** (ARM, Amazon Linux 2023) avec le serveur Hocuspocus, service systemd | une connexion WebSocket longue par rédacteur, documents en mémoire |
| API | **API Gateway HTTP** et deux **Lambda** Node.js 22 : `api` (512 Mo) et `telechargement` (1 Go, 250 exécutions réservées) | aucun coût au repos ; le pic des visiteurs ne touche pas le serveur d'édition |
| Données | 9 tables **DynamoDB** à la demande, bucket S3 de données (états, versions, PDF) | écritures conditionnelles atomiques pour C-1 et C-4 |
| Réseau | VPC dédié, 2 sous-réseaux publics, points d'accès S3 et DynamoDB | les points d'accès sont gratuits ; pas de NAT, qui est facturé à l'heure |
| Hors pile, créé par `deployer.sh` | bucket du code, 3 secrets SSM, identité e-mail SES, budget | ressources de compte, ou secrets qui ne doivent pas apparaître dans le gabarit |

## 2. Sécurité

- **Aucune clé d'accès** : chaque composant utilise son propre rôle IAM, et le déploiement utilise la session `aws login` de la personne qui déploie.
- **Un rôle par composant**, limité aux tables et dossiers dont il a besoin :

| Composant | Peut | Ne peut pas |
|---|---|---|
| Serveur d'édition (EC2) | 7 tables (crédits, journal, documents…), dossiers `etats/` et `versions/`, 2 secrets | toucher aux liens de téléchargement, aux PDF, au code administrateur |
| Lambda `api` | tables métier, lecture des versions, 2 secrets | écrire dans S3, envoyer un e-mail |
| Lambda `telechargement` | liens, réservations, lecture du journal, dossier `pdf/`, envoi d'e-mail | lire les secrets, toucher aux crédits |
| CloudFront | lire le bucket du site | tout le reste |

- **Le serveur d'édition** n'accepte que le trafic de CloudFront, avec la liste d'adresses gérée par AWS et un en-tête secret. Aucun port SSH n'est ouvert : l'administration passe par SSM Session Manager. IMDSv2 est obligatoire.
- **Les buckets** sont privés et chiffrés. DynamoDB est chiffré par défaut.

## 3. Déployer

**Prérequis**
- un compte AWS et l'AWS CLI v2, connectée avec `aws login`, avec une région par défaut configurée (`aws configure set region eu-north-1`) ;
- Node.js 22 et les dépendances installées (`npm ci` à la racine du dépôt) ;
- les outils `zip`, `openssl` et `jq`.

**Commande**, depuis la racine du dépôt :
```
infra/deployer.sh <votre-email>
```
L'e-mail reçoit les alertes de budget (5, 10, 20 USD) et sert d'expéditeur pour l'e-mail « lien épuisé ». Au premier déploiement, AWS y envoie un lien de vérification : il faut cliquer dessus.

Le script enchaîne 8 étapes, de 10 à 15 minutes la première fois et environ 3 minutes ensuite :
1. création des secrets dans SSM, une seule fois ;
2. création du bucket du code ;
3. construction du code, un fichier par composant ;
4. création ou mise à jour de la pile CloudFormation ;
5. copie du site web dans S3 et vidage du cache CloudFront ;
6. mise à jour du serveur d'édition par SSM, sans SSH ;
7. identité e-mail SES ;
8. budget.

**À la fin**, le script affiche l'adresse de l'application (`https://xxxx.cloudfront.net`) et la commande qui donne le code administrateur du tableau de bord.

**Mettre à jour après une modification du code** : relancer la même commande.

**Limite en mode d'essai SES** : un compte neuf ne peut envoyer d'e-mails qu'à des adresses vérifiées. Pour une démonstration, le créateur du lien doit utiliser l'adresse vérifiée.

## 4. Vérifier

```
curl -s -o /dev/null -w "%{http_code}\n" https://xxxx.cloudfront.net/            # 200
curl -s -X POST https://xxxx.cloudfront.net/api/session \
  -H 'content-type: application/json' -d '{"nom":"Test","email":"test@exemple.com"}' # renvoie un jeton
```
Les tests complets sont décrits dans [`tests/README.md`](../tests/README.md).

**Si le serveur d'édition ne répond pas** (erreur 504 sur `/collab`), lire ses journaux sans SSH :
```
aws ssm send-command --instance-ids <id> --document-name AWS-RunShellScript \
  --parameters 'commands=["journalctl -u bsynctext -n 30 --no-pager"]'
```

## 5. Supprimer

```
infra/supprimer.sh
```
Le script demande de taper `oui`, puis :
1. vide les buckets ;
2. supprime la pile et attend la fin ;
3. supprime le bucket du code, les secrets et le budget ;
4. affiche ce qui reste, qui doit être vide.

**L'opération est irréversible** : les documents sont perdus.

## 6. Coût

| Poste | Coût |
|---|---|
| Au repos (EC2, adresse IPv4, disque) | environ **0,55 USD par jour** si l'on oublie de supprimer |
| Lambda, API Gateway, DynamoDB, S3, CloudFront | presque rien sans trafic, en grande partie dans les offres gratuites |
