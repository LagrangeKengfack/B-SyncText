/* Bascule entre les états d'un écran. Seul JavaScript des maquettes.
   - un bouton [data-etat-bouton="x"] choisit l'état x ;
   - un élément [data-etats="x y"] n'est visible que dans les états x et y ;
   - un élément [data-desactive-si="x"] est désactivé (ou en lecture seule) dans l'état x ;
   - l'état choisi est gardé dans l'adresse (#x), ce qui permet de lier directement un état. */
(function () {
  var boutons = document.querySelectorAll("[data-etat-bouton]");
  if (!boutons.length) return;

  function choisir(etat) {
    document.body.setAttribute("data-etat", etat);
    boutons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-etat-bouton") === etat));
    });
    document.querySelectorAll("[data-etats]").forEach(function (el) {
      el.hidden = el.getAttribute("data-etats").split(" ").indexOf(etat) < 0;
    });
    document.querySelectorAll("[data-desactive-si]").forEach(function (el) {
      var actif = el.getAttribute("data-desactive-si").split(" ").indexOf(etat) >= 0;
      if ("disabled" in el) el.disabled = actif; else el.setAttribute("aria-readonly", String(actif));
    });
    if (window.history && history.replaceState) history.replaceState(null, "", "#" + etat);
  }

  boutons.forEach(function (b) {
    b.addEventListener("click", function () { choisir(b.getAttribute("data-etat-bouton")); });
  });

  var depart = location.hash.slice(1);
  var existe = depart && document.querySelector('[data-etat-bouton="' + depart + '"]');
  choisir(existe ? depart : boutons[0].getAttribute("data-etat-bouton"));

  window.addEventListener("hashchange", function () {
    var e = location.hash.slice(1);
    if (document.querySelector('[data-etat-bouton="' + e + '"]')) choisir(e);
  });
})();
