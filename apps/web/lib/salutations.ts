// The Anrede options offered on every form that asks for one.
//
// A free-text field was there before, which meant the same person could be
// "Hr.", "Herr" or "herr" depending on who typed it — and that string is
// printed at the top of the Nutzungsvereinbarung, so the inconsistency is
// visible to the customer.
//
// The list is the set in ordinary German business use, plus the two an
// association booking a venue actually needs: a family and an organisation
// both book here regularly and neither is "Frau" or "Herr".
export const SALUTATIONS = [
  'Frau',
  'Herr',
  'Divers',
  'Familie',
  'Firma',
] as const;

export type Salutation = (typeof SALUTATIONS)[number];
