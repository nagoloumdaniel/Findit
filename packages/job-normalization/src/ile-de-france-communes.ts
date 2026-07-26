import type { IleDeFranceDepartment } from "@findit/shared";

/*
 * Table générée par `generate-communes.mjs` le 2026-07-17,
 * depuis geo.api.gouv.fr - l'API officielle du découpage administratif français.
 * Ne pas modifier à la main : rejouer le script.
 *
 * 1262 communes, dont 4 dont le nom est porté par
 * deux départements d'Île-de-France. Celles-là valent `AMBIGUOUS` : le libellé
 * d'une offre ne suffit pas à les départager, et deviner le département
 * reviendrait à inventer la localisation.
 *
 * La clé est le nom normalisé - sans accent, sans apostrophe, sans tiret - parce
 * que les offres écrivent « Boulogne-Billancourt », « Boulogne Billancourt » et
 * « boulogne billancourt » pour la même ville.
 */
export type CommuneDepartment = IleDeFranceDepartment | "AMBIGUOUS";

export const ILE_DE_FRANCE_COMMUNES: ReadonlyMap<string, CommuneDepartment> = new Map([
  ["abbeville la riviere", "91"], // Abbéville-la-Rivière
  ["ableiges", "95"], // Ableiges
  ["ablis", "78"], // Ablis
  ["ablon sur seine", "94"], // Ablon-sur-Seine
  ["acheres", "78"], // Achères
  ["acheres la foret", "77"], // Achères-la-Forêt
  ["adainville", "78"], // Adainville
  ["aigremont", "78"], // Aigremont
  ["aincourt", "95"], // Aincourt
  ["alfortville", "94"], // Alfortville
  ["allainville", "78"], // Allainville
  ["ambleville", "95"], // Ambleville
  ["amenucourt", "95"], // Amenucourt
  ["amillis", "77"], // Amillis
  ["amponville", "77"], // Amponville
  ["andelu", "78"], // Andelu
  ["andilly", "95"], // Andilly
  ["andresy", "78"], // Andrésy
  ["andrezel", "77"], // Andrezel
  ["angerville", "91"], // Angerville
  ["angervilliers", "91"], // Angervilliers
  ["annet sur marne", "77"], // Annet-sur-Marne
  ["antony", "92"], // Antony
  ["arbonne la foret", "77"], // Arbonne-la-Forêt
  ["arcueil", "94"], // Arcueil
  ["argenteuil", "95"], // Argenteuil
  ["argentieres", "77"], // Argentières
  ["armentieres en brie", "77"], // Armentières-en-Brie
  ["arnouville", "95"], // Arnouville
  ["arnouville les mantes", "78"], // Arnouville-lès-Mantes
  ["arpajon", "91"], // Arpajon
  ["arrancourt", "91"], // Arrancourt
  ["arronville", "95"], // Arronville
  ["arthies", "95"], // Arthies
  ["arville", "77"], // Arville
  ["asnieres sur oise", "95"], // Asnières-sur-Oise
  ["asnieres sur seine", "92"], // Asnières-sur-Seine
  ["athis mons", "91"], // Athis-Mons
  ["attainville", "95"], // Attainville
  ["aubepierre ozouer le repos", "77"], // Aubepierre-Ozouer-le-Repos
  ["aubergenville", "78"], // Aubergenville
  ["aubervilliers", "93"], // Aubervilliers
  ["auffargis", "78"], // Auffargis
  ["aufferville", "77"], // Aufferville
  ["auffreville brasseuil", "78"], // Auffreville-Brasseuil
  ["augers en brie", "77"], // Augers-en-Brie
  ["aulnay sous bois", "93"], // Aulnay-sous-Bois
  ["aulnay sur mauldre", "78"], // Aulnay-sur-Mauldre
  ["aulnoy", "77"], // Aulnoy
  ["auteuil", "78"], // Auteuil
  ["authon la plaine", "91"], // Authon-la-Plaine
  ["autouillet", "78"], // Autouillet
  ["auvernaux", "91"], // Auvernaux
  ["auvers saint georges", "91"], // Auvers-Saint-Georges
  ["auvers sur oise", "95"], // Auvers-sur-Oise
  ["avernes", "95"], // Avernes
  ["avon", "77"], // Avon
  ["avrainville", "91"], // Avrainville
  ["baby", "77"], // Baby
  ["bagneaux sur loing", "77"], // Bagneaux-sur-Loing
  ["bagneux", "92"], // Bagneux
  ["bagnolet", "93"], // Bagnolet
  ["baillet en france", "95"], // Baillet-en-France
  ["bailly", "78"], // Bailly
  ["bailly romainvilliers", "77"], // Bailly-Romainvilliers
  ["ballainvilliers", "91"], // Ballainvilliers
  ["ballancourt sur essonne", "91"], // Ballancourt-sur-Essonne
  ["balloy", "77"], // Balloy
  ["bannost villegagnon", "77"], // Bannost-Villegagnon
  ["banthelu", "95"], // Banthelu
  ["barbey", "77"], // Barbey
  ["barbizon", "77"], // Barbizon
  ["barcy", "77"], // Barcy
  ["bassevelle", "77"], // Bassevelle
  ["baulne", "91"], // Baulne
  ["bazainville", "78"], // Bazainville
  ["bazemont", "78"], // Bazemont
  ["bazoches les bray", "77"], // Bazoches-lès-Bray
  ["bazoches sur guyonne", "78"], // Bazoches-sur-Guyonne
  ["beauchamp", "95"], // Beauchamp
  ["beauchery saint martin", "77"], // Beauchery-Saint-Martin
  ["beaumont du gatinais", "77"], // Beaumont-du-Gâtinais
  ["beaumont sur oise", "95"], // Beaumont-sur-Oise
  ["beautheil saints", "77"], // Beautheil-Saints
  ["beauvoir", "77"], // Beauvoir
  ["behoust", "78"], // Béhoust
  ["bellefontaine", "95"], // Bellefontaine
  ["bellot", "77"], // Bellot
  ["belloy en france", "95"], // Belloy-en-France
  ["bennecourt", "78"], // Bennecourt
  ["bernay vilbert", "77"], // Bernay-Vilbert
  ["bernes sur oise", "95"], // Bernes-sur-Oise
  ["berville", "95"], // Berville
  ["bessancourt", "95"], // Bessancourt
  ["bethemont la foret", "95"], // Béthemont-la-Forêt
  ["beton bazoches", "77"], // Beton-Bazoches
  ["beynes", "78"], // Beynes
  ["bezalles", "77"], // Bezalles
  ["bezons", "95"], // Bezons
  ["bievres", "91"], // Bièvres
  ["blandy", "AMBIGUOUS"], // Blandy
  ["blaru", "78"], // Blaru
  ["blennes", "77"], // Blennes
  ["bobigny", "93"], // Bobigny
  ["boigneville", "91"], // Boigneville
  ["boinville en mantois", "78"], // Boinville-en-Mantois
  ["boinville le gaillard", "78"], // Boinville-le-Gaillard
  ["boinvilliers", "78"], // Boinvilliers
  ["bois colombes", "92"], // Bois-Colombes
  ["bois d arcy", "78"], // Bois-d'Arcy
  ["bois herpin", "91"], // Bois-Herpin
  ["bois le roi", "77"], // Bois-le-Roi
  ["boisdon", "77"], // Boisdon
  ["boisemont", "95"], // Boisemont
  ["boissets", "78"], // Boissets
  ["boissettes", "77"], // Boissettes
  ["boissise la bertrand", "77"], // Boissise-la-Bertrand
  ["boissise le roi", "77"], // Boissise-le-Roi
  ["boissy aux cailles", "77"], // Boissy-aux-Cailles
  ["boissy l aillerie", "95"], // Boissy-l'Aillerie
  ["boissy la riviere", "91"], // Boissy-la-Rivière
  ["boissy le chatel", "77"], // Boissy-le-Châtel
  ["boissy le cutte", "91"], // Boissy-le-Cutté
  ["boissy le sec", "91"], // Boissy-le-Sec
  ["boissy mauvoisin", "78"], // Boissy-Mauvoisin
  ["boissy saint leger", "94"], // Boissy-Saint-Léger
  ["boissy sans avoir", "78"], // Boissy-sans-Avoir
  ["boissy sous saint yon", "91"], // Boissy-sous-Saint-Yon
  ["boitron", "77"], // Boitron
  ["bombon", "77"], // Bombon
  ["bondoufle", "91"], // Bondoufle
  ["bondy", "93"], // Bondy
  ["bonnelles", "78"], // Bonnelles
  ["bonneuil en france", "95"], // Bonneuil-en-France
  ["bonneuil sur marne", "94"], // Bonneuil-sur-Marne
  ["bonnieres sur seine", "78"], // Bonnières-sur-Seine
  ["bouafle", "78"], // Bouafle
  ["bouffemont", "95"], // Bouffémont
  ["bougival", "78"], // Bougival
  ["bougligny", "77"], // Bougligny
  ["boulancourt", "77"], // Boulancourt
  ["bouleurs", "77"], // Bouleurs
  ["boullay les troux", "91"], // Boullay-les-Troux
  ["boulogne billancourt", "92"], // Boulogne-Billancourt
  ["bouqueval", "95"], // Bouqueval
  ["bouray sur juine", "91"], // Bouray-sur-Juine
  ["bourdonne", "78"], // Bourdonné
  ["bourg la reine", "92"], // Bourg-la-Reine
  ["bourron marlotte", "77"], // Bourron-Marlotte
  ["boussy saint antoine", "91"], // Boussy-Saint-Antoine
  ["boutervilliers", "91"], // Boutervilliers
  ["boutigny", "77"], // Boutigny
  ["boutigny sur essonne", "91"], // Boutigny-sur-Essonne
  ["bouville", "91"], // Bouville
  ["bransles", "77"], // Bransles
  ["bray et lu", "95"], // Bray-et-Lû
  ["bray sur seine", "77"], // Bray-sur-Seine
  ["breancon", "95"], // Bréançon
  ["breau", "77"], // Bréau
  ["bretigny sur orge", "91"], // Brétigny-sur-Orge
  ["breuil bois robert", "78"], // Breuil-Bois-Robert
  ["breuillet", "91"], // Breuillet
  ["breux jouy", "91"], // Breux-Jouy
  ["breval", "78"], // Bréval
  ["brie comte robert", "77"], // Brie-Comte-Robert
  ["brieres les scelles", "91"], // Brières-les-Scellés
  ["brignancourt", "95"], // Brignancourt
  ["briis sous forges", "91"], // Briis-sous-Forges
  ["brou sur chantereine", "77"], // Brou-sur-Chantereine
  ["brouy", "91"], // Brouy
  ["brueil en vexin", "78"], // Brueil-en-Vexin
  ["brunoy", "91"], // Brunoy
  ["bruyeres le chatel", "91"], // Bruyères-le-Châtel
  ["bruyeres sur oise", "95"], // Bruyères-sur-Oise
  ["bry sur marne", "94"], // Bry-sur-Marne
  ["buc", "78"], // Buc
  ["buchelay", "78"], // Buchelay
  ["buhy", "95"], // Buhy
  ["bullion", "78"], // Bullion
  ["buno bonnevaux", "91"], // Buno-Bonnevaux
  ["burcy", "77"], // Burcy
  ["bures sur yvette", "91"], // Bures-sur-Yvette
  ["bussieres", "77"], // Bussières
  ["bussy saint georges", "77"], // Bussy-Saint-Georges
  ["bussy saint martin", "77"], // Bussy-Saint-Martin
  ["buthiers", "77"], // Buthiers
  ["butry sur oise", "95"], // Butry-sur-Oise
  ["cachan", "94"], // Cachan
  ["cannes ecluse", "77"], // Cannes-Écluse
  ["carnetin", "77"], // Carnetin
  ["carrieres sous poissy", "78"], // Carrières-sous-Poissy
  ["carrieres sur seine", "78"], // Carrières-sur-Seine
  ["cely", "77"], // Cély
  ["cergy", "95"], // Cergy
  ["cernay la ville", "78"], // Cernay-la-Ville
  ["cerneux", "77"], // Cerneux
  ["cerny", "91"], // Cerny
  ["cesson", "77"], // Cesson
  ["cessoy en montois", "77"], // Cessoy-en-Montois
  ["chailly en biere", "77"], // Chailly-en-Bière
  ["chailly en brie", "77"], // Chailly-en-Brie
  ["chaintreaux", "77"], // Chaintreaux
  ["chalautre la grande", "77"], // Chalautre-la-Grande
  ["chalautre la petite", "77"], // Chalautre-la-Petite
  ["chalifert", "77"], // Chalifert
  ["chalmaison", "77"], // Chalmaison
  ["chalo saint mars", "91"], // Chalo-Saint-Mars
  ["chalou moulineux", "91"], // Chalou-Moulineux
  ["chamarande", "91"], // Chamarande
  ["chambourcy", "78"], // Chambourcy
  ["chambry", "77"], // Chambry
  ["chamigny", "77"], // Chamigny
  ["champagne sur oise", "95"], // Champagne-sur-Oise
  ["champagne sur seine", "77"], // Champagne-sur-Seine
  ["champcenest", "77"], // Champcenest
  ["champcueil", "91"], // Champcueil
  ["champdeuil", "77"], // Champdeuil
  ["champeaux", "77"], // Champeaux
  ["champigny sur marne", "94"], // Champigny-sur-Marne
  ["champlan", "91"], // Champlan
  ["champmotteux", "91"], // Champmotteux
  ["champs sur marne", "77"], // Champs-sur-Marne
  ["changis sur marne", "77"], // Changis-sur-Marne
  ["chanteloup en brie", "77"], // Chanteloup-en-Brie
  ["chanteloup les vignes", "78"], // Chanteloup-les-Vignes
  ["chapet", "78"], // Chapet
  ["charenton le pont", "94"], // Charenton-le-Pont
  ["charmentray", "77"], // Charmentray
  ["charmont", "95"], // Charmont
  ["charny", "77"], // Charny
  ["chars", "95"], // Chars
  ["chartrettes", "77"], // Chartrettes
  ["chartronges", "77"], // Chartronges
  ["chateau landon", "77"], // Château-Landon
  ["chateaubleau", "77"], // Châteaubleau
  ["chateaufort", "78"], // Châteaufort
  ["chatenay en france", "95"], // Châtenay-en-France
  ["chatenay malabry", "92"], // Châtenay-Malabry
  ["chatenay sur seine", "77"], // Châtenay-sur-Seine
  ["chatenoy", "77"], // Châtenoy
  ["chatignonville", "91"], // Chatignonville
  ["chatillon", "92"], // Châtillon
  ["chatillon la borde", "77"], // Châtillon-la-Borde
  ["chatou", "78"], // Chatou
  ["chatres", "77"], // Châtres
  ["chauconin neufmontiers", "77"], // Chauconin-Neufmontiers
  ["chauffour les etrechy", "91"], // Chauffour-lès-Étréchy
  ["chauffry", "77"], // Chauffry
  ["chaufour les bonnieres", "78"], // Chaufour-lès-Bonnières
  ["chaumes en brie", "77"], // Chaumes-en-Brie
  ["chaumontel", "95"], // Chaumontel
  ["chaussy", "95"], // Chaussy
  ["chauvry", "95"], // Chauvry
  ["chavenay", "78"], // Chavenay
  ["chaville", "92"], // Chaville
  ["chelles", "77"], // Chelles
  ["chennevieres les louvres", "95"], // Chennevières-lès-Louvres
  ["chennevieres sur marne", "94"], // Chennevières-sur-Marne
  ["chenoise cucharmoy", "77"], // Chenoise-Cucharmoy
  ["chenou", "77"], // Chenou
  ["cheptainville", "91"], // Cheptainville
  ["cherence", "95"], // Chérence
  ["chessy", "77"], // Chessy
  ["chevannes", "91"], // Chevannes
  ["chevilly larue", "94"], // Chevilly-Larue
  ["chevrainvilliers", "77"], // Chevrainvilliers
  ["chevreuse", "78"], // Chevreuse
  ["chevru", "77"], // Chevru
  ["chevry cossigny", "77"], // Chevry-Cossigny
  ["chevry en sereine", "77"], // Chevry-en-Sereine
  ["chilly mazarin", "91"], // Chilly-Mazarin
  ["choisel", "78"], // Choisel
  ["choisy en brie", "77"], // Choisy-en-Brie
  ["choisy le roi", "94"], // Choisy-le-Roi
  ["citry", "77"], // Citry
  ["civry la foret", "78"], // Civry-la-Forêt
  ["clairefontaine en yvelines", "78"], // Clairefontaine-en-Yvelines
  ["clamart", "92"], // Clamart
  ["claye souilly", "77"], // Claye-Souilly
  ["clery en vexin", "95"], // Cléry-en-Vexin
  ["clichy", "92"], // Clichy
  ["clichy sous bois", "93"], // Clichy-sous-Bois
  ["clos fontaine", "77"], // Clos-Fontaine
  ["cocherel", "77"], // Cocherel
  ["coignieres", "78"], // Coignières
  ["collegien", "77"], // Collégien
  ["colombes", "92"], // Colombes
  ["combs la ville", "77"], // Combs-la-Ville
  ["commeny", "95"], // Commeny
  ["compans", "77"], // Compans
  ["conches sur gondoire", "77"], // Conches-sur-Gondoire
  ["conde sainte libiaire", "77"], // Condé-Sainte-Libiaire
  ["conde sur vesgre", "78"], // Condé-sur-Vesgre
  ["condecourt", "95"], // Condécourt
  ["conflans sainte honorine", "78"], // Conflans-Sainte-Honorine
  ["congerville thionville", "91"], // Congerville-Thionville
  ["congis sur therouanne", "77"], // Congis-sur-Thérouanne
  ["corbeil essonnes", "91"], // Corbeil-Essonnes
  ["corbreuse", "91"], // Corbreuse
  ["cormeilles en parisis", "95"], // Cormeilles-en-Parisis
  ["cormeilles en vexin", "95"], // Cormeilles-en-Vexin
  ["coubert", "77"], // Coubert
  ["coubron", "93"], // Coubron
  ["couilly pont aux dames", "77"], // Couilly-Pont-aux-Dames
  ["coulombs en valois", "77"], // Coulombs-en-Valois
  ["coulommes", "77"], // Coulommes
  ["coulommiers", "77"], // Coulommiers
  ["coupvray", "77"], // Coupvray
  ["courances", "91"], // Courances
  ["courbevoie", "92"], // Courbevoie
  ["courcelles en bassee", "77"], // Courcelles-en-Bassée
  ["courcelles sur viosne", "95"], // Courcelles-sur-Viosne
  ["courchamp", "77"], // Courchamp
  ["courdimanche", "95"], // Courdimanche
  ["courdimanche sur essonne", "91"], // Courdimanche-sur-Essonne
  ["courgent", "78"], // Courgent
  ["courpalay", "77"], // Courpalay
  ["courquetaine", "77"], // Courquetaine
  ["courson monteloup", "91"], // Courson-Monteloup
  ["courtacon", "77"], // Courtacon
  ["courtomer", "77"], // Courtomer
  ["courtry", "77"], // Courtry
  ["coutencon", "77"], // Coutençon
  ["coutevroult", "77"], // Coutevroult
  ["cravent", "78"], // Cravent
  ["crecy la chapelle", "77"], // Crécy-la-Chapelle
  ["cregy les meaux", "77"], // Crégy-lès-Meaux
  ["crespieres", "78"], // Crespières
  ["creteil", "94"], // Créteil
  ["crevec ur en brie", "77"], // Crèvecœur-en-Brie
  ["crisenoy", "77"], // Crisenoy
  ["croissy beaubourg", "77"], // Croissy-Beaubourg
  ["croissy sur seine", "78"], // Croissy-sur-Seine
  ["crosne", "91"], // Crosne
  ["crouy sur ourcq", "77"], // Crouy-sur-Ourcq
  ["cuisy", "77"], // Cuisy
  ["d huison longueville", "91"], // D'Huison-Longueville
  ["dagny", "77"], // Dagny
  ["dammarie les lys", "77"], // Dammarie-les-Lys
  ["dammartin en goele", "77"], // Dammartin-en-Goële
  ["dammartin en serve", "78"], // Dammartin-en-Serve
  ["dammartin sur tigeaux", "77"], // Dammartin-sur-Tigeaux
  ["dampierre en yvelines", "78"], // Dampierre-en-Yvelines
  ["dampmart", "77"], // Dampmart
  ["dannemarie", "78"], // Dannemarie
  ["dannemois", "91"], // Dannemois
  ["darvault", "77"], // Darvault
  ["davron", "78"], // Davron
  ["deuil la barre", "95"], // Deuil-la-Barre
  ["dhuisy", "77"], // Dhuisy
  ["diant", "77"], // Diant
  ["domont", "95"], // Domont
  ["donnemarie dontilly", "77"], // Donnemarie-Dontilly
  ["dormelles", "77"], // Dormelles
  ["doue", "77"], // Doue
  ["dourdan", "91"], // Dourdan
  ["douy la ramee", "77"], // Douy-la-Ramée
  ["drancy", "93"], // Drancy
  ["draveil", "91"], // Draveil
  ["drocourt", "78"], // Drocourt
  ["dugny", "93"], // Dugny
  ["eaubonne", "95"], // Eaubonne
  ["echarcon", "91"], // Écharcon
  ["echouboulains", "77"], // Échouboulains
  ["ecouen", "95"], // Écouen
  ["ecquevilly", "78"], // Ecquevilly
  ["egligny", "77"], // Égligny
  ["egly", "91"], // Égly
  ["egreville", "77"], // Égreville
  ["elancourt", "78"], // Élancourt
  ["emance", "78"], // Émancé
  ["emerainville", "77"], // Émerainville
  ["enghien les bains", "95"], // Enghien-les-Bains
  ["ennery", "95"], // Ennery
  ["epiais les louvres", "95"], // Épiais-lès-Louvres
  ["epiais rhus", "95"], // Épiais-Rhus
  ["epinay champlatreux", "95"], // Épinay-Champlâtreux
  ["epinay sous senart", "91"], // Épinay-sous-Sénart
  ["epinay sur orge", "91"], // Épinay-sur-Orge
  ["epinay sur seine", "93"], // Épinay-sur-Seine
  ["epone", "78"], // Épône
  ["eragny sur oise", "95"], // Éragny-sur-Oise
  ["ermont", "95"], // Ermont
  ["esbly", "77"], // Esbly
  ["esmans", "77"], // Esmans
  ["etampes", "91"], // Étampes
  ["etiolles", "91"], // Étiolles
  ["etrechy", "91"], // Étréchy
  ["etrepilly", "77"], // Étrépilly
  ["evecquemont", "78"], // Évecquemont
  ["everly", "77"], // Everly
  ["evry courcouronnes", "91"], // Évry-Courcouronnes
  ["evry gregy sur yerre", "77"], // Évry-Grégy-sur-Yerre
  ["ezanville", "95"], // Ézanville
  ["faremoutiers", "77"], // Faremoutiers
  ["favieres", "77"], // Favières
  ["favrieux", "78"], // Favrieux
  ["fay les nemours", "77"], // Faÿ-lès-Nemours
  ["fericy", "77"], // Féricy
  ["ferolles attilly", "77"], // Férolles-Attilly
  ["ferrieres en brie", "77"], // Ferrières-en-Brie
  ["feucherolles", "78"], // Feucherolles
  ["flacourt", "78"], // Flacourt
  ["flagy", "77"], // Flagy
  ["fleury en biere", "77"], // Fleury-en-Bière
  ["fleury merogis", "91"], // Fleury-Mérogis
  ["flexanville", "78"], // Flexanville
  ["flins neuve eglise", "78"], // Flins-Neuve-Église
  ["flins sur seine", "78"], // Flins-sur-Seine
  ["follainville dennemont", "78"], // Follainville-Dennemont
  ["fontaine fourches", "77"], // Fontaine-Fourches
  ["fontaine la riviere", "91"], // Fontaine-la-Rivière
  ["fontaine le port", "77"], // Fontaine-le-Port
  ["fontainebleau", "77"], // Fontainebleau
  ["fontains", "77"], // Fontains
  ["fontenailles", "77"], // Fontenailles
  ["fontenay aux roses", "92"], // Fontenay-aux-Roses
  ["fontenay en parisis", "95"], // Fontenay-en-Parisis
  ["fontenay le fleury", "78"], // Fontenay-le-Fleury
  ["fontenay le vicomte", "91"], // Fontenay-le-Vicomte
  ["fontenay les briis", "91"], // Fontenay-lès-Briis
  ["fontenay mauvoisin", "78"], // Fontenay-Mauvoisin
  ["fontenay saint pere", "78"], // Fontenay-Saint-Père
  ["fontenay sous bois", "94"], // Fontenay-sous-Bois
  ["fontenay tresigny", "77"], // Fontenay-Trésigny
  ["forfry", "77"], // Forfry
  ["forges", "77"], // Forges
  ["forges les bains", "91"], // Forges-les-Bains
  ["fosses", "95"], // Fosses
  ["fouju", "77"], // Fouju
  ["franconville", "95"], // Franconville
  ["fremainville", "95"], // Frémainville
  ["fremecourt", "95"], // Frémécourt
  ["freneuse", "78"], // Freneuse
  ["frepillon", "95"], // Frépillon
  ["fresnes", "94"], // Fresnes
  ["fresnes sur marne", "77"], // Fresnes-sur-Marne
  ["fretoy", "77"], // Frétoy
  ["fromont", "77"], // Fromont
  ["frouville", "95"], // Frouville
  ["fublaines", "77"], // Fublaines
  ["gagny", "93"], // Gagny
  ["gaillon sur montcient", "78"], // Gaillon-sur-Montcient
  ["galluis", "78"], // Galluis
  ["gambais", "78"], // Gambais
  ["gambaiseuil", "78"], // Gambaiseuil
  ["garancieres", "78"], // Garancières
  ["garches", "92"], // Garches
  ["garentreville", "77"], // Garentreville
  ["gargenville", "78"], // Gargenville
  ["garges les gonesse", "95"], // Garges-lès-Gonesse
  ["gastins", "77"], // Gastins
  ["gazeran", "78"], // Gazeran
  ["genainville", "95"], // Genainville
  ["genicourt", "95"], // Génicourt
  ["gennevilliers", "92"], // Gennevilliers
  ["gentilly", "94"], // Gentilly
  ["germigny l eveque", "77"], // Germigny-l'Évêque
  ["germigny sous coulombs", "77"], // Germigny-sous-Coulombs
  ["gesvres le chapitre", "77"], // Gesvres-le-Chapitre
  ["gif sur yvette", "91"], // Gif-sur-Yvette
  ["giremoutiers", "77"], // Giremoutiers
  ["gironville", "77"], // Gironville
  ["gironville sur essonne", "91"], // Gironville-sur-Essonne
  ["gometz la ville", "91"], // Gometz-la-Ville
  ["gometz le chatel", "91"], // Gometz-le-Châtel
  ["gommecourt", "78"], // Gommecourt
  ["gonesse", "95"], // Gonesse
  ["gouaix", "77"], // Gouaix
  ["goupillieres", "78"], // Goupillières
  ["gournay sur marne", "93"], // Gournay-sur-Marne
  ["goussainville", "95"], // Goussainville
  ["goussonville", "78"], // Goussonville
  ["gouvernes", "77"], // Gouvernes
  ["grandchamp", "78"], // Grandchamp
  ["grandpuits bailly carrois", "77"], // Grandpuits-Bailly-Carrois
  ["gravon", "77"], // Gravon
  ["gressey", "78"], // Gressey
  ["gressy", "77"], // Gressy
  ["gretz armainvilliers", "77"], // Gretz-Armainvilliers
  ["grez sur loing", "77"], // Grez-sur-Loing
  ["grigny", "91"], // Grigny
  ["grisy les platres", "95"], // Grisy-les-Plâtres
  ["grisy suisnes", "77"], // Grisy-Suisnes
  ["grisy sur seine", "77"], // Grisy-sur-Seine
  ["groslay", "95"], // Groslay
  ["grosrouvre", "78"], // Grosrouvre
  ["guerard", "77"], // Guérard
  ["guercheville", "77"], // Guercheville
  ["guermantes", "77"], // Guermantes
  ["guernes", "78"], // Guernes
  ["guerville", "78"], // Guerville
  ["guibeville", "91"], // Guibeville
  ["guignes", "77"], // Guignes
  ["guigneville sur essonne", "91"], // Guigneville-sur-Essonne
  ["guillerval", "91"], // Guillerval
  ["guiry en vexin", "95"], // Guiry-en-Vexin
  ["guitrancourt", "78"], // Guitrancourt
  ["gurcy le chatel", "77"], // Gurcy-le-Châtel
  ["guyancourt", "78"], // Guyancourt
  ["haravilliers", "95"], // Haravilliers
  ["hardricourt", "78"], // Hardricourt
  ["hargeville", "78"], // Hargeville
  ["haute isle", "95"], // Haute-Isle
  ["hautefeuille", "77"], // Hautefeuille
  ["hedouville", "95"], // Hédouville
  ["herbeville", "78"], // Herbeville
  ["herblay sur seine", "95"], // Herblay-sur-Seine
  ["hericy", "77"], // Héricy
  ["herme", "77"], // Hermé
  ["hermeray", "78"], // Hermeray
  ["herouville en vexin", "95"], // Hérouville-en-Vexin
  ["hodent", "95"], // Hodent
  ["hondevilliers", "77"], // Hondevilliers
  ["houdan", "78"], // Houdan
  ["houilles", "78"], // Houilles
  ["ichy", "77"], // Ichy
  ["igny", "91"], // Igny
  ["isles les meldeuses", "77"], // Isles-les-Meldeuses
  ["isles les villenoy", "77"], // Isles-lès-Villenoy
  ["issou", "78"], // Issou
  ["issy les moulineaux", "92"], // Issy-les-Moulineaux
  ["itteville", "91"], // Itteville
  ["iverny", "77"], // Iverny
  ["ivry sur seine", "94"], // Ivry-sur-Seine
  ["jablines", "77"], // Jablines
  ["jagny sous bois", "95"], // Jagny-sous-Bois
  ["jaignes", "77"], // Jaignes
  ["jambville", "78"], // Jambville
  ["janville sur juine", "91"], // Janville-sur-Juine
  ["janvry", "91"], // Janvry
  ["jaulnes", "77"], // Jaulnes
  ["joinville le pont", "94"], // Joinville-le-Pont
  ["jossigny", "77"], // Jossigny
  ["jouarre", "77"], // Jouarre
  ["jouars pontchartrain", "78"], // Jouars-Pontchartrain
  ["jouy en josas", "78"], // Jouy-en-Josas
  ["jouy le chatel", "77"], // Jouy-le-Châtel
  ["jouy le moutier", "95"], // Jouy-le-Moutier
  ["jouy mauvoisin", "78"], // Jouy-Mauvoisin
  ["jouy sur morin", "77"], // Jouy-sur-Morin
  ["juilly", "77"], // Juilly
  ["jumeauville", "78"], // Jumeauville
  ["jutigny", "77"], // Jutigny
  ["juvisy sur orge", "91"], // Juvisy-sur-Orge
  ["juziers", "78"], // Juziers
  ["l etang la ville", "78"], // L'Étang-la-Ville
  ["l hay les roses", "94"], // L'Haÿ-les-Roses
  ["l ile saint denis", "93"], // L'Île-Saint-Denis
  ["l isle adam", "95"], // L'Isle-Adam
  ["la boissiere ecole", "78"], // La Boissière-École
  ["la brosse montceaux", "77"], // La Brosse-Montceaux
  ["la celle les bordes", "78"], // La Celle-les-Bordes
  ["la celle saint cloud", "78"], // La Celle-Saint-Cloud
  ["la celle sur morin", "77"], // La Celle-sur-Morin
  ["la chapelle en vexin", "95"], // La Chapelle-en-Vexin
  ["la chapelle gauthier", "77"], // La Chapelle-Gauthier
  ["la chapelle iger", "77"], // La Chapelle-Iger
  ["la chapelle la reine", "77"], // La Chapelle-la-Reine
  ["la chapelle moutils", "77"], // La Chapelle-Moutils
  ["la chapelle rablais", "77"], // La Chapelle-Rablais
  ["la chapelle saint sulpice", "77"], // La Chapelle-Saint-Sulpice
  ["la courneuve", "93"], // La Courneuve
  ["la croix en brie", "77"], // La Croix-en-Brie
  ["la falaise", "78"], // La Falaise
  ["la ferte alais", "91"], // La Ferté-Alais
  ["la ferte gaucher", "77"], // La Ferté-Gaucher
  ["la ferte sous jouarre", "77"], // La Ferté-sous-Jouarre
  ["la foret le roi", "91"], // La Forêt-le-Roi
  ["la foret sainte croix", "91"], // La Forêt-Sainte-Croix
  ["la frette sur seine", "95"], // La Frette-sur-Seine
  ["la garenne colombes", "92"], // La Garenne-Colombes
  ["la genevraye", "77"], // La Genevraye
  ["la grande paroisse", "77"], // La Grande-Paroisse
  ["la haute maison", "77"], // La Haute-Maison
  ["la hauteville", "78"], // La Hauteville
  ["la houssaye en brie", "77"], // La Houssaye-en-Brie
  ["la madeleine sur loing", "77"], // La Madeleine-sur-Loing
  ["la norville", "91"], // La Norville
  ["la queue en brie", "94"], // La Queue-en-Brie
  ["la queue les yvelines", "78"], // La Queue-les-Yvelines
  ["la roche guyon", "95"], // La Roche-Guyon
  ["la rochette", "77"], // La Rochette
  ["la tombe", "77"], // La Tombe
  ["la tretoire", "77"], // La Trétoire
  ["la verriere", "78"], // La Verrière
  ["la ville du bois", "91"], // La Ville-du-Bois
  ["la villeneuve en chevrie", "78"], // La Villeneuve-en-Chevrie
  ["labbeville", "95"], // Labbeville
  ["lagny sur marne", "77"], // Lagny-sur-Marne
  ["lainville en vexin", "78"], // Lainville-en-Vexin
  ["larchant", "77"], // Larchant
  ["lardy", "91"], // Lardy
  ["lassy", "95"], // Lassy
  ["laval en brie", "77"], // Laval-en-Brie
  ["le bellay en vexin", "95"], // Le Bellay-en-Vexin
  ["le blanc mesnil", "93"], // Le Blanc-Mesnil
  ["le bourget", "93"], // Le Bourget
  ["le chatelet en brie", "77"], // Le Châtelet-en-Brie
  ["le chesnay rocquencourt", "78"], // Le Chesnay-Rocquencourt
  ["le coudray montceaux", "91"], // Le Coudray-Montceaux
  ["le heaulme", "95"], // Le Heaulme
  ["le kremlin bicetre", "94"], // Le Kremlin-Bicêtre
  ["le mee sur seine", "77"], // Le Mée-sur-Seine
  ["le merevillois", "91"], // Le Mérévillois
  ["le mesnil amelot", "77"], // Le Mesnil-Amelot
  ["le mesnil aubry", "95"], // Le Mesnil-Aubry
  ["le mesnil le roi", "78"], // Le Mesnil-le-Roi
  ["le mesnil saint denis", "78"], // Le Mesnil-Saint-Denis
  ["le pecq", "78"], // Le Pecq
  ["le perchay", "95"], // Le Perchay
  ["le perray en yvelines", "78"], // Le Perray-en-Yvelines
  ["le perreux sur marne", "94"], // Le Perreux-sur-Marne
  ["le pin", "77"], // Le Pin
  ["le plessis aux bois", "77"], // Le Plessis-aux-Bois
  ["le plessis bouchard", "95"], // Le Plessis-Bouchard
  ["le plessis feu aussoux", "77"], // Le Plessis-Feu-Aussoux
  ["le plessis gassot", "95"], // Le Plessis-Gassot
  ["le plessis l eveque", "77"], // Le Plessis-l'Évêque
  ["le plessis luzarches", "95"], // Le Plessis-Luzarches
  ["le plessis pate", "91"], // Le Plessis-Pâté
  ["le plessis placy", "77"], // Le Plessis-Placy
  ["le plessis robinson", "92"], // Le Plessis-Robinson
  ["le plessis trevise", "94"], // Le Plessis-Trévise
  ["le port marly", "78"], // Le Port-Marly
  ["le pre saint gervais", "93"], // Le Pré-Saint-Gervais
  ["le raincy", "93"], // Le Raincy
  ["le tartre gaudran", "78"], // Le Tartre-Gaudran
  ["le tertre saint denis", "78"], // Le Tertre-Saint-Denis
  ["le thillay", "95"], // Le Thillay
  ["le tremblay sur mauldre", "78"], // Le Tremblay-sur-Mauldre
  ["le val saint germain", "91"], // Le Val-Saint-Germain
  ["le vaudoue", "77"], // Le Vaudoué
  ["le vesinet", "78"], // Le Vésinet
  ["lechelle", "77"], // Léchelle
  ["les alluets le roi", "78"], // Les Alluets-le-Roi
  ["les breviaires", "78"], // Les Bréviaires
  ["les chapelles bourbon", "77"], // Les Chapelles-Bourbon
  ["les clayes sous bois", "78"], // Les Clayes-sous-Bois
  ["les ecrennes", "77"], // Les Écrennes
  ["les essarts le roi", "78"], // Les Essarts-le-Roi
  ["les granges le roi", "91"], // Les Granges-le-Roi
  ["les lilas", "93"], // Les Lilas
  ["les loges en josas", "78"], // Les Loges-en-Josas
  ["les marets", "77"], // Les Marêts
  ["les mesnuls", "78"], // Les Mesnuls
  ["les molieres", "91"], // Les Molières
  ["les mureaux", "78"], // Les Mureaux
  ["les ormes sur voulzie", "77"], // Les Ormes-sur-Voulzie
  ["les pavillons sous bois", "93"], // Les Pavillons-sous-Bois
  ["les ulis", "91"], // Les Ulis
  ["lescherolles", "77"], // Lescherolles
  ["lesches", "77"], // Lesches
  ["lesigny", "77"], // Lésigny
  ["leudeville", "91"], // Leudeville
  ["leudon en brie", "77"], // Leudon-en-Brie
  ["leuville sur orge", "91"], // Leuville-sur-Orge
  ["levallois perret", "92"], // Levallois-Perret
  ["levis saint nom", "78"], // Lévis-Saint-Nom
  ["lieusaint", "77"], // Lieusaint
  ["limay", "78"], // Limay
  ["limeil brevannes", "94"], // Limeil-Brévannes
  ["limetz villez", "78"], // Limetz-Villez
  ["limoges fourches", "77"], // Limoges-Fourches
  ["limours", "91"], // Limours
  ["linas", "91"], // Linas
  ["lisses", "91"], // Lisses
  ["lissy", "77"], // Lissy
  ["liverdy en brie", "77"], // Liverdy-en-Brie
  ["livilliers", "95"], // Livilliers
  ["livry gargan", "93"], // Livry-Gargan
  ["livry sur seine", "77"], // Livry-sur-Seine
  ["lizines", "77"], // Lizines
  ["lizy sur ourcq", "77"], // Lizy-sur-Ourcq
  ["lognes", "77"], // Lognes
  ["lommoye", "78"], // Lommoye
  ["longjumeau", "91"], // Longjumeau
  ["longnes", "78"], // Longnes
  ["longperrier", "77"], // Longperrier
  ["longpont sur orge", "91"], // Longpont-sur-Orge
  ["longuesse", "95"], // Longuesse
  ["longueville", "77"], // Longueville
  ["longvilliers", "78"], // Longvilliers
  ["lorrez le bocage preaux", "77"], // Lorrez-le-Bocage-Préaux
  ["louan villegruis fontaine", "77"], // Louan-Villegruis-Fontaine
  ["louveciennes", "78"], // Louveciennes
  ["louvres", "95"], // Louvres
  ["luisetaines", "77"], // Luisetaines
  ["lumigny nesles ormeaux", "77"], // Lumigny-Nesles-Ormeaux
  ["luzancy", "77"], // Luzancy
  ["luzarches", "95"], // Luzarches
  ["machault", "77"], // Machault
  ["maffliers", "95"], // Maffliers
  ["magnanville", "78"], // Magnanville
  ["magny en vexin", "95"], // Magny-en-Vexin
  ["magny le hongre", "77"], // Magny-le-Hongre
  ["magny les hameaux", "78"], // Magny-les-Hameaux
  ["maincy", "77"], // Maincy
  ["maison rouge", "77"], // Maison-Rouge
  ["maisoncelles en brie", "77"], // Maisoncelles-en-Brie
  ["maisoncelles en gatinais", "77"], // Maisoncelles-en-Gâtinais
  ["maisons alfort", "94"], // Maisons-Alfort
  ["maisons laffitte", "78"], // Maisons-Laffitte
  ["maisse", "91"], // Maisse
  ["malakoff", "92"], // Malakoff
  ["mandres les roses", "94"], // Mandres-les-Roses
  ["mantes la jolie", "78"], // Mantes-la-Jolie
  ["mantes la ville", "78"], // Mantes-la-Ville
  ["marchemoret", "77"], // Marchémoret
  ["marcilly", "77"], // Marcilly
  ["marcoussis", "91"], // Marcoussis
  ["marcq", "78"], // Marcq
  ["mareil en france", "95"], // Mareil-en-France
  ["mareil le guyon", "78"], // Mareil-le-Guyon
  ["mareil marly", "78"], // Mareil-Marly
  ["mareil sur mauldre", "78"], // Mareil-sur-Mauldre
  ["mareuil les meaux", "77"], // Mareuil-lès-Meaux
  ["margency", "95"], // Margency
  ["marines", "95"], // Marines
  ["marles en brie", "77"], // Marles-en-Brie
  ["marly la ville", "95"], // Marly-la-Ville
  ["marly le roi", "78"], // Marly-le-Roi
  ["marnes la coquette", "92"], // Marnes-la-Coquette
  ["marolles en beauce", "91"], // Marolles-en-Beauce
  ["marolles en brie", "AMBIGUOUS"], // Marolles-en-Brie
  ["marolles en hurepoix", "91"], // Marolles-en-Hurepoix
  ["marolles sur seine", "77"], // Marolles-sur-Seine
  ["mary sur marne", "77"], // Mary-sur-Marne
  ["massy", "91"], // Massy
  ["mauchamps", "91"], // Mauchamps
  ["maudetour en vexin", "95"], // Maudétour-en-Vexin
  ["maule", "78"], // Maule
  ["maulette", "78"], // Maulette
  ["mauperthuis", "77"], // Mauperthuis
  ["maurecourt", "78"], // Maurecourt
  ["mauregard", "77"], // Mauregard
  ["maurepas", "78"], // Maurepas
  ["may en multien", "77"], // May-en-Multien
  ["meaux", "77"], // Meaux
  ["medan", "78"], // Médan
  ["meigneux", "77"], // Meigneux
  ["meilleray", "77"], // Meilleray
  ["melun", "77"], // Melun
  ["melz sur seine", "77"], // Melz-sur-Seine
  ["menerville", "78"], // Ménerville
  ["mennecy", "91"], // Mennecy
  ["menouville", "95"], // Menouville
  ["menucourt", "95"], // Menucourt
  ["mere", "78"], // Méré
  ["mericourt", "78"], // Méricourt
  ["meriel", "95"], // Mériel
  ["merobert", "91"], // Mérobert
  ["mery sur marne", "77"], // Méry-sur-Marne
  ["mery sur oise", "95"], // Méry-sur-Oise
  ["mespuits", "91"], // Mespuits
  ["messy", "77"], // Messy
  ["meudon", "92"], // Meudon
  ["meulan en yvelines", "78"], // Meulan-en-Yvelines
  ["mezieres sur seine", "78"], // Mézières-sur-Seine
  ["mezy sur seine", "78"], // Mézy-sur-Seine
  ["millemont", "78"], // Millemont
  ["milly la foret", "91"], // Milly-la-Forêt
  ["milon la chapelle", "78"], // Milon-la-Chapelle
  ["misy sur yonne", "77"], // Misy-sur-Yonne
  ["mitry mory", "77"], // Mitry-Mory
  ["mittainville", "78"], // Mittainville
  ["moigny sur ecole", "91"], // Moigny-sur-École
  ["moisenay", "77"], // Moisenay
  ["moisselles", "95"], // Moisselles
  ["moisson", "78"], // Moisson
  ["moissy cramayel", "77"], // Moissy-Cramayel
  ["moncourt fromonville", "77"], // Moncourt-Fromonville
  ["mondeville", "91"], // Mondeville
  ["mondreville", "AMBIGUOUS"], // Mondreville
  ["monnerville", "91"], // Monnerville
  ["mons en montois", "77"], // Mons-en-Montois
  ["montainville", "78"], // Montainville
  ["montalet le bois", "78"], // Montalet-le-Bois
  ["montceaux les meaux", "77"], // Montceaux-lès-Meaux
  ["montceaux les provins", "77"], // Montceaux-lès-Provins
  ["montchauvet", "78"], // Montchauvet
  ["montdauphin", "77"], // Montdauphin
  ["montenils", "77"], // Montenils
  ["montereau fault yonne", "77"], // Montereau-Fault-Yonne
  ["montereau sur le jard", "77"], // Montereau-sur-le-Jard
  ["montesson", "78"], // Montesson
  ["montevrain", "77"], // Montévrain
  ["montfermeil", "93"], // Montfermeil
  ["montfort l amaury", "78"], // Montfort-l'Amaury
  ["montge en goele", "77"], // Montgé-en-Goële
  ["montgeron", "91"], // Montgeron
  ["montgeroult", "95"], // Montgeroult
  ["monthyon", "77"], // Monthyon
  ["montigny le bretonneux", "78"], // Montigny-le-Bretonneux
  ["montigny le guesdier", "77"], // Montigny-le-Guesdier
  ["montigny lencoup", "77"], // Montigny-Lencoup
  ["montigny les cormeilles", "95"], // Montigny-lès-Cormeilles
  ["montigny sur loing", "77"], // Montigny-sur-Loing
  ["montlhery", "91"], // Montlhéry
  ["montlignon", "95"], // Montlignon
  ["montmachoux", "77"], // Montmachoux
  ["montmagny", "95"], // Montmagny
  ["montmorency", "95"], // Montmorency
  ["montolivet", "77"], // Montolivet
  ["montreuil", "93"], // Montreuil
  ["montreuil sur epte", "95"], // Montreuil-sur-Epte
  ["montrouge", "92"], // Montrouge
  ["montry", "77"], // Montry
  ["montsoult", "95"], // Montsoult
  ["morainvilliers", "78"], // Morainvilliers
  ["morangis", "91"], // Morangis
  ["moret loing et orvanne", "77"], // Moret-Loing-et-Orvanne
  ["morigny champigny", "91"], // Morigny-Champigny
  ["mormant", "77"], // Mormant
  ["morsang sur orge", "91"], // Morsang-sur-Orge
  ["morsang sur seine", "91"], // Morsang-sur-Seine
  ["mortcerf", "77"], // Mortcerf
  ["mortery", "77"], // Mortery
  ["mouroux", "77"], // Mouroux
  ["mours", "95"], // Mours
  ["mousseaux les bray", "77"], // Mousseaux-lès-Bray
  ["mousseaux sur seine", "78"], // Mousseaux-sur-Seine
  ["moussy", "95"], // Moussy
  ["moussy le neuf", "77"], // Moussy-le-Neuf
  ["moussy le vieux", "77"], // Moussy-le-Vieux
  ["mouy sur seine", "77"], // Mouy-sur-Seine
  ["mulcent", "78"], // Mulcent
  ["nainville les roches", "91"], // Nainville-les-Roches
  ["nandy", "77"], // Nandy
  ["nangis", "77"], // Nangis
  ["nanteau sur essonne", "77"], // Nanteau-sur-Essonne
  ["nanteau sur lunain", "77"], // Nanteau-sur-Lunain
  ["nanterre", "92"], // Nanterre
  ["nanteuil les meaux", "77"], // Nanteuil-lès-Meaux
  ["nanteuil sur marne", "77"], // Nanteuil-sur-Marne
  ["nantouillet", "77"], // Nantouillet
  ["neauphle le chateau", "78"], // Neauphle-le-Château
  ["neauphle le vieux", "78"], // Neauphle-le-Vieux
  ["neauphlette", "78"], // Neauphlette
  ["nemours", "77"], // Nemours
  ["nerville la foret", "95"], // Nerville-la-Forêt
  ["nesles la vallee", "95"], // Nesles-la-Vallée
  ["neufmoutiers en brie", "77"], // Neufmoutiers-en-Brie
  ["neuilly en vexin", "95"], // Neuilly-en-Vexin
  ["neuilly plaisance", "93"], // Neuilly-Plaisance
  ["neuilly sur marne", "93"], // Neuilly-sur-Marne
  ["neuilly sur seine", "92"], // Neuilly-sur-Seine
  ["neuville sur oise", "95"], // Neuville-sur-Oise
  ["nezel", "78"], // Nézel
  ["nogent sur marne", "94"], // Nogent-sur-Marne
  ["nointel", "95"], // Nointel
  ["noiseau", "94"], // Noiseau
  ["noisiel", "77"], // Noisiel
  ["noisy le grand", "93"], // Noisy-le-Grand
  ["noisy le roi", "78"], // Noisy-le-Roi
  ["noisy le sec", "93"], // Noisy-le-Sec
  ["noisy rudignon", "77"], // Noisy-Rudignon
  ["noisy sur ecole", "77"], // Noisy-sur-École
  ["noisy sur oise", "95"], // Noisy-sur-Oise
  ["nonville", "77"], // Nonville
  ["notre dame de la mer", "78"], // Notre-Dame-de-la-Mer
  ["noyen sur seine", "77"], // Noyen-sur-Seine
  ["nozay", "91"], // Nozay
  ["nucourt", "95"], // Nucourt
  ["obsonville", "77"], // Obsonville
  ["ocquerre", "77"], // Ocquerre
  ["oinville sur montcient", "78"], // Oinville-sur-Montcient
  ["oissery", "77"], // Oissery
  ["ollainville", "91"], // Ollainville
  ["omerville", "95"], // Omerville
  ["oncy sur ecole", "91"], // Oncy-sur-École
  ["orcemont", "78"], // Orcemont
  ["orgerus", "78"], // Orgerus
  ["orgeval", "78"], // Orgeval
  ["orly", "94"], // Orly
  ["orly sur morin", "77"], // Orly-sur-Morin
  ["ormesson", "77"], // Ormesson
  ["ormesson sur marne", "94"], // Ormesson-sur-Marne
  ["ormoy", "91"], // Ormoy
  ["ormoy la riviere", "91"], // Ormoy-la-Rivière
  ["orphin", "78"], // Orphin
  ["orsay", "91"], // Orsay
  ["orsonville", "78"], // Orsonville
  ["orveau", "91"], // Orveau
  ["orvilliers", "78"], // Orvilliers
  ["osmoy", "78"], // Osmoy
  ["osny", "95"], // Osny
  ["othis", "77"], // Othis
  ["ozoir la ferriere", "77"], // Ozoir-la-Ferrière
  ["ozouer le voulgis", "77"], // Ozouer-le-Voulgis
  ["palaiseau", "91"], // Palaiseau
  ["paley", "77"], // Paley
  ["pamfou", "77"], // Pamfou
  ["pantin", "93"], // Pantin
  ["paray douaville", "78"], // Paray-Douaville
  ["paray vieille poste", "91"], // Paray-Vieille-Poste
  ["paris", "75"], // Paris
  ["parmain", "95"], // Parmain
  ["paroy", "77"], // Paroy
  ["passy sur seine", "77"], // Passy-sur-Seine
  ["pecqueuse", "91"], // Pecqueuse
  ["pecy", "77"], // Pécy
  ["penchard", "77"], // Penchard
  ["perdreauville", "78"], // Perdreauville
  ["perigny", "94"], // Périgny
  ["persan", "95"], // Persan
  ["perthes", "77"], // Perthes
  ["pezarches", "77"], // Pézarches
  ["pierre levee", "77"], // Pierre-Levée
  ["pierrelaye", "95"], // Pierrelaye
  ["piscop", "95"], // Piscop
  ["plaisir", "78"], // Plaisir
  ["plessis saint benoist", "91"], // Plessis-Saint-Benoist
  ["poigny", "77"], // Poigny
  ["poigny la foret", "78"], // Poigny-la-Forêt
  ["poincy", "77"], // Poincy
  ["poissy", "78"], // Poissy
  ["poligny", "77"], // Poligny
  ["pommeuse", "77"], // Pommeuse
  ["pomponne", "77"], // Pomponne
  ["pontault combault", "77"], // Pontault-Combault
  ["pontcarre", "77"], // Pontcarré
  ["ponthevrard", "78"], // Ponthévrard
  ["pontoise", "95"], // Pontoise
  ["porcheville", "78"], // Porcheville
  ["precy sur marne", "77"], // Précy-sur-Marne
  ["presles", "95"], // Presles
  ["presles en brie", "77"], // Presles-en-Brie
  ["pringy", "77"], // Pringy
  ["provins", "77"], // Provins
  ["prunay en yvelines", "78"], // Prunay-en-Yvelines
  ["prunay le temple", "78"], // Prunay-le-Temple
  ["prunay sur essonne", "91"], // Prunay-sur-Essonne
  ["puiselet le marais", "91"], // Puiselet-le-Marais
  ["puiseux en france", "95"], // Puiseux-en-France
  ["puiseux pontoise", "95"], // Puiseux-Pontoise
  ["puisieux", "77"], // Puisieux
  ["pussay", "91"], // Pussay
  ["puteaux", "92"], // Puteaux
  ["quiers", "77"], // Quiers
  ["quincy sous senart", "91"], // Quincy-sous-Sénart
  ["quincy voisins", "77"], // Quincy-Voisins
  ["raizeux", "78"], // Raizeux
  ["rambouillet", "78"], // Rambouillet
  ["rampillon", "77"], // Rampillon
  ["reau", "77"], // Réau
  ["rebais", "77"], // Rebais
  ["recloses", "77"], // Recloses
  ["remauville", "77"], // Remauville
  ["rennemoulin", "78"], // Rennemoulin
  ["reuil en brie", "77"], // Reuil-en-Brie
  ["richarville", "91"], // Richarville
  ["richebourg", "78"], // Richebourg
  ["ris orangis", "91"], // Ris-Orangis
  ["rochefort en yvelines", "78"], // Rochefort-en-Yvelines
  ["roinville", "91"], // Roinville
  ["roinvilliers", "91"], // Roinvilliers
  ["roissy en brie", "77"], // Roissy-en-Brie
  ["roissy en france", "95"], // Roissy-en-France
  ["rolleboise", "78"], // Rolleboise
  ["romainville", "93"], // Romainville
  ["ronquerolles", "95"], // Ronquerolles
  ["rosay", "78"], // Rosay
  ["rosny sous bois", "93"], // Rosny-sous-Bois
  ["rosny sur seine", "78"], // Rosny-sur-Seine
  ["rouilly", "77"], // Rouilly
  ["rouvres", "77"], // Rouvres
  ["rozay en brie", "77"], // Rozay-en-Brie
  ["rubelles", "77"], // Rubelles
  ["rueil malmaison", "92"], // Rueil-Malmaison
  ["rumont", "77"], // Rumont
  ["rungis", "94"], // Rungis
  ["rupereux", "77"], // Rupéreux
  ["saacy sur marne", "77"], // Saâcy-sur-Marne
  ["sablonnieres", "77"], // Sablonnières
  ["saclas", "91"], // Saclas
  ["saclay", "91"], // Saclay
  ["sagy", "95"], // Sagy
  ["sailly", "78"], // Sailly
  ["saint arnoult en yvelines", "78"], // Saint-Arnoult-en-Yvelines
  ["saint aubin", "91"], // Saint-Aubin
  ["saint augustin", "77"], // Saint-Augustin
  ["saint barthelemy", "77"], // Saint-Barthélemy
  ["saint brice", "77"], // Saint-Brice
  ["saint brice sous foret", "95"], // Saint-Brice-sous-Forêt
  ["saint cheron", "91"], // Saint-Chéron
  ["saint clair sur epte", "95"], // Saint-Clair-sur-Epte
  ["saint cloud", "92"], // Saint-Cloud
  ["saint cyr en arthies", "95"], // Saint-Cyr-en-Arthies
  ["saint cyr l ecole", "78"], // Saint-Cyr-l'École
  ["saint cyr la riviere", "91"], // Saint-Cyr-la-Rivière
  ["saint cyr sous dourdan", "91"], // Saint-Cyr-sous-Dourdan
  ["saint cyr sur morin", "77"], // Saint-Cyr-sur-Morin
  ["saint denis", "93"], // Saint-Denis
  ["saint denis les rebais", "77"], // Saint-Denis-lès-Rebais
  ["saint escobille", "91"], // Saint-Escobille
  ["saint fargeau ponthierry", "77"], // Saint-Fargeau-Ponthierry
  ["saint fiacre", "77"], // Saint-Fiacre
  ["saint forget", "78"], // Saint-Forget
  ["saint germain de la grange", "78"], // Saint-Germain-de-la-Grange
  ["saint germain en laye", "78"], // Saint-Germain-en-Laye
  ["saint germain laval", "77"], // Saint-Germain-Laval
  ["saint germain laxis", "77"], // Saint-Germain-Laxis
  ["saint germain les arpajon", "91"], // Saint-Germain-lès-Arpajon
  ["saint germain les corbeil", "91"], // Saint-Germain-lès-Corbeil
  ["saint germain sous doue", "77"], // Saint-Germain-sous-Doue
  ["saint germain sur ecole", "77"], // Saint-Germain-sur-École
  ["saint germain sur morin", "77"], // Saint-Germain-sur-Morin
  ["saint gervais", "95"], // Saint-Gervais
  ["saint gratien", "95"], // Saint-Gratien
  ["saint hilaire", "91"], // Saint-Hilaire
  ["saint hilarion", "78"], // Saint-Hilarion
  ["saint hilliers", "77"], // Saint-Hilliers
  ["saint illiers la ville", "78"], // Saint-Illiers-la-Ville
  ["saint illiers le bois", "78"], // Saint-Illiers-le-Bois
  ["saint jean de beauregard", "91"], // Saint-Jean-de-Beauregard
  ["saint jean les deux jumeaux", "77"], // Saint-Jean-les-Deux-Jumeaux
  ["saint just en brie", "77"], // Saint-Just-en-Brie
  ["saint lambert", "78"], // Saint-Lambert
  ["saint leger", "77"], // Saint-Léger
  ["saint leger en yvelines", "78"], // Saint-Léger-en-Yvelines
  ["saint leu la foret", "95"], // Saint-Leu-la-Forêt
  ["saint loup de naud", "77"], // Saint-Loup-de-Naud
  ["saint mammes", "77"], // Saint-Mammès
  ["saint mande", "94"], // Saint-Mandé
  ["saint mard", "77"], // Saint-Mard
  ["saint mars vieux maisons", "77"], // Saint-Mars-Vieux-Maisons
  ["saint martin de brethencourt", "78"], // Saint-Martin-de-Bréthencourt
  ["saint martin des champs", "AMBIGUOUS"], // Saint-Martin-des-Champs
  ["saint martin du boschet", "77"], // Saint-Martin-du-Boschet
  ["saint martin du tertre", "95"], // Saint-Martin-du-Tertre
  ["saint martin en biere", "77"], // Saint-Martin-en-Bière
  ["saint martin la garenne", "78"], // Saint-Martin-la-Garenne
  ["saint maur des fosses", "94"], // Saint-Maur-des-Fossés
  ["saint maurice", "94"], // Saint-Maurice
  ["saint maurice montcouronne", "91"], // Saint-Maurice-Montcouronne
  ["saint mery", "77"], // Saint-Méry
  ["saint mesmes", "77"], // Saint-Mesmes
  ["saint michel sur orge", "91"], // Saint-Michel-sur-Orge
  ["saint nom la breteche", "78"], // Saint-Nom-la-Bretèche
  ["saint ouen en brie", "77"], // Saint-Ouen-en-Brie
  ["saint ouen l aumone", "95"], // Saint-Ouen-l'Aumône
  ["saint ouen sur morin", "77"], // Saint-Ouen-sur-Morin
  ["saint ouen sur seine", "93"], // Saint-Ouen-sur-Seine
  ["saint pathus", "77"], // Saint-Pathus
  ["saint pierre du perray", "91"], // Saint-Pierre-du-Perray
  ["saint pierre les nemours", "77"], // Saint-Pierre-lès-Nemours
  ["saint prix", "95"], // Saint-Prix
  ["saint remy de la vanne", "77"], // Saint-Rémy-de-la-Vanne
  ["saint remy l honore", "78"], // Saint-Rémy-l'Honoré
  ["saint remy les chevreuse", "78"], // Saint-Rémy-lès-Chevreuse
  ["saint sauveur les bray", "77"], // Saint-Sauveur-lès-Bray
  ["saint sauveur sur ecole", "77"], // Saint-Sauveur-sur-École
  ["saint simeon", "77"], // Saint-Siméon
  ["saint soupplets", "77"], // Saint-Soupplets
  ["saint sulpice de favieres", "91"], // Saint-Sulpice-de-Favières
  ["saint thibault des vignes", "77"], // Saint-Thibault-des-Vignes
  ["saint vrain", "91"], // Saint-Vrain
  ["saint witz", "95"], // Saint-Witz
  ["saint yon", "91"], // Saint-Yon
  ["sainte aulde", "77"], // Sainte-Aulde
  ["sainte colombe", "77"], // Sainte-Colombe
  ["sainte genevieve des bois", "91"], // Sainte-Geneviève-des-Bois
  ["sainte mesme", "78"], // Sainte-Mesme
  ["saintry sur seine", "91"], // Saintry-sur-Seine
  ["salins", "77"], // Salins
  ["sammeron", "77"], // Sammeron
  ["samois sur seine", "77"], // Samois-sur-Seine
  ["samoreau", "77"], // Samoreau
  ["sancy", "77"], // Sancy
  ["sancy les provins", "77"], // Sancy-lès-Provins
  ["sannois", "95"], // Sannois
  ["santeny", "94"], // Santeny
  ["santeuil", "95"], // Santeuil
  ["sarcelles", "95"], // Sarcelles
  ["sartrouville", "78"], // Sartrouville
  ["saulx les chartreux", "91"], // Saulx-les-Chartreux
  ["saulx marchais", "78"], // Saulx-Marchais
  ["savigny le temple", "77"], // Savigny-le-Temple
  ["savigny sur orge", "91"], // Savigny-sur-Orge
  ["savins", "77"], // Savins
  ["sceaux", "92"], // Sceaux
  ["seine port", "77"], // Seine-Port
  ["senlisse", "78"], // Senlisse
  ["sept sorts", "77"], // Sept-Sorts
  ["septeuil", "78"], // Septeuil
  ["seraincourt", "95"], // Seraincourt
  ["sermaise", "91"], // Sermaise
  ["serris", "77"], // Serris
  ["servon", "77"], // Servon
  ["seugy", "95"], // Seugy
  ["sevran", "93"], // Sevran
  ["sevres", "92"], // Sèvres
  ["signy signets", "77"], // Signy-Signets
  ["sigy", "77"], // Sigy
  ["sivry courtry", "77"], // Sivry-Courtry
  ["sognolles en montois", "77"], // Sognolles-en-Montois
  ["soignolles en brie", "77"], // Soignolles-en-Brie
  ["soindres", "78"], // Soindres
  ["soisy bouy", "77"], // Soisy-Bouy
  ["soisy sous montmorency", "95"], // Soisy-sous-Montmorency
  ["soisy sur ecole", "91"], // Soisy-sur-École
  ["soisy sur seine", "91"], // Soisy-sur-Seine
  ["solers", "77"], // Solers
  ["sonchamp", "78"], // Sonchamp
  ["souppes sur loing", "77"], // Souppes-sur-Loing
  ["sourdun", "77"], // Sourdun
  ["souzy la briche", "91"], // Souzy-la-Briche
  ["stains", "93"], // Stains
  ["sucy en brie", "94"], // Sucy-en-Brie
  ["suresnes", "92"], // Suresnes
  ["survilliers", "95"], // Survilliers
  ["tacoignieres", "78"], // Tacoignières
  ["tancrou", "77"], // Tancrou
  ["taverny", "95"], // Taverny
  ["tessancourt sur aubette", "78"], // Tessancourt-sur-Aubette
  ["themericourt", "95"], // Théméricourt
  ["thenisy", "77"], // Thénisy
  ["theuville", "95"], // Theuville
  ["thiais", "94"], // Thiais
  ["thieux", "77"], // Thieux
  ["thiverval grignon", "78"], // Thiverval-Grignon
  ["thoiry", "78"], // Thoiry
  ["thomery", "77"], // Thomery
  ["thorigny sur marne", "77"], // Thorigny-sur-Marne
  ["thoury ferottes", "77"], // Thoury-Férottes
  ["tigeaux", "77"], // Tigeaux
  ["tigery", "91"], // Tigery
  ["tilly", "78"], // Tilly
  ["torcy", "77"], // Torcy
  ["torfou", "91"], // Torfou
  ["touquin", "77"], // Touquin
  ["tournan en brie", "77"], // Tournan-en-Brie
  ["tousson", "77"], // Tousson
  ["toussus le noble", "78"], // Toussus-le-Noble
  ["trappes", "78"], // Trappes
  ["tremblay en france", "93"], // Tremblay-en-France
  ["treuzy levelay", "77"], // Treuzy-Levelay
  ["triel sur seine", "78"], // Triel-sur-Seine
  ["trilbardou", "77"], // Trilbardou
  ["trilport", "77"], // Trilport
  ["trocy en multien", "77"], // Trocy-en-Multien
  ["ury", "77"], // Ury
  ["us", "95"], // Us
  ["ussy sur marne", "77"], // Ussy-sur-Marne
  ["vaires sur marne", "77"], // Vaires-sur-Marne
  ["valence en brie", "77"], // Valence-en-Brie
  ["valenton", "94"], // Valenton
  ["vallangoujard", "95"], // Vallangoujard
  ["valmondois", "95"], // Valmondois
  ["valpuiseaux", "91"], // Valpuiseaux
  ["vanves", "92"], // Vanves
  ["vanville", "77"], // Vanvillé
  ["varennes jarcy", "91"], // Varennes-Jarcy
  ["varennes sur seine", "77"], // Varennes-sur-Seine
  ["varreddes", "77"], // Varreddes
  ["vaucourtois", "77"], // Vaucourtois
  ["vaucresson", "92"], // Vaucresson
  ["vaudherland", "95"], // Vaudherland
  ["vaudoy en brie", "77"], // Vaudoy-en-Brie
  ["vaugrigneuse", "91"], // Vaugrigneuse
  ["vauhallan", "91"], // Vauhallan
  ["vaujours", "93"], // Vaujours
  ["vaureal", "95"], // Vauréal
  ["vaux le penil", "77"], // Vaux-le-Pénil
  ["vaux sur lunain", "77"], // Vaux-sur-Lunain
  ["vaux sur seine", "78"], // Vaux-sur-Seine
  ["vayres sur essonne", "91"], // Vayres-sur-Essonne
  ["velizy villacoublay", "78"], // Vélizy-Villacoublay
  ["vemars", "95"], // Vémars
  ["vendrest", "77"], // Vendrest
  ["verdelot", "77"], // Verdelot
  ["verneuil l etang", "77"], // Verneuil-l'Étang
  ["verneuil sur seine", "78"], // Verneuil-sur-Seine
  ["vernou la celle sur seine", "77"], // Vernou-la-Celle-sur-Seine
  ["vernouillet", "78"], // Vernouillet
  ["verrieres le buisson", "91"], // Verrières-le-Buisson
  ["versailles", "78"], // Versailles
  ["vert", "78"], // Vert
  ["vert le grand", "91"], // Vert-le-Grand
  ["vert le petit", "91"], // Vert-le-Petit
  ["vert saint denis", "77"], // Vert-Saint-Denis
  ["vetheuil", "95"], // Vétheuil
  ["viarmes", "95"], // Viarmes
  ["vicq", "78"], // Vicq
  ["videlles", "91"], // Videlles
  ["vieille eglise en yvelines", "78"], // Vieille-Église-en-Yvelines
  ["vienne en arthies", "95"], // Vienne-en-Arthies
  ["vieux champagne", "77"], // Vieux-Champagne
  ["vignely", "77"], // Vignely
  ["vigneux sur seine", "91"], // Vigneux-sur-Seine
  ["vigny", "95"], // Vigny
  ["villabe", "91"], // Villabé
  ["villaines sous bois", "95"], // Villaines-sous-Bois
  ["ville d avray", "92"], // Ville-d'Avray
  ["ville saint jacques", "77"], // Ville-Saint-Jacques
  ["villebeon", "77"], // Villebéon
  ["villebon sur yvette", "91"], // Villebon-sur-Yvette
  ["villecerf", "77"], // Villecerf
  ["villeconin", "91"], // Villeconin
  ["villecresnes", "94"], // Villecresnes
  ["villejuif", "94"], // Villejuif
  ["villejust", "91"], // Villejust
  ["villemarechal", "77"], // Villemaréchal
  ["villemareuil", "77"], // Villemareuil
  ["villemer", "77"], // Villemer
  ["villemoisson sur orge", "91"], // Villemoisson-sur-Orge
  ["villemomble", "93"], // Villemomble
  ["villenauxe la petite", "77"], // Villenauxe-la-Petite
  ["villeneuve la garenne", "92"], // Villeneuve-la-Garenne
  ["villeneuve le comte", "77"], // Villeneuve-le-Comte
  ["villeneuve le roi", "94"], // Villeneuve-le-Roi
  ["villeneuve les bordes", "77"], // Villeneuve-les-Bordes
  ["villeneuve saint denis", "77"], // Villeneuve-Saint-Denis
  ["villeneuve saint georges", "94"], // Villeneuve-Saint-Georges
  ["villeneuve sous dammartin", "77"], // Villeneuve-sous-Dammartin
  ["villeneuve sur auvers", "91"], // Villeneuve-sur-Auvers
  ["villeneuve sur bellot", "77"], // Villeneuve-sur-Bellot
  ["villennes sur seine", "78"], // Villennes-sur-Seine
  ["villenoy", "77"], // Villenoy
  ["villeparisis", "77"], // Villeparisis
  ["villepinte", "93"], // Villepinte
  ["villepreux", "78"], // Villepreux
  ["villeron", "95"], // Villeron
  ["villeroy", "77"], // Villeroy
  ["villers en arthies", "95"], // Villers-en-Arthies
  ["villetaneuse", "93"], // Villetaneuse
  ["villette", "78"], // Villette
  ["villevaude", "77"], // Villevaudé
  ["villiers adam", "95"], // Villiers-Adam
  ["villiers en biere", "77"], // Villiers-en-Bière
  ["villiers le bacle", "91"], // Villiers-le-Bâcle
  ["villiers le bel", "95"], // Villiers-le-Bel
  ["villiers le mahieu", "78"], // Villiers-le-Mahieu
  ["villiers le sec", "95"], // Villiers-le-Sec
  ["villiers saint frederic", "78"], // Villiers-Saint-Frédéric
  ["villiers saint georges", "77"], // Villiers-Saint-Georges
  ["villiers sous grez", "77"], // Villiers-sous-Grez
  ["villiers sur marne", "94"], // Villiers-sur-Marne
  ["villiers sur morin", "77"], // Villiers-sur-Morin
  ["villiers sur orge", "91"], // Villiers-sur-Orge
  ["villiers sur seine", "77"], // Villiers-sur-Seine
  ["villuis", "77"], // Villuis
  ["vimpelles", "77"], // Vimpelles
  ["vinantes", "77"], // Vinantes
  ["vincennes", "94"], // Vincennes
  ["vincy man uvre", "77"], // Vincy-Manœuvre
  ["viroflay", "78"], // Viroflay
  ["viry chatillon", "91"], // Viry-Châtillon
  ["vitry sur seine", "94"], // Vitry-sur-Seine
  ["voinsles", "77"], // Voinsles
  ["voisenon", "77"], // Voisenon
  ["voisins le bretonneux", "78"], // Voisins-le-Bretonneux
  ["voulangis", "77"], // Voulangis
  ["voulton", "77"], // Voulton
  ["voulx", "77"], // Voulx
  ["vulaines les provins", "77"], // Vulaines-lès-Provins
  ["vulaines sur seine", "77"], // Vulaines-sur-Seine
  ["wissous", "91"], // Wissous
  ["wy dit joli village", "95"], // Wy-dit-Joli-Village
  ["yebles", "77"], // Yèbles
  ["yerres", "91"], // Yerres
]);
