# Preuve de coût

Ce dossier donne ce que le projet a coûté chez AWS, du 24 au 27 octobre 2026, compte personnel, région eu-north-1.

## Le relevé

Le fichier [`releve-cost-explorer.txt`](releve-cost-explorer.txt) est la sortie brute de l'outil de facturation d'AWS (Cost Explorer), obtenue par la ligne de commande, par jour et par service :

```
aws ce get-cost-and-usage --time-period Start=2026-10-24,End=2026-10-28 --granularity DAILY \
  --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE
```

Elle contient une entrée par service et par jour. Seuls les services avec un montant non nul sont repris ci-dessous.

## Ce qui a coûté

| Service | Jour | USD | Pourquoi |
|---|---|---|---|
| EC2, calcul | 25/10 | 0,363 | serveur d'édition `t4g.small` et générateur de charge `m7i-flex.large` (quelques heures, pour les tests) |
| DynamoDB | 25/10 | 0,104 | écritures et lectures des tests de concurrence et du pic |
| API Gateway | 25/10 | 0,076 | les requêtes des quatre essais du pic (des centaines de milliers) |
| Réseau privé (VPC) | 25/10 | 0,050 | adresses IPv4 publiques des deux machines |
| EC2, autres (disque, adresse IPv4) | 24 et 25/10 | 0,019 | disque et adresse du serveur d'édition |
| S3 | 25/10 | 0,004 | pages, états, PDF |
| CloudFront, e-mail (SES), CloudWatch | 25/10 | 0,001 | négligeable |
| **Total relevé** | | **0,62** | |

Lambda, une grande partie de CloudFront et de DynamoDB, et les premières heures d'EC2 sont couverts par les offres gratuites du compte et n'apparaissent pas en coût.

## Ce que cela montre

- **Une dépense très inférieure aux 5 USD visés** dans la conception, tests de charge compris : les quatre essais du pic de 15 000 visiteurs ont coûté moins d'un dollar au total.
- **Un coût au repos faible** : sans trafic, il reste le serveur d'édition, son disque et son adresse publique, soit environ 0,55 USD par jour tant que l'application n'est pas supprimée.
- **Un budget de garde-fou** nommé `bsynctext` (alertes à 5, 10 et 20 USD) a été créé par le script de déploiement ; aucune alerte ne s'est déclenchée.

La suppression complète, par `infra/supprimer.sh`, arrête toute facturation.
