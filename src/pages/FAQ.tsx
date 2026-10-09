import Layout from "@/components/layout/Layout";

const FAQ = () => {
  return (
    <Layout>
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold text-foreground mb-6">FAQ</h1>
        <div className="space-y-6 text-sm text-muted-foreground leading-7">
          <div>
            <h2 className="text-foreground font-medium mb-2">Is Bloom a medical diagnosis tool?</h2>
            <p>No. Bloom is for education and tracking support, not diagnosis or treatment.</p>
          </div>
          <div>
            <h2 className="text-foreground font-medium mb-2">How can I improve prediction accuracy?</h2>
            <p>Log your daily symptoms and cycle data consistently so the model has better history.</p>
          </div>
          <div>
            <h2 className="text-foreground font-medium mb-2">Can I delete my data?</h2>
            <p>Yes. You can request account and data deletion through support.</p>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default FAQ;
