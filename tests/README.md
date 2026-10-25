# Tests de concurrence et de charge

Installation : `npm install` à la racine de `B-SyncText` (paquet `tests`). Node 22. Toutes les commandes se lancent depuis `tests/`, avec `BASE_URL=https://xxxx.cloudfront.net`.
Chaque script écrit `docs/tests/resultats/<test>-<date>.json` (données brutes + verdict). `--help` liste les options.

- T-01 (C-1) : `node concurrence/t01-c1.mjs --n 1,500 --m 1000 --repetitions 5`
- T-02 (C-1, remise en stock) : `node concurrence/t02-remise-en-stock.mjs`
- T-03 (C-2) : `node concurrence/t03-c2.mjs --clients 50 --duree 60 --redemarrer-a 30` (redémarrer le serveur d'édition à la main par SSM quand le script l'indique)
- T-04 (C-3) : `node concurrence/t04-c3.mjs`
- T-05 (C-4) : `node concurrence/t05-c4.mjs`
- T-06/T-07 (C-5, C-6), créer d'abord un lien de 500 (`LIEN_ID`) : `k6 run -e BASE_URL=$BASE_URL -e LIEN_ID=<id> --summary-export=../docs/tests/resultats/t06-resume.json charge/t06-pic.js`
- Rédacteurs pendant T-06 (autre terminal, même moment) : `node charge/redacteurs.mjs --duree 240`
