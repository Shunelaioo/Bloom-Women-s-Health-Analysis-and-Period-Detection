import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Heart,
  TrendingUp,
  Calendar,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const Landing = () => {
  const navigate = useNavigate();

  // If already logged in, go straight to /home
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) navigate("/home", { replace: true });
  }, [navigate]);

  const features = [
    {
      icon: Calendar,
      title: "Smart Cycle Tracking",
      description:
        "Accurately predict your next period and fertile window with our intelligent algorithm.",
    },
    {
      icon: TrendingUp,
      title: "Health Insights",
      description:
        "Understand your patterns with personalized insights based on your unique cycle data.",
    },
    {
      icon: Shield,
      title: "Private & Secure",
      description:
        "Your data is encrypted and protected. We never share your personal health information.",
    },
  ];

  const healthTips = [
    "Understanding your menstrual cycle helps you plan better and feel more in control.",
    "Tracking symptoms can reveal patterns that help identify hormonal imbalances early.",
    "Each phase of your cycle affects energy, mood, and productivity differently.",
    "Regular tracking helps detect irregularities that may need medical attention.",
  ];

  return (
    <div className="min-h-screen gradient-soft">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
                <Heart className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-serif text-xl font-semibold text-foreground">
                Bloom
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* ✅ Sign in opens login mode */}
              <Link to="/login?mode=login">
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Sign In
                </Button>
              </Link>

              {/* ✅ Get started opens signup mode */}
              <Link to="/login?mode=signup">
                <Button className="btn-primary">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 md:py-24 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6"
          >
            <Sparkles className="w-4 h-4" />
            <span>Your Personal Health Companion</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-4xl md:text-6xl font-bold text-foreground mb-6"
          >
            Embrace Your Cycle with{" "}
            <span className="text-gradient">Confidence</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground mb-8"
          >
            Bloom helps you understand your body, track your menstrual health, and
            live in harmony with your natural rhythm.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            {/* ✅ Primary CTA -> signup mode */}
            <Link to="/login?mode=signup" className="w-full sm:w-auto">
              <Button size="lg" className="btn-primary group w-full sm:w-auto">
                Start Today
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>

            {/* ✅ Secondary CTA -> login mode */}
            <Link to="/login?mode=login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                I Already Have an Account
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything You Need to <span className="text-gradient">Thrive</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Powerful features designed to help you understand and embrace your
            menstrual health.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="glass-card p-8 text-center"
            >
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-soft">
                <feature.icon className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why Track */}
      <section className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="glass-card p-8 md:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-coral/20 to-lavender/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative z-10 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-6">
                Why Track Your{" "}
                <span className="text-gradient">Menstrual Health?</span>
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                Your menstrual cycle is a vital sign of your overall health.
                Understanding it empowers you to make informed decisions about
                your wellbeing.
              </p>

              {/* ✅ signup mode */}
              <Link to="/login?mode=signup">
                <Button className="btn-primary group">
                  Start Your Journey
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>

            <div className="space-y-4">
              {healthTips.map((tip, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.06 }}
                  className="flex items-start gap-3 p-4 rounded-xl bg-background/50"
                >
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-foreground/80 text-sm">{tip}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="text-center py-12 px-8 rounded-3xl gradient-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />
          <div className="relative z-10">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to Bloom?
            </h2>
            <p className="text-primary-foreground/90 text-lg mb-8 max-w-xl mx-auto">
              Join our community and start your journey towards better menstrual
              health today.
            </p>

            {/* ✅ signup mode */}
            <Link to="/login?mode=signup">
              <Button
                size="lg"
                variant="secondary"
                className="bg-background text-foreground hover:bg-background/90"
              >
                Create Your Account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              <span className="font-serif font-semibold text-foreground">
                Bloom
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 Bloom. Your health, your data, your journey.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
