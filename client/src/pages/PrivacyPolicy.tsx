import { ChevronLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/profile">
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent border-2 border-[#00D4FF] text-[#00D4FF] hover:bg-gradient-to-r hover:from-[#00D4FF] hover:to-[#0099FF] hover:text-white hover:border-transparent transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Profile
            </Button>
          </Link>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg backdrop-blur-sm p-8">
            <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
            <p className="text-slate-400 mb-2">Effective Date: August 27, 2025</p>
            <p className="text-slate-400 mb-8">FitScore (operated by Gustav Griezitis, Switzerland)</p>

            <div className="space-y-8 text-slate-300 leading-relaxed">
              {/* Section 1 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">1. Introduction</h2>
                <p className="mb-4">
                  FitScore is a personal performance and wellness assistant that integrates WHOOP recovery data, training calendars, meal tracking, and AI-powered insights.
                </p>
                <p className="mb-4">
                  We respect your privacy and are committed to protecting your personal information. This Policy explains what data we collect, how we use it, and your rights.
                </p>
                <p>
                  By using FitScore, you agree to this Privacy Policy.
                </p>
              </section>

              {/* Section 2 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">2. Data We Collect</h2>
                <p className="mb-4">We may collect the following types of data when you use FitScore:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>WHOOP Data:</strong> sleep, recovery, strain, HRV, and related health metrics (via WHOOP API).</li>
                  <li><strong>Calendar Data:</strong> training events and schedules from Google Calendar ICS links you provide.</li>
                  <li><strong>Meal Data:</strong> meal photos and descriptions you upload.</li>
                  <li><strong>AI Insights:</strong> text you provide for analysis by OpenAI models (used only to generate insights, not stored by OpenAI).</li>
                  <li><strong>Account Information:</strong> your login credentials and email address.</li>
                  <li><strong>App Logs:</strong> basic usage and error logs, for debugging and improving services.</li>
                </ul>
                <p className="mt-4 font-medium">We do not sell your data to third parties.</p>
              </section>

              {/* Section 3 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Data</h2>
                <p className="mb-4">We use your data to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Provide and improve FitScore's services.</li>
                  <li>Generate personalized insights about recovery, training, and nutrition.</li>
                  <li>Synchronize data from WHOOP, Google Calendar, and your meal entries.</li>
                  <li>Respond to support requests.</li>
                  <li>Ensure the security and stability of the service.</li>
                </ul>
              </section>

              {/* Section 4 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">4. Data Sharing with Third Parties</h2>
                <p className="mb-4">To provide services, we share data only with trusted providers:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>WHOOP</strong> – to fetch your fitness and recovery data.</li>
                  <li><strong>Google (Calendar ICS)</strong> – to sync your training schedule.</li>
                  <li><strong>OpenAI</strong> – to generate AI-based insights (your data is sent for processing but not stored long-term by OpenAI).</li>
                  <li><strong>Cloud Hosting Providers</strong> – FitScore runs on secure cloud infrastructure (currently Replit; may change in the future).</li>
                </ul>
                <p className="mt-4 font-medium">We do not sell or rent your personal data.</p>
              </section>

              {/* Section 5 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">5. Data Retention</h2>
                <p className="mb-4">
                  We retain your data until you request deletion or close your account.
                </p>
                <p>
                  You may request deletion at any time by contacting us at <a href="mailto:privacy@fitscore.app" className="text-blue-400 hover:text-blue-300 underline">privacy@fitscore.app</a>.
                </p>
              </section>

              {/* Section 6 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">6. Your Rights</h2>
                <p className="mb-4">Depending on where you live, you may have the following rights:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>EU/UK/Swiss users (GDPR, UK GDPR, FADP):</strong> right to access, correct, delete, restrict, or transfer your data, and to object to processing.</li>
                  <li><strong>US users (California CCPA/CPRA):</strong> right to know what data we collect, request deletion, and opt out of data sale (FitScore does not sell personal data).</li>
                </ul>
                <p className="mt-4">
                  To exercise these rights, email us at <a href="mailto:privacy@fitscore.app" className="text-blue-400 hover:text-blue-300 underline">privacy@fitscore.app</a>.
                </p>
              </section>

              {/* Section 7 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">7. Age Restriction</h2>
                <p className="mb-4">
                  FitScore is intended for users 16 years or older.
                </p>
                <p>
                  We do not knowingly collect data from children under 16.
                </p>
              </section>

              {/* Section 8 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">8. Security</h2>
                <p>
                  We use industry-standard measures (encryption, secure storage, limited access) to protect your personal data. However, no method of transmission or storage is 100% secure.
                </p>
              </section>

              {/* Section 9 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">9. Changes to This Policy</h2>
                <p>
                  We may update this Privacy Policy from time to time. If we make material changes, we will notify you in the app or by email. The updated version will always be available at fitscore.app/privacy.
                </p>
              </section>

              {/* Section 10 */}
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">10. Contact Us</h2>
                <p className="mb-4">For privacy-related questions or data requests:</p>
                <p className="mb-4">
                  <a href="mailto:privacy@fitscore.app" className="text-blue-400 hover:text-blue-300 underline">privacy@fitscore.app</a>
                </p>
                <p>For user support:</p>
                <p>
                  <a href="mailto:support@fitscore.app" className="text-blue-400 hover:text-blue-300 underline">support@fitscore.app</a>
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}