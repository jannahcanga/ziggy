// ziggy's cat: all black, chalk outline, no pupils, eyelashes.
// catSVG(expression) returns the drawing. EXPRESSIONS lists every face he can make.

let uid = 0;
const W = '#f0f0ee';
const P = '#a98ff0';

// Left-eye pieces. The right eye is the same drawing mirrored.
const EYES = {
  sassy: `<path class="fill" d="M39.6 48.8 L53.4 48.2 Q51.4 55.4 45.6 55.3 Q41.2 54.6 39.6 48.8 Z"/>
          <path class="ln" d="M38.8 49 L54.8 48"/>
          <path class="ln thin" d="M39 48.6 L33.5 45.6 M41 48.3 L37.5 44 M43.5 48.1 L41.8 43.4"/>`,
  blink: `<path class="ln" d="M39 50.5 Q47 54.5 55 50.5"/>
          <path class="ln thin" d="M40.5 51.4 L36 54.2 M43 52.6 L40.2 56.4 M46 53.3 L44.6 57.6"/>`,
  happy: `<path class="ln" d="M39 54 Q47 44.5 55 54"/>
          <path class="ln thin" d="M39.6 52.6 L34.5 51.6 M41 50.2 L36.6 47.8 M43.2 48.3 L40.4 44.6"/>`,
  excited: `<ellipse class="fill" cx="47" cy="50.5" rx="6.6" ry="8.6"/>
            <path class="ln thin" d="M41.6 45.4 L36.6 42.2 M43.2 43.4 L40 39 M45.4 42.2 L44 37.4"/>`,
  smug: `<path class="fill" d="M39.6 50.4 L53.6 49.2 Q48.6 54.8 42.4 54 Q40 53 39.6 50.4 Z"/>
         <path class="ln" d="M38.8 50.6 L54.8 49"/>
         <path class="ln thin" d="M39.4 50.4 L34 48.4 M41.4 50 L38 46.4"/>`,
  sleepy: `<path class="ln" d="M40 52 Q47 56 54 52"/>
           <path class="ln thin" d="M41.4 53 L37.4 56.6 M44 54.2 L41.6 58.4"/>`,
  shook: `<ellipse class="fill" cx="47" cy="50" rx="5.4" ry="6.6"/>
          <path class="ln thin" d="M42.2 45.6 L38 42.6 M44 44.2 L41.4 40.2"/>`,
  love: `<path class="fill" d="M47 56.6 C39.4 51.6 39.4 45 43.6 44.4 C45.6 44.1 46.8 45.6 47 46.8 C47.2 45.6 48.4 44.1 50.4 44.4 C54.6 45 54.6 51.6 47 56.6 Z"/>
         <path class="ln thin" d="M41.4 46 L36.6 43.4 M43 44.6 L40.4 40.6"/>`,
  judging: `<path class="fill" d="M40 50.2 L53.6 49.5 L52.8 52.2 L41.2 52.6 Z"/>
            <path class="ln thin" d="M39.8 50.2 L34.6 48.4 M41.8 49.9 L38.8 46.4"/>
            <path class="ln thin" d="M41 44.2 L53 43"/>`,
};
const MOUTH = {
  w: '<path class="ln mid" d="M54.6 64 Q57.3 67.4 60 64 Q62.7 67.4 65.4 64"/>',
  smile: '<path class="ln mid" d="M54 63.4 Q60 70 66 63.4"/>',
  open: '<path class="fill" d="M54 63 Q60 73.5 66 63 Q60 65.4 54 63 Z"/>',
  smirk: '<path class="ln mid" d="M55.2 64.4 Q61 67.4 66.4 61.8"/>',
  small: '<path class="ln mid" d="M56.6 64.4 Q58.3 66.2 60 64.4 Q61.7 66.2 63.4 64.4"/>',
  o: '<ellipse class="ln mid" cx="60" cy="66.4" rx="2.2" ry="2.8"/>',
  flat: '<path class="ln mid" d="M56 65.4 L64 65.2"/>',
};
const star = (x, y, s, c = P) => `<path fill="${c}" d="M${x} ${y - s} Q${x + s * .18} ${y - s * .18} ${x + s} ${y} Q${x + s * .18} ${y + s * .18} ${x} ${y + s} Q${x - s * .18} ${y + s * .18} ${x - s} ${y} Q${x - s * .18} ${y - s * .18} ${x} ${y - s} Z"/>`;
const EXTRA = {
  excited: star(18, 26, 5) + star(104, 20, 3.6, W) + star(108, 38, 2.4),
  love: `<path fill="${P}" d="M98 28 C90 23 90 16.4 94.4 15.8 C96.4 15.5 97.6 17 98 18.4 C98.4 17 99.6 15.5 101.6 15.8 C106 16.4 106 23 98 28 Z"/>` + star(20, 22, 3, W),
  sleepy: `<path class="ln mid" d="M90 22 L97 22 L90 29 L97 29 M100 10 L105 10 L100 15 L105 15"/>`,
  shook: `<path class="ln mid" d="M48 4 L50 11 M60 1.5 L60 9 M72 4 L70 11"/>`,
  smug: star(102, 22, 2.6, W),
};
const FACES = {
  sassy: ['sassy', 'w'], happy: ['happy', 'smile'], excited: ['excited', 'open'], smug: ['smug', 'smirk'],
  love: ['love', 'smile'], shook: ['shook', 'o'], sleepy: ['sleepy', 'small'], judging: ['judging', 'flat'],
};
export const EXPRESSIONS = Object.keys(FACES);
const BLINKS = new Set(['sassy', 'excited', 'smug', 'shook', 'judging']);

const big = (k) => `<g transform="translate(47 51) scale(1.14) translate(-47 -51)">${EYES[k]}</g>`;
const eyesPair = (k) => `<g>${big(k)}</g><g transform="translate(120 0) scale(-1 1)">${big(k)}</g>`;

export function catSVG(expr = 'sassy', label = 'the cat') {
  const [eyes, mouth] = FACES[expr] || FACES.sassy;
  const id = 'chalk' + (++uid);
  const sil = `<ellipse cx="60" cy="52" rx="35" ry="28"/>
    <path d="M28 46 C27 34 29 24 33 17 C34.4 14.6 37 14.4 39 16.2 L54 29 Z"/>
    <path d="M92 46 C93 34 91 24 87 17 C85.6 14.6 83 14.4 81 16.2 L66 29 Z"/>
    <path d="M34 66 C25 82 23.6 100 35 108.6 C42 114 78 114 85 108.6 C96.4 100 95 82 86 66 Z"/>
    <ellipse cx="45" cy="110" rx="10" ry="5.4"/><ellipse cx="75" cy="110" rx="10" ry="5.4"/>`;
  const tail = 'M80 106 C104 108 114.6 93 111.4 77 C110 69.6 113 63.6 118.6 64.4';
  return `<svg class="cat" data-expr="${expr}" data-blinks="${BLINKS.has(expr)}" viewBox="0 -4 124 124" role="img" aria-label="${label}">
  <defs>
    <filter id="${id}" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${uid % 7 + 2}" result="wob"/>
      <feDisplacementMap in="SourceGraphic" in2="wob" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="rough"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="11" result="dust"/>
      <feColorMatrix in="dust" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -2.4 0 0 0 2.15" result="grain"/>
      <feComposite in="rough" in2="grain" operator="in"/>
    </filter>
  </defs>
  <g class="cat-tail">
    <path d="${tail}" fill="none" stroke="${W}" stroke-width="12.4" stroke-linecap="round" filter="url(#${id})"/>
    <path d="${tail}" fill="none" stroke="#000" stroke-width="6.4" stroke-linecap="round"/>
  </g>
  <g class="cat-body">
    <g fill="${W}" stroke="${W}" stroke-width="7" stroke-linejoin="round" filter="url(#${id})">${sil}</g>
    <g fill="#000">${sil}</g>
    <g class="face" filter="url(#${id})">
      <g class="eyes">${eyesPair(eyes)}</g>
      <g class="eyes-blink">${eyesPair('blink')}</g>
      <path fill="${W}" d="M58 60.4 L62 60.4 Q60 63.4 60 63.4 Q60 63.4 58 60.4 Z"/>
      ${MOUTH[mouth]}
      <path class="ln thin" d="M25.4 57 L13 54 M25.6 62.4 L12.4 63.6 M94.6 57 L107 54 M94.4 62.4 L107.6 63.6"/>
    </g>
  </g>
  <g class="extra" filter="url(#${id})">${EXTRA[expr] || ''}</g>
</svg>`;
}

// A small chalk gift box for the end of the XP bar.
export function giftSVG() {
  const id = 'chalk' + (++uid);
  return `<svg class="gift" viewBox="0 0 40 40" aria-hidden="true">
  <defs><filter id="${id}" x="-15%" y="-15%" width="130%" height="130%">
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="wob"/>
    <feDisplacementMap in="SourceGraphic" in2="wob" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="rough"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="11" result="dust"/>
    <feColorMatrix in="dust" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -3.2 0 0 0 2.35" result="grain"/>
    <feComposite in="rough" in2="grain" operator="in"/>
  </filter></defs>
  <g filter="url(#${id})" stroke="${W}" stroke-width="2" stroke-linejoin="round" fill="#000">
    <rect x="7" y="18" width="26" height="18" rx="2"/>
    <rect x="5" y="12" width="30" height="7" rx="2"/>
  </g>
  <g filter="url(#${id})" fill="none" stroke="${P}" stroke-width="2.4" stroke-linecap="round">
    <path d="M20 12 V36"/>
    <path d="M20 12 C15 4 9 7 12 10.4 C14 12.2 18 12 20 12 C22 12 26 12.2 28 10.4 C31 7 25 4 20 12"/>
  </g>
</svg>`;
}
