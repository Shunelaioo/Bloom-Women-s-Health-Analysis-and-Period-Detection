import Layout from "@/components/layout/Layout";

const TermsOfService = () => {
  return (
    <Layout>
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold text-foreground mb-6">Terms of Service</h1>
        <div className="space-y-6 text-sm text-muted-foreground leading-7">
          <p>
            By using Bloom, you agree to use the app responsibly and provide accurate information when
            possible so your health insights remain useful.
          </p>
          <p>
            Bloom provides educational and tracking support only. It is not a replacement for medical
            diagnosis, treatment, or emergency care.
          </p>
          <p>
            We may update these terms from time to time. Continued use of the app after updates means
            you accept the revised terms.
          </p>
        </div>
      </section>
    </Layout>
  );
};

export default TermsOfService;
