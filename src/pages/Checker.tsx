import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  ShieldAlert,
  Sparkles,
  History,
} from "lucide-react";

import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { modules, type Module, type QuizRiskLevel, type ResultBand } from "@/data/symptomModules";

type Phase = "select" | "detail" | "quiz" | "result";

type StoredResult = {
  moduleId: string;
  percentage: number;
  level: QuizRiskLevel;
  score: number;
  maxScore: number;
  bandTitle: string;
  completedAt: string;
};

type StoredResultMap = Record<string, StoredResult>;

type PollQuestionStats = {
  total: number;
  counts: number[];
  percents: number[];
};

const API_ROOT =
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );
const RESULTS_URL = `${API_ROOT}/api/quiz-results`;
const POLLS_URL = `${API_ROOT}/api/quiz-polls`;

function getToken(): string | null {
  const t = localStorage.getItem("token");
  return t && t.trim().length > 0 ? t : null;
}

function levelStyles(level: QuizRiskLevel) {
  if (level === "High") return "bg-destructive/15 border-destructive/30 text-destructive";
  if (level === "Moderate") return "bg-amber-500/15 border-amber-500/30 text-amber-700";
  return "bg-emerald-500/15 border-emerald-500/30 text-emerald-700";
}

function levelBadge(level: QuizRiskLevel) {
  if (level === "High") return "bg-destructive text-destructive-foreground";
  if (level === "Moderate") return "bg-amber-500 text-white";
  return "bg-emerald-500 text-white";
}

function optionValue(option: { value?: number; isCorrect?: boolean }) {
  if (typeof option.value === "number") return option.value;
  return option.isCorrect ? 3 : 0;
}

function computeMaxScore(module: Module) {
  const fallback = module.questions.reduce((sum, q) => {
    const maxForQ = Math.max(...q.options.map((opt) => optionValue(opt)));
    return sum + maxForQ;
  }, 0);
  return typeof module.maxScore === "number" && module.maxScore > 0 ? module.maxScore : fallback;
}

function resolveBand(module: Module, score: number): ResultBand {
  const bands = [...module.bands].sort((a, b) => a.minScore - b.minScore);
  let chosen = bands[0];
  for (const band of bands) {
    if (score >= band.minScore) chosen = band;
  }
  return chosen;
}

export default function Checker() {
  const [phase, setPhase] = useState<Phase>("select");
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [resultsByModule, setResultsByModule] = useState<StoredResultMap>({});
  const [latestResult, setLatestResult] = useState<StoredResult | null>(null);
  const [polls, setPolls] = useState<Record<number, PollQuestionStats>>({});

  const moduleById = useMemo(() => new Map(modules.map((m) => [m.id, m])), []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const loadResults = async () => {
      try {
        const res = await fetch(RESULTS_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const mapped: StoredResultMap = {};

        Object.entries(data || {}).forEach(([moduleId, raw]) => {
          const value = raw as any;
          const module = moduleById.get(moduleId);
          const score = Number(value?.score ?? 0);
          const maxScore = Number(value?.maxScore ?? (module ? computeMaxScore(module) : 0));
          const percentage =
            typeof value?.percentage === "number"
              ? value.percentage
              : maxScore > 0
              ? Math.round((score / maxScore) * 100)
              : 0;
          const band = module ? resolveBand(module, score) : null;
          const level = (value?.level as QuizRiskLevel) || band?.level || "Low";
          mapped[moduleId] = {
            moduleId,
            score,
            maxScore,
            percentage,
            level,
            bandTitle: value?.bandTitle || band?.title || "",
            completedAt:
              value?.updatedAt || value?.createdAt || new Date().toISOString(),
          };
        });

        setResultsByModule(mapped);
      } catch (err) {
        console.error("Failed to load checker results:", err);
      }
    };

    void loadResults();
  }, [moduleById]);

  useEffect(() => {
    const token = getToken();
    if (!token || !selectedModule) return;

    const loadPolls = async () => {
      try {
        const res = await fetch(`${POLLS_URL}/${selectedModule.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const normalized: Record<number, PollQuestionStats> = {};
        Object.keys(data || {}).forEach((k) => {
          normalized[Number(k)] = data[k];
        });
        setPolls(normalized);
      } catch (err) {
        console.error("Failed to load quiz polls:", err);
      }
    };

    void loadPolls();
  }, [selectedModule]);

  const totalQuestions = selectedModule?.questions.length ?? 0;
  const currentQuestion = selectedModule?.questions[step];
  const progress = totalQuestions ? ((step + 1) / totalQuestions) * 100 : 0;
  const canGoNext = answers[step] !== undefined;
  const pollForStep = polls[step];
  const showPollPercents =
    answers[step] !== undefined && Array.isArray(pollForStep?.percents);

  const beginModule = (mod: Module) => {
    setSelectedModule(mod);
    setPhase("detail");
    setStep(0);
    setAnswers({});
    setLatestResult(null);
  };

  const backToList = () => {
    setPhase("select");
    setSelectedModule(null);
    setStep(0);
    setAnswers({});
    setLatestResult(null);
    setPolls({});
  };

  const startQuiz = () => {
    setStep(0);
    setAnswers({});
    setLatestResult(null);
    setPhase("quiz");
  };

  const chooseOption = async (optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [step]: optionIndex }));

    const token = getToken();
    if (!token || !selectedModule) return;

    try {
      const res = await fetch(`${POLLS_URL}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          moduleId: selectedModule.id,
          questionIndex: step,
          optionIndex,
        }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setPolls((prev) => ({
        ...prev,
        [updated.questionIndex]: {
          total: updated.total,
          counts: updated.counts,
          percents: updated.percents,
        },
      }));
    } catch (err) {
      console.error("Failed to submit poll vote:", err);
    }
  };

  const goPrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const finishQuiz = async () => {
    if (!selectedModule) return;
    const maxScore = computeMaxScore(selectedModule);

    let score = 0;
    selectedModule.questions.forEach((q, idx) => {
      const picked = answers[idx];
      if (picked === undefined) return;
      score += optionValue(q.options[picked] || {});
    });

    const percentage = maxScore ? Math.round((score / maxScore) * 100) : 0;
    const band = resolveBand(selectedModule, score);
    let completedAt = new Date().toISOString();

    const token = getToken();
    if (token) {
      try {
        const res = await fetch(RESULTS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            moduleId: selectedModule.id,
            score,
            maxScore,
            percentage,
            level: band.level,
            bandTitle: band.title,
            isHighRisk: band.level === "High",
            answers,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          completedAt = saved?.updatedAt || saved?.createdAt || completedAt;
        }
      } catch (err) {
        console.error("Failed to save quiz result:", err);
      }
    }

    const result: StoredResult = {
      moduleId: selectedModule.id,
      percentage,
      level: band.level,
      score,
      maxScore,
      bandTitle: band.title,
      completedAt,
    };

    setResultsByModule((prev) => ({ ...prev, [selectedModule.id]: result }));
    setLatestResult(result);
    setPhase("result");
  };

  const goNext = async () => {
    if (!canGoNext) return;
    if (step < totalQuestions - 1) {
      setStep((s) => s + 1);
      return;
    }
    await finishQuiz();
  };

  const activeResult =
    latestResult || (selectedModule ? resultsByModule[selectedModule.id] ?? null : null);

  const activeBand = useMemo(() => {
    if (!selectedModule || !activeResult) return null;
    return resolveBand(selectedModule, activeResult.score);
  }, [selectedModule, activeResult]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 via-coral to-primary flex items-center justify-center shadow-soft">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-foreground">Condition Checker</h1>
          </div>
          <p className="text-muted-foreground">
            Answer a few quick questions to better understand your menstrual health and discover personalized insights.
          </p>
        </motion.section>

        <AnimatePresence mode="wait">
          {phase === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
            >
              {modules.map((mod, idx) => {
                const last = resultsByModule[mod.id];
                return (
                  <motion.div
                    key={mod.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    <Card
                      onClick={() => beginModule(mod)}
                      className="group overflow-hidden cursor-pointer border-border/60 hover:border-primary/35 hover:shadow-elevated transition-all"
                    >
                      <AspectRatio ratio={16 / 9}>
                        <img
                          src={mod.banner}
                          alt={mod.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      </AspectRatio>
                      <CardContent className="p-5 text-center">
                        <div className="text-3xl mb-2">{mod.emoji}</div>
                        <h3 className="font-display text-xl font-semibold text-foreground mb-1">
                          {mod.title}
                        </h3>
                        <p className="text-muted-foreground text-sm">{mod.description}</p>
                        <div className="mt-4">
                          {last ? (
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                              <History className="w-3.5 h-3.5" />
                              Last: {last.percentage}% ({last.level})
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No previous result yet
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {phase === "detail" && selectedModule && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="space-y-6 relative"
            >
              <div className="pointer-events-none absolute -top-10 -left-10 w-44 h-44 rounded-full bg-rose-500/15 blur-3xl" />
              <div className="pointer-events-none absolute -top-8 right-20 w-52 h-52 rounded-full bg-coral/15 blur-3xl" />
              <div className="pointer-events-none absolute top-52 -right-10 w-44 h-44 rounded-full bg-primary/10 blur-3xl" />

              <button
                onClick={backToList}
                className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/85 backdrop-blur px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-background transition-all shadow-soft"
              >
                <ArrowLeft className="w-4 h-4" /> Back to conditions
              </button>

              <div className="grid grid-cols-1 xl:grid-cols-[1.75fr_1fr] gap-5">
                <Card className="overflow-hidden border-primary/20 shadow-elevated bg-gradient-to-br from-background via-rose-50/40 to-coral/10">
                  <div className="h-1.5 bg-gradient-to-r from-rose-500 via-coral to-primary" />
                  <CardContent className="p-6 sm:p-7 space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary mb-3">
                          <span>{selectedModule.emoji}</span>
                          <span>{selectedModule.category}</span>
                        </div>
                        <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
                          {selectedModule.title}
                        </h2>
                        <p className="text-base text-muted-foreground mt-2 max-w-3xl">
                          {selectedModule.description}
                        </p>
                      </div>

                      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-semibold text-foreground/80">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        Awareness + quiz mode
                      </div>
                    </div>

                    <div className="rounded-2xl overflow-hidden border border-primary/15 shadow-soft">
                      <AspectRatio ratio={21 / 8}>
                        <img
                          src={selectedModule.banner}
                          alt={selectedModule.title}
                          className="w-full h-full object-cover"
                        />
                      </AspectRatio>
                      <div className="h-1 bg-gradient-to-r from-rose-500/70 via-coral/70 to-primary/70" />
                    </div>

                    {selectedModule.awareness ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-5 md:col-span-2">
                          <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                            What this condition is
                          </h3>
                          <p className="text-sm sm:text-base text-foreground/85 leading-relaxed">
                            {selectedModule.awareness.whatItIs}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-500/10 via-coral/10 to-transparent p-5">
                          <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                            Common patterns
                          </h3>
                          <ul className="space-y-1.5 text-sm text-foreground/85 list-disc pl-5">
                            {selectedModule.awareness.commonPatterns.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-500/10 via-primary/10 to-transparent p-5">
                          <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                            Why awareness matters
                          </h3>
                          <ul className="space-y-1.5 text-sm text-foreground/85 list-disc pl-5">
                            {selectedModule.awareness.whyAwarenessMatters.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 to-coral/10 p-5 md:col-span-2">
                          <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                            When to talk to a clinician
                          </h3>
                          <ul className="space-y-1.5 text-sm text-foreground/90 list-disc pl-5">
                            {selectedModule.awareness.whenToTalkToClinician.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-border/60 bg-gradient-to-r from-background to-muted/40 p-4">
                      <p className="text-sm text-foreground/90">
                        {selectedModule.resultText || "Educational check only."}
                      </p>
                    </div>

                    {selectedModule.redFlags?.length ? (
                      <div className="rounded-2xl border border-destructive/30 bg-gradient-to-br from-destructive/10 to-destructive/5 p-5">
                        <div className="flex items-center gap-2 font-semibold text-destructive mb-2">
                          <ShieldAlert className="w-4 h-4" />
                          Red flags to seek care for
                        </div>
                        <ul className="text-sm text-foreground/90 list-disc pl-5 space-y-1">
                          {selectedModule.redFlags.map((rf) => (
                            <li key={rf}>{rf}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="space-y-4 xl:sticky xl:top-24 self-start">
                  <Card className="overflow-hidden border-primary/20 shadow-elevated bg-gradient-to-br from-background via-background to-primary/10">
                    <div className="h-1.5 bg-gradient-to-r from-primary via-coral to-rose-500" />
                    <CardContent className="p-6 space-y-5">
                      <h3 className="font-display text-2xl font-semibold text-foreground">
                        Ready to check?
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Take {selectedModule.questions.length} questions from your active symptom
                        module and get a percent-based result.
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                          <p className="text-xs text-muted-foreground">Questions</p>
                          <p className="text-lg font-bold text-foreground">
                            {selectedModule.questions.length}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                          <p className="text-xs text-muted-foreground">Scoring bands</p>
                          <p className="text-lg font-bold text-foreground">
                            {selectedModule.bands.length}
                          </p>
                        </div>
                      </div>

                      {activeResult ? (
                        <div className={`rounded-2xl border p-4 ${levelStyles(activeResult.level)}`}>
                          <p className="text-xs uppercase tracking-wide font-semibold mb-1">
                            Last check result
                          </p>
                          <p className="text-3xl font-bold leading-none">{activeResult.percentage}%</p>
                          <p className="text-sm mt-1.5 font-semibold">{activeResult.level}</p>
                          <p className="text-xs mt-2 opacity-80">
                            {new Date(activeResult.completedAt).toLocaleString("en-US")}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
                          You have not checked this condition yet.
                        </div>
                      )}

                      <Button onClick={startQuiz} className="w-full h-12 rounded-xl btn-primary">
                        Take Quiz <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {phase === "quiz" && selectedModule && currentQuestion && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-rose-500/10 via-coral/10 to-primary/10 p-4 sm:p-5 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setPhase("detail")}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to details
                  </button>
                  <span className="text-sm font-semibold text-foreground/80">
                    Question {step + 1} of {totalQuestions}
                  </span>
                </div>
                <div className="mt-3">
                  <Progress value={progress} className="h-2.5 bg-white/70" />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/70 px-3 py-1 text-xs font-semibold text-foreground">
                    <span>{selectedModule.emoji}</span>
                    <span>{selectedModule.title}</span>
                  </span>
                  <span className="text-xs font-semibold text-primary">
                    {Math.round(progress)}% complete
                  </span>
                </div>
              </div>

              <Card className="overflow-hidden border-primary/20 shadow-elevated bg-gradient-to-br from-background via-rose-50/50 to-coral/10">
                <div className="h-2 bg-gradient-to-r from-rose-500 via-coral to-primary" />
                <CardContent className="p-6 sm:p-8">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/80 px-3 py-1 mb-4">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground/80">Choose one option</span>
                  </div>

                  <div className="flex items-start gap-3 mb-6">
                    <currentQuestion.icon className="w-6 h-6 text-primary mt-1 shrink-0" />
                    <h2 className="font-display text-2xl sm:text-4xl font-semibold text-foreground leading-tight">
                      {currentQuestion.text}
                    </h2>
                  </div>

                  <div className="space-y-3.5">
                    {currentQuestion.options.map((opt, idx) => {
                      const selected = answers[step] === idx;
                      const percent = showPollPercents ? pollForStep?.percents?.[idx] ?? 0 : null;
                      const optionTheme =
                        idx === 0
                          ? "from-rose-500/10 to-coral/15 border-rose-300/45 hover:border-rose-400/70"
                          : idx === 1
                          ? "from-sky-500/10 to-primary/12 border-sky-300/45 hover:border-sky-400/70"
                          : idx === 2
                          ? "from-emerald-500/10 to-teal-500/12 border-emerald-300/45 hover:border-emerald-400/70"
                          : "from-violet-500/10 to-purple-500/12 border-violet-300/45 hover:border-violet-400/70";
                      return (
                        <motion.button
                          key={opt.label}
                          type="button"
                          onClick={() => void chooseOption(idx)}
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.995 }}
                          className={`w-full text-left px-4 py-4 rounded-2xl border transition-all flex items-center gap-3 bg-gradient-to-r ${
                            selected
                              ? "border-primary from-rose-500/20 to-primary/20 ring-2 ring-primary/25 shadow-elevated"
                              : `${optionTheme}`
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-foreground/20 text-foreground/70 bg-background/80"
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-foreground text-base sm:text-lg flex-1 font-medium">
                            {opt.label}
                          </span>
                          {selected ? <CheckCircle2 className="w-4.5 h-4.5 text-primary shrink-0" /> : null}
                          {percent !== null ? (
                            <span className="text-xs font-semibold text-muted-foreground ml-2">
                              {percent}%
                            </span>
                          ) : null}
                        </motion.button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-2xl border border-border/60 bg-background/80 p-3 flex items-center justify-between gap-3">
                <Button variant="outline" onClick={goPrev} disabled={step === 0} className="gap-2 rounded-xl">
                  <ArrowLeft className="w-4 h-4" /> Previous
                </Button>
                <Button
                  onClick={() => void goNext()}
                  disabled={!canGoNext}
                  className="btn-primary gap-2 rounded-xl min-w-[140px]"
                >
                  {step < totalQuestions - 1 ? "Next" : "See Result"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {phase === "result" && selectedModule && activeResult && activeBand && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <Card className="overflow-hidden border-border/60">
                <div className="p-6 bg-gradient-to-r from-rose-500 via-coral to-primary text-primary-foreground">
                  <h2 className="font-display text-3xl font-bold mb-1">{selectedModule.title} Result</h2>
                  <p className="text-primary-foreground/90 text-sm">
                    Saved to your account via backend quiz results.
                  </p>
                </div>
                <CardContent className="p-6">
                  <div className={`rounded-2xl border p-6 mb-5 ${levelStyles(activeResult.level)}`}>
                    <p className="text-sm font-semibold uppercase tracking-wide mb-2">Pattern Match</p>
                    <div className="flex items-end gap-3 mb-2">
                      <span className="text-5xl font-bold leading-none">{activeResult.percentage}%</span>
                      <span className={`text-xs mb-1 px-2.5 py-1 rounded-full ${levelBadge(activeResult.level)}`}>
                        {activeResult.level}
                      </span>
                    </div>
                    <Progress value={activeResult.percentage} className="h-2.5 mt-3" />
                    <p className="text-sm mt-3 font-semibold">{activeBand.title}</p>
                    <p className="text-sm mt-1">{activeBand.message}</p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/40 p-4 mb-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Info className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-semibold text-foreground">Suggested next steps</p>
                    </div>
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                      {activeBand.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>

                  {!!selectedModule.redFlags?.length && activeResult.level === "High" ? (
                    <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 mb-5">
                      <div className="flex items-center gap-2 font-semibold text-destructive mb-1.5">
                        <ShieldAlert className="w-4 h-4" />
                        High-priority red flags
                      </div>
                      <ul className="text-sm text-foreground/90 list-disc pl-5 space-y-1">
                        {selectedModule.redFlags.map((rf) => (
                          <li key={rf}>{rf}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="outline" onClick={() => setPhase("detail")} className="gap-2">
                      <ArrowLeft className="w-4 h-4" /> Back to details
                    </Button>
                    <Button onClick={startQuiz} className="btn-primary gap-2">
                      Retake Quiz <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Button variant="secondary" onClick={backToList}>
                      Choose another condition
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
