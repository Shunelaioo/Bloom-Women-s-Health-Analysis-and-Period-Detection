import Layout from "@/components/layout/Layout";

const PrivacyPolicy = () => {
  return (
    <Layout>
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold text-foreground mb-6">Privacy Policy</h1>
        <div className="space-y-6 text-sm text-muted-foreground leading-7">
          <p>
            Bloom is committed to protecting your privacy. We collect only the information needed to
            provide cycle tracking, health insights, and account security.
          </p>
          <p>
            We use your data to personalize your experience, improve predictions, and support app
            features you choose to enable. We do not sell your personal health information.
          </p>
          <p>
            You can request account and data deletion at any time. For privacy questions, contact us
            through the Contact Us page.
          </p>
        </div>
      </section>
    </Layout>
  );
};

export default PrivacyPolicy;
