import { seedFromLocation } from '../core/ExperienceState';
import type { Detent } from '../core/Delta';
import { mountPlate } from './Plate';

/**
 * THE RECORD page. Its own entry, its own scroll: nothing here is in
 * the journey's beat grid, because the ScrollDirector measures page
 * progress against the whole document and a plate below the floor
 * would have moved every beat.
 *
 * ?seed=N     the world to draw (the same switch the journey takes)
 * ?detent=-1  the future to compare against the baseline; default +1
 */

function detentFromLocation(): Detent {
  const raw = new URLSearchParams(window.location.search).get('detent');
  if (raw === '-1') return -1;
  if (raw === '0') return 0;
  return 1;
}

mountPlate(seedFromLocation(), detentFromLocation());
