const replacementPenalty = (value: string) => (value.match(/\u{FFFD}/gu)?.length ?? 0) * 1000;
const cjkBonus = (value: string) => (value.match(/[\u{3400}-\u{9FFF}]/gu)?.length ?? 0) * 2;
const controlPenalty = (value: string) =>
  [...value].filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  }).length * 10;

const score = (value: string) => replacementPenalty(value) + controlPenalty(value) - cjkBonus(value);

export const normalizeDisplayText = (value: string) => {
  if (!/[\u{0080}-\u{00FF}]/u.test(value) || [...value].some((character) => (character.codePointAt(0) ?? 0) > 255)) {
    return value;
  }

  const bytes = Uint8Array.from([...value].map((character) => character.codePointAt(0) ?? 0));
  const candidates = [value];
  for (const encoding of ['utf8', 'gbk']) {
    try {
      candidates.push(new TextDecoder(encoding).decode(bytes));
    } catch {
      // Encoding support varies by browser.
    }
  }

  return candidates.sort((a, b) => score(a) - score(b))[0];
};
