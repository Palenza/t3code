import { useMemo, useState } from "react";

import {
  BellIcon,
  BookmarkIcon,
  BoxIcon,
  BriefcaseIcon,
  BugIcon,
  CalendarIcon,
  CameraIcon,
  CloudIcon,
  CodeIcon,
  CoffeeIcon,
  CompassIcon,
  CpuIcon,
  DatabaseIcon,
  FlagIcon,
  FlameIcon,
  FolderIcon,
  GamepadIcon,
  GlobeIcon,
  HeartIcon,
  HouseIcon,
  ImageIcon,
  LayersIcon,
  LeafIcon,
  LightbulbIcon,
  MailIcon,
  MapIcon,
  MegaphoneIcon,
  MoonIcon,
  MusicIcon,
  PaletteIcon,
  PenToolIcon,
  RocketIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  SunIcon,
  TerminalIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  VideoIcon,
  WandIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";

/**
 * Le sélecteur d'icône d'espace, façon Arc (demande fondateur 29/07 : « on
 * lui propose très peu d'icônes, et celles-là n'ont aucun sens »).
 *
 * Deux onglets — Emoji et Icône — une recherche, et des catégories. La liste
 * d'emoji est embarquée plutôt que tirée d'une dépendance : elle tient en
 * quelques kilo-octets, se cherche en FRANÇAIS comme en anglais, et n'ajoute
 * ni paquet ni surface d'attaque. Les icônes viennent de lucide, déjà là.
 */

interface Entree {
  readonly valeur: string;
  readonly mots: string;
}

const EMOJI_CATEGORIES: ReadonlyArray<{
  readonly nom: string;
  readonly entrees: ReadonlyArray<Entree>;
}> = [
  {
    nom: "Travail",
    entrees: [
      { valeur: "💼", mots: "travail boulot job business mallette" },
      { valeur: "🏭", mots: "usine production industrie factory" },
      { valeur: "🛠️", mots: "outils atelier build chantier tools" },
      { valeur: "⚙️", mots: "réglages engrenage config settings" },
      { valeur: "📊", mots: "graphique stats données chart analytics" },
      { valeur: "📈", mots: "croissance hausse growth revenus" },
      { valeur: "🧪", mots: "test labo expérience beta lab" },
      { valeur: "🐛", mots: "bug débogage debug erreur" },
      { valeur: "🚀", mots: "lancement rocket prod deploy fusée" },
      { valeur: "💡", mots: "idée ampoule inspiration idea" },
      { valeur: "🎯", mots: "objectif cible target but" },
      { valeur: "📌", mots: "épingle pin important" },
      { valeur: "🗂️", mots: "dossiers classement archives files" },
      { valeur: "📝", mots: "notes écrire rédaction write" },
      { valeur: "🔍", mots: "recherche loupe search audit" },
      { valeur: "⏱️", mots: "temps chrono perf vitesse" },
    ],
  },
  {
    nom: "Création",
    entrees: [
      { valeur: "🎨", mots: "design couleurs palette art dessin" },
      { valeur: "✨", mots: "magie brillant sparkles nouveau" },
      { valeur: "🖌️", mots: "pinceau peinture design brush" },
      { valeur: "📷", mots: "photo appareil camera image" },
      { valeur: "🎬", mots: "vidéo film cinéma montage clap" },
      { valeur: "🎧", mots: "audio musique casque son écoute" },
      { valeur: "🎵", mots: "musique note son piste music" },
      { valeur: "🎹", mots: "piano clavier musique midi" },
      { valeur: "🎸", mots: "guitare musique rock" },
      { valeur: "📐", mots: "règle mesure précision layout" },
      { valeur: "🪄", mots: "baguette magie auto wand" },
      { valeur: "🖼️", mots: "image cadre galerie visuel" },
    ],
  },
  {
    nom: "Nature",
    entrees: [
      { valeur: "🌱", mots: "pousse graine début growth plante" },
      { valeur: "🌿", mots: "feuille nature vert plante" },
      { valeur: "🔥", mots: "feu flamme chaud urgent hot" },
      { valeur: "💧", mots: "eau goutte liquide" },
      { valeur: "⚡", mots: "éclair rapide énergie zap" },
      { valeur: "🌙", mots: "lune nuit sombre nocturne" },
      { valeur: "☀️", mots: "soleil jour clair lumière" },
      { valeur: "🌊", mots: "vague océan mer flux" },
      { valeur: "🏔️", mots: "montagne sommet défi" },
      { valeur: "🌸", mots: "fleur printemps rose douceur" },
      { valeur: "🍀", mots: "trèfle chance luck" },
      { valeur: "🌍", mots: "terre monde global international" },
    ],
  },
  {
    nom: "Animaux",
    entrees: [
      { valeur: "🦖", mots: "dinosaure raptor trex puissance" },
      { valeur: "🦅", mots: "aigle rapace vol oiseau" },
      { valeur: "🐺", mots: "loup meute sauvage" },
      { valeur: "🦊", mots: "renard malin fox" },
      { valeur: "🐙", mots: "poulpe pieuvre multitâche" },
      { valeur: "🦈", mots: "requin shark chasse" },
      { valeur: "🐝", mots: "abeille travail ruche" },
      { valeur: "🦉", mots: "hibou nuit sagesse" },
      { valeur: "🐉", mots: "dragon puissance légende" },
      { valeur: "🦁", mots: "lion roi force" },
      { valeur: "🐢", mots: "tortue lent patient" },
      { valeur: "🦋", mots: "papillon transformation" },
    ],
  },
  {
    nom: "Objets",
    entrees: [
      { valeur: "📦", mots: "boîte paquet livraison package" },
      { valeur: "🔧", mots: "clé outil réparation fix" },
      { valeur: "🧭", mots: "boussole direction cap navigation" },
      { valeur: "🔑", mots: "clé accès auth secret" },
      { valeur: "🛡️", mots: "bouclier sécurité protection" },
      { valeur: "💎", mots: "diamant précieux premium qualité" },
      { valeur: "🏆", mots: "trophée gagné succès win" },
      { valeur: "📱", mots: "mobile téléphone app iphone" },
      { valeur: "💻", mots: "ordinateur laptop dev code" },
      { valeur: "🖥️", mots: "écran bureau desktop" },
      { valeur: "🗄️", mots: "archive classeur stockage" },
      { valeur: "☕", mots: "café pause matin coffee" },
    ],
  },
  {
    nom: "Symboles",
    entrees: [
      { valeur: "❤️", mots: "coeur amour favori like" },
      { valeur: "⭐", mots: "étoile favori star important" },
      { valeur: "🔴", mots: "rouge point urgent stop" },
      { valeur: "🟠", mots: "orange point attention" },
      { valeur: "🟢", mots: "vert point ok go" },
      { valeur: "🔵", mots: "bleu point info" },
      { valeur: "🟣", mots: "violet point" },
      { valeur: "⚫", mots: "noir point neutre" },
      { valeur: "✅", mots: "fait validé check terminé" },
      { valeur: "❌", mots: "annulé faux erreur non" },
      { valeur: "⚠️", mots: "attention danger warning" },
      { valeur: "♾️", mots: "infini toujours illimité" },
    ],
  },
];

const ICONES: ReadonlyArray<{ readonly nom: string; readonly Composant: typeof StarIcon }> = [
  { nom: "étoile favori star", Composant: StarIcon },
  { nom: "signet marque bookmark", Composant: BookmarkIcon },
  { nom: "coeur favori heart", Composant: HeartIcon },
  { nom: "drapeau flag repère", Composant: FlagIcon },
  { nom: "éclair rapide zap", Composant: ZapIcon },
  { nom: "flamme feu chaud", Composant: FlameIcon },
  { nom: "étincelles magie ia", Composant: SparklesIcon },
  { nom: "cloche alerte notif", Composant: BellIcon },
  { nom: "idée ampoule", Composant: LightbulbIcon },
  { nom: "palette design couleur", Composant: PaletteIcon },
  { nom: "plume dessin design", Composant: PenToolIcon },
  { nom: "calques espaces", Composant: LayersIcon },
  { nom: "base données db", Composant: DatabaseIcon },
  { nom: "processeur cpu perf", Composant: CpuIcon },
  { nom: "code dev", Composant: CodeIcon },
  { nom: "terminal shell", Composant: TerminalIcon },
  { nom: "bug débogage", Composant: BugIcon },
  { nom: "clé outil réglage", Composant: WrenchIcon },
  { nom: "dossier fichiers", Composant: FolderIcon },
  { nom: "boîte paquet", Composant: BoxIcon },
  { nom: "mallette travail", Composant: BriefcaseIcon },
  { nom: "calendrier date", Composant: CalendarIcon },
  { nom: "courrier mail", Composant: MailIcon },
  { nom: "monde global web", Composant: GlobeIcon },
  { nom: "boussole cap", Composant: CompassIcon },
  { nom: "carte plan", Composant: MapIcon },
  { nom: "maison accueil", Composant: HouseIcon },
  { nom: "personnes équipe", Composant: UsersIcon },
  { nom: "bouclier sécurité", Composant: ShieldIcon },
  { nom: "fusée lancement", Composant: RocketIcon },
  { nom: "croissance stats", Composant: TrendingUpIcon },
  { nom: "mégaphone annonce", Composant: MegaphoneIcon },
  { nom: "musique audio", Composant: MusicIcon },
  { nom: "vidéo film", Composant: VideoIcon },
  { nom: "image photo", Composant: ImageIcon },
  { nom: "appareil photo", Composant: CameraIcon },
  { nom: "jeu manette", Composant: GamepadIcon },
  { nom: "café pause", Composant: CoffeeIcon },
  { nom: "nuage cloud", Composant: CloudIcon },
  { nom: "feuille nature", Composant: LeafIcon },
  { nom: "soleil clair jour", Composant: SunIcon },
  { nom: "lune nuit sombre", Composant: MoonIcon },
  { nom: "camion livraison", Composant: TruckIcon },
  { nom: "baguette magie", Composant: WandIcon },
];

/** Le nom d'une icône lucide, préfixé pour le distinguer d'un emoji. */
export const ICON_PREFIX = "icon:";

export function estIconeLucide(valeur: string): boolean {
  return valeur.startsWith(ICON_PREFIX);
}

/** Rend l'icône d'un espace, qu'elle soit emoji ou icône lucide. */
export function SpaceIcon({ valeur, className }: { valeur: string; className?: string }) {
  if (!estIconeLucide(valeur)) {
    return <span className={cn("leading-none", className)}>{valeur}</span>;
  }
  const nom = valeur.slice(ICON_PREFIX.length);
  const trouve = ICONES.find((entree) => entree.nom === nom);
  const Composant = trouve?.Composant ?? StarIcon;
  return <Composant className={cn("size-4", className)} />;
}

export function SpaceIconPicker({
  valeur,
  onChange,
}: {
  readonly valeur: string;
  readonly onChange: (valeur: string) => void;
}) {
  const [onglet, setOnglet] = useState<"emoji" | "icone">("emoji");
  const [recherche, setRecherche] = useState("");
  const requete = recherche.trim().toLowerCase();

  const emojisFiltres = useMemo(() => {
    if (requete === "") return EMOJI_CATEGORIES;
    return EMOJI_CATEGORIES.map((categorie) => ({
      nom: categorie.nom,
      entrees: categorie.entrees.filter((entree) => entree.mots.includes(requete)),
    })).filter((categorie) => categorie.entrees.length > 0);
  }, [requete]);

  const iconesFiltrees = useMemo(
    () => (requete === "" ? ICONES : ICONES.filter((icone) => icone.nom.includes(requete))),
    [requete],
  );

  return (
    <div className="flex w-[320px] flex-col">
      <div className="flex items-center gap-1 px-3 pt-3">
        {(["emoji", "icone"] as const).map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setOnglet(cle)}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
              onglet === cle
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {cle === "emoji" ? "Emoji" : "Icône"}
          </button>
        ))}
      </div>
      <div className="relative px-3 pt-2">
        <SearchIcon className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={recherche}
          onChange={(event) => setRecherche(event.currentTarget.value)}
          placeholder="Rechercher"
          className="h-8 w-full rounded-lg border border-border/60 bg-transparent pl-7 pr-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="max-h-64 overflow-y-auto px-3 pb-3 pt-2">
        {onglet === "emoji" ? (
          emojisFiltres.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground/70">
              Rien pour « {recherche} ».
            </p>
          ) : (
            emojisFiltres.map((categorie) => (
              <div key={categorie.nom} className="pb-2">
                <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  {categorie.nom}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {categorie.entrees.map((entree) => (
                    <button
                      key={entree.valeur}
                      type="button"
                      aria-label={entree.mots.split(" ")[0]}
                      onClick={() => onChange(entree.valeur)}
                      className={cn(
                        "flex aspect-square cursor-pointer items-center justify-center rounded-md text-[17px] transition-colors",
                        valeur === entree.valeur ? "bg-accent ring-1 ring-ring" : "hover:bg-accent/60",
                      )}
                    >
                      {entree.valeur}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )
        ) : iconesFiltrees.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground/70">
            Rien pour « {recherche} ».
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {iconesFiltrees.map(({ nom, Composant }) => {
              const cle = `${ICON_PREFIX}${nom}`;
              return (
                <button
                  key={nom}
                  type="button"
                  aria-label={nom.split(" ")[0]}
                  onClick={() => onChange(cle)}
                  className={cn(
                    "flex aspect-square cursor-pointer items-center justify-center rounded-md transition-colors",
                    valeur === cle ? "bg-accent ring-1 ring-ring" : "hover:bg-accent/60",
                  )}
                >
                  <Composant className="size-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
