export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Effective Date: January 29, 2026
        </p>

        <div className="prose prose-lg max-w-none text-gray-700">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Introduction
            </h2>
            <p className="mb-4">
              Welcome to Countertop Visualizer. We value your privacy. This
              policy explains how we collect, use, and share your information
              when you use our kitchen visualization and quote-matching service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Information We Collect
            </h2>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>User-Provided Information:</strong> Name, email, phone
                number, and project address.
              </li>
              <li>
                <strong>Project Media:</strong> Photos of your kitchen uploaded
                for visualization.
              </li>
              <li>
                <strong>Automated Data:</strong> IP addresses, cookies, and
                usage patterns to improve our AI.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              How We Share Your Information
            </h2>
            <p className="mb-4">
              To fulfill your request for a remodel quote, we share your project
              details and contact information with our network of independent
              service professionals and contractors. These pros use this
              information solely to provide the estimates you requested.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              SMS Privacy & Protection
            </h2>
            <p className="mb-4">
              Mobile information will not be shared with third
              parties/affiliates for marketing or promotional purposes. All the
              above categories exclude text messaging originator opt-in data and
              consent; this information will not be shared with any third
              parties for their own marketing purposes. We only share your phone
              number with service professionals you have specifically requested
              a quote from to facilitate project communication.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Data Security
            </h2>
            <p className="mb-4">
              We implement industry-standard encryption to protect your photos
              and personal data. However, no method of transmission over the
              internet is 100% secure.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Your Choices
            </h2>
            <p className="mb-4">
              You may opt-out of marketing emails at any time. For SMS, reply
              STOP to any message to be removed from our list.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
