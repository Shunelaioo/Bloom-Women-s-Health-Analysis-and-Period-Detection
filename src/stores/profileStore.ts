import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileState {
  name: string;
  email: string;
  avatar: string | null;
  lifeStage: "reproductive" | "perimenopausal" | "unknown";
  contraceptionType: "none" | "pill" | "iud" | "implant" | "injection";
  postpartumBreastfeeding: boolean;
  tryingToConceive: boolean;
  familyHistory: string[];
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setAvatar: (avatar: string | null) => void;
  setLifeStage: (lifeStage: "reproductive" | "perimenopausal" | "unknown") => void;
  setContraceptionType: (value: "none" | "pill" | "iud" | "implant" | "injection") => void;
  setPostpartumBreastfeeding: (value: boolean) => void;
  setTryingToConceive: (value: boolean) => void;
  setFamilyHistory: (familyHistory: string[]) => void;
  resetProfile: () => void;
}

const DEFAULT_PROFILE = {
  name: "",
  email: "",
  avatar: null as string | null,
  lifeStage: "unknown" as "reproductive" | "perimenopausal" | "unknown",
  contraceptionType: "none" as "none" | "pill" | "iud" | "implant" | "injection",
  postpartumBreastfeeding: false,
  tryingToConceive: false,
  familyHistory: [] as string[],
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...DEFAULT_PROFILE,
      setName: (name) => set({ name }),
      setEmail: (email) => set({ email }),
      setAvatar: (avatar) => set({ avatar }),
      setLifeStage: (lifeStage) => set({ lifeStage }),
      setContraceptionType: (contraceptionType) => set({ contraceptionType }),
      setPostpartumBreastfeeding: (postpartumBreastfeeding) => set({ postpartumBreastfeeding }),
      setTryingToConceive: (tryingToConceive) => set({ tryingToConceive }),
      setFamilyHistory: (familyHistory) => set({ familyHistory }),
      resetProfile: () => set({ ...DEFAULT_PROFILE }),
    }),
    {
      name: 'bloom-profile',
    }
  )
);
