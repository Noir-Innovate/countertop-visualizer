export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Effective Date: January 29, 2026
        </p>

        <div className="prose prose-lg max-w-none text-gray-700">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              1. Nature of Service
            </h2>
            <p className="mb-4">
              Countertop Visualizer provides an AI-powered kitchen visualization
              tool. We connect users with third-party contractors ("Pros") for
              remodeling quotes. We are a lead-generation platform and do not
              perform the remodeling services ourselves.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              2. Accuracy of Visualizations
            </h2>
            <p className="mb-4">
              The visualizations provided are digital simulations for
              illustrative purposes only. They do not represent a guarantee of
              final results. Actual materials may vary in color, texture, and
              fit.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              3. Quotes and Estimates
            </h2>
            <p className="mb-4">
              Any quote generated through the platform is an estimate. Final
              pricing is determined solely by the Pro after an on-site
              inspection. Countertop Visualizer is not a party to any contract
              formed between a User and a Pro.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              4. Consent to Communication & SMS
            </h2>
            <p className="mb-4">
              By submitting a quote request and opting in, you provide express
              written consent to be contacted by Countertop Visualizer and its
              network of Pros via phone, email, or SMS (including automated
              technology) at the number provided.
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>Opt-out:</strong> You may unsubscribe from SMS by
                replying STOP. For help, reply HELP.
              </li>
              <li>
                <strong>Costs:</strong> Standard message and data rates may
                apply.
              </li>
              <li>
                <strong>Frequency:</strong> Message frequency varies based on
                your project status.
              </li>
              <li>
                <strong>No Purchase Required:</strong> Consent to receive texts
                is not a condition of purchasing any goods or services.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              5. User Conduct & Content
            </h2>
            <p className="mb-4">
              You represent that you own or have the right to upload the images
              of the property provided. You grant Countertop Visualizer a
              non-exclusive license to process these images to provide the
              service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              6. Limitation of Liability
            </h2>
            <p className="mb-4">
              Countertop Visualizer is not liable for the actions, errors, or
              omissions of any third-party Pros matched through our service. Use
              of the service is at your own risk.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
