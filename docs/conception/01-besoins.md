# 01 — Analyse des besoins

> **Statut :** à valider · **Date :** 25/10/2026 · **Auteur :** Kengfack Tsafack Bernice Lagrange · **Alimente :** livrable 2 (dossier de conception), livrable 3 (objectifs chiffrés et matrice de traçabilité)

Ce document dit **ce que l'application doit faire** et **à quel niveau d'exigence**, sans dire comment. Il sépare :
- la **spécification fonctionnelle** (sections 2 à 5) : ce que voient et font les utilisateurs, indépendamment de l'hébergement ;
- les **contraintes d'hébergement et de projet** (section 6) : où et dans quelles conditions l'application tourne.

Chaque exigence a un identifiant stable. Le plan de test et la matrice de traçabilité (D-006) s'y réfèrent.

---

## 1. Contexte

Une association étudiante écrit chaque année un journal numérique à plusieurs centaines de rédacteurs, souvent sur les mêmes textes, parfois au même endroit. À la parution, elle diffuse le journal par un lien de téléchargement annoncé à une date et une heure précises, limité à 500 exemplaires. L'équipe continue de corriger après l'annonce : une correction faite après la parution doit figurer dans les exemplaires téléchargés ensuite, sans changer de lien.

**Objectif du projet :** une application web d'écriture collaborative qui tient ce scénario, y compris le pic de la parution, et dont on peut **prouver** qu'elle respecte les contraintes du sujet.

---

## 2. Acteurs

| Acteur | Description | Identification |
|---|---|---|
| **Rédacteur** | toute personne qui entre dans l'application avec un nom et un e-mail ; écrit dans les documents auxquels elle a accès | fiche créée à la première entrée, identifiée par l'e-mail, sans mot de passe ni vérification (H-01) |
| **Propriétaire** | rédacteur qui gère les accès d'un document ; cas particulier du rédacteur. Le créateur est le **propriétaire principal** (BF-21) | idem |
| **Visiteur** | personne qui télécharge le journal par un lien | aucune identité demandée (sujet) |
| **Association** | consulte l'état de l'application (tableau de bord) | code administrateur (H-09) |
| **Système** | tâches sans intervention humaine : recharge des crédits, levée des blocages expirés, détection des abus, e-mail de lien épuisé | — |

Le **visiteur** et l'**association** n'ont pas de fiche dans les données de l'application : le visiteur reste anonyme (seuls les exemplaires qu'il obtient sont enregistrés, sans identité) et l'association se reconnaît à son code. Ils n'apparaîtront donc pas comme classes dans le modèle de données (phase 4).

Le **jury** n'est pas un acteur de l'application mais un utilisateur de son API : la description de l'API (livrable 4) doit lui permettre d'écrire ses propres tests.

---

## 3. Besoins fonctionnels

Priorité : **E** essentiel (exigé par le sujet, jamais sacrifié) · **I** important (exigé, mais sa forme peut être simplifiée si le temps manque) · **S** souhaitable (hors sujet strict, bonus).

| ID | Besoin | Source | Prio |
|---|---|---|---|
| BF-01 | Entrer dans l'application avec un nom et un e-mail, sans mot de passe ni vérification ; l'e-mail identifie le rédacteur (H-01) | sujet §1 | E |
| BF-02 | Créer un document (texte simple) | §1 | E |
| BF-03 | Donner accès à un document à d'autres rédacteurs (par e-mail ou par lien d'invitation, BF-23) | §1 | E |
| BF-04 | Lister les documents auxquels on a accès | implicite | E |
| BF-05 | Écrire à plusieurs en même temps dans un document ; voir presque aussitôt les modifications des autres ; savoir si ses propres modifications sont enregistrées | §1, C-2 | E |
| BF-06 | Voir qui est présent dans le document et où chacun écrit (nom saisi à l'entrée, sur la pastille et le curseur) | §1 | I |
| BF-07 | Consulter les versions précédentes d'un document | §1 | I |
| BF-08 | Restaurer une version précédente | §1 | I |
| BF-09 | Créer pour un document un lien de téléchargement en choisissant le nombre de téléchargements autorisés | §1, C-1 | E |
| BF-10 | Télécharger le document en PDF par le lien, sans donner d'identité | §1 | E |
| BF-11 | Le PDF obtenu est le document tel qu'il est au moment du téléchargement, pas à la création du lien | §1, C-3 | E |
| BF-12 | Quand le nombre est atteint, le lien est désactivé : tout nouveau clic reçoit aussitôt « épuisé », sans lire le document | §1, C-6 | E |
| BF-13 | Pendant un pic, chaque visiteur sait s'il télécharge maintenant, s'il doit patienter ou si le lien est épuisé | C-5 | E |
| BF-14 | Crédit d'écriture de 10 000 caractères par rédacteur, rechargé chaque jour ; crédit épuisé = plus d'écriture jusqu'à la recharge | §1, C-4 | E |
| BF-15 | Voir son crédit restant | implicite | I |
| BF-16 | Repérer une personne qui s'acharne contre les limites et la bloquer pour un temps | §1 | E |
| BF-17 | Tableau de bord de l'association : documents ouverts, liens actifs avec téléchargements restants, personnes bloquées | §1 | E |
| BF-18 | Prévenir par e-mail le créateur d'un lien quand celui-ci arrive à son dernier téléchargement | §1 | E |
| BF-19 | Voir ses liens et leurs téléchargements restants (rédacteur) | bonus | S |
| BF-20 | Numéroter chaque exemplaire PDF (« exemplaire 137 / 500 ») et y inscrire la version du document | bonus, preuve de C-1 et C-3 | I |
| BF-21 | Propriétaires multiples : un propriétaire peut nommer d'autres propriétaires et renoncer à son rôle s'il en reste au moins un. Le créateur est **propriétaire principal** : lui seul peut retirer le rôle de propriétaire à un autre. S'il renonce, le propriétaire nommé le plus anciennement devient principal | demande de l'auteur (H-05) | S |
| ~~BF-22~~ | ~~E-mail d'invitation~~ — retiré le 25/10 (quota d'e-mails), remplacé par BF-23 | — | — |
| BF-23 | **Lien d'invitation en écriture** : un propriétaire génère un lien, sans limite d'usage ; quiconque l'ouvre saisit son nom et son e-mail, puis devient membre. Le propriétaire peut le régénérer : l'ancien cesse de fonctionner | demande de l'auteur | I |

---

## 4. Contraintes du sujet

Les contraintes C-1 et C-2 sont **éliminatoires** : une application qui ne les respecte pas est jugée non fonctionnelle, même rapide.

| ID | Contrainte (reformulée) | Ce qu'il faudra prouver |
|---|---|---|
| **C-1** | Un lien permet **exactement** le nombre de téléchargements autorisé, jamais un de plus, quel que soit le nombre de clics simultanés. | sous clics massifs simultanés : nombre d'exemplaires délivrés = N, jamais N+1 |
| **C-2** | Quel que soit le nombre de rédacteurs simultanés, même au même endroit, **aucune modification acceptée n'est perdue** et tous finissent par voir **le même document**. | après une rafale d'écritures concurrentes : tous les clients ont un texte identique, qui contient chaque modification acceptée |
| C-3 | Un lien créé à T et utilisé à T1, après des modifications, donne le document **tel qu'il est à T1, complet et cohérent**, sans nouveau lien. | modifier, télécharger : le PDF contient la modification, et correspond à un état réel du document |
| C-4 | Un rédacteur n'écrit **jamais plus que son crédit du jour**, même depuis plusieurs appareils à la fois. | écriture simultanée depuis plusieurs sessions : total accepté ≤ 10 000 |
| C-5 | 15 000 personnes cliquent sur le lien, dont 80 % dans la première minute, pendant que 300 rédacteurs écrivent : **pas de panne, aucune requête ignorée**, chacun reçoit un état clair. | test de charge reproduisant ce profil : 100 % de réponses avec un état explicite |
| C-6 | Après le dernier exemplaire, les visiteurs encore présents **l'apprennent rapidement**, et l'application **cesse de délivrer** le service. | délai entre le dernier exemplaire et l'information des visiteurs ; aucune génération de PDF après épuisement |

---

## 5. Besoins non fonctionnels et objectifs chiffrés

Le sujet demande les objectifs que nous nous sommes fixés. Les voici, chacun mesurable. Ils seront repris tels quels dans le plan de test. Un objectif de performance (BNF-02, 03, 06, 07) peut être révisé après mesure ; le rapport de test présente l'objectif final et sa justification.

| ID | Qualité | Objectif mesurable | Lié à |
|---|---|---|---|
| BNF-01 | Exactitude des liens | **0** exemplaire délivré au-delà de N, sur 100 % des essais, avec au moins 1 000 demandes simultanées sur un lien (N = 1 et N = 500) | C-1 |
| BNF-02 | Convergence | **0** modification acceptée perdue ; textes identiques sur tous les clients au plus **5 s** après la fin des écritures (cible idéale : 2 s) ; essai avec au moins 50 clients écrivant au même endroit | C-2 |
| BNF-03 | Réactivité de l'édition | modification visible chez les autres en moins de **500 ms** (95 % des cas) hors pic, moins de **1 s** pendant le pic | BF-05 |
| BNF-04 | Fraîcheur du PDF | le PDF contient toute modification acceptée **avant** la demande de téléchargement, et correspond à un état réel du document (pas un mélange) | C-3 |
| BNF-05 | Respect du crédit | **0** caractère accepté au-delà de 10 000 par jour et par rédacteur, avec 3 sessions simultanées | C-4 |
| BNF-06 | Tenue du pic | profil C-5 rejoué : **100 %** des visiteurs reçoivent une réponse avec un état (télécharge, patiente, épuisé) ; temps de réponse inférieur à **2 s** pour 95 % ; **0** erreur serveur ; les 300 rédacteurs continuent d'écrire (BNF-03 tenu) | C-5 |
| BNF-07 | Information d'épuisement | délai entre l'attribution du dernier exemplaire et le moment où un visiteur **qui patiente encore sur la page** voit « épuisé » : moins de **5 s** ; après épuisement, une demande ne lit plus le document et ne génère plus de PDF | C-6 |
| BNF-08 | Lutte contre l'abus | blocage temporaire d'un rédacteur après un nombre de tentatives refusées défini (H-10) ; **aucun** visiteur légitime bloqué pendant le pic | BF-16 |
| BNF-09 | Tableau de bord | données à jour à **10 s** près | BF-17 |
| BNF-10 | Notification | **exactement un** e-mail par lien épuisé, même en cas de nouvelle tentative | BF-18 |
| BNF-11 | Coût | dépense minimale ; coût quasi nul au repos (paiement à l'usage) ; coût du test de charge mesuré et rapporté | D-005 |
| BNF-12 | Exploitabilité | déployer, tester et supprimer l'ensemble par des commandes documentées dans le README | livrable 1 |
| BNF-13 | Explicabilité | chaque choix justifié dans le dossier ; composants peu nombreux | note du sujet |
| BNF-14 | Compatibilité | testé sur Chrome, Firefox, Edge et Safari récents, ordinateur et téléphone ; interface en français. Les navigateurs diffèrent sur des points qui nous concernent : téléchargement automatique parfois bloqué (Safari sur iPhone), mise en veille des onglets en arrière-plan, reconnexion après coupure. Chaque écart a une solution de secours (par exemple un bouton « Télécharger ») | — |

---

## 6. Contraintes d'hébergement et de projet

Elles ne décrivent pas ce que fait l'application, mais les conditions imposées à sa construction. Les identifiants CH-07, CH-08 et CH-10 ont été retirés le 25/10/2026 (travail personnel, délai, budget : implicites ou déjà dans D-005) ; ils ne sont pas réutilisés.

| ID | Contrainte | Source |
|---|---|---|
| CH-01 | Déploiement sur AWS, compte personnel en plan gratuit | sujet §3 |
| CH-02 | Toutes les ressources dans une seule région : **eu-north-1** | sujet §3, D-003 |
| CH-03 | Aucune clé d'accès AWS dans le code ou le dépôt | sujet §3 |
| CH-04 | Chaque composant n'a que les droits dont il a besoin | sujet §3 |
| CH-05 | Bonnes pratiques du cours AWS appliquées (moindre privilège, rôles plutôt que clés, IMDSv2, buckets privés, groupes de sécurité restreints, suppression complète) | sujet §3 |
| CH-06 | Les fichiers à télécharger, c'est-à-dire les **PDF générés**, sont conservés dans **S3** (le texte du document et ses versions sont dans la base de données) | sujet §3 |
| CH-09 | Livrables : dépôt Git (code, infra, tests, README), dossier de conception, rapport de test, description de l'API, preuve de coût | sujet §4 |

---

## 7. Hypothèses d'interprétation

Le sujet laisse des points ouverts. Voici nos interprétations, à **valider par l'auteur**. Celles marquées ❓ demandent une réponse.

| ID | Point ouvert | Interprétation proposée | Statut |
|---|---|---|---|
| H-01 | Qui est « un rédacteur » sans compte ? | « Sans compte » veut dire **sans mot de passe ni vérification**, pas sans enregistrement. À la première entrée, l'application crée une **fiche rédacteur** identifiée par l'**e-mail** (mis en minuscules, espaces retirés) : nom affiché, crédit du jour, blocage éventuel. À chaque entrée suivante, avec le même e-mail, depuis n'importe quel appareil, on retrouve la même fiche, donc les mêmes documents et le même crédit (C-4). Les accès aux documents sont enregistrés par e-mail. L'e-mail n'étant pas vérifié, quelqu'un peut se faire passer pour un autre : **limite assumée** par le sujet (« pas de vrais comptes »), documentée dans la sécurité (R-08). | à valider |
| H-02 | Que consomme le crédit ? | chaque **caractère inséré** (frappe, collage) ; la suppression est gratuite mais **ne rend pas de crédit** : le crédit mesure ce qu'on écrit, pas la taille finale du texte. Sinon, écrire puis effacer en boucle permettrait d'écrire sans limite, et le crédit ne protégerait plus le service. Un remplacement compte comme une insertion. La **restauration** d'une version ne consomme pas de crédit (ce n'est pas écrire un texte nouveau). | **validée** |
| H-03 | « Rechargé chaque jour » : à quelle heure ? | à **minuit, heure WAT** (heure d'Afrique de l'Ouest, UTC+1, soit 23h00 UTC), réglable au déploiement | **validée** |
| H-04 | Écriture plus longue que le crédit restant (collage de 500 caractères avec 100 restants) | l'opération est **refusée en entier**, avec la raison (crédit restant, heure de recharge). Comme effacer ne rend pas de crédit (H-02), couper le texte ferait payer un morceau que l'auteur effacerait peut-être. Le serveur reste juge : il n'accepte jamais plus que le crédit restant, quoi que le navigateur envoie. | **validée** |
| H-05 | Qui peut donner accès à un document ? | **les propriétaires seulement**. Le créateur est **propriétaire principal** ; tout propriétaire peut nommer d'autres propriétaires parmi les membres, et renoncer à son rôle s'il en reste au moins un (BF-21). Seul le principal peut retirer le rôle de propriétaire à un autre. Si le principal renonce, le propriétaire nommé le plus anciennement devient principal. Les autres membres peuvent écrire, voir l'historique, restaurer et créer des liens. | **validée** (BF-21 en bonus) |
| H-06 | Qu'est-ce qu'une « version » ? | L'**enregistrement** est continu : chaque modification acceptée est gardée, sans bouton. Une **version** est un instantané daté, créé : (1) automatiquement **toutes les 10 minutes d'activité** au plus, et quand le dernier rédacteur quitte le document ; (2) à la main par un membre (« Créer une version », avec un nom, par exemple « relu par Camille »), **sans la limite des 10 minutes**, mais au plus une par minute et par document pour éviter les abus ; (3) juste avant une restauration. Soit au plus ~6 versions automatiques par heure d'écriture. **Restaurer** est réservé aux **propriétaires** (cela touche tout le monde) : le contenu d'une version est remis par une nouvelle modification, diffusée à tous ; l'historique n'est jamais réécrit (C-2). | à valider |
| H-07 | Quand un exemplaire est-il « téléchargé » ? Que veut dire « patienter » ? | **Option B.** Un clic ouvre une page (E-07). Si un exemplaire est libre, il est **réservé** 60 s au visiteur, qui reçoit une adresse de fichier **à usage unique** ; le téléchargement démarre seul. L'exemplaire est **compté** quand le fichier est effectivement demandé avec cette adresse (l'adresse est alors consommée). Réservation non utilisée en 60 s (onglet fermé, téléchargement bloqué) → l'exemplaire **revient dans le stock**. Compté + réservé ≤ N, toujours. Un visiteur dont le téléchargement a échoué peut recliquer sur le lien public : s'il reste des exemplaires, il en obtient un nouveau (c'est un nouveau téléchargement). « **Patienter** » couvre deux cas : (1) tous les exemplaires restants sont réservés mais pas encore récupérés, il peut s'en libérer ; (2) le service est momentanément saturé. Dans les deux cas, la page réessaie seule ; l'ordre de service est celui d'arrivée des demandes, approximativement (pas de file numérotée). | **validée** (option B) |
| H-08 | Que contient le PDF ? | le titre et le texte du document, la date et l'heure de génération, le **numéro de version** (preuve de C-3, voir 06 §1) et le numéro d'exemplaire (BF-20, preuve de C-1) | à valider |
| H-09 | Qui est « l'association » pour le tableau de bord ? | un accès réservé par un **code administrateur** fixé au déploiement et rangé hors du dépôt (ce n'est pas une clé AWS) | à valider |
| H-10 | Qu'est-ce que « s'acharner » ? | un **rédacteur** qui accumule des tentatives refusées (écrire sans crédit, dépasser un débit de requêtes) au-delà d'un seuil dans une courte fenêtre, par exemple 20 refus en 1 minute ; blocage de **15 minutes** par défaut, levé automatiquement. Les **visiteurs** anonymes sont seulement limités en débit, avec des seuils larges : beaucoup partagent une même adresse IP (école, opérateur mobile) et ne doivent pas être bloqués au pic. | à valider |
| H-11 | Forme du lien | une adresse stable, avec un identifiant aléatoire non devinable ; N choisi entre 1 et 10 000. Le lien a un état : **actif** tant qu'il reste des exemplaires, puis **épuisé** (désactivé). Un lien épuisé répond aussitôt « épuisé » à tout clic, y compris aux visiteurs qui patientaient, sans lire le document. | à valider |
| H-12 | Taille et forme d'un document | **mise en forme de base** : titres, gras, italique, souligné, alignement (gauche, centre, droite, justifié), listes à puces et numérotées, rendue aussi dans le PDF ; la mise en forme ne consomme pas de crédit. Taille maximale : 200 000 caractères (environ 80 pages) | **validée** |
| H-14 | Comment se répartissent les 300 rédacteurs du pic (C-5) ? | sur **30 documents de 10 rédacteurs**, plus un essai séparé de **50 rédacteurs au même endroit** pour C-2. 300 personnes dans un même document n'ont pas de sens éditorial et ne sont pas exigées par le sujet | à valider |
| H-13 | « Documents ouverts » sur le tableau de bord | documents où au moins un rédacteur est connecté en ce moment | à valider |

---

## 8. Risques identifiés

| ID | Risque | Effet | Parade envisagée (détaillée en phases 2 et 3) |
|---|---|---|---|
| R-01 | Lecture puis écriture du compteur de téléchargements sans opération atomique | N+1 exemplaires : **échec de C-1** | décrément atomique conditionnel côté base de données |
| R-02 | Un lien de fichier transmis à d'autres personnes | plus de N récupérations réelles du fichier | **adresse de fichier à usage unique** (H-07), vérifiée et consommée par l'application avant de servir le fichier |
| R-03 | Fusion naïve des modifications concurrentes | textes divergents ou pertes : **échec de C-2** | algorithme de fusion éprouvé (choix en phase 2, D-004) |
| R-04 | Génération d'un PDF à chaque clic | saturation et coût au pic | les visiteurs « épuisé » ou « patientez » ne déclenchent aucune génération ; le PDF de base est généré **une fois par état du document** et réutilisé tant que le document ne change pas ; seul le numéro d'exemplaire est ajouté à chaque copie, opération légère |
| R-05 | Quotas réduits d'un compte AWS récent (exécutions simultanées, débit) | refus de requêtes au pic : **échec de C-5** | quota Lambda relevé (400) ; calcul de besoin dans `03-architecture.md` ; une requête refusée pour saturation devient « patientez » côté visiteur, jamais une erreur ; part réservée aux rédacteurs pour que le pic des visiteurs ne les prive pas |
| R-06 | Envoi d'e-mails limité sur un compte neuf (« bac à sable » d'Amazon SES : destinataires vérifiés seulement, 200 e-mails par 24 h) | e-mail de lien épuisé non reçu | un seul e-mail par lien, 200 par jour suffisent ; demander la sortie du bac à sable, sinon vérifier les adresses de démonstration |
| R-07 | Blocage par adresse IP pendant le pic | visiteurs légitimes refusés : **échec de C-5** | ne pas bloquer les visiteurs par IP ; limiter le débit seulement avec des seuils larges |
| R-08 | Usurpation d'identité par e-mail | écriture au nom d'un autre, contournement du crédit en changeant d'e-mail | limite assumée par le sujet ; jeton de session ; détection d'abus par débit |
| R-09 | Dépassement de délai | livrables incomplets | plan de repli : C-1 et C-2 d'abord, l'habillage en dernier |

---

## 9. Hors périmètre

- Vrais comptes, mots de passe, vérification d'e-mail.
- Mise en forme avancée : images, tableaux, couleurs, polices (H-12 limite à la mise en forme de base).
- Validation des modifications par un propriétaire avant qu'elles soient visibles (mode « suggestion ») : contraire à C-2, qui veut que tous voient le même document, et à C-3, qui veut le document tel qu'il est au moment du clic. Le contrôle du propriétaire passe par les accès (qui peut écrire) et la restauration.
- Application mobile native ; seul le navigateur est visé.
- Plusieurs régions, nom de domaine personnalisé.
- Modération du contenu, commentaires, e-mails autres que celui du lien épuisé.
