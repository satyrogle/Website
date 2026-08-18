/**
 * Editorial behaviour: reveals, current-section navigation, and the
 * honest numbers. All content lives in the DOM whether or not the
 * world renders.
 */
export class ContentController {
  private readonly observers: IntersectionObserver[] = [];

  constructor(webgl: boolean, agentCount: number) {
    document.body.classList.toggle('no-webgl', !webgl);

    // honest node count in the copy
    for (const el of document.querySelectorAll('[data-node-count]')) {
      el.textContent = agentCount.toLocaleString('en-GB');
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-webgl-only]')) {
      el.hidden = !webgl;
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-no-webgl]')) {
      el.hidden = webgl;
    }
    const note = document.querySelector<HTMLElement>('[data-live-note]');
    if (note) note.hidden = !webgl;

    // reveals
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            reveal.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' }
    );
    for (const el of document.querySelectorAll('[data-reveal]')) reveal.observe(el);
    this.observers.push(reveal);

    // current-section marker in the nav
    const links = new Map<string, HTMLAnchorElement>();
    for (const a of document.querySelectorAll<HTMLAnchorElement>('.site-nav a')) {
      const id = a.getAttribute('href')?.slice(1);
      if (id) links.set(id, a);
    }
    const current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const link = links.get(entry.target.id);
          if (!link) continue;
          if (entry.isIntersecting) {
            for (const other of links.values()) other.removeAttribute('aria-current');
            link.setAttribute('aria-current', 'true');
          }
        }
      },
      { rootMargin: '-40% 0px -50% 0px' }
    );
    for (const id of links.keys()) {
      const section = document.getElementById(id);
      if (section) current.observe(section);
    }
    this.observers.push(current);
  }

  dispose(): void {
    for (const o of this.observers) o.disconnect();
  }
}
