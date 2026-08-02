import { useCallback, useEffect, useRef, useState } from "react";

import { lireTableauLocal } from "../settings/tableauLocalSource";
import { resumerComptesPourLeRond, type ComptesDuRond } from "./comptesDuRond";

/** Au plus une lecture des comptes toutes les 15 s, comme le rafraîchissement des quotas. */
const RELECTURE_THROTTLE_MS = 15_000;

/**
 * Les comptes, lus AU SURVOL du rond — jamais en fond.
 *
 * La page `/settings/tableau-local` sonde toutes les 60 s tant qu'elle est
 * ouverte, ce qui est juste : on la regarde. Le rond, lui, est présent sur
 * chaque écran ; le sonder en permanence ferait tourner une requête réseau
 * pendant toute la session pour une information que personne ne regarde. Le
 * moment où quelqu'un ouvre le panneau EST le moment où le chiffre doit être
 * frais.
 */
export function useComptesDuRond(): {
  readonly comptes: ComptesDuRond;
  readonly lireSiOuvert: (ouvert: boolean) => void;
} {
  const [resume, setResume] = useState<ComptesDuRond>(() => resumerComptesPourLeRond(null));
  const derniereLectureRef = useRef(0);
  // Une lecture partie avant un démontage ne doit pas écrire dans un composant
  // disparu, et une lecture plus ancienne ne doit pas écraser une plus récente.
  const generationRef = useRef(0);
  const monteRef = useRef(true);

  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const lireSiOuvert = useCallback((ouvert: boolean) => {
    if (!ouvert) return;
    const maintenant = Date.now();
    if (maintenant - derniereLectureRef.current < RELECTURE_THROTTLE_MS) return;
    derniereLectureRef.current = maintenant;
    const generation = ++generationRef.current;
    void lireTableauLocal().then((etat) => {
      if (!monteRef.current || generationRef.current !== generation) return;
      setResume(resumerComptesPourLeRond(etat));
    });
  }, []);

  return { comptes: resume, lireSiOuvert };
}
