export const SCORE_RANGES = [
  { value: "4-5", zh: "4–5 分", en: "4–5", min: 4, max: 5, exclusive: false },
  { value: "3-4", zh: "3–4 分", en: "3–4", min: 3, max: 4, exclusive: true },
  { value: "2-3", zh: "2–3 分", en: "2–3", min: 2, max: 3, exclusive: true },
  {
    value: "below-2",
    zh: "2 分以下",
    en: "Below 2",
    min: 0,
    max: 2,
    exclusive: true,
  },
];
export const scoreBounds = (value: string | null) => {
  const range = SCORE_RANGES.find((r) => r.value === value);
  return range
    ? {
        min_score: range.min,
        max_score: range.max,
        max_score_exclusive: range.exclusive,
      }
    : {};
};
