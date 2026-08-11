import { create } from 'zustand';

/**
 * Carries the half-built account across the five onboarding screens. The
 * server only sees it at the register step, so nothing is persisted until the
 * user actually finishes.
 */
interface OnboardingState {
  phone: string;
  phoneProofToken: string | null;
  name: string;
  username: string;
  city: string;
  avatarUrl: string | null;
  password: string;
  interestTags: string[];

  set: (patch: Partial<Omit<OnboardingState, 'set' | 'reset' | 'toggleInterest'>>) => void;
  toggleInterest: (tag: string) => void;
  reset: () => void;
}

const initial = {
  phone: '',
  phoneProofToken: null as string | null,
  name: '',
  username: '',
  city: '',
  avatarUrl: null as string | null,
  password: '',
  interestTags: [] as string[],
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initial,

  set: (patch) => set(patch),

  toggleInterest: (tag) =>
    set((s) => ({
      interestTags: s.interestTags.includes(tag)
        ? s.interestTags.filter((t) => t !== tag)
        : [...s.interestTags, tag],
    })),

  reset: () => set(initial),
}));
