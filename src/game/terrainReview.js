const REVIEW_CONFIDENCE_THRESHOLD = 0.65;
const TURKISH_NAME_COLLATOR = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

export function lowConfidenceReviewSurfaces(document, threshold = REVIEW_CONFIDENCE_THRESHOLD) {
  return (document?.surfaces || [])
    .filter((surface) => Number.isFinite(surface?.automatic?.confidence) && surface.automatic.confidence < threshold)
    .slice()
    .sort((first, second) => {
      const confidenceDifference = first.automatic.confidence - second.automatic.confidence;
      if (confidenceDifference !== 0) return confidenceDifference;
      const nameDifference = TURKISH_NAME_COLLATOR.compare(String(first.name || first.id), String(second.name || second.id));
      if (nameDifference !== 0) return nameDifference;
      return String(first.id).localeCompare(String(second.id));
    });
}
