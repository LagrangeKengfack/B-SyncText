# 07 — Identité et interfaces

> **Statut :** brouillon · **Date :** 25/10/2026 · **Auteur :** Kengfack Tsafack Bernice Lagrange · **Alimente :** livrable 2 (dossier de conception), livrable 6 (présentation)

Ce document décrit l'**identité** de l'application (nom, logo, charte graphique). Les **maquettes d'écrans** (E-xx) sont décrites en section 9. Les variables réutilisables par le front sont dans [`../assets/charte.css`](../assets/charte.css) ; ce document en donne les raisons.

---

## 1. Nom

**B-SyncText** se prononce « bi-sinc-tèxt ».

- **B** : l'initiale de l'auteur, gardée du nom de travail précédent (BLédit, puis BLEdit).
- **Sync** et **Text** : la synchronisation en temps réel et le texte, les deux promesses de l'application.
- Écriture : « B-SyncText » avec **B**, **S** et **T** en capitales et un trait d'union après le B. Jamais « BSyncText », « Bsynctext » ni « B-Synctext ».
- Slogan : « Créez sans effort. Modifiez en temps réel. Synchronisez en un instant. » Il s'écrit en italique et en petits caractères sous le nom (E-01).

Aucune vérification de marque déposée ni de nom de domaine n'a été faite pour ce nom : sans objet pour un projet d'évaluation. Noms écartés : voir la section 8.

---

## 2. Logo

### 2.1 Logo retenu : l'option 6

L'auteur a fourni une planche de neuf propositions et a retenu l'**option 6**, redessinée en SVG propre sous forme d'**icône d'application** (tuile aux coins arrondis) : une **feuille à coin plié avec des lignes de texte**, un **curseur** corail, et **six personnes autour** (les rédacteurs). La bulle de dialogue de la planche, qui faisait « message », est remplacée par la feuille. Les options 5 et 9 ont été écartées et leurs fichiers supprimés.

| Fichier (`docs/assets/`) | Usage |
|---|---|
| `logo-clair.svg` | thème clair, à partir de 56 px (écran d'entrée, présentation) |
| `logo-sombre.svg` | thème sombre ou fond foncé |
| `favicon.svg` | onglet du navigateur et en-têtes (16 à 40 px) : feuille et curseur seuls, traits épaissis, car avec les six personnes le dessin devient illisible en petit |

### 2.2 Couleurs

| Élément | Thème clair | Thème sombre |
|---|---|---|
| Tuile | blanc `#FFFFFF`, liseré `#E4DEF3` | violet 950 `#1E1040` |
| Tracé | violet de marque `#5A31B0` | blanc |
| Curseur et flèches | corail `#F97B5C` | corail clair `#FF8A63` |
| Favicon | tuile `#5A31B0`, tracé blanc, curseur `#F97B5C` | — |

Le corail du logo est celui des planches de l'auteur, un peu plus clair que `--accent` (`#E4572E`) de l'interface. Un logo n'est pas soumis aux règles de contraste du texte ; l'interface, elle, garde `--accent`.

### 2.3 Règles d'usage

- **Zone de protection** : au moins un dixième de la largeur de la tuile libre de tout côté.
- **Taille minimale** : 16 px pour `favicon.svg` ; 56 px pour les logos complets.
- À côté du logo, le nom s'écrit « B-SyncText » en Manrope 800.
- Ne pas : déformer, pivoter, ajouter une ombre, recolorer le curseur en une couleur d'état (vert, rouge, jaune).
- Sur fond clair, utiliser les versions `-clair` ; sur `--violet-950` ou un fond foncé, les versions `-sombre`.

---

## 3. Palette

Un **violet** unique et ses nuances, un **accent corail** pour le curseur, des **neutres teintés de violet**. Tous les rapports de contraste sont **calculés** (formule WCAG 2.1) ; l'objectif est le niveau **AA** : 4,5:1 pour le texte courant, 3:1 pour le grand texte et pour les éléments d'interface (contours de champ, icônes).

### 3.1 Échelle violette

| Jeton | Code | Rôle principal | Contraste avec le blanc |
|---|---|---|---|
| `--violet-50` | `#F6F2FE` | fond de panneau, survol discret | — |
| `--violet-100` | `#ECE4FD` | fond d'information | — |
| `--violet-200` | `#DACBFA` | séparateur, sélection | — |
| `--violet-300` | `#C0A6F5` | liens et symbole en thème sombre | — |
| `--violet-400` | `#A27EEE` | focus en thème sombre | — |
| `--violet-500` | `#8559E3` | anneau de focus | 4,63:1 |
| `--violet-600` | `#6B3FCF` | survol discret, graphiques | 6,49:1 |
| **`--violet-700`** | **`#5A31B0`** | **couleur de marque : bouton principal, liens, logo** (celle du favicon) | **8,40:1** |
| `--violet-800` | `#47278A` | bouton au survol | 10,91:1 |
| `--violet-900` | `#341C63` | titres sur fond clair | — |
| `--violet-950` | `#1E1040` | fond de bandeau, diapositives | — |

### 3.2 Accent et neutres (thème clair)

| Jeton | Code | Contraste | Remarque |
|---|---|---|---|
| `--accent` | `#E4572E` | 3,68:1 sur blanc | pour le **curseur du logo et les éléments graphiques** (3:1 suffit) ; jamais pour du texte |
| `--accent-texte` | `#C2410C` | 5,18:1 sur blanc | si l'accent doit servir de texte |
| `--fond` | `#FBFAFE` | — | fond de page |
| `--surface` | `#FFFFFF` | — | cartes, champs |
| `--texte` | `#1B1630` | **16,78:1** sur `--fond` | texte principal |
| `--texte-doux` | `#5B5473` | **6,83:1** sur `--fond` | texte secondaire, aides |
| `--bordure-champ` | `#7A7295` | **4,33:1** sur `--fond` | contour des champs et des boutons secondaires |
| `--bordure` | `#D9D3E8` | décoratif | séparateurs ; non porteur d'information |
| `--lien` | `#5A31B0` | **8,08:1** sur `--fond` | liens |

### 3.3 États

L'application dit à chaque visiteur s'il télécharge, s'il patiente ou si le lien est épuisé (C-5, C-6) : ces états sont **la partie la plus importante de la charte**. Chacun a un couple texte/fond, **tous supérieurs à 4,5:1**, et un **mot et une icône** : la couleur n'est jamais le seul porteur de l'information.

| État | Usage | Texte | Fond | Contraste | Icône suggérée |
|---|---|---|---|---|---|
| **Succès** | « Votre téléchargement démarre », enregistré | `#0F6B3C` | `#E3F5EA` | 5,81:1 | coche |
| **Attente** | « Patientez, vous êtes en file » | `#7A4A00` | `#FFF1D6` | 6,70:1 | sablier |
| **Erreur** | refus, crédit insuffisant, échec | `#B3261E` | `#FDE8E6` | 5,56:1 | point d'exclamation |
| **Épuisé** | « Ce lien n'a plus d'exemplaire » | `#4B4560` | `#EBE8F2` | 7,48:1 | cercle barré |
| **Information** | bloqué temporairement, indication | `#5A31B0` | `#ECE4FD` | 6,83:1 | « i » |

Choix délibéré : **« Épuisé » n'est pas rouge**. Ce n'est pas une panne, c'est un état normal et définitif. Il est gris-violet, neutre, pour ne pas ressembler à une erreur du service. Le rouge est réservé aux refus et aux erreurs.

### 3.4 Présence des rédacteurs

Huit couleurs, une par rédacteur connecté dans un document, toutes à **au moins 5:1 sur blanc** pour que le nom au-dessus du curseur reste lisible : `#6B3FCF`, `#C2410C`, `#0F7A5A`, `#1D63C9`, `#B0206F`, `#8A6100`, `#007A8A`, `#5B5473` (jetons `--presence-1` à `--presence-8`). Au-delà de huit rédacteurs, les couleurs se répètent : le **nom** distingue les personnes, pas la couleur seule.

### 3.5 Thème sombre (optionnel)

Le **thème clair passe d'abord** : toutes les maquettes sont en thème clair (D-010). Le thème sombre n'est fait que s'il reste du temps. Il est raisonnable et peu coûteux ici : il repose sur les mêmes jetons, redéfinis dans `charte.css`. Il suit le système (`prefers-color-scheme`) et peut être forcé avec `data-theme="dark"` ou `"light"` sur `<html>`.

| Jeton | Sombre | Contraste |
|---|---|---|
| `--fond` | `#14101F` | — |
| `--surface` | `#1D1830` | — |
| `--texte` | `#EDE9F7` | 15,66:1 sur le fond ; 14,36:1 sur la surface |
| `--texte-doux` | `#B0A8C8` | 8,26:1 ; 7,57:1 |
| `--lien` | `#C0A6F5` | 8,91:1 |
| `--bordure-champ` | `#948CB0` | 5,91:1 ; 5,42:1 |
| `--bouton-fond` (texte blanc) | `#7B4FE0` | 5,20:1 |
| `--accent` | `#FF8A63` | 8,07:1 |

Les états passent en **texte clair sur fond foncé teinté** (par exemple succès `#6FD9A0` sur `#12301F`, 8,25:1 ; erreur `#FF9C94` sur `#3D1512`, 7,94:1). Les huit couleurs de présence sont éclaircies (8,03:1 au moins sur le fond sombre). Les valeurs complètes sont dans `charte.css`.

---

## 4. Typographie

Deux familles, libres (licence SIL OFL), **auto-hébergées** : aucun appel à un service externe (confidentialité, disponibilité pendant le pic, aucune dépendance).

| Rôle | Famille | Poids | Pourquoi |
|---|---|---|---|
| **Interface et titres** | **Manrope** | 400 à 800 (variable) | géométrique, chaleureuse, très lisible petit ; caractère propre aux titres en 800 ; accents français bien dessinés |
| **Texte du document** | **Source Serif 4** | 400 à 700 (variable) | une serif pour la lecture longue : le texte qu'on écrit se distingue de l'interface ; son rendu est proche du PDF final |
| Identifiants et codes | pile monospace du système (`ui-monospace`) | — | aucune police à charger |

Fichiers attendus dans `docs/assets/fonts/` (puis copiés dans `src/`) : `manrope-variable.woff2` et `source-serif-4-variable.woff2`. **Ces fichiers ne sont pas encore dans le dépôt** : à télécharger depuis les paquets Fontsource (`@fontsource-variable/manrope`, `@fontsource-variable/source-serif-4`) ou leur dépôt officiel. Limiter au sous-ensemble latin pour rester sous 100 Ko chacun. En attendant, les piles de secours (`system-ui`, `Georgia`) s'appliquent sans casser la mise en page.

Échelle (base 16 px) :

| Jeton | Taille | Usage |
|---|---|---|
| `--t-xs` | 13 px | légendes, aides de champ |
| `--t-sm` | 15 px | texte secondaire, étiquettes d'état |
| `--t-base` | 16 px | interface |
| `--t-texte` | 18 px | **texte du document** (interligne 1,65) |
| `--t-lg` | 20 px | titre de section (h3) |
| `--t-xl` | 26 px | titre de page (h2) |
| `--t-2xl` | 34 px | titre principal (h1) |

Règles : interligne 1,5 pour l'interface ; ligne de texte du document limitée à **70 caractères** environ ; aucun texte courant sous 13 px ; ne pas utiliser le poids 400 de Manrope pour les titres.

---

## 5. Espacements, rayons, ombres

**Espacement** : base de **4 px**, huit pas (`--e-1` à `--e-8` : 4, 8, 12, 16, 24, 32, 48, 64). Un écran utilise ces pas et aucune autre valeur. Marge latérale de page : 16 px sur téléphone, 24 px et plus ailleurs (pas de défilement horizontal, BNF-14).

**Rayons** : sobres, pas de formes très rondes sauf les étiquettes.

| Jeton | Valeur | Usage |
|---|---|---|
| `--rayon-s` | 6 px | champs |
| `--rayon-m` | 10 px | boutons, cartes |
| `--rayon-l` | 16 px | fenêtres et panneaux |
| `--rayon-pilule` | 999 px | étiquettes d'état |

**Ombres** : une ombre légère (`--ombre-1`) pour les cartes, une plus marquée (`--ombre-2`) pour les fenêtres qui flottent. Pas d'autre ombre.

**Mouvement** : transitions de 150 ms ; supprimées si le système demande de réduire les animations.

---

## 6. Composants de base

Définis dans `charte.css` (classes `.bouton`, `.champ`, `.carte`, `.etat`).

### 6.1 Boutons
- **Principal** (`.bouton--principal`) : fond violet 700, texte blanc (8,40:1), survol violet 800, enfoncé violet 900. **Un seul par zone**.
- **Secondaire** (`.bouton--secondaire`) : transparent, contour `--bordure-champ` de 2 px, texte `--lien`.
- **Danger** (`.bouton--danger`) : fond d'erreur clair, texte rouge ; pour la restauration d'une version ou le blocage d'un rédacteur.
- Hauteur minimale **44 px** (zone tactile), rayon 10 px, texte en Manrope 700. Désactivé : opacité 50 %, curseur interdit, `aria-disabled`.
- Le texte d'un bouton est un **verbe** : « Créer le lien », « Restaurer cette version », « Télécharger le PDF ».

### 6.2 Champs
- Hauteur 44 px, contour **2 px** à 4,33:1 (au-dessus des 3:1 exigés), rayon 6 px, fond `--surface`.
- L'**étiquette est toujours visible** au-dessus du champ (jamais un simple texte indicatif qui disparaît).
- **Focus** : anneau de 3 px (`--focus`). **Erreur** : contour rouge **et** message en dessous, en gras (jamais la couleur seule).
- L'aide (`.champ__aide`) précise le format ; exemple pour le nombre de téléchargements : « Entre 1 et 10 000 ».

### 6.3 États d'un lien de téléchargement
Les cinq états de la section 3.3 sont des **étiquettes** (`.etat--succes`, `--attente`, `--erreur`, `--epuise`, `--info`) : un mot, une icône, une couleur de fond. Un état est toujours accompagné d'une **phrase complète** dite au visiteur, jamais d'un code seul.

### 6.4 Crédit d'écriture
Barre de progression de 8 px en violet 600 sur fond `--violet-100`, avec le **chiffre** (« 7 240 / 10 000 caractères »). Sous 10 % restant : la barre passe au rouge d'erreur et le message l'indique en toutes lettres.

---

## 7. Accessibilité (rappel de ce qui est vérifié)

- Contrastes AA calculés pour tous les couples texte/fond de la charte, clairs et sombres. Les valeurs de ce document sont celles de `charte.css`.
- Éléments d'interface (contours, icônes) à 3:1 minimum.
- **Aucune information portée par la seule couleur** : mot, icône ou nom à côté.
- Focus visible partout, zones tactiles de 44 px, mouvements réduits respectés.
- À faire au moment des maquettes et de l'implémentation : vérifier le contraste réel des écrans finis avec un outil automatique, naviguer au clavier, tester à 200 % de zoom.

Limite assumée : la charte ne couvre pas le texte placé sur une image, ni les couleurs choisies par le navigateur pour les contrôles natifs.

---

## 8. Choix et alternatives écartées

Reporté dans `docs/DECISIONS.md` (D-010).

| Sujet | Choix | Alternative écartée | Raison |
|---|---|---|---|
| Nom | **B-SyncText** (initialement BLEdit, puis BLédit) | Lagrafe, Bernote, Paginice, Plumange, Verbice, Bernédit, Lagrature, Lagomme, Rédange, Corrice ; au premier tour Chorale, Encrier, Cordée, Marge, Lagrange | choix de l'auteur : initiales de l'auteur et mot « édit », proche du nom de travail |
| Logo | option 6 de la planche de l'auteur, redessinée en SVG | monogramme B et L (nom BLédit) ; options 1 à 5, 7 à 9 | choix de l'auteur ; l'option 6 a une feuille à la place de la bulle |
| Couleur de marque | violet `#5A31B0` (`--violet-700`, celui du favicon) | `#6B3FCF` (`--violet-600`) | choix de l'auteur, qui préfère ce violet ; il est en fait plus foncé, donc plus contrasté (8,40:1 avec le blanc) |
| Accent | corail `#E4572E`, réservé au curseur | un second violet ; le vert | contraste chaud avec le violet, rappelle le curseur de présence |
| Polices | Manrope et Source Serif 4, auto-hébergées | Inter ; polices Google Fonts en ligne | pas d'appel externe, serif pour la lecture du document |
| « Épuisé » | gris-violet neutre | rouge | un lien épuisé est un état normal, pas une panne |
| Thème sombre | inclus | thème clair seul | coût faible : mêmes jetons, valeurs redéfinies |

---

## 9. Maquettes

Les maquettes ont été **vérifiées à l'œil** dans un navigateur (ordinateur 1366 px et téléphone 390 px) pour E-01, E-02 et E-03. Maquettes **statiques en HTML et CSS**, en **thème clair**, dans [`../assets/maquettes/`](../assets/maquettes/index.html). Elles s'appuient sur `charte.css` et sur un petit `maquettes.css` ; la seule part de JavaScript sert à basculer entre les états d'un écran (boutons en haut de page ; `#etat` dans l'adresse pour ouvrir un état précis). Chaque page est lisible sur ordinateur et sur téléphone. Le front retenu est **React + Vite + Tiptap** : les classes (`.bouton`, `.champ`, `.bandeau`, `.etat`, `.fenetre`, `.outil`, `.feuille`…) sont simples pour être reprises telles quelles en composants.

Ouvrir `docs/assets/maquettes/index.html` dans un navigateur : c'est le point d'entrée.

| Écran | Maquette | États dessinés | UC |
|---|---|---|---|
| E-01 Entrée | [e-01-entree.html](../assets/maquettes/e-01-entree.html) | normal ; e-mail invalide ; arrivée par invitation ; invitation expirée | UC-01, UC-03 |
| E-02 Mes documents | [e-02-mes-documents.html](../assets/maquettes/e-02-mes-documents.html) | liste remplie ; liste vide | UC-02, UC-04, UC-07 |
| E-03 Éditeur | [e-03-editeur.html](../assets/maquettes/e-03-editeur.html) | normal à plusieurs ; crédit faible ; insertion refusée (crédit) ; hors ligne ; rédacteur bloqué ; aperçu d'une version (propriétaire) ; aperçu (membre) ; confirmation de restauration | UC-05, UC-06, UC-07 |
| E-04 Partager | [e-04-partager.html](../assets/maquettes/e-04-partager.html) | normal ; e-mail invalide ; dernier propriétaire ; lien régénéré | UC-03 |
| E-05 Historique | [e-05-historique.html](../assets/maquettes/e-05-historique.html) | version téléphone du panneau d'historique : liste ; aperçu (propriétaire) ; aperçu (membre) ; confirmation | UC-08, UC-09 |
| E-06 Liens | [e-06-liens.html](../assets/maquettes/e-06-liens.html) | création ; lien créé ; lien épuisé | UC-10 |
| E-07 Téléchargement public | [e-07-telechargement.html](../assets/maquettes/e-07-telechargement.html) | exemplaire prêt ; patientez ; épuisé ; lien introuvable | UC-11 |
| E-08 Accès association | [e-08-acces-association.html](../assets/maquettes/e-08-acces-association.html) | normal ; code faux | UC-13 |
| E-09 Tableau de bord | [e-09-tableau-de-bord.html](../assets/maquettes/e-09-tableau-de-bord.html) | normal ; blocs vides | UC-13 |
| E-10 Messages transverses | [e-10-messages.html](../assets/maquettes/e-10-messages.html) | crédit épuisé ; rédacteur bloqué ; connexion perdue | UC-05, UC-15 |
| E-11 E-mail « lien épuisé » | [e-11-courriel-epuise.html](../assets/maquettes/e-11-courriel-epuise.html) | un seul état | UC-12 |

E-12 (e-mail d'invitation) est supprimé : aucun e-mail d'invitation n'est envoyé.

### 9.1 Choix d'ergonomie

**Éditeur (E-03).**
- **L'historique est toujours visible**, dans une colonne à gauche du document (300 px). On y crée une version et, pour un propriétaire, on restaure sans ouvrir de fenêtre. Sur téléphone, la colonne passe sous le document.
- **Numéros de version** : chaque version porte un préfixe `v1`, `v2`, `v3`… suivi du nom donné (« v3 — Avant relecture finale »). Une version **créée à la main** prend le numéro entier suivant ; les versions **automatiques** prises entre deux versions manuelles prennent un numéro décimal (v3.1, v3.2) et le nom « Automatique ». Une restauration crée une nouvelle version entière nommée « Restauration de vN ». Le formulaire annonce le numéro à venir (« sera numérotée v4 »). **Ce numéro figure sur le PDF** (preuve de C-3).
- Cliquer sur une version ouvre son **aperçu en lecture seule** dans la zone de texte, avec un bandeau et un lien « Revenir à la version actuelle » ; la barre de mise en forme est grisée. « Restaurer vN » (bouton de danger) n'apparaît que pour les propriétaires, avec une confirmation qui rappelle que rien n'est perdu ; un membre voit une explication.
- Les quatre zones du reste se lisent dans l'ordre : titre et état d'enregistrement, présents et actions, barre de mise en forme, texte. Le **crédit** est collé en bas de l'écran, toujours visible pendant la frappe.
- La barre de mise en forme regroupe : style de paragraphe (paragraphe, titres 1 à 3), gras, italique, souligné, alignement (gauche, centre, droite, justifié), listes à puces et numérotées. Chaque bouton a un nom accessible et un état « enfoncé » (`aria-pressed`). Elle défile à l'horizontale sur téléphone.
- L'indicateur d'enregistrement a trois états lisibles par le mot et l'icône : « Enregistré », « Synchronisation… », « Hors ligne ». Il ne dit « Enregistré » que quand le serveur a accepté la modification (UC-05).
- **Insertion refusée** : la zone refusée s'affiche à l'endroit du collage, en pointillés rouges, avec le nombre de caractères, le crédit restant et l'heure de recharge ; rien n'est inséré à moitié (H-04). On rappelle que supprimer reste possible.
- Les curseurs des autres sont des barres colorées avec le **nom** au-dessus ; les pastilles de présence reprennent la même couleur. La couleur ne porte jamais seule l'identité.
- **Bloqué** : lecture seule (barre grisée, texte non éditable), message d'heure de fin ; le rédacteur voit toujours les autres écrire.

**Page de téléchargement (E-07).**
- **Un seul grand état** au centre, avec une grande icône, un titre d'une phrase et une explication. Aucun champ, aucune identité demandée.
- « Exemplaire prêt » montre le numéro (« 137 / 500 »), annonce que le téléchargement démarre tout seul et garde un **bouton « Télécharger le PDF » de secours**. « Patientez » ne promet pas de position dans la file : il dit de **garder la page ouverte**, qu'elle réessaie toute seule, et montre une barre animée qui s'arrête si le mouvement est réduit. « Épuisé » est neutre (gris-violet), s'excuse et dit quoi faire ; « Lien introuvable » est la seule page d'erreur.
- L'état est annoncé aux lecteurs d'écran (`role="status"`). Page conçue pour le téléphone d'abord : un visiteur de la parution y arrive depuis un message.

**Entrée (E-01 et E-08).** Fond en **dégradé doux** de la palette (violet clair vers un corail très pâle, `--accent-doux`), repris sur E-08 ; le slogan est en italique et en petits caractères. Deux champs, un bouton. « Entrer » reste inactif tant que l'e-mail est invalide, et l'erreur est écrite sous le champ avec un exemple. L'arrivée par invitation nomme le document et la personne qui invite, et le bouton devient « Entrer et rejoindre ». Une invitation expirée n'empêche pas d'entrer : elle dit qui prévenir.

**Mes documents (E-02).** La page occupe la largeur de l'écran (jusqu'à 1200 px) et affiche les documents sur **deux colonnes** dès 1100 px, une seule en dessous. Le crédit et l'heure de recharge sont dans l'en-tête. Chaque carte montre le titre (le lien principal), **« Créé par »** (le propriétaire principal, repéré par l'étiquette « vous » quand c'est soi), **« Modifié … par »** (le **dernier éditeur**) et le nombre de connectés. L'ancienne couronne, ambiguë, est supprimée. Liste vide : une phrase et un bouton « Créer mon premier document ».

**Partager (E-04).** Deux manières d'inviter : par e-mail, ou par **lien d'invitation** (Copier, Régénérer) pour inviter beaucoup de monde. Les rôles (principal, propriétaire, membre) sont des étiquettes ; seules les actions permises sont proposées. « Renoncer à mon rôle » est grisé avec une explication quand on est le dernier propriétaire.

**Historique (E-05).** Sur ordinateur, l'historique est la colonne de gauche de E-03. E-05 montre le **même contenu en panneau plein écran**, pour le téléphone : mêmes numéros de version, mêmes règles de restauration.

**Liens (E-06).** Un champ numérique (1 à 10 000) et un bouton. L'adresse créée s'affiche avec « Copier » ; la liste montre pour chaque lien les téléchargements restants sur le total, une barre, et l'étiquette « Presque épuisé » ou « Épuisé ».

**Tableau de bord (E-09).** Trois tuiles de synthèse, puis trois blocs (documents ouverts, liens actifs avec barre de ce qui reste, personnes bloquées avec motif et fin). L'heure de dernière mise à jour est toujours visible. Sur téléphone, les tableaux deviennent des cartes. Lecture seule.

**Principes communs.**
- Les messages s'adressent à la personne (« Il vous reste 312 caractères »), jamais un code seul.
- Une étiquette d'état porte toujours un mot et une icône.
- Un seul bouton principal par zone ; les boutons ont une hauteur de 44 px.
- Les fenêtres (E-04, E-06) deviennent plein écran sur téléphone ; le panneau d'historique prend toute la largeur.
- Les données fictives (Camille, Idriss, Sarah, Amina ; « Le Bulletin — Octobre 2026 ») sont les mêmes d'un écran à l'autre pour que les captures du PowerPoint se raccordent.

### 9.2 Limites des maquettes
- Vérifiées à l'œil : E-01, E-02 et E-03. Les autres écrans ont seulement passé un contrôle par script (balises, identifiants, classes, liens, états) ; à regarder à 1200 px et à 375 px avant d'en tirer des captures.
- Les polices Manrope et Source Serif 4 ne sont pas encore dans le dépôt ; sans elles, les piles de secours s'appliquent et les largeurs changent un peu.
- Le **thème sombre** n'est pas dessiné (D-010).
- Les interactions réelles (Tiptap, temps réel, copie dans le presse-papiers) ne sont pas simulées : seule la bascule entre états l'est.
- Le logo complet (option 6) est détaillé : il se lit mal sous 56 px, d'où le favicon réduit dans les en-têtes.
