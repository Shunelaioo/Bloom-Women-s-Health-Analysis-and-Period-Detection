import type { LucideIcon } from "lucide-react";
import {
  Flame,
  CloudRain,
  Brain,
  Heart,
  Frown,
  Zap,
  Battery,
  Utensils,
  Angry,
  AlertCircle,
  Users,
  CalendarOff,
  Sparkles,
  Scissors,
  Scale,
  CircleDot,
  Droplets,
  TrendingUp,
  Activity,
  Dumbbell,
  Pill,
  BedDouble,
  Palette,
  Wind,
  Thermometer,
  Timer,
  Gauge,
  Circle,
} from "lucide-react";

import bannerDysmenorrhea from "@/assets/dysmen.png";
import bannerPms from "@/assets/pms.png";
import bannerPmdd from "@/assets/pmddd.png";
import bannerPcos from "@/assets/pcos.png";
import bannerEndometriosis from "@/assets/endo.png";
import bannerAnemia from "@/assets/anemia.png";
import bannerFibroids from "@/assets/fibrods.jpg";

// ================= TYPES =================

export interface QuizOption {
  label: string; // Answer text
  value?: number; // ✅ Symptom-check scoring (0..3)
  isCorrect?: boolean; // (legacy) keep if your UI still uses knowledge-quiz scoring
}

export interface QuestionItem {
  text: string;
  icon: LucideIcon;
  options: QuizOption[];
  explanation?: string;
}

export type QuizRiskLevel = "Low" | "Moderate" | "High";

export interface ResultBand {
  minScore: number; // inclusive
  level: QuizRiskLevel;
  title: string;
  message: string;
  tips: string[];
}

export interface AwarenessInfo {
  whatItIs: string;
  commonPatterns: string[];
  whyAwarenessMatters: string[];
  whenToTalkToClinician: string[];
}

export interface Module {
  id: string;
  title: string;
  emoji: string;
  description: string;
  banner: string;
  category: "Pain" | "Hormonal" | "Cycle" | "Medical";
  color: string; // UI card theme

  // ✅ Symptom-check quiz
  questions: QuestionItem[];
  maxScore: number; // usually 30 for 10 questions x 0..3
  bands: ResultBand[];

  // UI footer/help text
  resultText?: string;

  // Optional: show always (or only when High in your UI logic)
  redFlags?: string[];
  awareness?: AwarenessInfo;
}

// ================= HELPERS =================

const freqOptions = (): QuizOption[] => [
  { label: "Never / Not at all", value: 0 },
  { label: "Sometimes", value: 1 },
  { label: "Often", value: 2 },
  { label: "Almost every cycle / Very often", value: 3 },
];

const yesNoOptions = (yesValue = 3): QuizOption[] => [
  { label: "No", value: 0 },
  { label: "Yes", value: yesValue },
];

const baseBands = (topic: string): ResultBand[] => [
  {
    minScore: 0,
    level: "Low",
    title: `Low match for ${topic}`,
    message:
      "Your answers don’t strongly match this pattern right now. Keep tracking symptoms so you can notice changes over time.",
    tips: [
      "Track symptoms daily (not only on period days).",
      "Note triggers: stress, sleep, food, exercise.",
      "Re-check if symptoms change or worsen.",
    ],
  },
  {
    minScore: 8,
    level: "Moderate",
    title: `Possible pattern for ${topic}`,
    message:
      "Some of your answers match common patterns. This is not a diagnosis, but it may be worth paying closer attention and using supportive strategies.",
    tips: [
      "Track for 2–3 cycles to confirm patterns.",
      "Bring your log to a clinic visit if you’re concerned.",
      "Prioritize sleep, hydration, and gentle movement.",
    ],
  },
  {
    minScore: 18,
    level: "High",
    title: `Strong pattern for ${topic}`,
    message:
      "Many of your answers match common patterns. Consider discussing this with a healthcare professional—especially if symptoms interfere with daily life.",
    tips: [
      "Bring your symptom log (severity + timing) to your appointment.",
      "Mention how symptoms affect school/work/relationships.",
      "Ask what tests or next steps make sense for you.",
    ],
  },
];

const MAX_SCORE_10Q = 30;

// ================= MODULE DATA =================
// Symptom-check quizzes (10 questions each). Not medical advice. Not a diagnosis.

const baseModules: Module[] = [
  // ---------- Dysmenorrhea (Period Pain) ----------
  {
    id: "dysmenorrhea",
    title: "Dysmenorrhea Check",
    emoji: "🩸",
    description: "Check if your period cramps match common patterns",
    banner: bannerDysmenorrhea,
    category: "Pain",
    color: "#f97316",
    maxScore: MAX_SCORE_10Q,
    bands: baseBands("period cramps (dysmenorrhea)"),
    redFlags: [
      "Sudden severe pain that is new for you",
      "Fever, foul-smelling discharge, or severe pelvic tenderness",
      "Pain that is getting worse over time",
      "Pain with sex or pain outside your period (possible secondary causes)",
      "Fainting, severe weakness, or symptoms that feel urgent",
    ],
    resultText:
      "Educational symptom-check only (not a diagnosis). If pain is severe, new, worsening, or disrupts daily life, consider a healthcare check.",
    questions: [
      {
        text: "How often do your cramps feel strong enough to stop normal activities (school/work/chores)?",
        icon: AlertCircle,
        options: freqOptions(),
        explanation:
          "Cramps that regularly disrupt daily life can be a sign you should discuss options with a clinician.",
      },
      {
        text: "When do your cramps usually peak?",
        icon: Timer,
        options: [
          { label: "I don’t get cramps", value: 0 },
          { label: "Mostly day 1–2 of bleeding", value: 3 },
          { label: "Mostly after my period ends", value: 1 },
          { label: "Random times in the month", value: 2 },
        ],
        explanation:
          "Many people with primary dysmenorrhea have peak pain around the start of bleeding (day 1–2).",
      },
      {
        text: "Do you get nausea, vomiting, diarrhea, or sweating with period cramps?",
        icon: CloudRain,
        options: freqOptions(),
      },
      {
        text: "Do your cramps radiate to your lower back or thighs?",
        icon: Zap,
        options: freqOptions(),
      },
      {
        text: "How often do you need pain medicine (like ibuprofen/naproxen) or heat to manage cramps?",
        icon: Pill,
        options: freqOptions(),
      },
      {
        text: "Do you miss school/work or cancel plans due to period pain?",
        icon: CalendarOff,
        options: freqOptions(),
      },
      {
        text: "Did your cramps start recently after years of mild/no pain?",
        icon: TrendingUp,
        options: yesNoOptions(3),
        explanation:
          "New or worsening pain after a history of mild/no pain can be a sign to rule out secondary causes.",
      },
      {
        text: "Do you have pelvic pain even when you’re NOT on your period?",
        icon: CircleDot,
        options: freqOptions(),
        explanation:
          "Pain outside your period can suggest an underlying condition and is worth discussing with a clinician.",
      },
      {
        text: "Do you have pain during sex (deep pain) or pain after sex?",
        icon: Heart,
        options: freqOptions(),
      },
      {
        text: "How often do your cramps come with very heavy bleeding or large clots?",
        icon: Droplets,
        options: freqOptions(),
      },
    ],
  },

  // ---------- PMS ----------
  {
    id: "pms",
    title: "PMS Check",
    emoji: "😔",
    description: "Check if your pre-period symptoms match PMS patterns",
    banner: bannerPms,
    category: "Hormonal",
    color: "#3b82f6",
    maxScore: MAX_SCORE_10Q,
    bands: baseBands("PMS"),
    redFlags: [
      "Severe depression, panic, or rage before periods",
      "Thoughts of self-harm or feeling unsafe (seek urgent support)",
      "Symptoms that don’t improve after your period starts",
    ],
    resultText:
      "Educational symptom-check only (not a diagnosis). If mood symptoms feel severe or unsafe, get support urgently.",
    questions: [
      {
        text: "In the week before your period, how often do you feel more irritable or emotionally sensitive than usual?",
        icon: Frown,
        options: freqOptions(),
      },
      {
        text: "How often do you have bloating or a puffy feeling before your period?",
        icon: Gauge,
        options: freqOptions(),
      },
      {
        text: "How often do you get breast tenderness before your period?",
        icon: Heart,
        options: freqOptions(),
      },
      {
        text: "How often do you have cravings or appetite changes before your period?",
        icon: Utensils,
        options: freqOptions(),
      },
      {
        text: "How often do you notice acne flare-ups or skin changes before your period?",
        icon: Sparkles,
        options: freqOptions(),
      },
      {
        text: "How often do you get headaches or body aches before your period?",
        icon: Flame,
        options: freqOptions(),
      },
      {
        text: "How often do you feel more tired or low-energy before your period?",
        icon: Battery,
        options: freqOptions(),
      },
      {
        text: "Do these symptoms usually improve within a few days after bleeding starts?",
        icon: Timer,
        options: [
          { label: "No / Not sure", value: 1 },
          { label: "Sometimes", value: 2 },
          { label: "Yes, usually", value: 3 },
          { label: "I don’t get these symptoms", value: 0 },
        ],
        explanation:
          "PMS symptoms often improve shortly after the period begins.",
      },
      {
        text: "How often do these symptoms affect your relationships or daily routine (even a little)?",
        icon: Users,
        options: freqOptions(),
      },
      {
        text: "How often do you have trouble sleeping (too much or too little) before your period?",
        icon: BedDouble,
        options: freqOptions(),
      },
    ],
  },

  // ---------- PMDD ----------
  {
    id: "pmdd",
    title: "PMDD Check",
    emoji: "🧠",
    description: "Check for more intense premenstrual mood symptoms",
    banner: bannerPmdd,
    category: "Hormonal",
    color: "#8b5cf6",
    maxScore: MAX_SCORE_10Q,
    bands: baseBands("PMDD-like symptoms"),
    redFlags: [
      "Thoughts of self-harm, feeling unsafe, or feeling out of control (seek urgent support now)",
      "Severe mood symptoms that significantly disrupt school/work/relationships",
      "Symptoms that persist throughout the month without relief",
    ],
    resultText:
      "Educational symptom-check only (not a diagnosis). If you feel unsafe or have thoughts of self-harm, seek urgent support immediately.",
    questions: [
      {
        text: "In the week before your period, how often do you feel intense sadness, hopelessness, or crying spells?",
        icon: Brain,
        options: freqOptions(),
      },
      {
        text: "How often do you feel sudden anger, rage, or conflict with others before your period?",
        icon: Angry,
        options: freqOptions(),
      },
      {
        text: "How often do you feel intense anxiety, panic, or feeling “on edge” before your period?",
        icon: Wind,
        options: freqOptions(),
      },
      {
        text: "How often do you lose interest in your usual activities (socializing, hobbies) before your period?",
        icon: CalendarOff,
        options: freqOptions(),
      },
      {
        text: "How often do you struggle to concentrate or feel mentally foggy before your period?",
        icon: Circle,
        options: freqOptions(),
      },
      {
        text: "How often do you feel overwhelmed or like you can’t cope before your period?",
        icon: AlertCircle,
        options: freqOptions(),
      },
      {
        text: "Do your mood symptoms improve within a few days after your period starts?",
        icon: Timer,
        options: [
          { label: "No / Not sure", value: 1 },
          { label: "Sometimes", value: 2 },
          { label: "Yes, clearly", value: 3 },
          { label: "I don’t get these symptoms", value: 0 },
        ],
      },
      {
        text: "How often do these symptoms significantly affect school/work performance?",
        icon: TrendingUp,
        options: freqOptions(),
      },
      {
        text: "How often do you have physical symptoms too (bloating, breast tenderness, headaches) with the mood changes?",
        icon: CloudRain,
        options: freqOptions(),
      },
      {
        text: "Have you ever felt unsafe, had self-harm thoughts, or felt you might hurt yourself during the pre-period time?",
        icon: AlertCircle,
        options: [
          { label: "No", value: 0 },
          { label: "Yes (even once)", value: 3 },
          { label: "Prefer not to say", value: 2 },
          { label: "Not sure", value: 2 },
        ],
        explanation:
          "If you feel unsafe right now, please seek urgent support immediately (local emergency services or a trusted person/clinic).",
      },
    ],
  },

  // ---------- PCOS ----------
  {
    id: "pcos",
    title: "PCOS Check",
    emoji: "🌿",
    description: "Check for irregular cycle + androgen-related symptom patterns",
    banner: bannerPcos,
    category: "Cycle",
    color: "#10b981",
    maxScore: MAX_SCORE_10Q,
    bands: baseBands("PCOS-like patterns"),
    redFlags: [
      "No period for 3+ months (and not pregnant) should be checked",
      "Rapid/unexpected hair growth changes or virilization symptoms",
      "Symptoms of high blood sugar (excess thirst/urination) should be checked",
    ],
    resultText:
      "Educational symptom-check only (not a diagnosis). PCOS is diagnosed using a combination of symptoms, labs, and/or ultrasound.",
    questions: [
      {
        text: "How often are your cycles irregular (hard to predict, varying a lot)?",
        icon: CalendarOff,
        options: freqOptions(),
      },
      {
        text: "How often do you skip periods (e.g., >35–40 days between periods) or have very infrequent periods?",
        icon: Timer,
        options: freqOptions(),
      },
      {
        text: "How often do you have acne flare-ups that feel persistent (not only occasional pimples)?",
        icon: Sparkles,
        options: freqOptions(),
      },
      {
        text: "How often do you notice more facial/body hair growth than you’d expect (chin, upper lip, chest, abdomen)?",
        icon: Scissors,
        options: freqOptions(),
      },
      {
        text: "How often do you notice hair thinning on the scalp (widening part, shedding) compared to before?",
        icon: TrendingUp,
        options: freqOptions(),
      },
      {
        text: "How often do you gain weight easily or struggle to lose weight (even with effort)?",
        icon: Scale,
        options: freqOptions(),
      },
      {
        text: "How often do you have darkened skin patches (neck, underarms) or skin tags?",
        icon: Palette,
        options: freqOptions(),
        explanation:
          "These can be associated with insulin resistance for some people.",
      },
      {
        text: "How often do you feel strong sugar cravings, energy crashes, or feel shaky when hungry?",
        icon: Battery,
        options: freqOptions(),
      },
      {
        text: "Have you ever been told you have ovarian cysts or ‘polycystic ovaries’ on ultrasound?",
        icon: CircleDot,
        options: [
          { label: "No / never checked", value: 1 },
          { label: "Not sure", value: 2 },
          { label: "Yes", value: 3 },
          { label: "I don’t know what that means", value: 1 },
        ],
      },
      {
        text: "How often do you have trouble getting pregnant (if you’ve tried for 12 months or more)?",
        icon: Users,
        options: [
          { label: "Not applicable / never tried", value: 0 },
          { label: "No", value: 1 },
          { label: "Some difficulty", value: 2 },
          { label: "Yes (12+ months)", value: 3 },
        ],
      },
    ],
  },

  // ---------- Endometriosis ----------
  {
    id: "endometriosis",
    title: "Endometriosis Check",
    emoji: "🩺",
    description: "Check for pelvic pain patterns that can match endometriosis",
    banner: bannerEndometriosis,
    category: "Pain",
    color: "#ef4444",
    maxScore: MAX_SCORE_10Q,
    bands: baseBands("endometriosis-like patterns"),
    redFlags: [
      "Severe pain not controlled by usual measures",
      "Pain with bowel movements/urination that is severe or worsening",
      "Fainting, fever, or severe one-sided pain (urgent evaluation)",
    ],
    resultText:
      "Educational symptom-check only (not a diagnosis). Endometriosis often needs clinical evaluation; many people are dismissed—your tracking data helps.",
    questions: [
      {
        text: "How often do you have period pain that feels severe or out of proportion to what you expect?",
        icon: AlertCircle,
        options: freqOptions(),
      },
      {
        text: "How often do painkillers/heat NOT give enough relief for your period pain?",
        icon: Pill,
        options: freqOptions(),
      },
      {
        text: "How often do you have pelvic pain even when you are NOT bleeding?",
        icon: CircleDot,
        options: freqOptions(),
      },
      {
        text: "How often do you have pain during sex (especially deep pain)?",
        icon: Heart,
        options: freqOptions(),
      },
      {
        text: "How often do you have pain with bowel movements during your period?",
        icon: Activity,
        options: freqOptions(),
      },
      {
        text: "How often do you have pain when urinating during your period?",
        icon: Droplets,
        options: freqOptions(),
      },
      {
        text: "How often do you have GI symptoms around your period (bloating, diarrhea, constipation) that feel cyclical?",
        icon: CloudRain,
        options: freqOptions(),
      },
      {
        text: "How often do you feel very fatigued around your period (beyond normal tiredness)?",
        icon: Battery,
        options: freqOptions(),
      },
      {
        text: "How often do you have heavy bleeding or spotting between periods along with pain?",
        icon: Droplets,
        options: freqOptions(),
      },
      {
        text: "Do you have infertility concerns (trying 12+ months) or a family history of endometriosis?",
        icon: Users,
        options: [
          { label: "No", value: 0 },
          { label: "Not sure / haven’t tried", value: 1 },
          { label: "Family history OR fertility concerns", value: 2 },
          { label: "Both family history AND fertility concerns", value: 3 },
        ],
      },
    ],
  },

  // ---------- Anemia (often linked to heavy bleeding) ----------
  {
    id: "anemia",
    title: "Anemia Check",
    emoji: "🩸",
    description: "Check for symptoms that can match iron-deficiency anemia",
    banner: bannerAnemia,
    category: "Medical",
    color: "#0ea5e9",
    maxScore: MAX_SCORE_10Q,
    bands: baseBands("anemia (often iron deficiency)"),
    redFlags: [
      "Shortness of breath at rest, chest pain, fainting",
      "Rapid heartbeat/palpitations with weakness",
      "Very heavy bleeding or bleeding that won’t stop",
    ],
    resultText:
      "Educational symptom-check only (not a diagnosis). Anemia is confirmed by blood tests (e.g., hemoglobin, ferritin).",
    questions: [
      {
        text: "How often do you have very heavy periods (soaking through pads/tampons quickly, frequent changes)?",
        icon: Droplets,
        options: freqOptions(),
      },
      {
        text: "How often do you feel unusually tired or drained, even after sleep?",
        icon: Battery,
        options: freqOptions(),
      },
      {
        text: "How often do you feel dizzy, lightheaded, or close to fainting?",
        icon: Wind,
        options: freqOptions(),
      },
      {
        text: "How often do you get short of breath with mild activity (stairs, walking)?",
        icon: Activity,
        options: freqOptions(),
      },
      {
        text: "How often do you notice a fast heartbeat or palpitations?",
        icon: Heart,
        options: freqOptions(),
      },
      {
        text: "How often do you have headaches that feel frequent or worse than usual?",
        icon: Brain,
        options: freqOptions(),
      },
      {
        text: "How often do you feel cold hands/feet or have trouble staying warm?",
        icon: Thermometer,
        options: freqOptions(),
      },
      {
        text: "How often do you look pale (skin, lips, inside lower eyelid) compared to normal?",
        icon: Circle,
        options: freqOptions(),
      },
      {
        text: "Do you have cravings to chew ice, eat non-food items, or unusual cravings (pica)?",
        icon: Utensils,
        options: [
          { label: "No", value: 0 },
          { label: "Rarely", value: 1 },
          { label: "Sometimes", value: 2 },
          { label: "Often", value: 3 },
        ],
      },
      {
        text: "Have you ever been told you have low iron / low hemoglobin / low ferritin?",
        icon: AlertCircle,
        options: [
          { label: "No / never tested", value: 1 },
          { label: "Not sure", value: 2 },
          { label: "Yes (in the past)", value: 3 },
          { label: "Yes (recently)", value: 3 },
        ],
      },
    ],
  },

  // ---------- Fibroids ----------
  {
    id: "fibroids",
    title: "Fibroids Check",
    emoji: "🧷",
    description: "Check for heavy bleeding + pressure symptoms common with fibroids",
    banner: bannerFibroids,
    category: "Medical",
    color: "#f59e0b",
    maxScore: MAX_SCORE_10Q,
    bands: baseBands("fibroids"),
    redFlags: [
      "Soaking through pads/tampons in under 1–2 hours repeatedly",
      "Bleeding longer than 7–8 days often",
      "Severe pelvic pain, rapid belly growth, or fainting",
    ],
    resultText:
      "Educational symptom-check only (not a diagnosis). Fibroids are confirmed with an exam and imaging (often ultrasound).",
    questions: [
      {
        text: "How often do you have very heavy bleeding (needing to change protection very frequently)?",
        icon: Droplets,
        options: freqOptions(),
      },
      {
        text: "How often does your period last longer than 7 days?",
        icon: Timer,
        options: freqOptions(),
      },
      {
        text: "How often do you pass large clots during your period?",
        icon: Droplets,
        options: freqOptions(),
      },
      {
        text: "How often do you feel pelvic pressure/heaviness (like something is pushing down)?",
        icon: Gauge,
        options: freqOptions(),
      },
      {
        text: "How often do you feel bloated or notice your lower belly looks enlarged (not just pre-period bloating)?",
        icon: Circle,
        options: freqOptions(),
      },
      {
        text: "How often do you need to urinate frequently or feel bladder pressure?",
        icon: Droplets,
        options: freqOptions(),
      },
      {
        text: "How often do you have constipation or bowel pressure?",
        icon: Activity,
        options: freqOptions(),
      },
      {
        text: "How often do you have pain during sex or discomfort with deep penetration?",
        icon: Heart,
        options: freqOptions(),
      },
      {
        text: "How often do you have anemia-like symptoms (fatigue, dizziness) with your bleeding?",
        icon: Battery,
        options: freqOptions(),
      },
      {
        text: "Have you ever been told you have fibroids (exam/ultrasound)?",
        icon: AlertCircle,
        options: [
          { label: "No / never checked", value: 1 },
          { label: "Not sure", value: 2 },
          { label: "Yes (in the past)", value: 3 },
          { label: "Yes (recently)", value: 3 },
        ],
      },
    ],
  },
];

const awarenessById: Record<string, AwarenessInfo> = {
  dysmenorrhea: {
    whatItIs:
      "Dysmenorrhea is period pain caused by uterine contractions and inflammatory chemicals. It can be primary (common cycle-related cramps) or secondary (pain linked to another condition).",
    commonPatterns: [
      "Pain peaks around day 1-2 of bleeding",
      "Lower abdominal cramps with back/thigh radiation",
      "Nausea, loose stool, headache, or fatigue with pain",
    ],
    whyAwarenessMatters: [
      "Severe pain can affect school, work, and quality of life",
      "New or worsening pain may need evaluation for secondary causes",
      "Early tracking helps identify helpful treatment options",
    ],
    whenToTalkToClinician: [
      "Pain is severe despite usual pain relief",
      "Pain is worsening over time or occurs outside periods",
      "Pain interferes with daily functioning most cycles",
    ],
  },
  pms: {
    whatItIs:
      "PMS includes physical and emotional symptoms that happen before a period and usually improve after bleeding starts.",
    commonPatterns: [
      "Bloating, breast tenderness, cravings, fatigue",
      "Irritability or mood changes in the premenstrual week",
      "Recurring timing across multiple cycles",
    ],
    whyAwarenessMatters: [
      "Pattern tracking helps separate PMS from other conditions",
      "Lifestyle adjustments can reduce symptom burden",
      "Knowing your pattern improves self-management planning",
    ],
    whenToTalkToClinician: [
      "Symptoms feel severe or disruptive",
      "Mood symptoms impact relationships/work regularly",
      "Symptoms do not improve after periods start",
    ],
  },
  pmdd: {
    whatItIs:
      "PMDD is a severe premenstrual mood disorder with strong emotional symptoms and significant life impact.",
    commonPatterns: [
      "Intense irritability, sadness, anxiety, or anger before periods",
      "Symptoms improve after bleeding begins",
      "Cyclic recurrence across multiple months",
    ],
    whyAwarenessMatters: [
      "PMDD can seriously affect mental health and safety",
      "Early recognition supports faster treatment and support",
      "Structured symptom logs improve clinical assessment",
    ],
    whenToTalkToClinician: [
      "Symptoms feel overwhelming or unsafe",
      "You have thoughts of self-harm",
      "Mood symptoms repeatedly impair daily life",
    ],
  },
  pcos: {
    whatItIs:
      "PCOS is a hormonal and metabolic condition often linked to irregular ovulation, androgen-related symptoms, and possible insulin resistance.",
    commonPatterns: [
      "Irregular, infrequent, or skipped periods",
      "Acne, excess facial/body hair, or scalp hair thinning",
      "Weight or metabolic changes over time",
    ],
    whyAwarenessMatters: [
      "Timely management supports cycle, fertility, and metabolic health",
      "Symptoms can be managed with targeted care plans",
      "Early evaluation helps prevent delayed diagnosis",
    ],
    whenToTalkToClinician: [
      "Periods are absent or very irregular",
      "Androgen symptoms are worsening",
      "You have fertility concerns or metabolic risk factors",
    ],
  },
  endometriosis: {
    whatItIs:
      "Endometriosis is a condition where tissue similar to uterine lining grows outside the uterus, causing inflammation and pain.",
    commonPatterns: [
      "Painful periods that may worsen over time",
      "Pelvic pain outside bleeding days",
      "Pain with sex, bowel movements, or urination in some cases",
    ],
    whyAwarenessMatters: [
      "Diagnosis is often delayed without early symptom recognition",
      "Pain can affect sleep, mood, and productivity",
      "Early specialist review may improve outcomes",
    ],
    whenToTalkToClinician: [
      "Severe period pain is persistent",
      "Pain occurs across the month, not only during periods",
      "Symptoms affect fertility planning or daily function",
    ],
  },
  anemia: {
    whatItIs:
      "Anemia is a low red-blood-cell or hemoglobin state, often due to iron deficiency. Heavy menstrual bleeding can be one contributor.",
    commonPatterns: [
      "Persistent fatigue, weakness, or dizziness",
      "Shortness of breath with mild activity",
      "Pale skin, headaches, and reduced concentration",
    ],
    whyAwarenessMatters: [
      "Untreated anemia can worsen quality of life and performance",
      "Blood tests can confirm and guide treatment quickly",
      "Managing heavy bleeding helps prevent recurrence",
    ],
    whenToTalkToClinician: [
      "Symptoms are persistent or worsening",
      "You feel faint, very weak, or short of breath",
      "Heavy/prolonged periods are ongoing",
    ],
  },
  fibroids: {
    whatItIs:
      "Fibroids are common non-cancerous growths in the uterus. Some people have no symptoms, while others have heavy bleeding, pressure, or pain.",
    commonPatterns: [
      "Heavy or prolonged bleeding",
      "Pelvic pressure/fullness or frequent urination",
      "Back/pelvic discomfort during cycles",
    ],
    whyAwarenessMatters: [
      "Heavy bleeding may increase anemia risk",
      "Symptom severity can change over time",
      "Imaging and clinical review can clarify treatment choices",
    ],
    whenToTalkToClinician: [
      "Bleeding is very heavy or longer than usual",
      "Pressure or pain affects daily activity",
      "You have dizziness, weakness, or anemia symptoms",
    ],
  },
};

export const modules: Module[] = baseModules.map((module) => ({
  ...module,
  awareness: awarenessById[module.id],
}));

/**
 * OPTIONAL helper (if you want to compute result in the UI):
 * - totalScore: sum of selected option.value (default 0)
 * - band = last bands[] where totalScore >= band.minScore
 */
export function getBand(module: Module, totalScore: number): ResultBand {
  const sorted = [...module.bands].sort((a, b) => a.minScore - b.minScore);
  let current = sorted[0];
  for (const b of sorted) {
    if (totalScore >= b.minScore) current = b;
  }
  return current;
}
