# Journal des décisions

Une entrée par décision d'architecture, de technologie ou de cadrage. Les numéros D-001 et D-002 concernent l'organisation du travail et ne figurent pas ici. On n'efface pas une entrée : on en ajoute une qui la remplace et on marque l'ancienne « remplacée par D-xxx ».

Format : contexte, décision, alternatives écartées, conséquences.

---

## D-003 — Région AWS
- **Date :** 2026-10-24
- **Statut :** adoptée
- **Contexte :** une seule région pour toutes les ressources, fixée à l'inscription du compte.
- **Décision :** **eu-north-1 (Stockholm)**.
- **Conséquences :** vérifier que chaque service retenu y est disponible. Une valeur par défaut `eu-north-1` dans la CLI et l'infra.

## D-005 — Compte gratuit, durée de vie du projet
- **Date :** 2026-10-25
- **Statut :** adoptée
- **Contexte :** compte personnel en plan gratuit, solde **119,91 USD** de crédits, fin du plan en avril 2027. Le projet est évalué le lundi 26 octobre ; il doit tenir **jusqu'au mardi 27 octobre** inclus, pas au-delà.
- **Décision :** tout se fait dans les crédits. **On cherche à minimiser la dépense, sans s'interdire une dépense utile** : pas de plafond fixe. Si une option plus chère est nécessaire pour respecter une contrainte ou prouver un résultat, on la prend et on justifie ici son coût. À fonctionnalités égales, on prend l'option la moins chère. Le coût total est un critère de qualité (le sujet demande une preuve de coût) et le coût mesuré des tests de charge est mis en avant dans le rapport. Des alertes de budget servent de garde-fou (par exemple 5, 10 et 20 USD), pas de limite. Pas de ressource facturée à l'heure sans trafic (répartiteur, NAT, instance permanente, base relationnelle) sauf justification écrite ici.
- **Conséquences :** le démontage complet (README, section « supprimer ») est exécuté après le mardi, pas avant. Les captures de facturation du livrable 5 sont prises avant le démontage.

## D-006 — Stratégie de différenciation
- **Date :** 2026-10-25
- **Statut :** adoptée
- **Contexte :** c'est une compétition ; les deux premières contraintes décident du statut « fonctionnel », et le jury juge surtout les preuves.
- **Décision :** deux « armes », sans fonctionnalité supplémentaire : (1) **matrice de traçabilité** dans le rapport de test : pour chaque contrainte, mécanisme, test, résultat mesuré, fichier de preuve brut ; (2) **salle d'attente explicite** pour le pic : chaque visiteur reçoit un état clair (télécharge maintenant, patiente, lien épuisé), exposé par l'API.
- **Alternatives écartées :** contre-preuve d'une version naïve (utile mais non retenue, faute de temps) ; commande unique de démonstration en direct (idem).
- **Conséquences :** l'état d'attente fait partie de la description de l'API dès la phase 4 ; le plan de test (phase 6) prévoit la matrice.

## D-004 — Architecture du temps réel et de la concurrence
- **Date :** 2026-10-24
- **Statut :** adoptée (25/10)
- **Contexte :** contrainte 2 (aucune perte, convergence) et pic de la contrainte 5.
- **Décision :** CRDT **Yjs**, avec un serveur **Hocuspocus** (Node.js) sur **une instance EC2**. Une modification est acceptée une fois écrite dans le journal DynamoDB ; elle n'est diffusée qu'après.
- **Alternatives écartées :** OT (algorithme de transformation à écrire et à prouver) ; WebSocket API Gateway + Lambda (document rechargé à chaque message, diffusion lente et coûteuse) ; plusieurs serveurs avec Redis (inutile pour 300 rédacteurs).
- **Conséquences :** une instance facturée à l'heure (≈ 0,02 USD/h), justifiée par D-005 ; le serveur d'édition est un point unique, sans perte de données (03-architecture §5).

## D-007 — Deux chemins séparés : écriture sur EC2, téléchargement en serverless
- **Date :** 2026-10-25
- **Statut :** adoptée
- **Décision :** CloudFront devant tout. Le pic des visiteurs passe par API Gateway et Lambda, avec une concurrence réservée de 250 ; les rédacteurs passent par l'EC2. DynamoDB à la demande, S3, SES, SSM.
- **Alternatives écartées :** tout sur EC2 (le pic ralentirait les rédacteurs) ; tout en serverless (temps réel inadapté, voir D-004) ; répartiteur ALB (coût horaire, inutile avec un seul serveur).
- **Conséquences :** C-5 est tenu par isolation ; dimensionnement dans 03-architecture §3.

## D-008 — Aucune tâche planifiée
- **Date :** 2026-10-25
- **Statut :** adoptée
- **Décision :** recharge du crédit implicite (élément par jour WAT), blocage avec heure de fin, remise en stock des réservations faite par les visiteurs qui patientent.
- **Alternative écartée :** tâches EventBridge (un composant de plus, un risque de plus).

## D-009 — Pile technique et infrastructure en code
- **Date :** 2026-10-25
- **Statut :** adoptée
- **Décision :** TypeScript partout (React + Vite + Tiptap, Node.js 22 sur Lambda et EC2), pdfmake et pdf-lib, CloudFormation déployé par l'AWS CLI, k6 pour la charge. Détail et alternatives : `conception/04-technologies.md`.

## D-010 — Identité : B-SyncText
- **Date :** 2026-10-25
- **Statut :** adoptée
- **Décision :** nom **B-SyncText** (remplace BLédit, 25/10) ; logo **option 6** (`docs/assets/logo-clair.svg`, `logo-sombre.svg`, `favicon.svg`) ; violet de marque `#5A31B0` (`--violet-700`) ; accent corail `#E4572E` réservé au curseur ; polices Manrope et Source Serif 4 auto-hébergées ; « épuisé » en gris-violet neutre ; **thème clair d'abord**, thème sombre seulement s'il reste du temps. Jetons dans `docs/assets/charte.css`.
- **Alternatives écartées et raisons :** `conception/07-identite-et-interfaces.md` §8 (autres noms, logos A et C, polices en ligne, rouge pour « épuisé »).
