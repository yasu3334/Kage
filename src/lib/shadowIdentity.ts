export interface ShadowQualityOption {
  key: string;
  label: string;
  meaning: string;
  accent: 'crimson' | 'violet' | 'amber';
}

export const SHADOW_QUALITY_OPTIONS: readonly ShadowQualityOption[] = [
  {
    key: 'Strength',
    label: 'THE POWERHOUSE',
    meaning: 'You admire power, courage, and overcoming challenges.',
    accent: 'crimson',
  },
  {
    key: 'Determination',
    label: 'THE UNYIELDING',
    meaning: 'You admire persistence and refusing to give up.',
    accent: 'amber',
  },
  {
    key: 'Intelligence',
    label: 'THE STRATEGIST',
    meaning: 'You admire strategy, creativity, and thoughtful decisions.',
    accent: 'violet',
  },
  {
    key: 'Loyalty',
    label: 'THE GUARDIAN',
    meaning: 'You value protecting friends and standing by others.',
    accent: 'crimson',
  },
  {
    key: 'Kindness',
    label: 'THE HEARTKEEPER',
    meaning: 'You admire compassion, empathy, and helping people.',
    accent: 'amber',
  },
  {
    key: 'Discipline',
    label: 'THE DISCIPLINED',
    meaning: 'You value consistency, training, and self-control.',
    accent: 'violet',
  },
  {
    key: 'Confidence',
    label: 'THE FEARLESS',
    meaning: 'You admire self-belief and facing challenges.',
    accent: 'crimson',
  },
  {
    key: 'Resilience',
    label: 'THE PHOENIX',
    meaning: 'You admire learning from setbacks and moving forward.',
    accent: 'amber',
  },
  {
    key: 'Leadership',
    label: 'THE COMMANDER',
    meaning: 'You admire responsibility and inspiring others.',
    accent: 'crimson',
  },
  {
    key: 'Mystery',
    label: 'THE ENIGMA',
    meaning: 'You enjoy complex characters and hidden depths.',
    accent: 'violet',
  },
  {
    key: 'Humour',
    label: 'THE WILDCARD',
    meaning: 'You enjoy characters who bring fun and unpredictable energy.',
    accent: 'amber',
  },
  {
    key: 'Creativity',
    label: 'THE VISIONARY',
    meaning: 'You admire imagination and original thinking.',
    accent: 'violet',
  },
] as const;

export const SHADOW_QUALITY_MAP: Record<string, ShadowQualityOption> = Object.fromEntries(
  SHADOW_QUALITY_OPTIONS.map((q) => [q.key, q])
);

const canonicalByLower: Record<string, string> = Object.fromEntries(
  SHADOW_QUALITY_OPTIONS.map((q) => [q.key.toLowerCase(), q.key])
);

// Normalized sorted key "A+B" (alphabetical order so selection order never matters)
export const COMBINED_SHADOW_LABELS: Record<
  string,
  { label: string; meaning: string }
> = {
  'Determination+Strength': {
    label: 'THE UNBREAKABLE',
    meaning: 'Unstoppable willpower forged from strength and relentless persistence.',
  },
  'Intelligence+Mystery': {
    label: 'THE SHADOW MIND',
    meaning: 'Mastermind perception drawn to layered strategy and hidden truths.',
  },
  'Kindness+Loyalty': {
    label: 'THE PROTECTOR',
    meaning: 'Unwavering devotion to shielding friends with empathy and heart.',
  },
  'Confidence+Leadership': {
    label: 'THE RISING MONARCH',
    meaning: 'Commanding presence that inspires allies and faces every trial head-on.',
  },
  'Creativity+Intelligence': {
    label: 'THE ARCHITECT',
    meaning: 'Visionary intellect that builds bold ideas and original strategies.',
  },
  'Confidence+Humour': {
    label: 'THE CHAOS SPARK',
    meaning: 'Fearless, unpredictable charisma that turns any battle into a spectacle.',
  },
};

export interface ComputedShadowIdentity {
  qualities: string[];
  label: string;
  meaning: string;
  disclaimer: string;
}

export const SHADOW_IDENTITY_DISCLAIMER =
  'Shadow Identity badges are for anime community self-expression and entertainment — never psychological assessments.';

export function validateAndComputeShadowIdentity(
  rawQualities: unknown
): ComputedShadowIdentity {
  if (rawQualities === undefined || rawQualities === null) {
    return {
      qualities: [],
      label: '',
      meaning: '',
      disclaimer: SHADOW_IDENTITY_DISCLAIMER,
    };
  }

  if (!Array.isArray(rawQualities)) {
    throw new Error('Shadow Identity qualities must be provided as a list.');
  }

  if (rawQualities.length > 2) {
    throw new Error('You may select up to 2 Shadow Identity qualities.');
  }

  const canonicalList: string[] = [];
  const seen = new Set<string>();

  for (const item of rawQualities) {
    if (typeof item !== 'string') {
      throw new Error('Invalid Shadow Identity quality selection.');
    }
    const clean = canonicalByLower[item.trim().toLowerCase()];
    if (!clean) {
      throw new Error(`Unsupported Shadow Identity quality: "${item}".`);
    }
    if (seen.has(clean)) {
      throw new Error('Duplicate Shadow Identity qualities are not allowed.');
    }
    seen.add(clean);
    canonicalList.push(clean);
  }

  if (canonicalList.length === 0) {
    return {
      qualities: [],
      label: '',
      meaning: '',
      disclaimer: SHADOW_IDENTITY_DISCLAIMER,
    };
  }

  if (canonicalList.length === 1) {
    const single = SHADOW_QUALITY_MAP[canonicalList[0]];
    return {
      qualities: canonicalList,
      label: single.label,
      meaning: single.meaning,
      disclaimer: SHADOW_IDENTITY_DISCLAIMER,
    };
  }

  // Normalize order before lookup AND fallback so A+B and B+A always produce the exact same label
  const normalizedPair = [...canonicalList].sort((a, b) => a.localeCompare(b));
  const pairKey = `${normalizedPair[0]}+${normalizedPair[1]}`;
  const combined = COMBINED_SHADOW_LABELS[pairKey];

  if (combined) {
    return {
      qualities: canonicalList,
      label: combined.label,
      meaning: combined.meaning,
      disclaimer: SHADOW_IDENTITY_DISCLAIMER,
    };
  }

  // Deterministic order-independent fallback using normalized first quality's label
  const primary = SHADOW_QUALITY_MAP[normalizedPair[0]];
  const secondary = SHADOW_QUALITY_MAP[normalizedPair[1]];
  return {
    qualities: canonicalList,
    label: primary.label,
    meaning: `${primary.meaning} Paired with ${secondary.key.toLowerCase()} in the characters you admire.`,
    disclaimer: SHADOW_IDENTITY_DISCLAIMER,
  };
}
