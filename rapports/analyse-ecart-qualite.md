# Analyse d'écart — rapport professionnel vs rapport généré par l'app

Comparaison entre `Rapport d'inspection 2980 Rue Albert-Lachance, Lévis.pdf` (Sébastien
Morneau, Inspection DMI, membre AIBQ — 36 pages, Home Inspector Pro) et
`rapport-4a2dae05-....pdf` (généré par cette app — 39 pages, même propriété). Les deux
couvrent la même inspection réelle, ce qui rend la comparaison directe.

## Ce que le rapport pro fait et que le nôtre ne fait pas

| Écart | Rapport pro | Rapport app | Impact |
|---|---|---|---|
| **Couverture exhaustive** | Chaque composant du bâtiment a sa propre entrée, même "Adéquat, aucune anomalie" (portes, robinets, éclairage, etc. — ~150 entrées) | Seulement les photos où l'IA a détecté une anomalie apparaissent — rien n'atteste ce qui a été vérifié et jugé correct | Un rapport qui ne liste que les problèmes donne l'impression d'un survol incomplet, même quand l'analyse était en fait approfondie. C'est aussi une protection légale pour l'inspecteur ("j'ai vérifié X, c'était correct") |
| **États "non inspecté" / "inspection limitée"** | Icônes dédiées + texte type "Examen impossible en raison de l'entreposage de biens personnels" sur presque chaque section | Aucune notion — l'IA ne voit que ce qui est sur la photo et ne peut pas signaler "ceci n'a pas pu être vérifié" | Sans ça, le rapport ne peut pas couvrir légalement les limites de l'inspection (accès, biens personnels, hauteur du toit, etc.) |
| **Résumé des priorités** | Page finale "Récapitulatif des éléments prioritaires" : seulement les items Prioritaire (rouge), avec page de référence | Aucun résumé — les 2 anomalies "critique"/"majeure" à retenir sont noyées dans 93 constats | Le client (et l'inspecteur en révision) doit tout lire pour trouver ce qui compte vraiment |
| **Déduplication / regroupement** | Une observation = un constat, même si plusieurs photos le documentent | Chaque photo génère 2-4 constats séparés qui décrivent souvent la même chose sous des angles différents ("isolant_endommage" + "ventilation" + "autre" sur une même zone) | 93 anomalies pour ~15-20 problèmes réels distincts dans le comble — le volume nuit à la lisibilité et dilue les vrais points prioritaires |
| **Avis au lecteur / méthodologie** | Page complète en avant-propos : norme AIBQ, limites de l'inspection visuelle, non-exhaustivité, recommandation de faire appel à des spécialistes, légende des icônes, convention avant/arrière/côtés | Une seule ligne en bas de la dernière page | Exposition légale — le rapport pro pose clairement le cadre de responsabilité avant même la première observation |
| **Métadonnées d'intake** | Participants, occupation, dimensions, année de construction, météo, température, sources d'énergie, déclaration du vendeur résumée | Adresse + type de section seulement | Contextualise chaque anomalie (ex: "fissure de moins de 2mm" jugée différemment selon l'âge du bâtiment) et documente les conditions de l'inspection elle-même |
| **Traçabilité inspecteur** | Nom, # de membre AIBQ, coordonnées sur chaque page (en-tête) | Nom + certification uniquement sur la page de garde | Mineur, mais cohérent avec la valeur légale du document |
| **Méthode d'inspection par section** | "Observé à partir du niveau du terrain" / "accédé par la trappe du garde-manger" / caméra FLIR modèle précisé | Aucune | Autre angle de protection légale + transparence sur la rigueur de l'inspection |

## Ce que notre IA fait déjà bien (à ne pas perdre en corrigeant le reste)

- **Précision technique par constat** : nos recommandations citent des normes concrètes
  ("R-41 à R-60 selon le Code de construction du Québec", "pente de 2 % sur 1,5 m",
  "150-300 mm du plancher") — souvent plus spécifique que le texte du rapport pro, qui
  reste parfois générique ("faites corriger").
- **Localisation visuelle** : les flèches/encadrés jaunes sur les photos sont au même
  niveau de qualité que le rapport pro.
- **Ton factuel, pas d'invention** : conforme au system prompt (pas de sur-estimation ni
  sous-estimation), cohérent avec l'exigence déjà posée dans le readme.

Le gap n'est donc pas la qualité du jugement technique ponctuel de l'IA — il est
structurel : **couverture, hiérarchisation et cadrage légal du rapport dans son
ensemble.**

## Recommandations, par effort/impact

### P0 — fait maintenant (cette session)

1. **Récapitulatif des priorités** — nouvelle section en tête du PDF listant uniquement
   les constats `majeure`/`critique`, groupés par section. Zéro changement d'IA ou de
   schéma : les données existent déjà (`anomaly_detections.anomalies`), c'est une
   requête + un bloc de template.
2. **Avis au lecteur** — bloc de méthodologie/limites en page 1, adapté honnêtement à
   notre contexte (analyse assistée par IA, révisée par l'inspecteur avant remise —
   contrairement au rapport pro, on ne peut pas prétendre à une inspection 100 %
   humaine composant par composant). Texte statique, aucun changement de code au-delà
   du template.

### P1 — prochaine itération (nécessite une discussion de priorité)

3. **États "non inspecté" / "accès limité"** — étendre `ANOMALY_SCHEMA`
   ([claude_client.py](../backend/app/claude_client.py)) avec un champ optionnel
   `limitation` par photo (ex: "Zone non visible en raison de l'entreposage") que
   Claude peut renseigner quand une photo montre une inspection incomplète plutôt
   qu'une anomalie. Affecte le prompt IA et le schéma JSON — impact sur toutes les
   futures analyses, à valider avant de changer.
4. **Déduplication des constats** — soit resserrer le system prompt
   ("un seul constat par défaut réel, ne pas répéter sous plusieurs angles"), soit
   ajouter un passage de fusion post-traitement dans le worker qui regroupe les
   constats très similaires d'une même section avant de les envoyer en révision.
   Impact direct sur le coût (tokens) et le comportement de l'IA pour toutes les
   inspections — à tester sur un jeu de photos avant de généraliser.
5. **Métadonnées d'intake enrichies** — champs structurés à l'écran "Nouvelle
   inspection" (année de construction, météo, participants, etc.), affichés en page
   de garde du PDF comme le rapport pro. Changement de schéma (`inspections`) +
   formulaire frontend.

### P2 — structurel, lié à la feuille de route

6. **Modèle de couverture complète par composant** (checklist "vérifié même si bon")
   — recoupe directement la métrique "écart IA vs révision inspecteur" déjà proposée
   dans [ROADMAP.md](../ROADMAP.md#phase-3--métriques-à-valeur-ajoutée-contexte-québec).
   C'est un changement de modèle de données plus large (une section peut être "couverte"
   sans qu'aucune photo n'y montre d'anomalie) — à traiter comme un chantier à part,
   pas un correctif ponctuel.

## Ce qui reste un choix produit, pas un bug

Le rapport pro liste ~150 items vérifiés pour se protéger légalement et démontrer
l'exhaustivité de la visite terrain. Reproduire ça à l'identique demanderait que l'app
sache ce qu'elle *n'a pas* photographié — ce qui dépend entièrement de la discipline de
capture de l'inspecteur sur le terrain, pas seulement du prompt IA. Le point P2 ci-dessus
adresse ça, mais il faut être honnête : sans changer le flux de capture (forcer une photo
par composant du checklist plutôt que "autant de photos que vous voulez"), on ne pourra
jamais légitimement prétendre à la même exhaustivité qu'un inspecteur humain qui suit une
liste de vérification fixe.
