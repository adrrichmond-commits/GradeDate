export interface CoachingTip {
  id: string;
  text: string;
  source: "rule";
}

const LIGHTING_CUES = ["light", "lighting", "dark", "bright", "shadow"];
const FRAMING_CUES = ["crop", "frame", "angle", "close", "group"];

const LIGHTING_TIP: CoachingTip = {
  id: "lighting",
  text: "Try even, natural light facing you.",
  source: "rule",
};

const FRAMING_TIP: CoachingTip = {
  id: "framing",
  text: "Keep your face clear and crop out distracting edges or group context.",
  source: "rule",
};

const PHOTO_COUNT_TIP: CoachingTip = {
  id: "photo-count",
  text: "Try adding 3–5 varied photos so people can see more of you.",
  source: "rule",
};

/** Derive stable, constructive coaching from existing feedback and photo count. */
export function deriveCoachingTips(feedback: string[], photoCount: number): CoachingTip[] {
  const normalizedFeedback = feedback.join(" ").toLowerCase();
  const tips: CoachingTip[] = [];

  if (LIGHTING_CUES.some((cue) => normalizedFeedback.includes(cue))) {
    tips.push({ ...LIGHTING_TIP });
  }
  if (FRAMING_CUES.some((cue) => normalizedFeedback.includes(cue))) {
    tips.push({ ...FRAMING_TIP });
  }
  if (photoCount < 3) {
    tips.push({ ...PHOTO_COUNT_TIP });
  }

  return tips;
}
