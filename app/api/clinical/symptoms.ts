export const KEYWORDS = {
  chestPain: [/borstpijn/i, /pijn op de borst/i],
  fainting: [/flauwgevallen/i, /flauwvallen/i, /viel flauw/i],
  severeSobRest: [
    /benauwd in rust/i,
    /kortademig in rust/i,
    /kan( bijna)? niet ademen/i,
    /kan niet praten van( de)? benauwdheid/i
  ],
  ankleSwelling: [/enkel.*(gezwollen|zwelling)/i, /(gezwollen|dikke) enkels/i],
  missedMeds: [
    /medicatie (vergeten|gemist)/i,
    /pillen (vergeten|gemist)/i,
    /(dosis|tablet) vergeten/i
  ],
  stairsWorse: [/trap.*(slechter|moeilijker)/i, /traplopen.*slechter/i],
  stairsBetter: [/trap.*(beter|makkelijker)/i, /traplopen.*beter/i],
  stairsSame: [/trap.*(zelfde|hetzelfde|onveranderd)/i, /traplopen.*(zelfde|hetzelfde)/i]
} as const;

export function matchesAny(text: string, patterns: readonly RegExp[]) {
  return patterns.some((re) => re.test(text));
}
