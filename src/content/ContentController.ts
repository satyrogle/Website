/** Keeps the hero readable when WebGL is unavailable. */
export class ContentController {
  constructor(webgl: boolean, _agentCount: number) {
    document.body.classList.toggle('no-webgl', !webgl);
  }
}
