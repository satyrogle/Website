import './styles/tokens.css';
import './styles/global.css';
import './styles/typography.css';
import './styles/sections.css';

import { AccessibilityController } from './accessibility/AccessibilityController';

/**
 * The evidence page is a document. It carries no WebGL, no scroll
 * choreography and no dependency on the prologue bundle — the only
 * script is the print handling that opens any disclosure before the
 * snapshot is taken.
 */
new AccessibilityController().init();
