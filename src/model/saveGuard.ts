/** Permette di salvare un progetto vuoto solo dopo un "Nuovo" esplicito. */
let allowEmpty = false;
export const allowEmptySave = () => {
  allowEmpty = true;
};
export const consumeAllowEmpty = () => {
  const v = allowEmpty;
  allowEmpty = false;
  return v;
};
