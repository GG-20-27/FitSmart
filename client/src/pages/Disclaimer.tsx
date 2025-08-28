import { ChevronLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function Disclaimer() {
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
            <h1 className="text-3xl font-bold text-white mb-8">Disclaimer</h1>

            <div className="space-y-6 text-slate-300 leading-relaxed text-lg">
              <p>
                FitScore provides general wellness and performance insights only.
              </p>
              
              <p>
                It does not provide medical advice, diagnosis, or treatment.
              </p>
              
              <p>
                You should always consult a qualified healthcare professional before making health-related decisions.
              </p>
              
              <p className="font-medium text-white">
                By using FitScore, you acknowledge that you are responsible for your own choices and outcomes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}