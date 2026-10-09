import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Calendar,
  Ruler,
  Weight,
  Cake,
  Clock,
  RefreshCw,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface OnboardingDataUI {
  age: number;
  weight: number; // lbs
  heightFeet: number;
  heightInches: number;
  lastPeriodDate: Date | undefined;
  periodDuration: number;
  cycleLength: number;
}

type BackendOnboardingPayload = {
  dateOfBirth: string; // backend expects this
  heightCm: number;
  weightKg: number;
  cycleLengthDays: number;
  periodLengthDays: number;
  lastPeriodStart: string; // YYYY-MM-DD
};

interface OnboardingFormProps {
  onComplete: (data: BackendOnboardingPayload) => void;
  onBack: () => void;
}

function lbsToKg(lbs: number) {
  return Math.round(lbs * 0.45359237 * 10) / 10;
}

function feetInchesToCm(feet: number, inches: number) {
  const totalInches = feet * 12 + inches;
  return Math.round(totalInches * 2.54 * 10) / 10;
}

function toYYYYMMDD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * UI collects age only, but backend expects dateOfBirth.
 * We'll approximate DOB as Jan 1 of (currentYear - age).
 * (Best solution: add DOB picker later.)
 */
function approximateDobFromAge(age: number) {
  const now = new Date();
  const year = now.getFullYear() - age;
  return `${year}-01-01`;
}

const OnboardingForm = ({ onComplete, onBack }: OnboardingFormProps) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingDataUI>({
    age: 25,
    weight: 130,
    heightFeet: 5,
    heightInches: 5,
    lastPeriodDate: undefined,
    periodDuration: 5,
    cycleLength: 28,
  });
  const [isLoading, setIsLoading] = useState(false);

  const totalSteps = 3;

  const handleNext = () => {
    if (step < totalSteps) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else onBack();
  };

  const handleSubmit = async () => {
    if (!formData.lastPeriodDate) return;

    setIsLoading(true);
    try {
      const payload: BackendOnboardingPayload = {
        dateOfBirth: approximateDobFromAge(formData.age),
        heightCm: feetInchesToCm(formData.heightFeet, formData.heightInches),
        weightKg: lbsToKg(formData.weight),
        cycleLengthDays: formData.cycleLength,
        periodLengthDays: formData.periodDuration,
        lastPeriodStart: toYYYYMMDD(formData.lastPeriodDate),
      };

      onComplete(payload);
      console.log("Onboarding payload -> backend:", payload);
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.age > 0 && formData.weight > 0 && formData.heightFeet > 0;
      case 2:
        return formData.lastPeriodDate !== undefined;
      case 3:
        return formData.periodDuration > 0 && formData.cycleLength > 0;
      default:
        return true;
    }
  };

  return (
    <div className="min-h-screen flex gradient-hero overflow-hidden">
      {/* Left Side - Branding */}
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden
           bg-gradient-to-r from-primary via-coral/60 to-white"
      >
        <div className="absolute top-20 left-20 w-32 h-32 rounded-full bg-primary/20 blur-3xl animate-float" />
        <div
          className="absolute bottom-32 right-20 w-48 h-48 rounded-full bg-accent/20 blur-3xl animate-float"
          style={{ animationDelay: "1s" }}
        />

        <div className="relative z-10 max-w-md text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
            className="w-24 h-24 mx-auto mb-8 rounded-2xl gradient-primary flex items-center justify-center shadow-glow"
          >
            <Heart className="w-12 h-12 text-primary-foreground" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="font-display text-5xl font-bold text-primary-foreground mb-4"
          >
            Tell Us About You
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-lg text-primary-foreground/80 mb-8"
          >
            Help us personalize your experience with accurate cycle predictions and health insights.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex justify-center gap-3"
          >
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-300",
                  s === step
                    ? "bg-primary-foreground scale-125"
                    : s < step
                      ? "bg-primary-foreground/60"
                      : "bg-primary-foreground/30"
                )}
              />
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="gradient-glass backdrop-blur-xl rounded-3xl shadow-card p-8 lg:p-10 border border-border/50">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center justify-center mb-6">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <Heart className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>

            {/* Mobile Progress */}
            <div className="lg:hidden flex justify-center gap-2 mb-6">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    s === step
                      ? "bg-primary scale-125"
                      : s < step
                        ? "bg-primary/60"
                        : "bg-muted"
                  )}
                />
              ))}
            </div>

            {/* Step Content */}
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {step === 1 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                      Basic Information
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      This helps us provide personalized insights
                    </p>
                  </div>

                  <div>
                    <Label className="text-foreground font-medium flex items-center gap-2">
                      <Cake className="w-4 h-4 text-primary" />
                      Age
                    </Label>
                    <div className="mt-3 space-y-3">
                      <Slider
                        value={[formData.age]}
                        onValueChange={(value) =>
                          setFormData({ ...formData, age: value[0] })
                        }
                        min={12}
                        max={60}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>12</span>
                        <span className="font-semibold text-foreground">{formData.age} years</span>
                        <span>60</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-foreground font-medium flex items-center gap-2">
                      <Weight className="w-4 h-4 text-primary" />
                      Weight (lbs)
                    </Label>
                    <div className="mt-3 space-y-3">
                      <Slider
                        value={[formData.weight]}
                        onValueChange={(value) =>
                          setFormData({ ...formData, weight: value[0] })
                        }
                        min={70}
                        max={350}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>70</span>
                        <span className="font-semibold text-foreground">{formData.weight} lbs</span>
                        <span>350</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-foreground font-medium flex items-center gap-2">
                      <Ruler className="w-4 h-4 text-primary" />
                      Height
                    </Label>
                    <div className="mt-3 space-y-4">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                          <span>Feet</span>
                          <span className="font-semibold text-foreground">{formData.heightFeet} ft</span>
                        </div>
                        <Slider
                          value={[formData.heightFeet]}
                          onValueChange={(value) =>
                            setFormData({ ...formData, heightFeet: value[0] })
                          }
                          min={3}
                          max={7}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                          <span>Inches</span>
                          <span className="font-semibold text-foreground">{formData.heightInches} in</span>
                        </div>
                        <Slider
                          value={[formData.heightInches]}
                          onValueChange={(value) =>
                            setFormData({ ...formData, heightInches: value[0] })
                          }
                          min={0}
                          max={11}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                      Last Period
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      When did your last period start?
                    </p>
                  </div>

                  <div>
                    <Label className="text-foreground font-medium flex items-center gap-2 mb-3">
                      <Calendar className="w-4 h-4 text-primary" />
                      Start Date of Last Period
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full h-12 justify-start text-left font-normal rounded-xl border-border/50 bg-background/50",
                            !formData.lastPeriodDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-3 h-5 w-5 text-primary" />
                          {formData.lastPeriodDate ? (
                            format(formData.lastPeriodDate, "PPP")
                          ) : (
                            <span>Select date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={formData.lastPeriodDate}
                          onSelect={(date) =>
                            setFormData({ ...formData, lastPeriodDate: date })
                          }
                          disabled={(date) => date > new Date()}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                      Cycle Details
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Help us understand your cycle pattern
                    </p>
                  </div>

                  <div>
                    <Label className="text-foreground font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      Period Duration
                    </Label>
                    <div className="space-y-3 mt-3">
                      <Slider
                        value={[formData.periodDuration]}
                        onValueChange={(value) =>
                          setFormData({ ...formData, periodDuration: value[0] })
                        }
                        min={1}
                        max={10}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>1</span>
                        <span className="font-semibold text-foreground">{formData.periodDuration} days</span>
                        <span>10</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-foreground font-medium flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-primary" />
                      Cycle Length
                    </Label>
                    <div className="space-y-3 mt-3">
                      <Slider
                        value={[formData.cycleLength]}
                        onValueChange={(value) =>
                          setFormData({ ...formData, cycleLength: value[0] })
                        }
                        min={21}
                        max={40}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>21</span>
                        <span className="font-semibold text-foreground">{formData.cycleLength} days</span>
                        <span>40</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Navigation Buttons */}
            <div className="flex gap-4 mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="flex-1 h-12 rounded-xl border-border/50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceed() || isLoading}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold rounded-xl shadow-glow hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 group"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      {step === totalSteps ? "Complete Setup" : "Continue"}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default OnboardingForm;
