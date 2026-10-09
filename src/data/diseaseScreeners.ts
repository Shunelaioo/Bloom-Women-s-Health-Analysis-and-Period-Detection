export type ScreenerOption = {
  label: string;
  points: number;
};

export type ScreenerQuestion = {
  id: string;
  text: string;
  hint?: string;
  options: ScreenerOption[];
};

export type DiseaseScreener = {
  moduleId: string;
  overview: string;
  facts: string[];
  careTips: string[];
  urgentSigns: string[];
  disclaimer: string;
  questions: ScreenerQuestion[];
};

const frequencyOptions: ScreenerOption[] = [
  { label: "Often / Yes", points: 2 },
  { label: "Sometimes", points: 1 },
  { label: "Rarely / No", points: 0 },
];

function q(id: string, text: string, hint?: string): ScreenerQuestion {
  return { id, text, hint, options: frequencyOptions };
}

export const diseaseScreeners: Record<string, DiseaseScreener> = {
  dysmenorrhea: {
    moduleId: "dysmenorrhea",
    overview:
      "Dysmenorrhea means painful menstrual cramps. This self-check helps you see if your pain pattern looks like common cramp patterns worth discussing with a clinician.",
    facts: [
      "Pain often peaks around day 1-2 of bleeding.",
      "Pain can spread to the back or thighs.",
      "Severe pain that disrupts daily life deserves medical review.",
    ],
    careTips: [
      "Use heat pads and rest during higher-pain days.",
      "Track pain timing, intensity, and response to relief methods.",
      "Discuss persistent severe pain with a gynecologist.",
    ],
    urgentSigns: [
      "Sudden severe one-sided pelvic pain",
      "Fainting with pain",
      "Pain getting worse every cycle despite treatment",
    ],
    disclaimer: "This is a screening pattern check, not a diagnosis.",
    questions: [
      q("dys-1", "Do you get cramping pain during your period?"),
      q("dys-2", "Is your pain strongest in the first 1-2 days of bleeding?"),
      q("dys-3", "Does pain spread to your lower back or thighs?"),
      q("dys-4", "Do cramps interfere with school/work/social plans?"),
      q("dys-5", "Do you need pain medicine most periods?"),
      q("dys-6", "Does nausea, loose stool, or fatigue come with cramps?"),
      q("dys-7", "Do cramps wake you from sleep?"),
      q("dys-8", "Did cramps become worse over the last 6-12 months?"),
      q("dys-9", "Do heat or OTC meds help only partially?"),
      q("dys-10", "Do you avoid activity because of period pain?"),
    ],
  },
  pms: {
    moduleId: "pms",
    overview:
      "PMS includes emotional and physical symptoms before periods. This check looks for cyclic premenstrual patterns.",
    facts: [
      "Symptoms usually begin in the luteal phase (before bleeding).",
      "Common symptoms include bloating, breast tenderness, mood changes, and cravings.",
      "Tracking across 2-3 cycles helps identify patterns.",
    ],
    careTips: [
      "Track sleep, stress, and symptom timing.",
      "Support routine: hydration, regular meals, movement, and sleep.",
      "Seek care if symptoms repeatedly disrupt life.",
    ],
    urgentSigns: [
      "Mood symptoms causing safety concerns",
      "Severe anxiety/depression before each period",
      "Symptoms that do not improve after bleeding starts",
    ],
    disclaimer: "This screening estimates pattern match, not diagnosis.",
    questions: [
      q("pms-1", "Do symptoms show up mainly in the week before your period?"),
      q("pms-2", "Do symptoms improve after bleeding starts?"),
      q("pms-3", "Do you get bloating or breast tenderness premenstrually?"),
      q("pms-4", "Do cravings increase before periods?"),
      q("pms-5", "Do mood swings happen before your period?"),
      q("pms-6", "Do you feel more fatigued before bleeding starts?"),
      q("pms-7", "Do symptoms recur with similar timing each cycle?"),
      q("pms-8", "Do symptoms affect your concentration or productivity?"),
      q("pms-9", "Do symptoms improve with sleep/stress management?"),
      q("pms-10", "Have you tracked these symptoms for at least 2 cycles?"),
    ],
  },
  pmdd: {
    moduleId: "pmdd",
    overview:
      "PMDD is a severe premenstrual mood condition. This check focuses on intensity and life impact of cyclical mood symptoms.",
    facts: [
      "PMDD symptoms are usually severe and impair daily functioning.",
      "Symptoms are cyclical: worse premenstrually, better after period starts.",
      "Professional support is important for severe mood symptoms.",
    ],
    careTips: [
      "Track mood daily across cycles.",
      "Prioritize support systems and mental-health care.",
      "Discuss symptom severity with a clinician promptly.",
    ],
    urgentSigns: [
      "Thoughts of self-harm or hopelessness",
      "Severe panic/depression before periods",
      "Major relationship/work disruption each cycle",
    ],
    disclaimer: "If safety is at risk, seek urgent help immediately.",
    questions: [
      q("pmdd-1", "Do you have intense irritability before periods?"),
      q("pmdd-2", "Do mood symptoms severely affect relationships/work?"),
      q("pmdd-3", "Do symptoms improve after menstruation begins?"),
      q("pmdd-4", "Do you feel overwhelmed or emotionally out of control premenstrually?"),
      q("pmdd-5", "Do anxiety or sadness spike before periods?"),
      q("pmdd-6", "Do you lose interest in usual activities premenstrually?"),
      q("pmdd-7", "Do concentration problems worsen before periods?"),
      q("pmdd-8", "Do symptoms return with similar timing each cycle?"),
      q("pmdd-9", "Do symptoms feel much stronger than typical PMS?"),
      q("pmdd-10", "Have these symptoms persisted across multiple cycles?"),
    ],
  },
  pcos: {
    moduleId: "pcos",
    overview:
      "PCOS can involve irregular ovulation, androgen-related signs, and metabolic changes. This check estimates whether your pattern warrants evaluation.",
    facts: [
      "Cycles may be infrequent or irregular.",
      "Acne or excess facial/body hair may occur.",
      "Clinical diagnosis requires medical evaluation.",
    ],
    careTips: [
      "Track cycle length and skipped periods.",
      "Track skin/hair changes over time.",
      "Request clinical workup if patterns persist.",
    ],
    urgentSigns: [
      "No period for 3+ months (not pregnancy)",
      "Rapidly worsening acne/hair changes",
      "Persistent abnormal bleeding",
    ],
    disclaimer: "Only clinicians can diagnose PCOS with appropriate criteria.",
    questions: [
      q("pcos-1", "Are your periods often irregular or infrequent?"),
      q("pcos-2", "Do cycles frequently exceed 35 days?"),
      q("pcos-3", "Have you had skipped periods for months?"),
      q("pcos-4", "Do you have persistent acne beyond teen years?"),
      q("pcos-5", "Do you notice excess facial/body hair growth?"),
      q("pcos-6", "Do you experience scalp hair thinning?"),
      q("pcos-7", "Have you noticed weight gain that is hard to manage?"),
      q("pcos-8", "Do you have darkened skin folds (neck/armpit)?"),
      q("pcos-9", "Do you have a family history of PCOS or type 2 diabetes?"),
      q("pcos-10", "Are fertility/ovulation concerns present?"),
    ],
  },
  endometriosis: {
    moduleId: "endometriosis",
    overview:
      "Endometriosis can cause pelvic pain, painful periods, and pain outside period days. This check looks for common symptom clusters.",
    facts: [
      "Pain can happen during and outside periods.",
      "Pain during sex or bowel movements can occur in some people.",
      "Earlier specialist evaluation may reduce delay in care.",
    ],
    careTips: [
      "Track pain timing and triggers.",
      "Record pain severity and functional impact.",
      "Discuss persistent symptoms with a gynecologist.",
    ],
    urgentSigns: [
      "Severe worsening pelvic pain",
      "Pain not controlled by usual methods",
      "Symptoms affecting fertility planning",
    ],
    disclaimer: "This screening supports discussion; it does not diagnose endometriosis.",
    questions: [
      q("endo-1", "Do you have severe period pain regularly?"),
      q("endo-2", "Do you have pelvic pain between periods?"),
      q("endo-3", "Do bowel movements hurt during periods?"),
      q("endo-4", "Do you feel pain during or after sex?"),
      q("endo-5", "Has pain worsened over time?"),
      q("endo-6", "Do pain symptoms disrupt daily activity often?"),
      q("endo-7", "Do you have heavy bleeding with pain?"),
      q("endo-8", "Do you have chronic fatigue with pelvic pain?"),
      q("endo-9", "Have you had trouble conceiving?"),
      q("endo-10", "Do symptoms persist despite usual pain meds?"),
    ],
  },
  anemia: {
    moduleId: "anemia",
    overview:
      "Anemia can follow chronic blood loss, including heavy periods. This check looks for fatigue and low-iron symptom patterns.",
    facts: [
      "Fatigue and weakness are common.",
      "Heavy/prolonged bleeding can contribute to iron deficiency.",
      "Blood tests confirm anemia and iron status.",
    ],
    careTips: [
      "Track flow heaviness and duration.",
      "Track fatigue, dizziness, and breathlessness.",
      "Request CBC/ferritin testing if symptoms persist.",
    ],
    urgentSigns: [
      "Fainting or near-fainting",
      "Shortness of breath at rest",
      "Very heavy bleeding with dizziness",
    ],
    disclaimer: "Lab tests are required to confirm anemia.",
    questions: [
      q("anemia-1", "Do you feel tired most days?"),
      q("anemia-2", "Do you feel weak or low-energy with simple tasks?"),
      q("anemia-3", "Do you get dizzy/lightheaded often?"),
      q("anemia-4", "Do you feel short of breath with mild activity?"),
      q("anemia-5", "Do you have pale skin/lips more often lately?"),
      q("anemia-6", "Do you have cold hands/feet frequently?"),
      q("anemia-7", "Do your periods feel heavy or prolonged?"),
      q("anemia-8", "Do headaches increase around heavy bleeding days?"),
      q("anemia-9", "Have you ever been told your iron is low?"),
      q("anemia-10", "Do symptoms improve when bleeding is lighter?"),
    ],
  },
  fibroids: {
    moduleId: "fibroids",
    overview:
      "Fibroids are common non-cancerous uterine growths. This check looks for bleeding and pressure symptom patterns linked with fibroids.",
    facts: [
      "Fibroids can cause heavy or prolonged periods.",
      "Pelvic pressure/fullness can occur.",
      "Ultrasound is commonly used for evaluation.",
    ],
    careTips: [
      "Track bleeding days and flow volume.",
      "Track pressure, urinary frequency, and pain.",
      "Seek gynecology review if symptoms persist.",
    ],
    urgentSigns: [
      "Very heavy bleeding with weakness/dizziness",
      "Rapidly increasing pelvic pressure",
      "Severe pain with fever",
    ],
    disclaimer: "This is a pattern check and not a diagnostic test.",
    questions: [
      q("fib-1", "Are your periods often heavy?"),
      q("fib-2", "Do your periods often last more than 7 days?"),
      q("fib-3", "Do you pass clots during periods?"),
      q("fib-4", "Do you feel pelvic pressure/fullness frequently?"),
      q("fib-5", "Do you urinate more often due to pelvic pressure?"),
      q("fib-6", "Do you have lower abdominal bloating unrelated to meals?"),
      q("fib-7", "Do you have pelvic/back discomfort most cycles?"),
      q("fib-8", "Do heavy periods affect your daily routine?"),
      q("fib-9", "Have you had anemia symptoms with heavy bleeding?"),
      q("fib-10", "Do symptoms persist over several months?"),
    ],
  },
};

export type ScreenerLevel = "low" | "moderate" | "high" | "very_high";

export function scoreToLevel(percent: number): ScreenerLevel {
  if (percent >= 80) return "very_high";
  if (percent >= 60) return "high";
  if (percent >= 35) return "moderate";
  return "low";
}

export function levelLabel(level: ScreenerLevel): string {
  if (level === "very_high") return "Very High Pattern Match";
  if (level === "high") return "High Pattern Match";
  if (level === "moderate") return "Moderate Pattern Match";
  return "Low Pattern Match";
}
