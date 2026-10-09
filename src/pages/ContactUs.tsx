import Layout from "@/components/layout/Layout";

const ContactUs = () => {
  return (
    <Layout>
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold text-foreground mb-6">Contact Us</h1>
        <div className="space-y-6 text-sm text-muted-foreground leading-7">
          <p>
            Need help with your account, privacy, or app features? Reach out and we will get back to
            you as soon as possible.
          </p>
          <div>
            <p className="text-foreground font-medium">Support Email</p>
            <a className="text-primary hover:underline" href="mailto:support@bloom.app">
              support@bloom.app
            </a>
          </div>
          <div>
            <p className="text-foreground font-medium">Support Hours</p>
            <p>Monday to Friday, 9:00 AM to 6:00 PM</p>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default ContactUs;
