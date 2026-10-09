// Mock data for cycle tracking
export interface CycleDay {
  date: string;
  flow: "none" | "light" | "medium" | "heavy";
  symptoms: string[];
  mood: "happy" | "neutral" | "sad" | "irritable" | "anxious";
  notes?: string;
  sleepQuality?: "excellent" | "good" | "fair" | "poor";
  sleepHours?: number;
  exercises?: string[];
  exerciseDuration?: number;
}

export interface CycleStats {
  averageCycleLength: number;
  averagePeriodLength: number;
  nextPeriodDate: string;
  daysUntilNextPeriod: number;
  currentPhase: "menstrual" | "follicular" | "ovulation" | "luteal";
  cycleDay: number;
}

export const mockCycleHistory: CycleDay[] = [
  { date: "2025-01-10", flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "irritable", sleepQuality: "poor", sleepHours: 5, exercises: ["yoga"], exerciseDuration: 30, notes: "First day of period, feeling tired." },
  { date: "2025-01-11", flow: "heavy", symptoms: ["cramps", "headache"], mood: "sad", sleepQuality: "fair", sleepHours: 6, exercises: [], exerciseDuration: 0 },
  { date: "2025-01-12", flow: "medium", symptoms: ["cramps"], mood: "neutral", sleepQuality: "good", sleepHours: 7.5, exercises: ["walking"], exerciseDuration: 45 },
  { date: "2025-01-13", flow: "light", symptoms: [], mood: "neutral", sleepQuality: "good", sleepHours: 7, exercises: ["cardio"], exerciseDuration: 30, notes: "Feeling better today!" },
  { date: "2025-01-14", flow: "light", symptoms: [], mood: "happy", sleepQuality: "excellent", sleepHours: 8, exercises: ["strength", "cardio"], exerciseDuration: 60 },
  { date: "2024-12-12", flow: "heavy", symptoms: ["cramps", "bloating"], mood: "irritable", sleepQuality: "poor", sleepHours: 4.5, exercises: [], exerciseDuration: 0 },
  { date: "2024-12-13", flow: "heavy", symptoms: ["cramps"], mood: "sad", sleepQuality: "fair", sleepHours: 6, exercises: ["yoga"], exerciseDuration: 20 },
  { date: "2024-12-14", flow: "medium", symptoms: [], mood: "neutral", sleepQuality: "good", sleepHours: 7, exercises: ["walking"], exerciseDuration: 40 },
  { date: "2024-12-15", flow: "light", symptoms: [], mood: "happy", sleepQuality: "excellent", sleepHours: 8.5, exercises: ["cardio", "strength"], exerciseDuration: 50 },
  { date: "2024-11-13", flow: "heavy", symptoms: ["cramps", "fatigue", "headache"], mood: "irritable", sleepQuality: "poor", sleepHours: 5, exercises: [], exerciseDuration: 0, notes: "Bad headache, stayed in bed most of the day." },
  { date: "2024-11-14", flow: "medium", symptoms: ["cramps"], mood: "neutral", sleepQuality: "fair", sleepHours: 6.5, exercises: ["yoga"], exerciseDuration: 25 },
  { date: "2024-11-15", flow: "light", symptoms: [], mood: "neutral", sleepQuality: "good", sleepHours: 7.5, exercises: ["walking"], exerciseDuration: 35 },
  { date: "2024-11-16", flow: "light", symptoms: [], mood: "happy", sleepQuality: "excellent", sleepHours: 8, exercises: ["cardio"], exerciseDuration: 45 },
];

export const mockStats: CycleStats = {
  averageCycleLength: 28,
  averagePeriodLength: 5,
  nextPeriodDate: "2025-02-07",
  daysUntilNextPeriod: 23,
  currentPhase: "follicular",
  cycleDay: 5,
};

export const symptoms = [
  "cramps",
  "headache",
  "fatigue",
  "bloating",
  "breast tenderness",
  "acne",
  "backache",
  "nausea",
  "mood swings",
  "food cravings",
];

export const moods = [
  { value: "happy", icon: "Smile", label: "Happy" },
  { value: "neutral", icon: "Meh", label: "Neutral" },
  { value: "sad", icon: "Frown", label: "Sad" },
  { value: "irritable", icon: "Angry", label: "Irritable" },
  { value: "anxious", icon: "AlertCircle", label: "Anxious" },
];

// Sleep quality options
export const sleepOptions = [
  { value: "excellent", hours: "8+", icon: "Moon", label: "Excellent" },
  { value: "good", hours: "7-8", icon: "MoonStar", label: "Good" },
  { value: "fair", hours: "5-7", icon: "CloudMoon", label: "Fair" },
  { value: "poor", hours: "<5", icon: "CloudOff", label: "Poor" },
];

// Exercise options
export const exerciseOptions = [
  { value: "cardio", icon: "HeartPulse", label: "Cardio" },
  { value: "strength", icon: "Dumbbell", label: "Strength" },
  { value: "yoga", icon: "Flower2", label: "Yoga" },
  { value: "walking", icon: "Footprints", label: "Walking" },
  { value: "swimming", icon: "Waves", label: "Swimming" },
  { value: "none", icon: "Sofa", label: "Rest Day" },
];

export const flowOptions = [
  { value: "none", label: "None", color: "bg-muted" },
  { value: "light", label: "Light", color: "bg-rose-light" },
  { value: "medium", label: "Medium", color: "bg-rose-medium" },
  { value: "heavy", label: "Heavy", color: "bg-primary" },
];

// Chart data
export const cycleChartData = [
  { month: "Aug", cycleLength: 27, periodLength: 5 },
  { month: "Sep", cycleLength: 29, periodLength: 4 },
  { month: "Oct", cycleLength: 28, periodLength: 5 },
  { month: "Nov", cycleLength: 30, periodLength: 4 },
  { month: "Dec", cycleLength: 29, periodLength: 4 },
  { month: "Jan", cycleLength: 28, periodLength: 5 },
];

export const symptomFrequency = [
  { symptom: "Cramps", count: 18, percentage: 75 },
  { symptom: "Fatigue", count: 12, percentage: 50 },
  { symptom: "Headache", count: 8, percentage: 33 },
  { symptom: "Bloating", count: 10, percentage: 42 },
  { symptom: "Mood swings", count: 6, percentage: 25 },
];

export const moodDistribution = [
  { mood: "Happy", value: 35, color: "#8BC34A" },
  { mood: "Neutral", value: 30, color: "#FFC107" },
  { mood: "Sad", value: 15, color: "#03A9F4" },
  { mood: "Irritable", value: 12, color: "#FF5722" },
  { mood: "Anxious", value: 8, color: "#9C27B0" },
];

// Sleep pattern data (hours per night)
export const sleepPatternData = [
  { day: "Mon", hours: 7.5, quality: "Good" },
  { day: "Tue", hours: 6.5, quality: "Fair" },
  { day: "Wed", hours: 8, quality: "Excellent" },
  { day: "Thu", hours: 6, quality: "Poor" },
  { day: "Fri", hours: 7, quality: "Good" },
  { day: "Sat", hours: 8.5, quality: "Excellent" },
  { day: "Sun", hours: 8, quality: "Excellent" },
];

// Exercise frequency data (times per week over months)
export const exerciseFrequencyData = [
  { month: "Aug", cardio: 3, strength: 2, yoga: 1 },
  { month: "Sep", cardio: 4, strength: 2, yoga: 2 },
  { month: "Oct", cardio: 3, strength: 3, yoga: 1 },
  { month: "Nov", cardio: 2, strength: 2, yoga: 3 },
  { month: "Dec", cardio: 2, strength: 1, yoga: 2 },
  { month: "Jan", cardio: 4, strength: 3, yoga: 2 },
];

// Family history disorder options
export const familyHistoryDisorders = [
  "Endometriosis",
  "PCOS (Polycystic Ovary Syndrome)",
  "Uterine Fibroids",
  "Ovarian Cysts",
  "Breast Cancer",
  "Ovarian Cancer",
  "Thyroid Disorders",
  "Diabetes",
  "Heart Disease",
  "Autoimmune Disorders",
];
