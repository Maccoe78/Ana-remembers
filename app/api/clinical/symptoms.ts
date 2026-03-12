export const KEYWORDS = {
  chestPain: [/borstpijn/i, /pijn op de borst/i, /pijn.*borst/i],
  fainting: [/flauwgevallen/i, /flauwvallen/i, /viel flauw/i],
  severeSobRest: [
    /benauwd in rust/i,
    /kortademig in rust/i,
    /kan( bijna)? niet ademen/i,
    /kan niet praten van( de)? benauwdheid/i
  ],
  ankleSwelling: [
    /enkel.*(gezwollen|zwelling|dik|opgezet)/i,
    /(gezwollen|dikke|opgezette) enkels/i,
    /benen.*(gezwollen|dik|opgezet)/i,
    /vocht.*(enkel|been|benen)/i
  ],
  noAnkleSwelling: [
    /enkels? niet gezwollen/i,
    /geen zwelling/i,
    /niet gezwollen/i,
    /geen vocht/i
  ],
  missedMeds: [
    /medicatie? (vergeten|gemist|niet genomen|overgeslagen)/i,
    /pillen? (vergeten|gemist|niet genomen)/i,
    /(dosis|tablet) vergeten/i,
    /niet (elke dag|dagelijks|altijd) (medicatie|pillen?|ingenomen)/i,
    /behalve \d+ dag/i,
    /\d+ dag(en)? (niet|vergeten|gemist|overgeslagen)/i,
    /(een|1|twee|2|drie|3) (dag|dagen) (niet|vergeten|gemist)/i,
    /soms vergeten/i,
    /af en toe vergeten/i
  ],
  stairsWorse: [/trap.*(slechter|moeilijker)/i, /traplopen.*slechter/i],
  stairsBetter: [/trap.*(beter|makkelijker)/i, /traplopen.*beter/i],
  stairsSame: [/trap.*(zelfde|hetzelfde|onveranderd)/i, /traplopen.*(zelfde|hetzelfde)/i]
} as const;

export function matchesAny(text: string, patterns: readonly RegExp[]) {
  return patterns.some((re) => re.test(text));
}
